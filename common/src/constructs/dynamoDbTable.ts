import {
  AttributeType,
  BillingMode,
  ITable,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IStream } from "aws-cdk-lib/aws-kinesis";
import { IKey } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

interface DynamoDbTableConstructProps {
  kinesisStream?: IStream;
  kmsKey: IKey;
  streamViewType?: StreamViewType;
}

export class DynamoDbTableConstruct extends Construct {
  readonly table: ITable;
  constructor(
    scope: Construct,
    id: string,
    props: DynamoDbTableConstructProps
  ) {
    super(scope, id);

    const { kmsKey, kinesisStream, streamViewType } = props;

    this.table = new Table(this, `${id}-Table`, {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: AttributeType.STRING,
      },
      encryptionKey: kmsKey,
      pointInTimeRecovery: true,
      stream: streamViewType,
      kinesisStream: kinesisStream,
    });
  }
}
