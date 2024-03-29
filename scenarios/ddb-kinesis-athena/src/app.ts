import { DeletionPolicySetter } from "@common/src/aspects/deletionPolicySetter.js";
import {
  App,
  Aspects,
  RemovalPolicy,
  Tags,
} from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import { DdbKinesisAthenaStack } from "./stacks/ddb-kinesis-athena-stack.js";

const app = new App();
const scenarioName = "ddb-kinesis-athena";
const logLevel = "DEBUG";
const stack = new DdbKinesisAthenaStack(app, scenarioName, {
  scenarioName: scenarioName,
  logLevel: logLevel,
});

Aspects.of(app).add(new AwsSolutionsChecks());
Aspects.of(app).add(new DeletionPolicySetter(RemovalPolicy.DESTROY));

Tags.of(stack).add("project", "examples-aws-dynamodb-analytics-cdk");
Tags.of(stack).add("scenario", scenarioName);
