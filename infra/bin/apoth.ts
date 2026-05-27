#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getConfig } from '../lib/config';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { IamStack } from '../lib/iam-stack';
import { AppStack } from '../lib/app-stack';
import { WorkerStack } from '../lib/worker-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

// Validate configuration before instantiating any stack; exit 1 on error
// so cdk synth fails fast with a clear message rather than a CDK exception.
let config!: ReturnType<typeof getConfig>;
try {
  config = getConfig(app);
} catch (e) {
  console.error(`\nCDK configuration error: ${(e as Error).message}\n`);
  console.error('Set env context: cdk --context env=staging [--context staging.kmsKeyArn=<arn>]');
  process.exit(1);
}

const env = { account: config.account, region: config.region };

// Apply project tags at app level — all child stacks inherit automatically
cdk.Tags.of(app).add('Project', 'apoth');
cdk.Tags.of(app).add('Env', config.env);

// Stack instantiation in dependency order.
// Deploy order: NetworkStack → DataStack → IamStack | AppStack | WorkerStack → ObservabilityStack
const networkStack = new NetworkStack(app, `ApothNetwork-${config.env}`, { config, env });

const dataStack = new DataStack(app, `ApothData-${config.env}`, { config, networkStack, env });
dataStack.addDependency(networkStack);

const iamStack = new IamStack(app, `ApothIam-${config.env}`, { config, env });

const appStack = new AppStack(app, `ApothApp-${config.env}`, { config, networkStack, dataStack, env });
appStack.addDependency(dataStack);
appStack.addDependency(iamStack);

const workerStack = new WorkerStack(app, `ApothWorker-${config.env}`, { config, networkStack, dataStack, env });
workerStack.addDependency(dataStack);

const observabilityStack = new ObservabilityStack(app, `ApothObservability-${config.env}`, {
  config,
  dataStack,
  env,
});
observabilityStack.addDependency(appStack);
observabilityStack.addDependency(workerStack);
