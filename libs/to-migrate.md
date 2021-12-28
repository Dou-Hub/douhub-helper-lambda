

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
