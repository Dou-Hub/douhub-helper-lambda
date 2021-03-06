//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

import { getPropValueOfObject, isObject, isNonEmptyString, isGuid, _process, _track, getWebLocation } from 'douhub-helper-util';
import { isNil, isBoolean, isNumber, isArray, isString } from 'lodash';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { LambdaError, LambdaResponse } from './types';
import { ERROR_UNEXPECTED, RATE_LIMIT_DURATION, RATE_LIMIT_POINTS_PER_SECOND } from './constants';

import { getSecretValue } from 'douhub-helper-service';
import { S3 } from 'aws-sdk';

export const checkRateLimit = async (sourceIp: string, apiName?: string, points?: number) => {

    const callerId = `${sourceIp}-${apiName}`;
    if (_track) console.log({ apiName, points });
    try {
        if (!_process.rateLimiter) _process.rateLimiter = new RateLimiterMemory({
            points: isNonEmptyString(_process.env.RATE_LIMIT_POINTS_PER_SECOND) ? parseInt(`${_process.env.RATE_LIMIT_POINTS_PER_SECOND}`) : RATE_LIMIT_POINTS_PER_SECOND,
            duration: RATE_LIMIT_DURATION, // Per second
        });

        await _process.rateLimiter.consume(callerId, isNumber(points) ? points : 2); // consume points
        return true;
    }
    catch (ex) {
        // Not enough points to consume
        console.error(ex);
        if (_track) console.log('Bad Caller', callerId);
        return false;
    }
};

export const getPropValueOfEvent = (event: any, name: string, defaultValue?: string) => {

    let v = getPropValueOfObject(event.headers, name);
    if (isNil(v)) v = getPropValueOfObject(event.path, name);
    if (isNil(v)) v = getPropValueOfObject(event.body, name);
    if (isNil(v)) v = getPropValueOfObject(event.query, name);
    return !isNil(v) ? v : (isNil(defaultValue) ? undefined : defaultValue);
};

export const getObjectValueOfEvent = (event: any, name: string, defaultValue?: Record<string, any>): Record<string, any> | undefined => {
    if (!isObject(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    try {
        return isObject(val) ? val : (isNonEmptyString(val) ? JSON.parse(val) : defaultValue);
    }
    catch (error) {
        if (_track) console.error({ error, name, defaultValue, val });
    }
    return undefined;
};

export const getGuidValueOfEvent = (event: any, name: string, defaultValue?: string): string | undefined => {
    if (!isGuid(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return isGuid(val) ? val : defaultValue;
};

export const getIntValueOfEvent = (event: any, name: string, defaultValue?: number): number | undefined => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseInt(val)) ? parseInt(val) : defaultValue;
};

export const getFloatValueOfEvent = (event: any, name: string, defaultValue?: number): number | undefined => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseFloat(val)) ? parseFloat(val) : defaultValue;
};

export const getBooleanValueOfEvent = (event: any, name: string, defaultValue?: boolean): boolean | undefined => {
    if (!isBoolean(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    if (`${val}`.toLowerCase() == 'true') return true;
    if (`${val}`.toLowerCase() == 'false') return false;
    return defaultValue;
};

export const getArrayPropValueOfEvent = (event: any, name: string, defaultValue?: []): Array<any> | undefined => {
    if (!isArray(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return isArray(val) ? val : isNonEmptyString(val) ? JSON.parse(val) : defaultValue;
};

//Render error result

export const onError = (currentError?: LambdaError, innerError?: any): LambdaResponse => {

    if (!isObject(currentError)) currentError = { statusCode: 500 };
    const error = { ...currentError };
    const types:string[] = [];

    if (isObject(innerError)) {
        if (innerError['statusCode']) error.statusCode = innerError['statusCode'];
        if (innerError['statusName']) error.statusName = innerError['statusName'];
        if (innerError['type'])
        {
            if(isNil(error.type)) 
            {
                error.type = innerError['type'];
                types.push(`${error.type}`);
            }
            else
            {
                types.unshift(error.type);
                types.push(`${innerError['type']}`);
            }
        }  
        let errorTree = innerError?.detail?.error;
        console.log({errorTree})
       
        while(isObject(errorTree))
        {
            if (errorTree?.type) types.push(`${errorTree?.type}`);
            errorTree = errorTree?.detail?.error;
        }
        
        error.types = types;
    }

  
    if (isString(innerError)) {
        error.statusName = innerError;
    }

    if (isNil(error.type)) error.type = ERROR_UNEXPECTED;

    if (!isNil(innerError)) {
        error.error = innerError;
    }

    error.statusCode = error.statusCode || 500;
    error.statusName = error.statusName || error.type;

    return {
        statusCode: error.statusCode,
        statusName: error.statusName,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT"
        },
        body: JSON.stringify(error)
    };
};


//Render success result
export const onSuccess = (data: Record<string, any>): LambdaResponse => {
    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT"
        },
        body: JSON.stringify(data)
    };
};

export const s3Uploader = async () => {

    if (!_process.s3Uploader) {

        const s3UploaderSecret = (await getSecretValue('S3_UPLOADER')).split("|");

        _process.s3Uploader = new S3({
            region: process.env.REGION,
            accessKeyId: s3UploaderSecret[0],
            secretAccessKey: s3UploaderSecret[1]
        });
    }

    return _process.s3Uploader;
};


export const getDomain = (event: any, skipQueryValue: boolean) => {

    let domain = null;
    if (skipQueryValue) domain = getPropValueOfEvent(event, "domain");
    if (!isNonEmptyString(domain)) domain = getPropValueOfEvent(event, "origin");
    if (!isNonEmptyString(domain)) domain = getPropValueOfEvent(event, "referer");

    //try to get domain name from the origin header
    if (isNonEmptyString(domain)) {
        const location = getWebLocation(domain);
        if (location) domain = location.host;
    }

    return domain;
};
