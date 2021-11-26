//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

import { getPropValueOfObject, isNonEmptyString, isGuid } from 'douhub-helper-util';
import { s3Get, dynamoDBRetrieve,  } from 'douhub-helper-service';
import { isObject, find, isNil, isBoolean, isNumber, isArray } from 'lodash';
import { checkToken, getToken } from './token';
import {
    HTTPERROR_400, HTTPERROR_429, HTTPERROR_403,
    ERROR_TOO_MANY_REQUESTS, ERROR_AUTH_FAILED,
    S3_BUCKET_NAME_DATA,
    ERROR_PARAMETER_MISSING, DYNAMO_DB_TABLE_NAME_PROFILE,
    REGION, 
} from './constants';
import { CheckCallerSettings, CheckCallerResult } from './types';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { getPropValueOfEvent, checkRateLimit } from './helper';
import axios from 'axios';
import { getSecretValue } from 'douhub-helper-service';

const _cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider();


export const verifyReCaptchaToken = async (siteKey: string, token: string) => {
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

export const parseAccessToken = async (event: any) => {

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
            if (!userToken) 
            {
                console.error('Missing user token record');
                return null;
            }
            else
            {
                const { roles, licenses } = userToken.data;
                return { accessToken, userId, organizationId, roles, licenses };
            }
        }

    }

    return null;
};


export const parseApiToken = async (event: any) => {

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


export const getContext = async (event: any, settings?: Record<string, any>): Promise<Record<string, any>> => {

    if (!isObject(settings)) settings = {};
    let context = await parseApiToken(event);

    if (!isObject(context)) context = await parseAccessToken(event);

    // if (!isObject(context)) context = {};
    // context.event = event;

    if (isNonEmptyString(context.userId) && !settings.skipUserProfile) {
        context.user = await dynamoDBRetrieve(`user.${context.userId}`, DYNAMO_DB_TABLE_NAME_PROFILE, REGION);
        if (isObject(context.user)) context.user.id = context.userId;
    }

    return context;
};


export const getSolution = async (solutionId: string) => {
    try {
        return await s3Get(S3_BUCKET_NAME_DATA, `${solutionId}/solution.json`, REGION);
    }
    catch (error) {
        console.error({ error, bucketName: S3_BUCKET_NAME_DATA, fileName: `${solutionId}/solution.json` });
        return null;
    }
}


export const checkCaller = async (event: any, settings: CheckCallerSettings): Promise<CheckCallerResult> => {

    const { needSolution, verifyReCaptcha } = settings;

    const solutionId = getPropValueOfEvent(event, 'solutionId');
    if (!isNonEmptyString(solutionId) && needSolution) {
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
        settings.ignoreRateLimit = true;
        settings.ignoreAuth = true;
        settings.needSolution = true;
        settings.verifyReCaptcha = false;
        return settings.stopAWSEvent ? { type: 'STOP' } : { type: 'CONTINUE' };
    }

    const result: CheckCallerResult = { context: {}, type: 'CONTINUE' };

    //Get recaptchaToken submitted
    const recaptchaToken = getPropValueOfEvent(event, 'recaptchaToken');
    const sourceIp = event.identity && event.identity.sourceIp;

    //check the rate limit
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

    //need authentication & therefore get user context
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

    //if needSolution=true or verify ReCaptcha, we will need to get solution profile
    if (needSolution || verifyReCaptcha && isNonEmptyString(recaptchaToken)) {
        result.context.solution = await getSolution(solutionId);
        if (!isObject(result.context.solution)) {
            return {
                type: 'ERROR',
                error: {
                    ...HTTPERROR_403,
                    type: 'ERROR_CONTEXT_SOLUTION',
                    source: 'context.checkCaller',
                    detail: {
                        solutionId,
                        settings
                    }
                }
            }
        }
    }

    if (verifyReCaptcha) {

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