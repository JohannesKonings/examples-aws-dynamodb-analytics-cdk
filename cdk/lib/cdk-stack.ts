import * as cdk from "@aws-cdk/core";
import * as kms from "@aws-cdk/aws-kms";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const name = `persons-cdk`;

    const kmsKey = new kms.Key(this, "kmsKey", {
      enableKeyRotation: true,
    });

    kmsKey.addAlias(name);

    const table = new dynamodb.Table(this, "Table", {
      tableName: name,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kmsKey,
    });
  }
}
