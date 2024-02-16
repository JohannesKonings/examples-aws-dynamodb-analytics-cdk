import { join } from "node:path";

import {
  DeliveryStream,
  IDeliveryStream,
  LambdaFunctionProcessor,
} from "@aws-cdk/aws-kinesisfirehose-alpha";
import { S3Bucket } from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import { __dirname } from "@common/src/types/general.js";
import { Duration } from "aws-cdk-lib";
import { IStream } from "aws-cdk-lib/aws-kinesis";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { LambdaConstruct } from "./lambda.js";

interface FirehoseConstructProps {
  kinesisStream?: IStream;
  s3Bucket: IBucket;
}

export class FirehoseConstruct extends Construct {
  readonly firehoseDeliveryStream: IDeliveryStream;
  readonly dataOutputPrefix = "firehose/";
  constructor(scope: Construct, id: string, props: FirehoseConstructProps) {
    super(scope, id);

    const { s3Bucket, kinesisStream } = props;

    const processorLambda = new LambdaConstruct(this, "ProcessorLambda", {
      entry: join(
        __dirname,
        `../../../common/src/lambdas/firehoseLambdaProcessor.ts`
      ),
      timeout: Duration.minutes(2),
    });

    const lambdaProcessor = new LambdaFunctionProcessor(
      processorLambda.lambda,
      {
        retries: 2,
      }
    );

    const firehoseS3Bucket = new S3Bucket(s3Bucket, {
      encryptionKey: s3Bucket.encryptionKey,
      bufferingInterval: Duration.seconds(1),
      // try to switch to new line delimeter: https://docs.aws.amazon.com/firehose/latest/dev/create-destination.html#create-destination-s3
      processor: lambdaProcessor,
      dataOutputPrefix: this.dataOutputPrefix,
      errorOutputPrefix: "firehose-errors/",
    });
    this.firehoseDeliveryStream = new DeliveryStream(
      this,
      `${id}-FirehoseDeliveryStream`,
      {
        sourceStream: kinesisStream,
        destinations: [firehoseS3Bucket],
      }
    );
    NagSuppressions.addResourceSuppressions(
      this.firehoseDeliveryStream,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "cdk managed, wildcards are ok",
        },
        {
          id: "AwsSolutions-KDF1",
          reason: "encryption is managed by kinesis data stream",
        },
      ],
      true
    );
  }
}
