//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

export {
    ERROR_PARAMETER_MISSING,
    ERROR_PARAMETER_INVALID,
    ERROR_TOO_MANY_REQUESTS,
    ERROR_AUTH_FAILED,
    ERROR_UNEXPECTED,
    ERROR_PERMISSION_DENIED,
    ERROR_S3,
    ERROR_COSMOS_DB,
    ERROR_DYNAMO_DB,

    DYNAMO_DB_PROFILE_TABLE,
    S3_DATA_BUCKET,
    S3_PHOTO_BUCKET,
    S3_VIDEO_BUCKET,

    HTTPERROR_400,
    HTTPERROR_401,
    HTTPERROR_402,
    HTTPERROR_403,
    HTTPERROR_404,
    HTTPERROR_405,
    HTTPERROR_406,
    HTTPERROR_407,
    HTTPERROR_408,
    HTTPERROR_429,
    HTTPERROR_500,
    HTTPERROR_501,
    HTTPERROR_502,
    HTTPERROR_503,
    HTTPERROR_504,

    RATE_LIMIT_DURATION,
    RATE_LIMIT_POINTS_PER_SECOND,

} from './libs/constants';


export {
    checkRateLimit,
    getPropValueOfEvent,
    getObjectValueOfEvent,
    getGuidValueOfEvent,
    getIntValueOfEvent,
    getFloatValueOfEvent,
    getBooleanValueOfEvent,
    getArrayPropValueOfEvent,
    onError,
    onSuccess,
    s3Uploader,
    getDomain
} from './libs/helper';

export {
    verifyReCaptchaToken,
    parseAccessToken,
    parseApiToken,
    getContext,
    getSolution,
    checkCaller
} from './libs/context';

export {
    encryptToken,
    decryptToken,
    
    createToken,
    getToken,
    checkToken,
    
    createUserToken,
    getUserToken,
} from './libs/token';

export {
    LambdaHeaderOption,
    LambdaError,
    LambdaResponse,
    CheckCallerSettings,
    CheckCallerResult,
    HttpError,
    Token
} from './libs/types';


export {
    ActionSettings,
    sendAction,
    sendMessage,
    processSNSRecords,
    getActionDataFromSNSRecord,
    validateActionDataFromSNSRecord,
    callFromAWSEvents
} from './libs/util';


