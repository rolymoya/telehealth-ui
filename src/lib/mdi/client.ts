import "server-only";

import {
  createStructuredLogEvent,
  type StructuredLogEvent,
} from "@/lib/observability/logging";
import {
  withMdiTokenRefreshRetry,
  type MdiAccessToken,
  type MdiTokenClientOptions,
} from "@/lib/mdi/token";

type FetchLike = (
  input: string,
  init: {
    body?: string;
    headers: Record<string, string>;
    method: MdiHttpMethod;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export type MdiHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export type MdiClientErrorCode =
  | "auth_failed"
  | "invalid_response"
  | "maintenance"
  | "network_error"
  | "provider_error"
  | "timeout"
  | "unauthorized_after_refresh";

export type MdiClientError = {
  code: MdiClientErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
  retryAfterSeconds?: number;
};

export type MdiClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MdiClientError };

export type MdiClientOptions = MdiTokenClientOptions & {
  fetch?: FetchLike;
  log?: (event: StructuredLogEvent) => void;
  timeoutMs?: number;
};

export type MdiRequestInput<T> = {
  body?: unknown;
  idempotencyKey?: string;
  method?: MdiHttpMethod;
  parse?: (payload: unknown) => T;
  path: string;
};

export type MdiCreatePatientInput = {
  idempotencyKey?: string;
  patient: Record<string, unknown>;
};

export type MdiCreatedPatient = {
  mdiPatientId: string;
};

export type MdiQuestionOption = {
  optionId: string;
  label: string;
};

export type MdiQuestion = {
  questionId: string;
  text: string;
  controlType: string;
  required: boolean;
  options?: MdiQuestionOption[];
  constraints?: Record<string, unknown>;
};

export type MdiQuestionnaireSubmissionInput = {
  questionnaireId: string;
  caseId: string;
  patientId: string;
  responses: Array<{
    questionId: string;
    value: unknown;
  }>;
};

export type MdiQuestionnaireSubmission = {
  submissionId: string;
  status: string;
};

const defaultTimeoutMs = 10_000;

export async function requestMdi<T = unknown>(
  input: MdiRequestInput<T>,
  options: MdiClientOptions = {},
): Promise<MdiClientResult<T>> {
  const result = await withMdiTokenRefreshRetry(
    (token) => requestWithToken(input, token, options),
    options,
  );

  if (!result.ok && result.error.code === "token_retry_failed") {
    const error = clientErr(
      "unauthorized_after_refresh",
      "MDI request remained unauthorized after token refresh",
      { retryable: false, status: 401 },
    );
    logFailure(error, options);
    return { ok: false, error };
  }

  if (!result.ok && isTokenFailureCode(result.error.code)) {
    const error = clientErr("auth_failed", "MDI authentication failed", {
      retryable: false,
      status: result.error.status,
    });
    logFailure(error, options);
    return { ok: false, error };
  }

  return result as MdiClientResult<T>;
}

export async function getMdiQuestionnaireQuestions(
  questionnaireId: string,
  options: MdiClientOptions = {},
) {
  return requestMdi<MdiQuestion[]>(
    {
      method: "GET",
      parse: parseQuestions,
      path: `/partner/questionnaires/${encodeURIComponent(questionnaireId)}/questions`,
    },
    options,
  );
}

export async function createMdiPatient(
  input: MdiCreatePatientInput,
  options: MdiClientOptions = {},
) {
  return requestMdi<MdiCreatedPatient>(
    {
      body: input.patient,
      idempotencyKey: input.idempotencyKey,
      method: "POST",
      parse: parseCreatedPatient,
      path: "/partner/patients",
    },
    options,
  );
}

export async function submitMdiQuestionnaireResponses(
  input: MdiQuestionnaireSubmissionInput,
  options: MdiClientOptions = {},
) {
  return requestMdi<MdiQuestionnaireSubmission>(
    {
      body: {
        caseId: input.caseId,
        patientId: input.patientId,
        responses: input.responses,
      },
      method: "POST",
      parse: parseSubmission,
      path: `/partner/questionnaires/${encodeURIComponent(input.questionnaireId)}/responses`,
    },
    options,
  );
}

async function requestWithToken<T>(
  input: MdiRequestInput<T>,
  token: MdiAccessToken,
  options: MdiClientOptions,
): Promise<MdiClientResult<T>> {
  const fetchImpl = (options.fetch ?? fetch) as FetchLike;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = nowMs(options);

  try {
    const response = await fetchImpl(resolveMdiUrl(token.apiBaseUrl, input.path), {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token.accessToken}`,
        ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      method: input.method ?? "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const parsed = await mapResponse(response, input);
    if (!parsed.ok && parsed.error.status !== 401) {
      logFailure(parsed.error, options, startedAt);
    }
    return parsed;
  } catch (error) {
    clearTimeout(timeout);
    const mapped = isAbortError(error)
      ? clientErr("timeout", "MDI request timed out", { retryable: true })
      : clientErr("network_error", "MDI network request failed", { retryable: true });
    logFailure(mapped, options, startedAt);
    return { ok: false, error: mapped };
  }
}

async function mapResponse<T>(
  response: Awaited<ReturnType<FetchLike>>,
  input: MdiRequestInput<T>,
): Promise<MdiClientResult<T>> {
  if (response.status === 401) {
    return {
      ok: false,
      error: clientErr("provider_error", "MDI request was unauthorized", {
        retryable: false,
        status: 401,
      }),
    };
  }

  if (response.status === 418) {
    return {
      ok: false,
      error: maintenanceError(response.status, await safeJson(response)),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: clientErr("provider_error", "MDI provider request failed", {
        retryable: response.status === 429 || response.status >= 500,
        status: response.status,
      }),
    };
  }

  if (response.status === 204) {
    return { ok: true, value: null as T };
  }

  const payload = await safeJson(response);
  if (!payload.ok) {
    return {
      ok: false,
      error: clientErr("invalid_response", "MDI response was invalid JSON", {
        retryable: false,
        status: response.status,
      }),
    };
  }

  try {
    return {
      ok: true,
      value: input.parse ? input.parse(payload.value) : (payload.value as T),
    };
  } catch {
    return {
      ok: false,
      error: clientErr("invalid_response", "MDI response shape was invalid", {
        retryable: false,
        status: response.status,
      }),
    };
  }
}

function parseQuestions(payload: unknown): MdiQuestion[] {
  const rawQuestions = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.questions)
      ? payload.questions
      : null;
  if (!rawQuestions) {
    throw new Error("Invalid MDI question response");
  }

  return rawQuestions.map((question) => {
    if (!isRecord(question)) {
      throw new Error("Invalid MDI question");
    }
    if (
      typeof question.questionId !== "string" ||
      typeof question.text !== "string" ||
      typeof question.controlType !== "string" ||
      typeof question.required !== "boolean"
    ) {
      throw new Error("Invalid MDI question fields");
    }

    return {
      questionId: question.questionId,
      text: question.text,
      controlType: question.controlType,
      required: question.required,
      ...(Array.isArray(question.options)
        ? { options: question.options.map(parseQuestionOption) }
        : {}),
      ...(isRecord(question.constraints)
        ? { constraints: question.constraints }
        : {}),
    };
  });
}

function parseQuestionOption(option: unknown): MdiQuestionOption {
  if (!isRecord(option) || typeof option.optionId !== "string" || typeof option.label !== "string") {
    throw new Error("Invalid MDI question option");
  }
  return {
    optionId: option.optionId,
    label: option.label,
  };
}

function parseSubmission(payload: unknown): MdiQuestionnaireSubmission {
  if (!isRecord(payload)) {
    throw new Error("Invalid MDI submission response");
  }

  const submissionId = payload.submissionId ?? payload.mdiSubmissionId ?? payload.id;
  if (typeof submissionId !== "string" || typeof payload.status !== "string") {
    throw new Error("Invalid MDI submission fields");
  }

  return {
    status: payload.status,
    submissionId,
  };
}

function parseCreatedPatient(payload: unknown): MdiCreatedPatient {
  if (!isRecord(payload)) {
    throw new Error("Invalid MDI patient response");
  }

  const mdiPatientId = payload.patient_id ?? payload.patientId ?? payload.mdiPatientId;
  if (typeof mdiPatientId !== "string" || mdiPatientId.length === 0) {
    throw new Error("Invalid MDI patient response fields");
  }

  return { mdiPatientId };
}

async function safeJson(response: Awaited<ReturnType<FetchLike>>) {
  try {
    return { ok: true as const, value: await response.json() };
  } catch {
    return { ok: false as const };
  }
}

function maintenanceError(status: number, payload: { ok: true; value: unknown } | { ok: false }) {
  const retryAfterSeconds =
    payload.ok &&
    isRecord(payload.value) &&
    typeof payload.value.retryAfterSeconds === "number" &&
    Number.isFinite(payload.value.retryAfterSeconds)
      ? payload.value.retryAfterSeconds
      : undefined;

  return clientErr("maintenance", "MDI is temporarily unavailable", {
    retryAfterSeconds,
    retryable: true,
    status,
  });
}

function logFailure(
  error: MdiClientError,
  options: MdiClientOptions,
  startedAt?: number,
) {
  if (!options.log) {
    return;
  }

  options.log(
    createStructuredLogEvent({
      durationMs: startedAt === undefined ? undefined : nowMs(options) - startedAt,
      event: "mdi_call_failed",
      level: error.retryable ? "warn" : "error",
      metadata: {
        error: { code: error.code },
        httpStatus: error.status,
        retryable: error.retryable,
      },
      outcome: error.retryable ? "retry" : "failure",
      provider: "mdi",
      reasonCode: reasonCodeFor(error),
    }),
  );
}

function reasonCodeFor(error: MdiClientError) {
  if (error.code === "maintenance") {
    return "provider_unavailable";
  }
  if (error.code === "timeout") {
    return "timeout";
  }
  if (error.code === "invalid_response") {
    return "validation_failed";
  }
  return error.retryable ? "provider_unavailable" : "processing_failed";
}

function clientErr(
  code: MdiClientErrorCode,
  message: string,
  options: {
    retryable: boolean;
    retryAfterSeconds?: number;
    status?: number;
  },
): MdiClientError {
  return {
    code,
    message,
    retryable: options.retryable,
    ...(options.status ? { status: options.status } : {}),
    ...(options.retryAfterSeconds ? { retryAfterSeconds: options.retryAfterSeconds } : {}),
  };
}

function resolveMdiUrl(apiBaseUrl: string, path: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function nowMs(options: MdiClientOptions) {
  return (options.now ?? (() => new Date()))().getTime();
}

function isTokenFailureCode(code: string) {
  return (
    code === "invalid_secret" ||
    code === "invalid_token_response" ||
    code === "missing_secret" ||
    code === "token_request_failed"
  );
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
