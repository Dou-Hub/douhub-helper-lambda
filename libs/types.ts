//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

export type LambdaHeaderOption = {
    'Access-Control-Allow-Origin': string;
    'Content-Type': 'application/json',
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT"
}

export type LambdaError = {
    statusCode: number;
    statusName?: string;
    type?: string;
    types?: string[];
    source?: string;
    detail?: Record<string, any>;
    error?: Record<string, any> | string;
}

export type LambdaResponse = {
    headers: LambdaHeaderOption;
    statusCode: number;
    statusName?: string;
    body: string;
}

export type CheckCallerSettings = {
    apiName?: string,
    apiPoints?: number
    stopAWSEvent?: boolean,
    skipAuthentication?: boolean,
    needAuthorization?: boolean,
    verifyReCaptcha?: boolean,
    ignoreRateLimit?: boolean,
    needUserProfile?: boolean,
    needOrganizationProfile?: boolean,
    needSolution?: boolean
}

export type CheckCallerResult = {
    type: 'STOP' | 'CONTINUE' | 'ERROR',
    solution?: any,
    context?: any,
    error?: LambdaError
}

export type HttpError = {
    statusCode: number,
    statusName: string
}

export type Token = {
    token: string,
    type: string,
    data?: any,
    createdOn: string
}