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


import {createToken} from "./token";
import cosmosDb from "../services/cosmos-db";
import dynamoDb from "../services/dynamo-db";
import cognito from "../services/cognito";
import {isNonEmptyString} from '../moved-to-npm-libs/helper';
import { hasRole, checkRecordPrivilege } from "../util/auth";
import { DynamoDB } from 'aws-sdk';

const _dynamoDb = new DynamoDB.DocumentClient({ region: process.env.REGION });
export const PROFILE_TABLE_NAME = `${process.env.RESOURCE_PREFIX}-profile`;


export const userOrgs = async (email, mobile) => {
    const attributes = 'c.id, c.organizationId, c.emailVerifiedOn, c.mobileVerifiedOn, c.stateCode, c.statusCode, c.latestSignInOn, c.modifiedOn';
    const type = isNonEmptyString(email) ? 'email' : 'mobile';

    return await _.cosmosDBQuery(`SELECT ${attributes} FROM c 
        WHERE c.stateCode=0 AND c.entityName=@entityName 
        AND c.${type}=@value`, [
        {
            name: '@value',
            value: isNonEmptyString(email) ? email : mobile
        },
        {
            name: '@entityName',
            value: 'User'
        }
    ]);
};


export const verifyCode = async (email, mobile, verificationCode) => {

    const users = await _.cosmosDBQuery(`SELECT * FROM c 
        WHERE c.email=@email AND c.emailVerificationCode=@verificationCode 
        OR c.mobile=@mobile AND c.mobileVerificationCode=@verificationCode`, [
        {
            name: '@email',
            value: isNonEmptyString(email) ? email : _.newGuid()
        },
        {
            name: '@mobile',
            value: isNonEmptyString(mobile) ? mobile : _.newGuid()
        },
        {
            name: '@verificationCode',
            value: verificationCode
        }
    ]);

    if (users.length == 0) return false;

    const user = _.assign({}, users[0], users[0].emailVerificationCode == verificationCode ?
        { emailVerifiedOn: _.utcISOString() } :
        { mobileVerifiedOn: _.utcISOString() });

    //direct cosmosDb update
    await _.cosmosDBUpsert(user);
    await _dynamoDb.put({ TableName: PROFILE_TABLE_NAME, Item: _.assign({}, user, { id: `user.${user.id}` }) }).promise();
    return true;
};

export const createUser = async (context, userData, password) => {

    if (!_.isEmail(userData.email) && !_.isPhoneNumber(userData.mobile)) {
        _.throw('ERROR_API_MISSING_PARAMETERS',
            {
                statusCode: 400,
                detail: {
                    paramName: 'email or mobile',
                    userData, password
                }
            });
    }

    const solution = context.solution;

    if (!_.isPassword(password, solution.auth.passwordRules)) {
        _.throw('ERROR_API_CREATE_USER_WRONG_PASSWORD',
            {
                statusCode: 400,
                detail: {
                    paramName: 'email or mobile',
                    userData, password
                }
            });
    }

    const newUserId = _.newGuid();
    const newOrganizationId = _.newGuid();

    let createdCosmosOrganizationId = null;
    let createdDynamoOrganizationId = null;
    let createdCosmosUserId = null;
    let createdDynamoUserId = null;
    let userToken = null;

    userData.id = newUserId;

    try {

        if ((await userOrgs(userData.email, userData.mobile)).length > 0) throw "ERROR_API_USEREXISTS";

        context = _.assign(context, { userId: newUserId, organizationId: newOrganizationId });

        //create organization in cosmosDb
        createdCosmosOrganizationId = newOrganizationId;
        const organization = await cosmosDb.createRecord(
            context,
            {
                id: createdCosmosOrganizationId,
                entityName: "Organization",
                name: 'My Organization',
                solutionId: solution.id,
                disableDelete: true
            }, true);

        //create organization in dynamoDb
        const createdDynamoOrganizationId = `organization.${createdCosmosOrganizationId}`;
        await _dynamoDb.put({ TableName: PROFILE_TABLE_NAME, Item: _.assign({}, organization, { id: createdDynamoOrganizationId }) }).promise();

        context.organization = organization;
        context.organizationId = organization.id;

        userData.organizationId = context.organizationId;
        userData.key = _.serialNumber();
        userData.entityName = "User";
        userData.emailVerificationCode = _.newGuid().split("-")[0].toUpperCase();
        userData.mobileVerificationCode = _.newGuid().split("-")[0].toUpperCase();
        userData.disableDelete = true;
        userData.createdFromDomain = _.getDomain(context.event);

        context.user = userData;
        context.userId = userData.id;

        userData = (await cosmosDb.processUpsertData(context, userData, true)).data;

        //insert user into cosmosDb
        userData = await cosmosDb.createRecord(context, userData, true);
        createdCosmosUserId = userData.id;

        //insert user into dynamoDb
        const createdDynamoUserId = `user.${userData.id}`;
        await _dynamoDb.put({ TableName: PROFILE_TABLE_NAME, Item: _.assign({}, userData, { id: createdDynamoUserId }) }).promise();

        userToken = await createToken(newUserId, 'user', { userId: newUserId, organizationId: newOrganizationId, roles: userData.roles, licenses: userData.licenses });

        await cognito.createUser(
            solution.auth.cognito.userPoolId,
            solution.auth.cognito.userPoolLambdaClientId,
            context.organizationId,
            userData.id,
            password
        );

        return { user: userData, organization };

    } catch (error) {

        console.error(error);


        //we will have to rollback what we have done
        if (createdCosmosOrganizationId) await cosmosDb.deleteRecord(context, createdCosmosOrganizationId, { skipSecurityCheck: true });
        if (createdDynamoOrganizationId) await dynamoDb.deleteRecord(createdDynamoOrganizationId, PROFILE_TABLE_NAME);

        if (createdCosmosUserId) await cosmosDb.deleteRecord(context, createdCosmosUserId, { skipSecurityCheck: true });
        if (createdDynamoUserId) await dynamoDb.deleteRecord(createdDynamoUserId, PROFILE_TABLE_NAME);

        if (_.isObject(userToken)) {
            await _dynamoDb.delete({ TableName: PROFILE_TABLE_NAME, Key: { id: `tokens.${createdCosmosUserId}` } }).promise();
        }

        _.throw('ERROR_API_CREATE_USER',
            {
                statusCode: 400,
                detail: {
                    userData, password
                }
            });
    }
};

export const updateUser = async (context, data) => {

    //only user entity is allowed to be updated here
    if (data.entityName != 'User') {
        _.throw('ERROR_API_UPDATE_USER_ONLY',
            {
                statusCode: 400,
                detail: {
                    data
                }
            });
    }

    const userId = context.userId;

    try {

        let newRoles = _.isArray(data.roles) ? data.roles.slice() : [];
        let newLicenses = _.isArray(data.licenses) ? data.licenses.slice() : [];

        const result = await cosmosDb.processUpsertData(context, data);
        data = result.data;
        const existingData = result.existingData;

        if (!checkRecordPrivilege(context, existingData, 'update')) {
            _.throw('ERROR_API_PERMISSION_DENIED',
                {
                    statusCode: 401,
                    detail: {
                        message: `The user ${userId} has no permission to update the user (${data.id}).`,
                        data
                    }
                });
        }

        //only organization owner, organization manager, or license manager role can change roles and licenses
        if (hasRole(context, 'Org-Owner') || hasRole(context, 'Org-Administrator') || hasRole(context, 'License-Manager')) {
            data.roles = newRoles;
            data.licenses = newLicenses;
        }
        else {
            data.roles = existingData.roles;
            data.licenses = existingData.licenses;
        }

        //delete old props, we do not use system to keep roles and licenses anymore
        if (_.isObject(data.system)) {
            delete data.system.roles;
            delete data.system.licenses;
        }

        if (_.isArray(data.roles)) data.roles = _.uniq(data.roles);
        if (_.isArray(data.licenses)) data.licenses = _.uniq(data.licenses);

        data = (await cosmosDb.processUpsertData(context, data, true)).data;

        //update user into cosmosDb
        data = await cosmosDb.upsertRecord(context, data, 'update');

        //update user into dynamoDb
        await _dynamoDb.put({ TableName: PROFILE_TABLE_NAME, Item: _.assign({}, data, { id: `user.${data.id}` }) }).promise();

        return { user: data };

    }
    catch (error) {
        _.throw('ERROR_API_CREATE_USER',
            {
                statusCode: 400,
                detail: {
                    data
                }
            });
    }
};

export const deleteUser = async (context, id) => {

    const { organizationId, userId } = context;
    const toDeleteUserId = id;

    if (_.sameGuid(toDeleteUserId, userId)) {
        _.throw('ERROR_API_DELETE_USER_DELETE_SELF', { statusCode: 403, message: 'User can not delete self.' });
    }

    const toDeleteUser = await _.cosmosDBRetrieve(toDeleteUserId);

    if (!(_.isObject(toDeleteUser) && toDeleteUser.id)) {
        _.throw('ERROR_API_DELETE_USER_NOT_EXISTS', { statusCode: 400, toDeleteUserId });
    }

    const curUserIsRootAdmin = !hasRole(context, 'Root-Admin');
    const curUserIsOrgAdmin = hasRole(context, 'Org-Admin') && _.sameGuid(toDeleteUser.organizationId, organizationId);

    if (!curUserIsRootAdmin && !curUserIsOrgAdmin) {
        return _.throw('ERROR_API_DELETE_USER_NEED_ORG_ROOT_ADMIN',
            {
                statusCode: 403,
                message: `Only the user with Org-Admin or Root-Admin role can delete the user (${toDeleteUserId}).`
            });
    }

    const toDeleteUserOrganizationId = toDeleteUser.organizationId;
    const toDeleteUserOrganization = await _.cosmosDBRetrieve(toDeleteUserOrganizationId);

    const isDeletingOwnerOfOrganization = _.sameGuid(toDeleteUserOrganization.ownedBy, id);
    if (isDeletingOwnerOfOrganization && !curUserIsRootAdmin) {
        return _.throw('ERROR_API_DELETE_USER_NEED_ROOT_ADMIN',
            {
                statusCode: 403,
                message: `Only the user with Root-Admin role can delete the organization owner (${toDeleteUserId}).`
            });
    }

    //find the records owned, created or modified by the user
    //We only delete non-dependency user that has only two records associated to the user
    //One record is the organization created for the user and the other is the user record itself
    const userData = await _.cosmosDBQuery(
        `SELECT TOP 1 c.id FROM c WHERE c.id NOT IN (@orgId,@userId) AND (c.createdBy=@userId OR c.ownedBy=@userId OR c.modifiedBy=@userId)`,
        [
            {
                name: '@userId',
                value: toDeleteUserId
            },
            {
                name: '@orgId',
                value: toDeleteUserOrganizationId
            }
        ]);


    //we need to make sure the user does not have associated records
    if (userData.length > 0) {
        return _.throw('ERROR_API_USER_DELETE_USERHASDATA', {
            statusCode: 400,
            message: `There are data depending on the user (${toDeleteUserId}), the user can not be deleted.`
        });
    }

    let deleteOrg = false;

    //If the user created by him/herself, it means this is the owner of the organization or the first user of the organization
    if (isDeletingOwnerOfOrganization || _.sameGuid(toDeleteUser.id, toDeleteUser.createdBy)) {
        //Find whether there's other user in the organization 
        const orgUsers = await _.cosmosDBQuery(
            'SELECT c.id FROM c WHERE c.entityName=@entityName AND c.organizationId=@organizationId',
            [
                {
                    name: '@organizationId',
                    value: toDeleteUserOrganizationId
                },
                {
                    name: '@entityName',
                    value: 'User'
                }
            ]);


        if (orgUsers.length == 1) deleteOrg = true;
    }


    //Delete Organization
    if (deleteOrg) {
        await cosmosDb.deleteRecord(context, toDeleteUserOrganizationId, { skipSecurityCheck: true });
        await dynamoDb.deleteRecord(`organization.${toDeleteUserOrganizationId}`, PROFILE_TABLE_NAME);
    }

    //Delete User
    await cosmosDb.deleteRecord(context, toDeleteUserId, { skipSecurityCheck: true });
    await dynamoDb.deleteRecord(`user.${toDeleteUserId}`, PROFILE_TABLE_NAME);

    await _dynamoDb.delete({ TableName: PROFILE_TABLE_NAME, Key: { id: `tokens.${toDeleteUserId}` } }).promise();

    //Delete Cognito User
    await cognito.deleteUser(solution.auth.cognito.userPoolId, toDeleteUserOrganizationId, toDeleteUserId);

    return { toDeleteUserOrganizationId, toDeleteUserId };

};

export default { userOrgs, createUser, deleteUser, verifyCode };