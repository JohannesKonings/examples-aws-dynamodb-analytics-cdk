import { CfnWorkGroup } from "aws-cdk-lib/aws-athena";
import { IKey } from "aws-cdk-lib/aws-kms";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface AthenaWorkgroupConstructProps {
  kmsKey: IKey;
  s3Bucket: IBucket;
}

export class AthenaWorkgroupConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: AthenaWorkgroupConstructProps
  ) {
    super(scope, id);

    const { kmsKey, s3Bucket } = props;

    new CfnWorkGroup(this, "AthenaWorkgroup", {
      name: id,
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        resultConfiguration: {
          outputLocation: `s3://${s3Bucket.bucketName}/athena-results/`,
          encryptionConfiguration: {
            encryptionOption: "SSE_KMS",
            kmsKey: kmsKey.keyArn,
          },
        },
      },
    });
  }
}
