//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.

import { HttpError } from './types';

export const ERROR_PARAMETER_MISSING = 'ERROR_PARAMETER_MISSING';
export const ERROR_PARAMETER_INVALID = 'ERROR_PARAMETER_INVALID';
export const ERROR_TOO_MANY_REQUESTS = 'ERROR_TOO_MANY_REQUESTS';
export const ERROR_AUTH_FAILED = 'ERROR_AUTH_FAILED';
export const ERROR_UNEXPECTED = 'ERROR_UNEXPECTED';

export const HTTPERROR_400: HttpError = { statusCode: 400, statusName: 'Bad Request' };
export const HTTPERROR_401: HttpError = { statusCode: 401, statusName: 'Unauthorized' };
export const HTTPERROR_402: HttpError = { statusCode: 402, statusName: 'Payment Required' };
export const HTTPERROR_403: HttpError = { statusCode: 403, statusName: 'Forbidden' };
export const HTTPERROR_404: HttpError = { statusCode: 404, statusName: 'Not Found' };
export const HTTPERROR_405: HttpError = { statusCode: 405, statusName: 'Method Not Allowed' };
export const HTTPERROR_406: HttpError = { statusCode: 405, statusName: 'Not Acceptable' };
export const HTTPERROR_407: HttpError = { statusCode: 407, statusName: 'Proxy Authentication Required' };
export const HTTPERROR_408: HttpError = { statusCode: 408, statusName: 'Request Timeout' };
export const HTTPERROR_429: HttpError = { statusCode: 429, statusName: 'Too Many Requests' };
export const HTTPERROR_500: HttpError = { statusCode: 500, statusName: 'Internal Server Error' };
export const HTTPERROR_501: HttpError = { statusCode: 501, statusName: 'Not Implemented' };
export const HTTPERROR_502: HttpError = { statusCode: 502, statusName: 'Bad Gateway' };
export const HTTPERROR_503: HttpError = { statusCode: 503, statusName: 'Service Unavailable' };
export const HTTPERROR_504: HttpError = { statusCode: 504, statusName: 'Gateway Timeout' };

export const RATE_LIMIT_DURATION: number = process.env.RATE_LIMIT_DURATION ? parseInt(process.env.RATE_LIMIT_DURATION) : 1;
export const RATE_LIMIT_POINTS_PER_SECOND: number = process.env.RATE_LIMIT_POINTS_PER_SECOND ? parseInt(process.env.RATE_LIMIT_POINTS_PER_SECOND) : 2;