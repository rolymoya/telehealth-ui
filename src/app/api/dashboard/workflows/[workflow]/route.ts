import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  getServerSession,
  resolveCognitoAuthConfig,
} from "@/lib/auth";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import {
  createDynamoDbAppDataRepository,
  resolveDynamoDbAppDataConfig,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  requestMdiWorkflowUrlDynamoDb,
  type MdiWorkflowRequestId,
} from "@/lib/mdi-workflows";

type WorkflowRouteContext = {
  params: Promise<{ workflow?: string }>;
};

const approvedDashboardWorkflows = new Set([
  "file_upload",
  "intro_video",
  "messaging",
]);

export async function GET(request: NextRequest, context: WorkflowRouteContext) {
  const workflow = (await context.params).workflow ?? "";
  if (!approvedDashboardWorkflows.has(workflow)) {
    return workflowUnavailable(request);
  }

  const session = await readWorkflowSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const repository = resolveWorkflowRepository(process.env);
  if (!repository.ok) {
    return workflowUnavailable(request);
  }

  const result = await requestMdiWorkflowUrlDynamoDb(
    repository.value,
    {
      cognitoSub: session.value.user.cognitoSub,
      workflow,
    },
    {
      requestId: createDashboardWorkflowRequestId(),
    },
  );
  if (!result.ok) {
    return workflowUnavailable(request);
  }

  return NextResponse.redirect(result.url, { status: 303 });
}

async function readWorkflowSession(request: NextRequest) {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    return { ok: false as const, error: "workflow_unavailable", status: 503 };
  }

  const token = request.cookies.get(patientAccessCookieName)?.value ?? null;
  const session = await getServerSession({
    config: config.value,
    token,
  });
  if (!session.ok) {
    return { ok: false as const, error: "authentication_required", status: 401 };
  }

  return { ok: true as const, value: session.value };
}

function resolveWorkflowRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}

function createDashboardWorkflowRequestId(): MdiWorkflowRequestId {
  return `req_dashboard_${randomUUID().replaceAll("-", "")}`;
}

function workflowUnavailable(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard?workflow=unavailable", request.url), {
    status: 303,
  });
}
