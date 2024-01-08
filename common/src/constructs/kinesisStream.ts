import { IStream, Stream, StreamEncryption } from "aws-cdk-lib/aws-kinesis";
import { IKey } from "aws-cdk-lib/aws-kms";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

interface KinesisStreamConstructProps {
  kmsKey: IKey;
}

export class KinesisStreamConstruct extends Construct {
  readonly stream: IStream;
  constructor(
    scope: Construct,
    id: string,
    props: KinesisStreamConstructProps
  ) {
    super(scope, id);

    const { kmsKey } = props;

    this.stream = new Stream(this, `${id}-Stream`, {
      encryption: StreamEncryption.KMS,
      encryptionKey: kmsKey,
    });
    NagSuppressions.addResourceSuppressions(this.stream, [
      {
        id: "AwsSolutions-KDS3",
        reason: "using own KMS instead of default KMS key is intentional",
      },
    ]);
  }
}
