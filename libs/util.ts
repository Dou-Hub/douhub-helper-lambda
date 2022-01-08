import {isObject, isNonEmptyString, newGuid, getSubObject, utcISOString, GUID_EMPTY, _track} from 'douhub-helper-util';
import {HTTPERROR_400, ERROR_PARAMETER_MISSING, HTTPERROR_500 , ERROR_S3} from './constants';
import {s3PutObject, RESOURCE_PREFIX, s3GetObject} from 'douhub-helper-service';
import {isArray, assign} from 'lodash';

export const callFromAWSEvents = (event: Record<string,any>) => {
    return event.source == "aws.events";
};


export const sendMessage = async (template: Record<string,any>, regarding?: Record<string,any> , settings?: Record<string,any>) => {

    // console.log({ template, regarding, settings });
    const source = 'douhub-helper-service.sendMessage';

    if (!isObject(settings)) settings = {};
    const errorDetail = { template, regarding, settings };

    if (!isObject(template)) 
    {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'template',
                template, regarding, settings
            }
        }
    }

    const content = template.content;
    if (!isObject(content) || isObject(content) && Object.keys(content).length == 0) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'template.content',
                template, regarding, settings
            }
        }
    }

    if (!settings) settings = {};

    if (isArray(settings.methods) && settings.methods.length > 0) template.methods = settings.methods; //the method defined in the settings will overwrite the one from template
    if (!(isArray(template.methods) && template.methods.length > 0)) {
        template.methods = [];
        if (content.email) template.methods.push('email');
        if (content.sms) template.methods.push('sms');
        if (content.fcm) template.methods.push('fcm');
        if (content.chat) template.methods.push('chat.fifo');
    }

    if (!(isArray(template.methods) && template.methods.length > 0)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'template.methods',
                template, regarding, settings
            }
        }
    }

    if (isObject(settings.recipients)) {
        //the recipients defined in the settings will overwrite the one from template
        template.recipients = settings.recipients;
    }

    if (!(isArray(template?.recipients?.to) && template?.recipients?.to?.length > 0)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'template.recipients.to',
                template, regarding, settings
            }
        }
    }

    //the recipients defined in the settings will overwrite the one from template
    if (settings.sender) template.sender = settings.sender;
    if (!template.sender) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'template.sender',
                template, regarding, settings
            }
        }
    }

    const ignoreContext = template.ignoreContext && true || false;
    const ignoreUser = template.ignoreUser && true || false;
    const ignoreOrganization = template.ignoreOrganization && true || false;

    //the ignore settings in the template is for reduce the size of the message
    if (ignoreContext || ignoreUser) delete settings.user;
    if (ignoreContext || ignoreOrganization) delete settings.organization;

    //define context props to keep the object small
    if (isObject(settings.organization) && isNonEmptyString(template.contextOrganizationProps)) {
        settings.organization = getSubObject(settings.organization, template.contextOrganizationProps);
    }
    if (isObject(settings.user) && isNonEmptyString(template.contextUserProps)) {
        settings.user = getSubObject(settings.user, template.contextUserProps);
    }

    settings.mergeData = true;

    const ids = [];
    for (var i = 0; i < template.methods.length; i++) {

        ids.push(await sendAction(template.methods[i].toLowerCase(),
            { regarding, template },
            assign({ type: 'message' }, settings)));
    }

    return ids;
};

export const sendAction = async (snsTopic:string, data:Record<string,any>, settings:Record<string,any>) => {

    if (!isObject(settings)) settings = {};

    let { userId, organizationId, user, organization, requireUserId, requireOrganizationId, solutionId } = settings;
    const source = 'douhub-helper-service.sendAction';

    if (!isNonEmptyString(snsTopic)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'snsTopic',
                snsTopic, data, settings
            }
        }
    }

    if (requireUserId==true && !isNonEmptyString(userId)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'settings.userId',
                snsTopic, data, settings
            }
        }
    }

    if (requireOrganizationId==true && !isNonEmptyString(organizationId)) {
        if (isObject(user) && isNonEmptyString(user.organizationId)) {
            organizationId = user.organizationId;
        }
        else {
            throw {
                ...HTTPERROR_400,
                type: ERROR_PARAMETER_MISSING,
                source,
                detail: {
                    paramName: 'settings.organizationId',
                    snsTopic, data, settings
                }
            }
        }
    }

    if (!isObject(data)) data = {};
    if (!isNonEmptyString(settings.type)) settings.type = 'action';
    if (!isNonEmptyString(organizationId)) organizationId = GUID_EMPTY;

    const id = isNonEmptyString(settings.id) ? settings.id : newGuid();
    const name = isNonEmptyString(settings.name) ? settings.name : '';
    const s3FileName = `${solutionId}/${organizationId}/${snsTopic}/${isNonEmptyString(name) ? name + '/' : ''}${id}.json`;
    const s3BucketName = `${RESOURCE_PREFIX}-${settings.type}`;

    const item = assign((settings.mergeData ? data : { data }), { settings }, {
        id, createdOn: utcISOString(),
        user, organization,
        createdBy: userId, solutionId, organizationId,
        snsTopic, s3BucketName, s3FileName
    });
    if (isNonEmptyString(name)) item.name = settings.name;

    try {
        await s3PutObject(s3BucketName,s3FileName,item);
    } catch (error) {
        throw {
            ...HTTPERROR_500,
            type: ERROR_S3,
            source,
            detail: {
                functionName: 's3PutObject',
                snsTopic, data, settings, error,
                s3BucketName,s3FileName,item
            }
        }
    }
    return item;
};

//Process SNS Records
export const processSNSRecords = async (records: Array<Record<string, any>>, onMessage: any, onError?: any):
    Promise<{ finished: Array<Record<string, any>>, failed: Array<Record<string, any>> }> => {

    const finished = [];
    const failed = [];
    for (var i = 0; i < records.length; i++) {
        const record = records[i];
        const message = JSON.parse(record.Sns.Message);
        try {
            if (onMessage) await onMessage(message);
            finished.push({ message });
        }
        catch (error) {
            const errorInfo = {
                detail: { record }
            };
            if (_track) console.log({ error, record });
            if (onError) await onError(error, errorInfo);
            failed.push({ message, error });
        }
    }

    return { finished, failed };
};


//record -> {bucketName, fileName}
//We will read the action detail from S3 file
export const getActionDataFromSNSRecord = async (record: Record<string, any>) => {
    return await s3GetObject(record.bucketName, record.fileName);
};

export const validateActionDataFromSNSRecord = (data: Record<string, any>, settings?: Record<string, any>) => {

    const source = 'sns.validateActionDataFromSNSRecord';

    if (!isObject(settings)) settings = {};

    if (!isObject(data) && !settings?.ignoreData) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'data',
                data
            }
        }
    }

    if (settings?.requireUserId && !isNonEmptyString(settings.userId)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'settings.userId',
                data
            }
        }
    }

    if (settings?.requireOrganizationId && !isNonEmptyString(settings.organizationId)) {
        if (isObject(settings.user) && isNonEmptyString(settings?.user?.organizationId)) {
            settings.organizationId = settings?.user?.organizationId;
        }
        else {
            throw {
                ...HTTPERROR_400,
                type: ERROR_PARAMETER_MISSING,
                source,
                detail: {
                    paramName: 'settings.organizationId',
                    data
                }
            }
        }
    }

    if (settings?.requireOrganization && !isObject(settings.organization)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'settings.organization',
                data
            }
        }
    }

    if (settings?.requireUser && !isObject(settings.user)) {
        throw {
            ...HTTPERROR_400,
            type: ERROR_PARAMETER_MISSING,
            source,
            detail: {
                paramName: 'settings.organization',
                data
            }
        }
    }
};
