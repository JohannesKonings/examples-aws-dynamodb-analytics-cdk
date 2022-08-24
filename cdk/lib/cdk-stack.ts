import { Construct } from 'constructs'
import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  aws_kms as kms,
  aws_kinesis as kinesis,
  aws_dynamodb as dynamodb,
  aws_s3 as s3,
  aws_lambda_nodejs as lambda,
  aws_iam as iam,
  aws_glue as glue,
  aws_athena as athena,
  Size,
} from 'aws-cdk-lib'

import { LambdaFunctionProcessor as LambdaFunctionProcessorAlpha, DeliveryStream as DeliveryStreamAlpha } from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as destinationsAlpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import { SavedQueries } from './saved-queries/saved-queries'
import { Quicksight } from './quicksight/quicksight'
import { QuicksightRole } from './quicksight/quicksight-role'

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const name = `persons-cdk`

    const kmsKey = new kms.Key(this, 'kmsKey', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    kmsKey.addAlias(name)

    const stream = new kinesis.Stream(this, 'Stream', {
      streamName: `${name}-data-stream`,
      encryption: kinesis.StreamEncryption.KMS,
      encryptionKey: kmsKey,
    })

    const table = new dynamodb.Table(this, 'Table', {
      tableName: name,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kmsKey,
      kinesisStream: stream,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const loader = new lambda.NodejsFunction(this, 'lambda-function-loader', {
      functionName: `${name}-loader`,
      timeout: Duration.minutes(2),
      environment: {
        TABLE_NAME: table.tableName,
      },
    })
    table.grantReadWriteData(loader)

    const firehoseBucketName = `${name}-firehose-s3-bucket`
    const firehoseBucket = new s3.Bucket(this, 'firehose-s3-bucket', {
      bucketName: firehoseBucketName,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const processor = new lambda.NodejsFunction(this, 'lambda-function-processor', {
      functionName: `${name}-firehose-converter`,
      timeout: Duration.minutes(2),
      bundling: {
        sourceMap: true,
      },
    })

    const lambdaProcessor = new LambdaFunctionProcessorAlpha(processor, {
      retries: 5,
    })

    // json format
    const s3Destination = new destinationsAlpha.S3Bucket(firehoseBucket, {
      encryptionKey: kmsKey,
      bufferingInterval: Duration.seconds(60),
      processor: lambdaProcessor,
    })

    // parquet format
    // const s3Destination = new destinationsAlpha.S3Bucket(firehoseBucket, {
    //   encryptionKey: kmsKey,
    //   bufferingInterval: Duration.seconds(60),
    //   processor: lambdaProcessor,
    //   bufferingSize: Size.mebibytes(64),
    // });

    const firehoseDeliveryStream = new DeliveryStreamAlpha(this, 'Delivery Stream', {
      deliveryStreamName: `${name}-firehose`,
      sourceStream: stream,
      destinations: [s3Destination],
    })

    // // https://5k-team.trilogy.com/hc/en-us/articles/360015651640-Configuring-Firehose-with-CDK
    // // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-kinesisfirehose-deliverystream.html
    // const firehoseDeliveryStreamCfn = firehoseDeliveryStream.node.defaultChild as CfnDeliveryStream;
    // firehoseDeliveryStreamCfn.addPropertyOverride('ExtendedS3DestinationConfiguration.DataFormatConversionConfiguration', {
    //   inputFormatConfiguration: {
    //     deserializer: {
    //       // These settings might need to be changed based on the use case
    //       // This is the default settings when configured through the console
    //       openXJsonSerDe: {
    //         caseInsensitive: false,
    //         // Add hive keywords (e.g. timestamp) if they are added to events schema
    //         columnToJsonKeyMappings: {},
    //         convertDotsInJsonKeysToUnderscores: false,
    //       },
    //     },
    //   },
    //   outputFormatConfiguration: {
    //     serializer: {
    //       parquetSerDe: {
    //         compression: 'SNAPPY',
    //       },
    //     },
    //   },
    //   schemaConfiguration: {
    //     databaseName: this.backendStack.glueStack.database.databaseName, // Target Glue database name
    //     roleArn: this.deliveryStreamRole.roleArn,
    //     tableName: this.backendStack.glueStack.eventsTable.tableName, // Target Glue table name
    //   },
    // });

    const athenaQueryResults = new s3.Bucket(this, 'query-results', {
      bucketName: `${name}-query-results`,
      encryptionKey: kmsKey,
    })

    const roleCrawler = new iam.Role(this, 'role crawler', {
      roleName: `${name}-crawler-role`,
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
    })

    roleCrawler.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['glue:GetSecurityConfiguration'],
      })
    )

    const glueDb = new glueAlpha.Database(this, 'glue db', {
      databaseName: `${name}-db`,
    })

    const glueSecurityOptions = new glueAlpha.SecurityConfiguration(this, 'glue security options', {
      securityConfigurationName: `${name}-security-options`,
      s3Encryption: {
        mode: glueAlpha.S3EncryptionMode.KMS,
      },
    })

    const crawler = new glue.CfnCrawler(this, 'crawler', {
      name: `${name}-crawler`,
      role: roleCrawler.roleArn,
      targets: {
        s3Targets: [
          {
            path: `s3://${firehoseBucket.bucketName}`,
          },
        ],
      },
      databaseName: glueDb.databaseName,
      crawlerSecurityConfiguration: glueSecurityOptions.securityConfigurationName,
    })

    const glueCrawlerLogArn = `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws-glue/crawlers:log-stream:${crawler.name}`

    const glueTableArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${glueDb.databaseName}/*`

    const glueCrawlerArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:crawler/${crawler.name}`

    roleCrawler.addToPolicy(
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
        ],
        actions: ['logs:*', 'glue:*', 'kms:Decrypt', 'S3:*'],
      })
    )

    const athenaWorkgroup = new athena.CfnWorkGroup(this, 'analytics-athena-workgroup', {
      name: `${name}-workgroup`,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${athenaQueryResults.bucketName}`,
          encryptionConfiguration: {
            encryptionOption: 'SSE_KMS',
            kmsKey: kmsKey.keyArn,
          },
        },
      },
    })

    // saved queries
    const savedQueries = new SavedQueries(this, 'saved-queries', {
      glueDb: glueDb,
      athenaTableName: firehoseBucketName,
      athenaWorkgroupName: athenaWorkgroup.name,
    })

    savedQueries.node.addDependency(athenaWorkgroup)

    new Quicksight(this, 'quicksight', {
      bucket: firehoseBucket,
    })

    new QuicksightRole(this, 'quicksight-role', {
      name: name,
      bucket: firehoseBucket,
    })
  }
}
