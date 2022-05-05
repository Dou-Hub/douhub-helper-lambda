//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

import { isNonEmptyString, _process, _track, ttl } from 'douhub-helper-util';
import { isNil, isInteger } from 'lodash';
import { S3_BUCKET_NAME_CACHE, s3Get, S3Result, s3Put} from 'douhub-helper-service';

export const getS3Cache = async (key: string, region?: string): Promise<any> => {

    if (!isNonEmptyString(key)) return null;

    try {
        const s3Result: S3Result | null = await s3Get(S3_BUCKET_NAME_CACHE, `${key}.txt`, region);

        if (s3Result) {
            const result = JSON.parse(s3Result.content);
            if (_track) console.log('getS3Cache - content')
            if (isInteger(result.ttl) && Date.now() > result.ttl * 1000)  //.ttl is in seconds
            {
                if (_track) console.log('getS3Cache - ttl');
                return null;
            }
            if (!isNil(result.cache)) {
                if (_track) console.log('getS3Cache - hit');
                return result.cache;
            }
        }

    }
    catch (error) {
        console.error(error);
    }
    if (_track) console.log('getS3Cache - miss')
    return null;
};

export const getS3CacheObject = async (key: string, region?: string): Promise<Record<string, any> | null> => {

    const v = await getS3Cache(key, region);
    if (isNonEmptyString(v)) {
        try {
            return JSON.parse(v);
        }
        catch (error) {
            console.error(error);
        }
    }
    return null;
};

export const setS3Cache = async (key: string, content: any, expireMinutes?: number, region?: string) => {

    if (!isNonEmptyString(key)) return null;
    const data: Record<string, any> = {};

    if (expireMinutes && isInteger(expireMinutes) && expireMinutes > 0) {
        data.ttl = ttl(expireMinutes);
    }
    else {
        data.ttl = ttl(30 * 24 * 60); //30 days default
    }

    data.cache = content;

    try {
        await s3Put(S3_BUCKET_NAME_CACHE, `${key}.txt`,JSON.stringify(data),region);
    }
    catch (error) {
        console.error(error);
    }
};

export const setS3CacheObject = async (key: string, content: Record<string, any>, expireMinutes?: number, region?: string) => {
    await setS3Cache(key, JSON.stringify(content), expireMinutes);
};
