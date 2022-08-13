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
} from 'aws-cdk-lib'

// import * as dynamodb from '@aws-cdk/aws-dynamodb'
// import * as kinesis from '@aws-cdk/aws-kinesis'
// import * as s3 from '@aws-cdk/aws-s3'
// import * as destinations from '@aws-cdk/aws-kinesisfirehose-destinations'
// import * as firehose from '@aws-cdk/aws-kinesisfirehose'
// import * as lambda from '@aws-cdk/aws-lambda-nodejs'
// import * as glue from '@aws-cdk/aws-glue'
// import * as iam from '@aws-cdk/aws-iam'
// import * as athena from '@aws-cdk/aws-athena'
import { LambdaFunctionProcessor as LambdaFunctionProcessorAlpha, DeliveryStream as  DeliveryStreamAlpha} from '@aws-cdk/aws-kinesisfirehose-alpha'
import * as destinationsAlpha from '@aws-cdk/aws-kinesisfirehose-destinations-alpha'
import * as glueAlpha from '@aws-cdk/aws-glue-alpha';

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

    const firehoseBucket = new s3.Bucket(this, 'firehose-s3-bucket', {
      bucketName: `${name}-firehose-s3-bucket`,
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

    const s3Destination = new destinationsAlpha.S3Bucket(firehoseBucket, {
      encryptionKey: kmsKey,
      bufferingInterval: Duration.seconds(60),
      processor: lambdaProcessor,
    })

    const firehoseDeliveryStream = new DeliveryStreamAlpha(this, 'Delivery Stream', {
      deliveryStreamName: `${name}-firehose`,
      sourceStream: stream,
      destinations: [s3Destination],
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
      cloudWatchEncryption: {
        mode: glueAlpha.CloudWatchEncryptionMode.KMS,
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
