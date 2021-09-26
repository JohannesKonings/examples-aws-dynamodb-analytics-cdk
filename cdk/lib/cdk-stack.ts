import * as cdk from "@aws-cdk/core";
import * as kms from "@aws-cdk/aws-kms";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as kinesis from "@aws-cdk/aws-kinesis";
import * as s3 from "@aws-cdk/aws-s3";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const name = `persons-cdk`;

    const kmsKey = new kms.Key(this, "kmsKey", {
      enableKeyRotation: true,
    });

    kmsKey.addAlias(name);

    const stream = new kinesis.Stream(this, "Stream", {
      streamName: `${name}-data-stream`,
      encryption: kinesis.StreamEncryption.KMS,
      encryptionKey: kmsKey,
    });

    const table = new dynamodb.Table(this, "Table", {
      tableName: name,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kmsKey,
      kinesisStream: stream,
    });

    const firehoseBucket = new s3.Bucket(this, "firehose-s3-bucket", {
      bucketName: `${name}-firehose-s3-bucket`,
      encryptionKey: kmsKey,
    });

    const athenaQueryResults = new s3.Bucket(this, "query-results", {
      bucketName: `${name}-query-results`,
      encryptionKey: kmsKey,
    });
  }
}
