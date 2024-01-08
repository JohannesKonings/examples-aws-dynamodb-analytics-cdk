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
    Size,
} from 'aws-cdk-lib';
import {
    DeliveryStream as DeliveryStreamAlpha
} from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';


export interface FirehoseParquetProps {
    name: string
    kmsKey: kms.IKey
    firehoseBucket: s3.IBucket
    ddbChangesPrefix: string
    stream: kinesis.Stream
    glueSecurityConfiguration: glueAlpha.SecurityConfiguration
    glueDb: glueAlpha.Database
    table: dynamodb.ITable
    tableName: string
}

export class FirehoseParquet extends Construct {
    constructor(scope: Construct, id: string, props: FirehoseParquetProps) {
        super(scope, id)

        const { kmsKey, firehoseBucket, name, ddbChangesPrefix, stream, glueSecurityConfiguration, glueDb, table, tableName } = props
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
                    glueCrawlerArn,
                    table.tableArn,
                ],
                actions: [
                    'logs:*',
                    'glue:*',
                    'kms:Decrypt',
                    'dynamodb:DescribeTable',
                    'dynamodb:Scan',
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
            logGroup: new logs.LogGroup(this, 'firehose-parquet-s3-log-group', {
                logGroupName: `${name}-firehose-parquet-s3-log-group`,
                removalPolicy: RemovalPolicy.DESTROY,
            }),
            bufferingSize: Size.mebibytes(64),
        })

        const glueTableName = tableName.replace(/-/g, '_')
        console.log(`glueTableName: ${glueTableName}`)
        // https://5k-team.trilogy.com/hc/en-us/articles/360015651640-Configuring-Firehose-with-CDK
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-kinesisfirehose-deliverystream.html


        const firehoseDeliveryStream = new DeliveryStreamAlpha(this, 'Delivery Stream', {
            deliveryStreamName: `${name}-firehose-parquet`,
            sourceStream: stream,
            destinations: [s3Destination],
        })

        const firehoseRole = firehoseDeliveryStream.node.findChild('S3 Destination Role') as iam.Role;
        // firehoseRole.addToPolicy(
        //     new iam.PolicyStatement({
        //         effect: iam.Effect.ALLOW,
        //         resources: [
        //             glueDb.databaseArn,
        //             `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:catalog`
        //         ],
        //         actions: ['glue:GetTable', 'glue:GetTableVersion'],
        //     })
        // );
        firehoseRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ['*'],
                actions: ['*'],
            })
        );

        const firehoseDeliveryStreamCfn = firehoseDeliveryStream.node.defaultChild as CfnDeliveryStream;
        firehoseDeliveryStreamCfn.addPropertyOverride('ExtendedS3DestinationConfiguration.DataFormatConversionConfiguration', {
            inputFormatConfiguration: {
                deserializer: {
                    // These settings might need to be changed based on the use case
                    // This is the default settings when configured through the console
                    openXJsonSerDe: {
                        caseInsensitive: false,
                        // Add hive keywords (e.g. timestamp) if they are added to events schema
                        columnToJsonKeyMappings: {},
                        convertDotsInJsonKeysToUnderscores: false,
                    },
                },
            },
            outputFormatConfiguration: {
                serializer: {
                    parquetSerDe: {
                        compression: 'SNAPPY',
                    },
                },
            },
            schemaConfiguration: {
                databaseName: glueDb.databaseName,
                roleArn: firehoseRole.roleArn,
                tableName: glueTableName,
            },
        });
        firehoseDeliveryStreamCfn.node.addDependency(firehoseRole);

    }
}
