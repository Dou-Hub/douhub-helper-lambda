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
