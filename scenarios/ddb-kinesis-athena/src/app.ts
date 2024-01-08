import {
  App,
  Aspects,
  CfnResource,
  IAspect,
  RemovalPolicy,
  Tags,
} from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { IConstruct } from "constructs";

import { DdbKinesisAthenaStack } from "./stacks/ddb-kinesis-athena-stack.js";

export class DeletionPolicySetter implements IAspect {
  constructor(private readonly policy: RemovalPolicy) {}
  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(this.policy);
    }
  }
}

const app = new App();
const scenarioName = "ddb-kinesis-athena";
const logLevel = "DEBUG";
const stack = new DdbKinesisAthenaStack(app, "ddb-kinesis-athena", {
  scenarioName: scenarioName,
  logLevel: logLevel,
});

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new DeletionPolicySetter(RemovalPolicy.DESTROY));

Tags.of(stack).add("project", "examples-aws-dynamodb-analytics-cdk");
Tags.of(stack).add("scenario", scenarioName);
