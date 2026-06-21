import "server-only";

import {
  type AppDataRepository,
  type AppDataResult,
  type MdiLinkageRecord,
  getMdiLinkage,
  recordEvidenceEvent,
} from "@/lib/dynamodb/app-data";
import {
  type DynamoDbAppDataRepository,
  getMdiLinkageDynamoDb,
  recordEvidenceEventDynamoDb,
} from "@/lib/dynamodb/app-data-dynamodb";
import {
  type MdiClientOptions,
  type MdiWorkflowCode,
  getMdiFileUploadWorkflowUrl,
  getMdiIntroVideoWorkflowUrl,
  getMdiMessagingWorkflowUrl,
} from "@/lib/mdi/client";

export type MdiWorkflowFallback =
  | "expired"
  | "not_linked"
  | "unavailable"
  | "unsupported";

export type MdiWorkflowLaunchResult =
  | {
    ok: true;
    expiresAt: string;
    launchMode: "link";
    url: string;
    workflow: MdiWorkflowCode;
  }
  | {
    ok: false;
    fallback: MdiWorkflowFallback;
    workflow: MdiWorkflowCode | "unsupported";
  };

export type MdiWorkflowRequestId = `req_${string}`;

export type MdiWorkflowEvidenceOutcome =
  | "expired"
  | "invalid_response"
  | "issued"
  | "not_linked"
  | "unavailable"
  | "unsupported";

export type MdiWorkflowUrlGateway = {
  getFileUploadWorkflowUrl(
    input: { patientId: string },
    options?: MdiClientOptions,
  ): ReturnType<typeof getMdiFileUploadWorkflowUrl>;
  getIntroVideoWorkflowUrl(
    input: { patientId: string },
    options?: MdiClientOptions,
  ): ReturnType<typeof getMdiIntroVideoWorkflowUrl>;
  getMessagingWorkflowUrl(
    input: { caseId: string; patientId: string },
    options?: MdiClientOptions,
  ): ReturnType<typeof getMdiMessagingWorkflowUrl>;
};

export type RequestMdiWorkflowUrlOptions = {
  clientOptions?: MdiClientOptions;
  gateway?: MdiWorkflowUrlGateway;
  now?: string;
  requestId: MdiWorkflowRequestId;
  ttlSeconds?: number;
};

const defaultTtlSeconds = 300;

export async function requestMdiWorkflowUrl(
  repository: AppDataRepository,
  input: {
    cognitoSub: string;
    workflow: MdiWorkflowCode | string;
  },
  options: RequestMdiWorkflowUrlOptions,
): Promise<MdiWorkflowLaunchResult> {
  if (!isMdiWorkflowCode(input.workflow)) {
    return fallback("unsupported", "unsupported");
  }
  if (!isMdiWorkflowRequestId(options.requestId)) {
    return fallback(input.workflow, "unavailable");
  }

  const linkage = getMdiLinkage(repository, input.cognitoSub);
  if (!linkage.ok) {
    return fallback(input.workflow, "unavailable");
  }
  if (!linkage.value) {
    return fallback(input.workflow, "not_linked");
  }
  if (input.workflow === "messaging" && !linkage.value.mdiCaseId) {
    const evidence = await recordWorkflowEvidence(repository, input.cognitoSub, linkage.value, {
      outcome: "not_linked",
      recordedAt: nowIso(options),
      requestId: options.requestId,
      workflow: input.workflow,
    });
    if (!evidence.ok) {
      return fallback(input.workflow, "unavailable");
    }
    return fallback(input.workflow, "not_linked");
  }

  const gateway = options.gateway ?? defaultMdiWorkflowUrlGateway;
  const result = await requestFromMdi(gateway, input.workflow, linkage.value, options.clientOptions);
  const recordedAt = nowIso(options);
  if (!result.ok) {
    const outcome = outcomeForClientFailure(result.error.code);
    const evidence = await recordWorkflowEvidence(repository, input.cognitoSub, linkage.value, {
      outcome,
      recordedAt,
      requestId: options.requestId,
      workflow: input.workflow,
    });
    if (!evidence.ok) {
      return fallback(input.workflow, "unavailable");
    }
    return fallback(input.workflow, outcome === "expired" ? "expired" : "unavailable");
  }

  const expiresAt = addSecondsIso(recordedAt, options.ttlSeconds ?? defaultTtlSeconds);
  const evidence = await recordWorkflowEvidence(repository, input.cognitoSub, linkage.value, {
    outcome: "issued",
    recordedAt,
    requestId: options.requestId,
    workflow: input.workflow,
  });
  if (!evidence.ok) {
    return fallback(input.workflow, "unavailable");
  }

  return {
    ok: true,
    expiresAt,
    launchMode: "link",
    url: result.value.url,
    workflow: input.workflow,
  };
}

export async function requestMdiWorkflowUrlDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  input: {
    cognitoSub: string;
    workflow: MdiWorkflowCode | string;
  },
  options: RequestMdiWorkflowUrlOptions,
): Promise<MdiWorkflowLaunchResult> {
  if (!isMdiWorkflowCode(input.workflow)) {
    return fallback("unsupported", "unsupported");
  }
  if (!isMdiWorkflowRequestId(options.requestId)) {
    return fallback(input.workflow, "unavailable");
  }

  const linkage = await getMdiLinkageDynamoDb(repository, input.cognitoSub);
  if (!linkage.ok) {
    return fallback(input.workflow, "unavailable");
  }
  if (!linkage.value) {
    return fallback(input.workflow, "not_linked");
  }
  if (input.workflow === "messaging" && !linkage.value.mdiCaseId) {
    const evidence = await recordWorkflowEvidenceDynamoDb(
      repository,
      input.cognitoSub,
      linkage.value,
      {
        outcome: "not_linked",
        recordedAt: nowIso(options),
        requestId: options.requestId,
        workflow: input.workflow,
      },
    );
    if (!evidence.ok) {
      return fallback(input.workflow, "unavailable");
    }
    return fallback(input.workflow, "not_linked");
  }

  const gateway = options.gateway ?? defaultMdiWorkflowUrlGateway;
  const result = await requestFromMdi(gateway, input.workflow, linkage.value, options.clientOptions);
  const recordedAt = nowIso(options);
  if (!result.ok) {
    const outcome = outcomeForClientFailure(result.error.code);
    const evidence = await recordWorkflowEvidenceDynamoDb(
      repository,
      input.cognitoSub,
      linkage.value,
      {
        outcome,
        recordedAt,
        requestId: options.requestId,
        workflow: input.workflow,
      },
    );
    if (!evidence.ok) {
      return fallback(input.workflow, "unavailable");
    }
    return fallback(input.workflow, outcome === "expired" ? "expired" : "unavailable");
  }

  const expiresAt = addSecondsIso(recordedAt, options.ttlSeconds ?? defaultTtlSeconds);
  const evidence = await recordWorkflowEvidenceDynamoDb(
    repository,
    input.cognitoSub,
    linkage.value,
    {
      outcome: "issued",
      recordedAt,
      requestId: options.requestId,
      workflow: input.workflow,
    },
  );
  if (!evidence.ok) {
    return fallback(input.workflow, "unavailable");
  }

  return {
    ok: true,
    expiresAt,
    launchMode: "link",
    url: result.value.url,
    workflow: input.workflow,
  };
}

export function isMdiWorkflowCode(value: unknown): value is MdiWorkflowCode {
  return value === "file_upload" || value === "intro_video" || value === "messaging";
}

export function createMdiWorkflowUrlEventId(input: {
  mdiPatientId: string;
  requestId: MdiWorkflowRequestId;
  workflow: MdiWorkflowCode;
}) {
  return `mdi:workflow_url:${input.mdiPatientId}:${input.workflow}:${input.requestId}`;
}

export function isMdiWorkflowRequestId(value: unknown): value is MdiWorkflowRequestId {
  return typeof value === "string" &&
    /^req_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value) &&
    !unsafeWorkflowRequestIdPatterns.some((pattern) => pattern.test(value));
}

const defaultMdiWorkflowUrlGateway: MdiWorkflowUrlGateway = {
  getFileUploadWorkflowUrl: getMdiFileUploadWorkflowUrl,
  getIntroVideoWorkflowUrl: getMdiIntroVideoWorkflowUrl,
  getMessagingWorkflowUrl: getMdiMessagingWorkflowUrl,
};

const unsafeWorkflowRequestIdPatterns = [
  /\b(symptom|diagnosis|medication|clinical|questionnaire|answer)\b/i,
  /\b(chest[_-]?pain|shortness[_-]?of[_-]?breath|pregnan|allerg|dosage|prescription|diabetes|lab[_-]?a1c|weight|hiv|opioid|substance|addiction|mental[_-]?health|depression|anxiety|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide)\b/i,
  /(?:^|[:._-])(hiv|opioid|substance|addiction|depression|anxiety|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide)(?:$|[:._-])/i,
  /\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/,
  /(?:^|[^A-Za-z0-9])(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}(?:$|[^A-Za-z0-9])/i,
  /\[[0-9a-f:]+\](?::\d+)?/i,
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  /sk_(?:live|test)_/i,
  /rk_(?:live|test)_/i,
  /whsec_/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN/i,
  /bearer[:_-]/i,
  /\s/,
];

async function requestFromMdi(
  gateway: MdiWorkflowUrlGateway,
  workflow: MdiWorkflowCode,
  linkage: MdiLinkageRecord,
  options: MdiClientOptions | undefined,
) {
  switch (workflow) {
    case "file_upload":
      return gateway.getFileUploadWorkflowUrl({ patientId: linkage.mdiPatientId }, options);
    case "intro_video":
      return gateway.getIntroVideoWorkflowUrl({ patientId: linkage.mdiPatientId }, options);
    case "messaging":
      return gateway.getMessagingWorkflowUrl({
        caseId: linkage.mdiCaseId ?? "",
        patientId: linkage.mdiPatientId,
      }, options);
  }
}

async function recordWorkflowEvidence(
  repository: AppDataRepository,
  cognitoSub: string,
  linkage: MdiLinkageRecord,
  input: {
    outcome: MdiWorkflowEvidenceOutcome;
    recordedAt: string;
    requestId: MdiWorkflowRequestId;
    workflow: MdiWorkflowCode;
  },
): Promise<AppDataResult<unknown>> {
  return recordEvidenceEvent(repository, {
    actorType: "system",
    cognitoSub,
    eventCategory: "mdi_handoff",
    eventId: createMdiWorkflowUrlEventId({
      mdiPatientId: linkage.mdiPatientId,
      requestId: input.requestId,
      workflow: input.workflow,
    }),
    eventType: "mdi_workflow_url_requested",
    occurredAt: input.recordedAt,
    recordedAt: input.recordedAt,
    ...(input.workflow === "messaging" && linkage.mdiCaseId !== undefined
      ? { mdiCaseId: linkage.mdiCaseId }
      : {}),
    mdiPatientId: linkage.mdiPatientId,
    metadata: {
      outcome: input.outcome,
      workflow: input.workflow,
    },
    requestId: input.requestId,
    source: "app",
    status: input.outcome === "issued" ? "recorded" : "skipped",
    summaryCode: "MDI_WORKFLOW_URL_REQUESTED",
  });
}

async function recordWorkflowEvidenceDynamoDb(
  repository: Pick<DynamoDbAppDataRepository, "get" | "transactWrite">,
  cognitoSub: string,
  linkage: MdiLinkageRecord,
  input: {
    outcome: MdiWorkflowEvidenceOutcome;
    recordedAt: string;
    requestId: MdiWorkflowRequestId;
    workflow: MdiWorkflowCode;
  },
): Promise<AppDataResult<unknown>> {
  return recordEvidenceEventDynamoDb(repository, {
    actorType: "system",
    cognitoSub,
    eventCategory: "mdi_handoff",
    eventId: createMdiWorkflowUrlEventId({
      mdiPatientId: linkage.mdiPatientId,
      requestId: input.requestId,
      workflow: input.workflow,
    }),
    eventType: "mdi_workflow_url_requested",
    occurredAt: input.recordedAt,
    recordedAt: input.recordedAt,
    ...(input.workflow === "messaging" && linkage.mdiCaseId !== undefined
      ? { mdiCaseId: linkage.mdiCaseId }
      : {}),
    mdiPatientId: linkage.mdiPatientId,
    metadata: {
      outcome: input.outcome,
      workflow: input.workflow,
    },
    requestId: input.requestId,
    source: "app",
    status: input.outcome === "issued" ? "recorded" : "skipped",
    summaryCode: "MDI_WORKFLOW_URL_REQUESTED",
  });
}

function fallback(
  workflow: MdiWorkflowCode | "unsupported",
  fallback: MdiWorkflowFallback,
): MdiWorkflowLaunchResult {
  return { ok: false, fallback, workflow };
}

function outcomeForClientFailure(code: string): MdiWorkflowEvidenceOutcome {
  return code === "invalid_response" ? "expired" : "unavailable";
}

function nowIso(options: Pick<RequestMdiWorkflowUrlOptions, "now">) {
  return options.now ?? new Date().toISOString();
}

function addSecondsIso(isoTimestamp: string, seconds: number) {
  return new Date(Date.parse(isoTimestamp) + seconds * 1000).toISOString();
}
