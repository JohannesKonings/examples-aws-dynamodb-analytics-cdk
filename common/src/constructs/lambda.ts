import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export interface LambdaConstructProps {
  entry: string;
  environment?: Record<string, string>;
  timeout?: Duration;
}

export class LambdaConstruct extends Construct {
  readonly lambda: lambdaNodejs.NodejsFunction;
  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    const { entry, environment, timeout } = props;

    const logGroup = new logs.LogGroup(this, `${id}-LambdaLogGroup`, {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_DAY,
    });
    this.lambda = new lambdaNodejs.NodejsFunction(this, `${id}-Lambda`, {
      logGroup: logGroup,
      entry: entry,
      runtime: Runtime.NODEJS_20_X,
      environment: environment,
      tracing: Tracing.ACTIVE,
      timeout: timeout,
      bundling: {
        format: OutputFormat.ESM,
        sourceMap: false,
        // prefer ECMAScript versions of dependencies
        mainFields: ["module", "main"],
        // nodeModules: ["@faker-js/faker"],
        target: "esnext",
        banner: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
      },
    });
    NagSuppressions.addResourceSuppressions(
      this.lambda,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "cdk managed, managed policy is ok here",
        },
        {
          id: "AwsSolutions-IAM5",
          reason: "cdk managed, wildcards are ok",
        },
      ],
      true
    );
  }
}
