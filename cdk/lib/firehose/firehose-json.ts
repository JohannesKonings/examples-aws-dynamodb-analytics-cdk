import { Construct } from 'constructs'
import * as destinationsAlpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import {
    Duration,
    aws_kms as kms,
    aws_s3 as s3,
    aws_lambda_nodejs as lambda,
    aws_kinesis as kinesis,
    aws_logs as logs,
    RemovalPolicy,
} from 'aws-cdk-lib';
import {
    LambdaFunctionProcessor as LambdaFunctionProcessorAlpha,
    DeliveryStream as DeliveryStreamAlpha
} from '@aws-cdk/aws-kinesisfirehose-alpha'

export interface FirehoseJsonProps {
    name: string
    kmsKey: kms.IKey
    firehoseBucket: s3.IBucket
    ddbChangesPrefix: string
    stream: kinesis.Stream
}

export class FirehoseJson extends Construct {
    constructor(scope: Construct, id: string, props: FirehoseJsonProps) {
        super(scope, id)

        const { kmsKey, firehoseBucket, name, ddbChangesPrefix, stream } = props

        const processor = new lambda.NodejsFunction(this, 'lambda-function-processor', {
            functionName: `${name}-firehose-json-converter`,
            timeout: Duration.minutes(2),
            bundling: {
                sourceMap: true,
            },
        })

        const lambdaProcessor = new LambdaFunctionProcessorAlpha(processor, {
            retries: 5,
        })

        const s3Destination = new destinationsAlpha.S3Bucket(firehoseBucket, {
            encryptionKey: kmsKey,
            bufferingInterval: Duration.seconds(60),
            processor: lambdaProcessor,
            dataOutputPrefix: `${ddbChangesPrefix}/`,
            logGroup: new logs.LogGroup(this, 'firehose--json-s3-log-group', {
                logGroupName: `${name}-firehose-json-s3-log-group`,
                removalPolicy: RemovalPolicy.DESTROY,
            }),
        })

        new DeliveryStreamAlpha(this, 'Delivery Stream', {
            deliveryStreamName: `${name}-firehose-json`,
            sourceStream: stream,
            destinations: [s3Destination],
        })

    }
}
