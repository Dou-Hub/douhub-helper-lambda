//  COPYRIGHT:       PrimeObjects Software Inc. (C) 2021 All Right Reserved
//  COMPANY URL:     https://www.primeobjects.com/
//  CONTACT:         developer@primeobjects.com
// 
//  This source is subject to the PrimeObjects License Agreements. 
// 
//  Our EULAs define the terms of use and license for each PrimeObjects product. 
//  Whenever you install a PrimeObjects product or research PrimeObjects source code file, you will be prompted to review and accept the terms of our EULA. 
//  If you decline the terms of the EULA, the installation should be aborted and you should remove any and all copies of our products and source code from your computer. 
//  If you accept the terms of our EULA, you must abide by all its terms as long as our technologies are being employed within your organization and within your applications.
// 
//  THIS CODE AND INFORMATION IS PROVIDED "AS IS" WITHOUT WARRANTY
//  OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT
//  LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
//  FITNESS FOR A PARTICULAR PURPOSE.
// 
//  ALL OTHER RIGHTS RESERVED

import { getPropValueOfObject, isNonEmptyString, isGuid } from 'douhub-helper-util';
import { isObject, find, isNil, isBoolean, isNumber, isArray } from 'lodash';
import { checkToken, getToken } from './token';
import {
    HTTPERROR_400, HTTPERROR_429, HTTPERROR_403, PROFILE_TABLE_NAME,
    ERROR_TOO_MANY_REQUESTS, ERROR_AUTH_FAILED,
    ERROR_PARAMETER_INVALID,
    ERROR_PARAMETER_MISSING
} from './constants';
import { LambdaError, CheckCallerSettings, CheckCallerResult } from './types';
import { CognitoIdentityServiceProvider, DynamoDB } from 'aws-sdk';
import { getPropValueOfEvent, checkRateLimit } from './helper';
import axios from 'axios';
import { getSecretValue } from '../services/secret-manager';
import _ = require('lodash');

const _cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider();
const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });

export const verifyReCaptchaToken = async (siteKey, token) => {
    try {

        const googleApiKey = await getSecretValue('GOOGLE_RECAPTCHA_KEY');
        const googleProjectId = await getSecretValue('GOOGLE_PROJECT_ID');

        const options: any = {
            method: 'post',
            url: `https://recaptchaenterprise.googleapis.com/v1beta1/projects/${googleProjectId}/assessments?key=${googleApiKey}`,
            data: { event: { token, siteKey } }
        };

        return (await axios.request(options)).data;

    }
    catch (error) {
        console.error(error);
    }

    return null;
};

export const parseAccessToken = async (event) => {

    const accessToken = getPropValueOfEvent(event, 'accessToken');
    if (isNonEmptyString(accessToken)) {
        //user.authorization = event.headers.Authorization;
        //user.accessToken = accessToken;

        //get user info
        //// console.log("getUser by accessToken - start");
        const cognitoUser = await _cognitoIdentityServiceProvider
            .getUser({ AccessToken: accessToken })
            .promise();

        //// console.log("getUser by accessToken - end");
        if (isObject(cognitoUser) && isNonEmptyString(cognitoUser.Username)) {
            const userNameInfo = cognitoUser.Username.split(".");
            const organizationId = userNameInfo[0];
            const userId = userNameInfo[1];

            //Try to get user token, because it has roles & licenses
            const userToken = await getToken(userId, 'user');
            if (isNil(userToken)) throw 'Missing user token record';
            const { roles, licenses } = userToken.data;

            return { accessToken, userId, organizationId, roles, licenses };
        }

    }

    return null;
};


export const parseApiToken = async (event) => {

    let apiToken = getPropValueOfEvent(event, "apiToken");

    if (isNonEmptyString(apiToken)) {

        try {
            const token = await checkToken(apiToken);
            //TODO: Use tokenData to check permissions
            return token?.data;
        } catch (error) {
            console.error("ERROR_CURSOLUTIONUSER_BADAPITOKEN", error);
        }
    }
    return null;
};


export const getContext = async (event: any, settings?: any) => {

    if (!isObject(settings)) settings = {};
    let context = await parseApiToken(event);

    if (!isObject(context)) context = await parseAccessToken(event);

    if (!isObject(context)) context = {};
    context.event = event;

    if (isNonEmptyString(context.userId) && !settings.skipUserProfile) {
        context.user = (await _dynamoDb.get({ TableName: PROFILE_TABLE_NAME, Key: { id: `user.${context.userId}` } }).promise()).Item;
        if (isObject(context.user)) context.user.id = context.userId;
    }

    return context;
};

export const getSolution = async (solutionId) => {
    return (await _dynamoDb.get({
        TableName: PROFILE_TABLE_NAME,
        Key: { id: `solution.${solutionId}` }
    }).promise()).Item;
}


export const checkCaller = async (event: any, settings?: CheckCallerSettings | null): Promise<CheckCallerResult> => {

    if (!isObject(settings)) settings = {};

    const solutionId = getPropValueOfEvent(event, 'solutionId');
    if (!isNonEmptyString(solutionId)) {
        return {
            type: 'ERROR', error: {
                ...HTTPERROR_400,
                source: 'context.checkCaller',
                type: ERROR_PARAMETER_MISSING,
                detail: { paramName: 'solutionId' }
            }
        };
    }

    if (event.source == "aws.events") {
        return settings.stopAWSEvent ? { type: 'STOP' } : { type: 'CONTINUE' };
    }

    const result: CheckCallerResult = { context: {}, type: 'CONTINUE' };

    const recaptchaToken = getPropValueOfEvent(event, 'recaptchaToken');
    const sourceIp = event.identity && event.identity.sourceIp;

    if (!settings.ignoreRateLimit && !(await checkRateLimit(sourceIp, settings.apiName, settings.apiPoints))) {
        return {
            type: 'ERROR', error: {
                ...HTTPERROR_429,
                type: ERROR_TOO_MANY_REQUESTS,
                source: 'context.checkCaller',
                detail: {
                    sourceIp,
                    settings
                }
            }
        };
    }


    if (!settings.ignoreAuth) {
        result.context = await getContext(event, settings);
        if (!isNonEmptyString(result.context.userId)) {
            return {
                type: 'ERROR', error: {
                    ...HTTPERROR_403,
                    type: ERROR_AUTH_FAILED,
                    source: 'context.checkCaller',
                    detail: {
                        sourceIp,
                        settings
                    }
                }
            }
        }
    }

    if (settings.needSolution || settings.verifyReCaptcha) {
        result.context.solution = await getSolution(solutionId);
        if (!_.isObject(result.context.solution)) {
            return {
                type: 'ERROR', error: {
                    ...HTTPERROR_403,
                    type: ERROR_PARAMETER_INVALID,
                    source: 'context.checkCaller',
                    detail: {
                        name: 'recaptchaToken',
                        settings
                    }
                }
            }

        }
    }

    if (settings.verifyReCaptcha) {

        if (!isNonEmptyString(recaptchaToken)) {
            return {
                type: 'ERROR', error: {
                    ...HTTPERROR_403,
                    type: ERROR_PARAMETER_MISSING,
                    source: 'context.checkCaller',
                    detail: {
                        name: 'recaptchaToken',
                        settings
                    }
                }
            }
        }

        const recaptchaSiteKey = result.context.solution.keys.recaptchaSiteKey;;

        if (!await verifyReCaptchaToken(recaptchaSiteKey, recaptchaToken)) {
            throw {
                ...HTTPERROR_403,
                type: ERROR_AUTH_FAILED,
                source: 'context.checkCaller',
                detail: {
                    reason: 'ERROR_API_FAILED_RECAPTCHA',
                    recaptchaToken,
                    settings
                }
            }
        }
    }

    return result;
};