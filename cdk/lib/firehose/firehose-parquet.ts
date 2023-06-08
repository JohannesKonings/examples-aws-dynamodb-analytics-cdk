import { Construct } from 'constructs'
import * as destinationsAlpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import {
    Duration,
    aws_kms as kms,
    aws_iam as iam,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_glue as glue,
    aws_kinesis as kinesis,
    aws_logs as logs,
    RemovalPolicy,
    Stack,
} from 'aws-cdk-lib';
import {
    LambdaFunctionProcessor as LambdaFunctionProcessorAlpha,
    DeliveryStream as DeliveryStreamAlpha
} from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha'


export interface FirehoseParquetProps {
    name: string
    kmsKey: kms.IKey
    firehoseBucket: s3.IBucket
    ddbChangesPrefix: string
    stream: kinesis.Stream
    glueSecurityConfiguration: glueAlpha.SecurityConfiguration
    glueDb: glueAlpha.Database
    table: dynamodb.ITable
}

export class FirehoseParquet extends Construct {
    constructor(scope: Construct, id: string, props: FirehoseParquetProps) {
        super(scope, id)

        const { kmsKey, firehoseBucket, name, ddbChangesPrefix, stream, glueSecurityConfiguration, glueDb, table } = props
        const roleName = `${name}-crawler-ddb-role`;
        const roleCrawlerddb = new iam.Role(this, 'roleCrawlerDdb', {
            roleName: roleName,
            assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
        })

        const crawlerName = `${name}-ddb-crawler`;
        const crawler = new glue.CfnCrawler(this, 'crawler-ddb', {
            name: crawlerName,
            role: roleCrawlerddb.roleArn,
            targets: {
                dynamoDbTargets: [
                    {
                        path: table.tableName,
                    },
                ],
            },
            databaseName: glueDb.databaseName,
            crawlerSecurityConfiguration: glueSecurityConfiguration.securityConfigurationName,
            configuration: JSON.stringify({
                Version: 1.0,
                Grouping: { TableGroupingPolicy: 'CombineCompatibleSchemas' },
                CrawlerOutput: {
                    Partitions: { AddOrUpdateBehavior: 'InheritFromTable' },
                },
            }),
        })

        const glueCrawlerLogArn = `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws-glue/crawlers-role/${roleName}-*:log-stream:${crawlerName}`;

        const glueTableArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${glueDb.databaseName}/*`

        const glueCrawlerArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:crawler/${crawler.name}`
        roleCrawlerddb.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    glueCrawlerLogArn,
                    glueTableArn,
                    glueDb.catalogArn,
                    glueDb.databaseArn,
                    kmsKey.keyArn,
                    firehoseBucket.bucketArn,
                    `${firehoseBucket.bucketArn}/*`,
                    glueCrawlerArn,
                    table.tableArn,
                ],
                actions: [
                    'logs:*',
                    'glue:*',
                    'kms:Decrypt',
                    'S3:*',
                    'dynamodb:DescribeTable',
                ],
            })
        )
        roleCrawlerddb.addToPolicy(
            new iam.PolicyStatement({
                resources: ['*'],
                actions: ['glue:GetSecurityConfiguration'],
            })
        )
        glueSecurityConfiguration.node.addDependency(roleCrawlerddb)


        const s3Destination = new destinationsAlpha.S3Bucket(firehoseBucket, {
            encryptionKey: kmsKey,
            bufferingInterval: Duration.seconds(60),
            dataOutputPrefix: `${ddbChangesPrefix}/`,
            logGroup: new logs.LogGroup(this, 'firehose--parquet-s3-log-group', {
                logGroupName: `${name}-firehose-parquet-s3-log-group`,
                removalPolicy: RemovalPolicy.DESTROY,
            }),
        })

        new DeliveryStreamAlpha(this, 'Delivery Stream', {
            deliveryStreamName: `${name}-firehose-parquet`,
            sourceStream: stream,
            destinations: [s3Destination],
        })

    }
}
