//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.


import { decrypt, encrypt } from './crypto';
import { newGuid, utcISOString } from 'douhub-helper-util';
import { isObject, find, map } from 'lodash';
import { getSecretValue } from 'douhub-helper-service';
import { DynamoDB } from 'aws-sdk';
import { DYNAMO_DB_TABLE_NAME_PROFILE, SECRET_ID } from './constants';
import { Token } from './types';

const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });

export const encryptToken = async (id: string): Promise<string> => {
    return encrypt(
        id,
        await getSecretValue(SECRET_ID, 'SECRET_CODE'),
        await getSecretValue(SECRET_ID, 'SECRET_IV'));
};

//Upsert a token record in DynamoDB user profile table, id: tokens.${userId}
export const createToken = async (userId: string, type: string, data: Record<string, any>, allowMultiple?: boolean): Promise<Token> => {

    const id: string = `tokens.${userId}`;
    let token: Token | null = null;
    let profile = (await _dynamoDb.get({ TableName: DYNAMO_DB_TABLE_NAME_PROFILE, Key: { id } }).promise()).Item;
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
        TableName: DYNAMO_DB_TABLE_NAME_PROFILE, Item: profile
    }).promise();

    return token;
};

export const createUserToken = async (userId: string, organizationId: string, roles: Array<string>, allowMultiple?: boolean): Promise<Token | null> => {
    const type: string = 'user';
    let token: Token | null = await getToken(userId, type);
    if (!token) {
        token = await createToken(userId, type, { userId, organizationId, roles }, allowMultiple);
    }
    return token;
};

export const getToken = async (userId: string, type: string): Promise<Token | null> => {

    const id: string = `tokens.${userId}`;
    const profile = (await _dynamoDb.get({ TableName: DYNAMO_DB_TABLE_NAME_PROFILE, Key: { id } }).promise()).Item;
    if (!isObject(profile)) return null;
    const token: Token = find(profile.tokens, (t) => t.type == type);
    return token || null;
};

export const checkToken = async (token: string): Promise<Token | null> => {

    try {
        const userId = (await decrypt(token,
            await getSecretValue(SECRET_ID, 'SECRET_CODE'),
            await getSecretValue(SECRET_ID, 'SECRET_IV'))).split('|')[0];
        const id = `tokens.${userId}`;
        const profile = (await _dynamoDb.get({ TableName: DYNAMO_DB_TABLE_NAME_PROFILE, Key: { id } }).promise()).Item;
        if (!isObject(profile)) return null;
        const result: Token = find(profile.tokens, (t) => t.token == token);
        return result ? result : null;
    }
    catch (error) {
        return null;
    }
};