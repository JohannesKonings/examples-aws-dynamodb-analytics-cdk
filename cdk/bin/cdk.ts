#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from 'aws-cdk-lib';
import { CdkStack } from "../lib/cdk-stack";
import { config } from "./config";

const name = `persons-cdk`;

const app = new App();
const cdkStack = new CdkStack(app, name, {
  config: config,
});

Tags.of(cdkStack).add("Project", "test-aws-dynamodb-athena-cdk");
