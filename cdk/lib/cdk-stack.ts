import * as cdk from '@aws-cdk/core'
import * as kms from '@aws-cdk/aws-kms'
import * as dynamodb from '@aws-cdk/aws-dynamodb'
import * as kinesis from '@aws-cdk/aws-kinesis'
import * as s3 from '@aws-cdk/aws-s3'
import * as destinations from '@aws-cdk/aws-kinesisfirehose-destinations'
import * as firehose from '@aws-cdk/aws-kinesisfirehose'
import * as glue from '@aws-cdk/aws-glue'
import * as iam from '@aws-cdk/aws-iam'
import * as athena from '@aws-cdk/aws-athena'

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const name = `persons-cdk`

    const kmsKey = new kms.Key(this, 'kmsKey', {
      enableKeyRotation: true,
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
    })

    const firehoseBucket = new s3.Bucket(this, 'firehose-s3-bucket', {
      bucketName: `${name}-firehose-s3-bucket`,
      encryptionKey: kmsKey,
    })

    const firehoseDeliveryStream = new firehose.DeliveryStream(this, 'Delivery Stream', {
      deliveryStreamName: `${name}-firehose`,
      sourceStream: stream,
      destinations: [new destinations.S3Bucket(firehoseBucket)],
    })

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
        resources: [kmsKey.keyArn],
        actions: ['glue:GetSecurityConfiguration'],
      })
    )

    const glueDb = new glue.Database(this, 'glue db', {
      databaseName: `${name}-db`,
    })

    const glueSecurityOptions = new glue.SecurityConfiguration(this, 'glue security options', {
      securityConfigurationName: `${name}-security-options`,
      s3Encryption: {
        mode: glue.S3EncryptionMode.KMS,
      },
      cloudWatchEncryption: {
        mode: glue.CloudWatchEncryptionMode.KMS,
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

    const glueCrawlerLogArn = `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws-glue/crawlers:log-stream:${crawler.name}`

    const glueTableArn = `arn:aws:glue:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/${glueDb.databaseName}/*`

    const glueCrawlerArn = `arn:aws:glue:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:crawler/${crawler.name}`

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

    new athena.CfnWorkGroup(this, 'analytics-athena-workgroup', {
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
  }
}
