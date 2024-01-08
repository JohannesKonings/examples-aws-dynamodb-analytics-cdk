import { Construct } from 'constructs'
import {
  Stack,
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
  StackProps,
} from 'aws-cdk-lib'

import * as glueAlpha from '@aws-cdk/aws-glue-alpha'
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose'
import { SavedQueries } from './saved-queries/saved-queries'
import { Quicksight } from './quicksight/quicksight'
import { QuicksightRole } from './quicksight/quicksight-role'
import { DdbExport } from './ddb-export/ddb-export'
import { DdbExportStepFunction } from './ddb-export/ddb-export-step-function'
import { Config } from '../bin/config'
import { FirehoseJson } from './firehose/firehose-json'
import { FirehoseParquet } from './firehose/firehose-parquet'
import { th } from '@faker-js/faker'


export interface CdkStackProps extends StackProps {
  config: Config
}

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: CdkStackProps) {
    super(scope, id, props)

    const name = `persons-cdk`

    const kmsKey = new kms.Key(this, 'kmsKey', {
      enableKeyRotation: true,
      pendingWindow: Duration.days(7),
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
      pointInTimeRecovery: true,
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

    const glueSecurityConfiguration = new glueAlpha.SecurityConfiguration(this, 'glue security options', {
      securityConfigurationName: `${name}-security-options`,
      s3Encryption: {
        mode: glueAlpha.S3EncryptionMode.KMS,
        kmsKey: kmsKey,
      },
    })

    const glueDb = new glueAlpha.Database(this, 'glue db', {
      databaseName: `${name}-db`,
    })

    let ddbChangesPrefix;

    switch (props?.config.kinesisFormat) {
      case 'JSON':
        ddbChangesPrefix = 'ddb-changes-json';
        new FirehoseJson(this, 'firehoseJson', {
          name: name,
          kmsKey: kmsKey,
          firehoseBucket: firehoseBucket,
          ddbChangesPrefix: ddbChangesPrefix,
          stream: stream,
        })
        break;
      case 'PARQUET':
        ddbChangesPrefix = 'ddb-changes-parquet';
        new FirehoseParquet(this, 'firehoseJson', {
          name: name,
          kmsKey: kmsKey,
          firehoseBucket: firehoseBucket,
          ddbChangesPrefix: ddbChangesPrefix,
          stream: stream,
          glueSecurityConfiguration: glueSecurityConfiguration,
          glueDb: glueDb,
          table: table,
          tableName: name,
        })
        break;
      default: throw new Error('kinesisFormat not supported');
    }

    const athenaQueryResults = new s3.Bucket(this, 'query-results', {
      bucketName: `${name}-query-results`,
      encryptionKey: kmsKey,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const roleCrawler = new iam.Role(this, 'role crawler', {
      roleName: `${name}-crawler-role`,
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
    })

    const crawler = new glue.CfnCrawler(this, 'crawler', {
      name: `${name}-crawler`,
      role: roleCrawler.roleArn,
      targets: {
        s3Targets: [
          {
            path: `s3://${firehoseBucket.bucketName}/${ddbChangesPrefix}`,
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

    // const glueCrawlerLogArn = `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws-glue/crawlers:log-stream:${crawler.name}`
    // const glueCrawlerLogArn = `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`;

    const glueTableArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:table/${glueDb.databaseName}/*`
    // const glueTableArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:*`;

    const glueCrawlerArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:crawler/${crawler.name}`
    // const glueCrawlerArn = `arn:aws:glue:${Stack.of(this).region}:${Stack.of(this).account}:*`;

    roleCrawler.addToPolicy(
      new iam.PolicyStatement({
        resources: [
          // glueCrawlerLogArn,
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
    roleCrawler.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['glue:GetSecurityConfiguration'],
      })
    )
    glueSecurityConfiguration.node.addDependency(roleCrawler)
    // crawler.node.addDependency(roleCrawler)

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
      athenaTableName: ddbChangesPrefix,
      athenaWorkgroupName: athenaWorkgroup.name,
    })

    savedQueries.node.addDependency(athenaWorkgroup)

    if (props?.config.isQuicksight) {
      let quicksightUsername;
      if (process.env.QUICKSIGHT_USERNAME) {
        quicksightUsername = process.env.QUICKSIGHT_USERNAME;
      } else {
        throw new Error('QUICKSIGHT_USERNAME environment variable is required');
      }

      new Quicksight(this, 'quicksight', {
        bucket: firehoseBucket,
        name: name,
        prefix: ddbChangesPrefix,
        quicksightUsername: quicksightUsername,
      })

      new QuicksightRole(this, 'quicksight-role', {
        name: name,
        bucket: firehoseBucket,
      })
    }

    new DdbExport(this, 'ddb-export', {
      name: name,
      table: table,
      firehoseBucket: firehoseBucket,
      athenaResultBucket: athenaQueryResults,
      glueDb: glueDb,
      athenaWorkgroup: athenaWorkgroup,
    })

    new DdbExportStepFunction(this, 'ddb-export-step-function', {
      name: name,
      table: table,
      firehoseBucket: firehoseBucket,
      athenaResultBucket: athenaQueryResults,
      glueDb: glueDb,
      athenaWorkgroup: athenaWorkgroup,
    })
  }
}
