import { Duration } from "aws-cdk-lib";
import { IKey, Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

export interface KmsKeyConstructProps {
  scenarioName: string;
}

export class KmsKeyConstruct extends Construct {
  readonly kmsKey: IKey;

  constructor(scope: Construct, id: string, props: KmsKeyConstructProps) {
    super(scope, id);

    const { scenarioName: sceanrioName } = props;
    this.kmsKey = new Key(this, "kmsKey", {
      enableKeyRotation: true,
      pendingWindow: Duration.days(7),
    });

    this.kmsKey.addAlias(sceanrioName);
  }
}
