#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { StorageStack } from "../stacks/storage-stack";

const app = new cdk.App();

const envName = (app.node.tryGetContext("env") as string) ?? "dev";
const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

new StorageStack(app, `Poe2Storage-${envName}`, {
  env_name: envName,
  env: awsEnv,
  description: `PoE2 Craft & Trade — storage (${envName})`,
  tags: {
    Project: "poe2-craft-trader",
    Env:     envName,
  },
});

app.synth();
