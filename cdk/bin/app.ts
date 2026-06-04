#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { StorageStack } from "../stacks/storage-stack";
import { IamStack } from "../stacks/iam-stack";

const app = new cdk.App();

const envName          = (app.node.tryGetContext("env")               as string) ?? "dev";
const githubOrg        = (app.node.tryGetContext("githubOrg")         as string) ?? "asaifuddin18";
const githubRepo       = (app.node.tryGetContext("githubRepo")        as string) ?? "PoE2CraftAndTrader";
const vercelTeamSlug   = (app.node.tryGetContext("vercelTeamSlug")    as string) ?? "asaifuddin18s-projects";
const vercelProjectName= (app.node.tryGetContext("vercelProjectName") as string) ?? "po-e2-craft-and-trader";

const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const tags = { Project: "poe2-craft-trader", Env: envName };

const storageStack = new StorageStack(app, `Poe2Storage-${envName}`, {
  env_name: envName,
  env: awsEnv,
  description: `PoE2 Craft & Trade — storage (${envName})`,
  tags,
});

new IamStack(app, `Poe2Iam-${envName}`, {
  env_name: envName,
  storageStack,
  githubOrg,
  githubRepo,
  vercelTeamSlug,
  vercelProjectName,
  env: awsEnv,
  description: `PoE2 Craft & Trade — IAM / OIDC (${envName})`,
  tags,
});

app.synth();
