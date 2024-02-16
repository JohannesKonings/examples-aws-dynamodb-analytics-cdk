import { IDeliveryStream } from "@aws-cdk/aws-kinesisfirehose-alpha";
import {
  IPipe,
  ISource,
  ITarget,
  Pipe,
  SourceConfig,
  TargetConfig,
} from "@aws-cdk/aws-pipes-alpha";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IRole } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

interface EventBridgePipeConstructProps {
  deliveryStream: IDeliveryStream;
  table: ITable;
}

export class EventBridgePipeConstruct extends Construct {
  readonly pipe: IPipe;

  constructor(
    scope: Construct,
    id: string,
    props: EventBridgePipeConstructProps
  ) {
    super(scope, id);

    const { table, deliveryStream } = props;

    // @aws-cdk/aws-pipes-sources-alpha has only SQS as source (https://constructs.dev/packages/@aws-cdk/aws-pipes-sources-alpha/v/2.128.0-alpha.0?lang=typescript)

    // enrichment: https://constructs.dev/packages/@aws-cdk/aws-pipes-enrichments-alpha/v/2.128.0-alpha.0?lang=typescript

    const dynamoDbStreamSource = new DynamoDBStreamSource(table);
    const firehoseTarget = new FirehoseTarget(deliveryStream);

    this.pipe = new Pipe(this, "Pipe", {
      source: dynamoDbStreamSource,
      target: firehoseTarget,
    });
    NagSuppressions.addResourceSuppressions(
      this.pipe,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "more or less cdk managed, wildcards are ok",
        },
      ],
      true
    );
  }
}

interface DynamoDBStreamSourceParameters {
  /**
   * (Streams only) The position in a stream from which to start reading.
   *
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-pipes-pipe-pipesourcedynamodbstreamparameters.html#cfn-pipes-pipe-pipesourcedynamodbstreamparameters-startingposition
   * @default LATEST
   */
  readonly startingPosition?: "TRIM_HORIZON" | "LATEST";
}

class DynamoDBStreamSource implements ISource {
  private readonly table: ITable;
  readonly sourceArn;
  private sourceParameters;

  constructor(table: ITable, parameters?: DynamoDBStreamSourceParameters) {
    this.table = table;
    this.sourceArn = table.tableStreamArn || "";
    if (!this.sourceArn) {
      throw new Error("Table does not have a stream");
    }
    if (parameters) {
      this.sourceParameters = parameters;
    }
  }

  bind(_pipe: IPipe): SourceConfig {
    return {
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: this.sourceParameters?.startingPosition || "LATEST",
        },
      },
    };
  }

  grantRead(pipeRole: IRole): void {
    this.table.grantStreamRead(pipeRole);
  }
}

class FirehoseTarget implements ITarget {
  targetArn: string;

  constructor(private readonly deliverStream: IDeliveryStream) {
    this.deliverStream = deliverStream;
    this.targetArn = deliverStream.deliveryStreamArn;
  }

  bind(_pipe: IPipe): TargetConfig {
    return {
      targetParameters: {},
    };
  }

  grantPush(grantee: IRole): void {
    this.deliverStream.grantPutRecords(grantee);
  }
}
