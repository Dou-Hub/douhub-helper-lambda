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


import { decrypt, encrypt } from './helper';
import { newGuid, utcISOString } from '../moved-to-npm-libs/helper';
import { isObject, find, map } from 'lodash';
import { getSecretValue } from '../services/secret-manager';
import { DynamoDB } from 'aws-sdk';
import { PROFILE_TABLE_NAME } from './constants';
import { Token } from './types';

const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });

export const encryptToken = async (id:string):Promise<string> => {
    return encrypt(
        id,
        await getSecretValue('SECRET_CODE'),
        await getSecretValue('SECRET_IV'));
};

//Upsert a token record in DynamoDB user profile table, id: tokens.${userId}
export const createToken = async (userId: string, type: string, data: object, allowMultiple?: boolean): Promise<Token> => {

    const id: string = `tokens.${userId}`;
    let token: Token | null = null;
    let profile = (await _dynamoDb.get({ TableName: PROFILE_TABLE_NAME, Key: { id } }).promise()).Item;
    token = { token: await encryptToken(`${userId}|${type}|${newGuid()}`), createdOn: utcISOString(), type, data };

    if (!isObject(profile)) {
        //if there is no user tokens profile, we will create one
        profile = { createdOn: utcISOString(), id, tokens: [token] };
    }
    else {
        //if there is a user tokens profile,
        if (allowMultiple) {
            profile.tokens.push(token); // add one more;
        }
        else {
            //not allow multiple, overwrite if there is token with the same type
            profile.tokens = map(profile.tokens, (t) => {
                if (t.type == type) {
                    t.data = data;
                    token = t;
                }
                return t;
            });

            //there is no existing token with the same type, add a new one
            if (!token) {
                profile.tokens.push(token);
            }
        }
    }

    //update token profile record
    await _dynamoDb.put({
        TableName: PROFILE_TABLE_NAME, Item: profile
    }).promise();

    return token;
};

export const createUserToken = async (userId: string, organizationId: string, roles, allowMultiple?: boolean): Promise<Token | null> => {
    const type: string = 'user';
    let token: Token | null = await getToken(userId, type);
    if (!token) {
        token = await createToken(userId, type, { userId, organizationId, roles }, allowMultiple);
    }
    return token;
};

export const getToken = async (userId: string, type: string): Promise<Token | null> => {

    const id: string = `tokens.${userId}`;
    const profile = (await _dynamoDb.get({ TableName: PROFILE_TABLE_NAME, Key: { id } }).promise()).Item;
    if (!isObject(profile)) return null;
    const token: Token = find(profile.tokens, (t) => t.type == type);
    return token || null;
};

export const checkToken = async (token: string): Promise<Token | null> => {

    try {
        const userId = (await decrypt(token,
            await getSecretValue('SECRET_CODE'),
            await getSecretValue('SECRET_IV'))).split('|')[0];
        const id = `tokens.${userId}`;
        const profile = (await _dynamoDb.get({ TableName: PROFILE_TABLE_NAME, Key: { id } }).promise()).Item;
        if (!isObject(profile)) return null;
        const result: Token = find(profile.tokens, (t) => t.token == token);
        return result ? result : null;
    }
    catch (error) {
        return null;
    }
};