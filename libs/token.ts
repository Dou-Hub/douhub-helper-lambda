//  Copyright PrimeObjects Software Inc. and other contributors <https://www.primeobjects.com/>
// 
//  This source code is licensed under the MIT license.
//  The detail information can be found in the LICENSE file in the root directory of this source tree.


import { decrypt, encrypt } from './crypto';
import { newGuid, utcISOString } from 'douhub-helper-util';
import { find, map } from 'lodash';
import { getSecretValue, dynamoDBRetrieve, dynamoDBCreate, DYNAMO_DB_TABLE_NAME_PROFILE } from 'douhub-helper-service';
import { Token } from './types';

export const encryptToken = async (id: string): Promise<string> => {
    return encrypt(
        id,
        await getSecretValue('SECRET_CODE'),
        await getSecretValue('SECRET_IV'));
};

export const decryptToken = async (token: string): Promise<string> => {
    return decrypt(
        token,
        await getSecretValue('SECRET_CODE'),
        await getSecretValue('SECRET_IV'));
};

//Upsert a token record in DynamoDB user profile table, id: tokens.${userId}
export const createToken = async (userId: string, type: string, data: Record<string, any>, allowMultiple?: boolean): Promise<Token> => {

    const id: string = `tokens.${userId}`;
    let profile: Record<string, any> = await dynamoDBRetrieve(id, DYNAMO_DB_TABLE_NAME_PROFILE);
    let token = { token: await encryptToken(`${userId}|${type}|${newGuid()}`), createdOn: utcISOString(), type, data };
   
    if (!profile) {
        //if there is no user tokens profile, we will create one
        profile = { createdOn: utcISOString(), id, tokens: [token] };
    }
    else {
        if (!profile.tokens) profile.tokens = [];

        //if there is a user tokens profile,
        if (allowMultiple) {
            profile.tokens.push(token); // add one more;
        }
        else {

            let tokenExist = false;
            //not allow multiple, overwrite if there is token with the same type
            profile.tokens = map(profile.tokens, (t) => {
                if (t.type == type) {
                    t.data = data;
                    tokenExist = true;
                }
                return t;
            });

            //there is no existing token with the same type, add a new one
            if (!tokenExist) {
                profile.tokens.push(token);
            }
        }
    }

    //update token profile record
    await dynamoDBCreate(profile, DYNAMO_DB_TABLE_NAME_PROFILE);

    return token;
};


export const createUserToken = async (userId: string, organizationId: string, roles: Array<string>, allowMultiple?: boolean): Promise<Token> => {
    const type = 'user';
    let token = await getToken(userId, type);
    if (!token) {
        token = await createToken(userId, type, { userId, organizationId, roles }, allowMultiple);
    }
    return token;
};

export const getToken = async (userId: string, type: string): Promise<Token | null> => {
    const id: string = `tokens.${userId}`;
    const profile: Record<string, any> = await dynamoDBRetrieve(id, DYNAMO_DB_TABLE_NAME_PROFILE);
    if (!profile) return null;
    const token: Token = find(profile.tokens, (t) => t.type == type);
    return token || null;
};

export const checkToken = async (token: string): Promise<Token | null> => {

    try {
        const userId = (await decryptToken(token)).split('|')[0];
        const id = `tokens.${userId}`;
        const profile: Record<string, any> = await dynamoDBRetrieve(id, DYNAMO_DB_TABLE_NAME_PROFILE);
        if (!profile) return null;
        const result: Token = find(profile.tokens, (t) => t.token == token);
        return result ? result : null;
    }
    catch (error) {
        return null;
    }
};