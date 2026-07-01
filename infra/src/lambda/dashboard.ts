import { randomUUID } from "node:crypto";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "../../../src/lib/dynamodb/app-data-dynamodb.js";
import { loadPatientDashboard } from "../../../src/lib/patient-dashboard.js";
import {
  requestMdiWorkflowUrlDynamoDb,
  type MdiWorkflowRequestId,
} from "../../../src/lib/mdi-workflows.js";
import {
  json,
  readPatientSession,
  redirect,
  requestBaseOrigin,
  type ApiGatewayEvent,
  type ApiGatewayResponse,
} from "./patient-api.js";

const approvedDashboardWorkflows = new Set([
  "file_upload",
  "intro_video",
  "messaging",
]);

export async function dashboardHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  if (!repository.ok) {
    return json(503, { error: "dashboard_unavailable" });
  }

  const dashboard = await loadPatientDashboard(repository.value, {
    cognitoSub: session.session.cognitoSub,
    now: new Date().toISOString(),
  });
  if (!dashboard.ok) {
    return json(503, { error: "dashboard_unavailable" });
  }

  return json(200, dashboard.value as unknown as Record<string, unknown>);
}

export async function workflowRedirectHandler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const workflow = event.pathParameters?.workflow ?? "";
  if (!approvedDashboardWorkflows.has(workflow)) {
    return workflowUnavailable(event);
  }

  const session = await readPatientSession(event);
  if (!session.ok) {
    return json(session.status, { error: session.code });
  }

  const repository = resolveRepository(process.env);
  if (!repository.ok) {
    return workflowUnavailable(event);
  }

  const result = await requestMdiWorkflowUrlDynamoDb(
    repository.value,
    {
      cognitoSub: session.session.cognitoSub,
      workflow,
    },
    {
      requestId: createDashboardWorkflowRequestId(),
    },
  );
  if (!result.ok) {
    return workflowUnavailable(event);
  }

  return redirect(303, result.url);
}

function resolveRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}

function createDashboardWorkflowRequestId(): MdiWorkflowRequestId {
  return `req_dashboard_${randomUUID().replaceAll("-", "")}`;
}

function workflowUnavailable(event: ApiGatewayEvent) {
  const origin = requestBaseOrigin(event) ?? "https://app.apoth.invalid";
  return redirect(303, `${origin}/dashboard?workflow=unavailable`);
}
