#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { StaffIdentityStack } from "../lib/staff-identity-stack.js";

const app = new App({ analyticsReporting: false });
const environmentName = app.node.tryGetContext("environment") ?? "staging";
const publicOrigin = app.node.tryGetContext("publicOrigin");
if (typeof publicOrigin !== "string") throw new Error("Set -c publicOrigin=https://your-reviewed-gateway-origin");
new StaffIdentityStack(app, `VandLabsStaffIdentity-${environmentName}`, {
  environmentName, publicOrigin,
  intelligence: app.node.tryGetContext("intelligence") === "true", googleClientId: app.node.tryGetContext("googleClientId"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: app.node.tryGetContext("region") ?? process.env.CDK_DEFAULT_REGION ?? "ap-south-1" },
});
