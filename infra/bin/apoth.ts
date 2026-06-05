#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { getStageConfig, resolveDeployEnvironment } from "../src/config";
import { ServerlessPlatformStack } from "../src/serverless-platform-stack";

const app = new cdk.App();
const stage = app.node.tryGetContext("stage") ?? process.env.APOTH_STAGE ?? "staging";
const config = getStageConfig(stage);
const env = resolveDeployEnvironment(config, {
  allowProductionSynth: process.env.APOTH_ALLOW_PRODUCTION_SYNTH,
  defaultAccount: process.env.CDK_DEFAULT_ACCOUNT,
  defaultRegion: process.env.CDK_DEFAULT_REGION,
  productionAccountId: process.env.APOTH_PRODUCTION_ACCOUNT_ID,
});

new ServerlessPlatformStack(app, `Apoth-${config.stage}-ServerlessPlatform`, {
  config,
  env,
});
