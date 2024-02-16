import { RemovalPolicy } from "aws-cdk-lib";
import { IKey } from "aws-cdk-lib/aws-kms";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

interface S3BucketConstructProps {
  kmsKey: IKey;
}

export class S3BucketConstruct extends Construct {
  readonly bucket: IBucket;
  constructor(scope: Construct, id: string, props: S3BucketConstructProps) {
    super(scope, id);

    const { kmsKey } = props;

    this.bucket = new Bucket(this, `${id}-Bucket`, {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey: kmsKey,
      enforceSSL: true,
    });
    NagSuppressions.addResourceSuppressions(this.bucket, [
      {
        id: "AwsSolutions-S1",
        reason: "no server access logging is required for this bucket",
      },
    ]);
  }
}
