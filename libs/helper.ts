//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

import { getPropValueOfObject, isObject, isNonEmptyString, isGuid } from 'douhub-helper-util';
import {  isNil, isBoolean, isNumber, isArray, isString } from 'lodash';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { LambdaError, LambdaResponse } from './types';
import { ERROR_UNEXPECTED, RATE_LIMIT_DURATION, RATE_LIMIT_POINTS_PER_SECOND } from './constants';

import { getSecretValue } from 'douhub-helper-service';
import { S3 } from 'aws-sdk';

// const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });

const _rateLimiter = new RateLimiterMemory({
    points: isNonEmptyString(process.env.RATE_LIMIT_POINTS_PER_SECOND) ? parseInt(`${process.env.RATE_LIMIT_POINTS_PER_SECOND}`) : RATE_LIMIT_POINTS_PER_SECOND,
    duration: RATE_LIMIT_DURATION, // Per second
});

export const checkRateLimit = async (sourceIp: string, apiName?: string, points?: number) => {

    const callerId = `${sourceIp}-${apiName}`;
    console.log({ apiName, points });
    try {
        await _rateLimiter.consume(callerId, isNumber(points) ? points : 2); // consume points
        return true;
    }
    catch (ex) {
        // Not enough points to consume
        console.error(ex);
        console.log('Bad Caller', callerId);
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

export const getObjectValueOfEvent = (event: any, name: string, defaultValue?: Record<string,any>) => {
    if (!isObject(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    try {
        return isObject(val) ? val : (isNonEmptyString(val) ? JSON.parse(val) : defaultValue);
    }
    catch (error) {
        console.error({ error, name, defaultValue, val });
    }
    return undefined;
};

export const getGuidValueOfEvent = (event: any, name: string, defaultValue?: string) => {
    if (!isGuid(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return isGuid(val) ? val : defaultValue;
};

export const getIntValueOfEvent = (event: any, name: string, defaultValue?: number) => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseInt(val)) ? parseInt(val) : defaultValue;
};

export const getFloatValueOfEvent = (event: any, name: string, defaultValue?: number) => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseFloat(val)) ? parseFloat(val) : defaultValue;
};

export const getBooleanValueOfEvent = (event: any, name: string, defaultValue?: boolean) => {
    if (!isBoolean(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    if (`${val}`.toLowerCase() == 'true') return true;
    if (`${val}`.toLowerCase() == 'false') return false;
    return defaultValue;
};

export const getArrayPropValueOfEvent = (event: any, name: string, defaultValue?: []) => {
    if (!isArray(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return isArray(val) ? val : isNonEmptyString(val) ? JSON.parse(val) : defaultValue;
};

//Render error result
export const onError = (currentError?: LambdaError, innerError?: any): LambdaResponse => {

    if (!isObject(currentError)) currentError = { statusCode: 500 };
    const error = { ...currentError };

    
    if (isObject(innerError)) {
        if (innerError['statusCode']) error.statusCode = innerError['statusCode'];
        if (innerError['statusName']) error.statusName = innerError['statusName'];
        if (innerError['type'] && isNil(error.type)) error.type = innerError['type'];
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
            "Content-Type": "application/json"
        },
        body: JSON.stringify(error)
    };
};

//Render success result
export const onSuccess = (data: Record<string,any>): LambdaResponse => {
    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
};


let _s3Uploader: any = null;
export const s3Uploader = async () => {

    if (!_s3Uploader) {

        const s3UploaderSecret = (await getSecretValue('S3_UPLOADER')).split("|");

        _s3Uploader = new S3({
            region: process.env.REGION,
            accessKeyId: s3UploaderSecret[0],
            secretAccessKey: s3UploaderSecret[1]
        });
    }

    return _s3Uploader;
};

