#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AutomobileEngineStack } from "../lib/automobile-engine-stack.js";

const app = new App();
const environment = app.node.tryGetContext("environment") ?? "staging";

new AutomobileEngineStack(app, `AutomobileEngine-${environment}`, {
  environmentName: environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
  },
});
