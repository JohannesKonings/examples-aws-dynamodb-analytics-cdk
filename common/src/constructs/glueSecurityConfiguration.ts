import {
  CloudWatchEncryptionMode,
  ISecurityConfiguration,
  S3EncryptionMode,
  SecurityConfiguration,
} from "@aws-cdk/aws-glue-alpha";
import { IKey } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

interface GlueSecurityConfigurationConstructProps {
  kmsKey: IKey;
}

export class GlueSecurityConfigurationConstruct extends Construct {
  readonly glueSecurityConfiguration: ISecurityConfiguration;
  constructor(
    scope: Construct,
    id: string,
    props: GlueSecurityConfigurationConstructProps
  ) {
    super(scope, id);

    const { kmsKey } = props;

    this.glueSecurityConfiguration = new SecurityConfiguration(
      this,
      "SecurityConfiguration",
      {
        s3Encryption: {
          mode: S3EncryptionMode.KMS,
          kmsKey: kmsKey,
        },
        // cloudWatchEncryption: {
        //   mode: CloudWatchEncryptionMode.KMS,
        //   kmsKey: kmsKey,
        // },
      }
    );
  }
}
