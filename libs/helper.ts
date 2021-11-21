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

import { getPropValueOfObject, isNonEmptyString, isGuid } from '../moved-to-npm-libs/helper';
import { isObject, find, isNil, isBoolean, isNumber, isArray } from 'lodash';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RATE_LIMIT_DURATION, RATE_LIMIT_POINTS_PER_SECOND } from '../settings';
import { LambdaError, LambdaResponse } from './types';
import CryptoJS from "crypto-js";
import { Base64 } from 'js-base64';
import { ERROR_UNEXPECTED } from './constants';
import { DynamoDB } from 'aws-sdk';

import { getSecretValue } from '../services/secret-manager';
import {S3} from 'aws-sdk';

const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });

const _rateLimiter = new RateLimiterMemory({
    points: isNonEmptyString(process.env.RATE_LIMIT_POINTS_PER_SECOND) ? parseInt(`${process.env.RATE_LIMIT_POINTS_PER_SECOND}`) : RATE_LIMIT_POINTS_PER_SECOND,
    duration: RATE_LIMIT_DURATION, // Per second
});


//Encrypt a string with key and iv
export const encrypt = (s, key, iv) => {

    if (!isNonEmptyString(key)) throw 'Encrypt key is not provided.';
    if (!isNonEmptyString(iv)) throw 'Encrypt iv is not provided.';
    try {
        let result = CryptoJS.AES.encrypt(s, CryptoJS.MD5(key), { iv: CryptoJS.MD5(iv), mode: CryptoJS.mode.CBC });

        result = result.ciphertext.toString(CryptoJS.enc.Base64);
        return Base64.encode(result);
    }
    catch (error) {
        console.error(error);
        return '';
    }
};

//Decrypt a string with key and iv
export const decrypt = (s, key, iv) => {

    if (!isNonEmptyString(key)) throw 'Decrypt key is not provided.';
    if (!isNonEmptyString(iv)) throw 'Decrypt iv is not provided.';

    try {
        s = CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8);
        const result = CryptoJS.AES.decrypt(s, CryptoJS.MD5(key), { iv: CryptoJS.MD5(iv), mode: CryptoJS.mode.CBC });
        return result.toString(CryptoJS.enc.Utf8);
    }
    catch (error) {
        console.error(error);
        return '';
    }
};



export const checkRateLimit = async (sourceIp: string, apiName?: string, points?: number) => {

    const callerId = `${sourceIp}-${apiName}`;

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
    if (!v) v = getPropValueOfObject(event.path, name);
    if (!v) v = getPropValueOfObject(event.body, name);
    if (!v) v = getPropValueOfObject(event.query, name);

    return !isNil(v) ? v : (isNil(defaultValue) ? null : defaultValue);
};

export const getObjectValueOfEvent = (event: any, name: string, defaultValue?: object) => {
    if (!isObject(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    try {
        return isObject(val) ? val : (isNonEmptyString(val) ? JSON.parse(val) : defaultValue);
    }
    catch (error) {
        console.error({ error, name, defaultValue, val });
    }
    return null;
};

export const getGuidValueOfEvent = (event: any, name: string, defaultValue?: string) => {
    if (!isGuid(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return isGuid(val) ? val : defaultValue;
};

export const getIntValueOfEvent = (event: any, name: string, defaultValue?: Number) => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseInt(val)) ? parseInt(val) : defaultValue;
};

export const getFloatValueOfEvent = (event: any, name: string, defaultValue?: Number) => {
    if (!isNumber(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    return !isNaN(parseFloat(val)) ? parseFloat(val) : defaultValue;
};

export const getBooleanValueOfEvent = (event: any, name: string, defaultValue?: Boolean) => {
    if (!isBoolean(defaultValue)) defaultValue = undefined;
    const val = getPropValueOfEvent(event, name);
    if (`${val}`.toLowerCase() == 'true') return true;
    if (`${val}`.toLowerCase() == 'false') return false;
    return isNil(defaultValue) ? null : `${defaultValue}`.toLowerCase() == 'true';
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
export const onSuccess = (data: object): LambdaResponse => {
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


const getCosmosDb = async () => {

    if (_.cosmosDb) return _.cosmosDb;

    const coreDBConnectionInfo = (await _.getSecretValue('COSMOS_DB')).split("|");
    _.cosmosDb = {};

    _.cosmosDb.settings = {
        type: "cosmosDb",
        uri: coreDBConnectionInfo[0],
        key: coreDBConnectionInfo[1],
        collectionId: coreDBConnectionInfo[2],
        databaseId: coreDBConnectionInfo[3],
    };

    try {
        _.cosmosDb.client = new CosmosClient({
            endpoint: _.cosmosDb.settings.uri,
            key: _.cosmosDb.settings.key
        });
    }
    catch (error) {
        console.error({ error, message: 'Failed to new CosmosClient', settings: _.cosmosDb.settings });
        _.cosmosDb = null;
    }

    return _.cosmosDb;
};

_.cosmosDbClient = async () => {
    if (_.cosmosDb) return _.cosmosDb.client;
    return (await getCosmosDb()).client;
};

_.cosmosDbSettings = async () => {
    if (_.cosmosDb) return _.cosmosDb.settings;
    return (await getCosmosDb()).settings;
};

_.handleActionSQS = async (event) => {

    const queueItems = event.Records;

    for (var i = 0; i < queueItems.length; i++) {

        const message = JSON.parse(queueItems[i].body);
        const records = message.Records;
        for (var j = 0; _.isArray(records) && j < records.length; j++) {

            const record = records[j];
            const bucketName = record.s3.bucket.name;
            const fileName = record.s3.object.key;
            const snsTopic = fileName.split('/')[2];  //fileName: `${solutionId}/${organizationId}/${snsTopic}/${id}.json`

            try {

                const message = JSON.stringify({ bucketName, fileName });
                const topicArn = `${process.env.SNS_TOPIC_ARN_PREFIX}-${snsTopic}`;

                // console.log(`Publishing to SNS ${topicArn}`);

                await _.sns.publish({ Message: message, TopicArn: topicArn }).promise();
                // console.log(`The action ${message} was sent to ${topicArn}.`);

            }
            catch (error) {
                console.error({ error });
            }
        }
    }

    return _.onSuccess(event, {});
};

_.sendGraph = async (graph, settings) => {

    if (!_.isObject(settings)) settings = {};
    if (!(_.isArray(graph) && graph.length > 0)) throw new Error(`There's no graph provided in the array format.`);

    for (var i = 0; i < graph.length; i++) {
        const r = graph[i];
        if (!_.isObject(r.source) || !_.isObject(r.target) || !_.isNonEmptyString(r.relationship)) {
            throw new Error(`One of the mandatory props is not defined (source, target, relationship).`);
        }
    }

    settings.mergeData = true;
    return await _.sendAction('graph', { graph }, _.assign({ type: 'graph' }, settings));
};


_.sendMessage = async (template, regarding, settings) => {

    // console.log({ template, regarding, settings });

    if (!_.isObject(settings)) settings = {};
    const errorDetail = { template, regarding, settings };

    if (!_.isObject(template)) _.throw('ERROR_API_SENDMESSAGE_TEMPLATE_NOT_DEFINED', errorDetail);

    const content = template.content;
    if (!_.isObject(content) || _.isObject(content) && Object.keys(content).length == 0) {
        _.throw('ERROR_API_SENDMESSAGE_TEMPLATE_CONTENT_NOT_DEFINED', errorDetail);
    }

    if (_.isArray(settings.methods) && settings.methods.length > 0) template.methods = settings.methods; //the method defined in the settings will overwrite the one from template
    if (!(_.isArray(template.methods) && template.methods.length > 0)) {
        template.methods = [];
        if (content.email) template.methods.push('email');
        if (content.sms) template.methods.push('sms');
        if (content.fcm) template.methods.push('fcm');
        if (content.chat) template.methods.push('chat.fifo');
    }

    if (!(_.isArray(template.methods) && template.methods.length > 0)) {
        _.throw('ERROR_API_SENDMESSAGE_TEMPLATE_METHOD_NOT_DEFINED', errorDetail);
    }

    if (_.isObject(settings.recipients)) {
        //the recipients defined in the settings will overwrite the one from template
        template.recipients = settings.recipients;
    }

    if (!(_.isArray(template.recipients.to) && template.recipients.to.length > 0)) {
        _.throw('ERROR_API_SENDMESSAGE_TEMPLATE_RECIPIENT_TO_NOT_DEFINED', errorDetail);
    }

    //the recipients defined in the settings will overwrite the one from template
    if (settings.sender) template.sender = settings.sender;
    if (!template.sender) template.sender = solution.sender;
    if (!template.sender) {
        _.throw('ERROR_API_SENDMESSAGE_TEMPLATE_SENDER_NOT_DEFINED', errorDetail);
    }

    const ignoreContext = template.ignoreContext && true || false;
    const ignoreUser = template.ignoreUser && true || false;
    const ignoreOrganization = template.ignoreOrganization && true || false;

    //the ignore settings in the template is for reduce the size of the message
    if (ignoreContext || ignoreUser) delete settings.user;
    if (ignoreContext || ignoreOrganization) delete settings.organization;

    //define context props to keep the object small
    if (_.isObject(settings.organization) && _.isNonEmptyString(template.contextOrganizationProps)) {
        settings.organization = _.getSubObject(settings.organization, template.contextOrganizationProps);
    }
    if (_.isObject(settings.user) && _.isNonEmptyString(template.contextUserProps)) {
        settings.user = _.getSubObject(settings.user, template.contextUserProps);
    }

    settings.mergeData = true;

    const ids = [];
    for (var i = 0; i < template.methods.length; i++) {

        ids.push(await _.sendAction(template.methods[i].toLowerCase(),
            { regarding, template },
            _.assign({ type: 'message' }, settings)));
    }

    return ids;
};

_.sendAction = async (snsTopic, data, settings) => {

    if (!_.isObject(settings)) settings = {};

    let { userId, organizationId, user, organization } = settings;

    if (!_.isNonEmptyString(snsTopic)) {
        return _.onError(
            HTTPERROR_400, {
            name: 'ERROR_API_MISSING_PARAMETERS',
            detail: {
                paramName: 'snsTopic',
                snsTopic, data, settings
            }
        });
    }

    if (settings.requireUserId && !_.isNonEmptyString(userId)) {
        return _.onError(
            HTTPERROR_400, {
            name: 'ERROR_API_MISSING_PARAMETERS',
            detail: {
                paramName: 'settings.userId',
                snsTopic, data, settings
            }
        });
    }
    if (settings.requireOrganizationId && !_.isNonEmptyString(organizationId)) {
        if (_.isObject(user) && _.isNonEmptyString(user.organizationId)) {
            organizationId = user.organizationId;
        }
        else {
            return _.onError(
                HTTPERROR_400, {
                name: 'ERROR_API_MISSING_PARAMETERS',
                detail: {
                    paramName: 'settings.organizationId',
                    snsTopic, data, settings
                }
            });
        }
    }

    if (!_.isObject(data)) data = {};
    if (!_.isNonEmptyString(settings.type)) settings.type = 'action';
    if (!_.isNonEmptyString(organizationId)) organizationId = GUID_EMPTY;

    const id = _.isNonEmptyString(settings.id) ? settings.id : _.newGuid();
    const name = _.isNonEmptyString(settings.name) ? settings.name : '';
    const s3FileName = `${solutionId}/${organizationId}/${snsTopic}/${_.isNonEmptyString(name) ? name + '/' : ''}${id}.json`;
    const s3BucketName = `${process.env.RESOURCE_PREFIX}-${settings.type}`;

    const item = _.assign((settings.mergeData ? data : { data }), { settings }, {
        id, createdOn: _.utcISOString(),
        user, organization,
        createdBy: userId, solutionId, organizationId,
        snsTopic, s3BucketName, s3FileName
    });
    if (_.isNonEmptyString(name)) item.name = settings.name;

    // console.log(`send ${settings.type}`, JSON.stringify(item));

    try {
        await _.s3.putObject({
            Bucket: s3BucketName,
            Key: s3FileName,
            Body: JSON.stringify(item)
        }).promise();
    } catch (error) {
        return _.onError(
            error, {
            name: '_.sendAction',
            detail: {
                snsTopic, data, settings,
                s3BucketName, s3FileName
            }
        });
    }
    return item;
};

//START: DYNAMODB HELPER

_dynamoDbGet = async (tableName, keyName, keyValue) => {
    const key = {};
    key[keyName] = keyValue;
    const params = { TableName: tableName, Key: key };
    const result = (await _dynamoDb.get(params).promise()).Item;
    return result;
};

_dynamoDbSet = async (tableName, data) => {
    await _dynamoDb.put({
        TableName: tableName,
        Item: data
    }).promise();
};

//END: DYNAMODB HELPER

