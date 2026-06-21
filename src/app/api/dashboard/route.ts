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
import { loadPatientDashboard } from "@/lib/patient-dashboard";

export async function GET(request: NextRequest) {
  const session = await readDashboardSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const repository = resolveDashboardRepository(process.env);
  if (!repository.ok) {
    return NextResponse.json({ error: "dashboard_unavailable" }, { status: 503 });
  }

  const dashboard = await loadPatientDashboard(repository.value, {
    cognitoSub: session.value.user.cognitoSub,
    now: new Date().toISOString(),
  });
  if (!dashboard.ok) {
    return NextResponse.json({ error: "dashboard_unavailable" }, { status: 503 });
  }

  return NextResponse.json(dashboard.value);
}

async function readDashboardSession(request: NextRequest) {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    return { ok: false as const, error: "dashboard_unavailable", status: 503 };
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

function resolveDashboardRepository(env: Record<string, string | undefined>) {
  const config = resolveDynamoDbAppDataConfig(env);
  return config.ok
    ? { ok: true as const, value: createDynamoDbAppDataRepository(config.value) }
    : { ok: false as const };
}
