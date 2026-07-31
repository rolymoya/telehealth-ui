import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  createExternalOperationRecord,
  createLaunchNonceRecord,
  createPortalLinkageRecord,
  type EnrollmentRecord,
  type ExternalOperationRecord,
  type PortalLinkageRecord,
} from "@/lib/enrollment/records";
import type { EnrollmentRepository } from "@/lib/enrollment/repository";
import {
  type PortalProvider,
  validatePortalLaunchUrl,
} from "@/lib/enrollment/portal-provider";
import { applyEnrollmentTransition } from "@/lib/enrollment/state-machine";

export type PortalLaunchResult =
  | { ok: true; launchUrl: string }
  | {
    ok: false;
    code: "portal_unavailable" | "portal_not_authorized" | "portal_busy";
  };

export async function launchPatientPortal(input: {
  cognitoSub: string;
  launchEnabled: boolean;
  provisioningEnabled: boolean;
  provider: PortalProvider;
  repository: EnrollmentRepository;
  returnOrigin: string;
  now?: Date;
}): Promise<PortalLaunchResult> {
  if (!input.launchEnabled) {
    return failure("portal_unavailable");
  }

  const authorization = await loadAuthorizedEnrollment(input);
  if (!authorization.ok) {
    return authorization;
  }

  const linkage = await ensurePortalLinkage({
    ...input,
    enrollment: authorization.enrollment,
  });
  if (!linkage.ok) {
    return linkage;
  }

  const readyEnrollment = await ensurePortalHandoffState({
    enrollment: authorization.enrollment,
    linkage: linkage.linkage,
    now: nowIso(input.now),
    repository: input.repository,
    target: "ready",
  });
  if (!readyEnrollment.ok) {
    return readyEnrollment;
  }

  return mintLaunch({
    ...input,
    enrollment: readyEnrollment.enrollment,
    linkage: linkage.linkage,
  });
}

async function loadAuthorizedEnrollment(input: {
  cognitoSub: string;
  repository: EnrollmentRepository;
}): Promise<
  | { ok: true; enrollment: EnrollmentRecord }
  | { ok: false; code: "portal_unavailable" | "portal_not_authorized" }
> {
  const pointer = await input.repository.getActiveAccountEnrollment(input.cognitoSub);
  if (!pointer.ok || !pointer.value) {
    return failure("portal_not_authorized");
  }
  const enrollment = await input.repository.getEnrollment(pointer.value.enrollmentId);
  if (!enrollment.ok || !enrollment.value) {
    return failure("portal_unavailable");
  }
  if (
    enrollment.value.cognitoSub !== input.cognitoSub ||
    enrollment.value.identity !== "verified" ||
    enrollment.value.paymentSetup !== "setup_succeeded" ||
    enrollment.value.billing !== "payment_method_collected"
  ) {
    return failure("portal_not_authorized");
  }
  if (["declined", "closed"].includes(enrollment.value.care)) {
    return failure("portal_not_authorized");
  }
  return { ok: true, enrollment: enrollment.value };
}

async function ensurePortalLinkage(input: {
  cognitoSub: string;
  enrollment: EnrollmentRecord;
  provisioningEnabled: boolean;
  provider: PortalProvider;
  repository: EnrollmentRepository;
  now?: Date;
}): Promise<
  | { ok: true; linkage: PortalLinkageRecord }
  | { ok: false; code: "portal_unavailable" | "portal_busy" }
> {
  const existing = await input.repository.getPortalLinkage(input.cognitoSub);
  if (!existing.ok) {
    return failure("portal_unavailable");
  }
  if (existing.value) {
    return existing.value.provider === input.provider.providerCode &&
      existing.value.enrollmentId === input.enrollment.enrollmentId &&
      existing.value.state === "ready"
      ? { ok: true, linkage: existing.value }
      : failure("portal_unavailable");
  }
  if (!input.provisioningEnabled) {
    return failure("portal_unavailable");
  }

  const now = input.now ?? new Date();
  const operationId = `portal-provision-${digest(input.enrollment.enrollmentId).slice(0, 32)}`;
  const idempotencyKey = `portal-provision-${digest(
    `${input.provider.providerCode}:${input.enrollment.enrollmentId}`,
  )}`;
  const operation = await getOrCreateOperation({
    aggregateId: input.enrollment.enrollmentId,
    idempotencyKey,
    now,
    operationId,
    operationType: "provider_provisioning",
    repository: input.repository,
  });
  if (!operation.ok) {
    return operation;
  }
  if (operation.operation.state === "succeeded") {
    return failure("portal_unavailable");
  }

  const owner = `portal-provision-worker-${randomUUID()}`;
  const lease = await input.repository.leaseExternalOperation({
    operationId,
    owner,
    now: now.toISOString(),
    nowEpochSeconds: epochSeconds(now),
    leaseExpiresAtEpochSeconds: epochSeconds(now) + 30,
  });
  if (!lease.ok) {
    return failure(lease.error.code === "lease_unavailable"
      ? "portal_busy"
      : "portal_unavailable");
  }

  const provisioned = await input.provider.provisionPatient({
    patientReference: input.cognitoSub,
    enrollmentReference: input.enrollment.enrollmentId,
    catalogReference: input.enrollment.catalogCode,
    idempotencyKey,
  });
  if (
    !provisioned.ok ||
    !validOpaqueProviderId(provisioned.value.providerPatientId) ||
    (provisioned.value.providerCaseId !== undefined &&
      !validOpaqueProviderId(provisioned.value.providerCaseId))
  ) {
    await failOperation(input.repository, operationId, owner, now, provisioned.ok
      ? "invalid_provider_response"
      : provisioned.code);
    return failure("portal_unavailable");
  }

  const candidate = createPortalLinkageRecord({
    cognitoSub: input.cognitoSub,
    enrollmentId: input.enrollment.enrollmentId,
    provider: input.provider.providerCode,
    providerPatientId: provisioned.value.providerPatientId,
    providerCaseId: provisioned.value.providerCaseId,
    now: now.toISOString(),
  });
  const created = await input.repository.createPortalLinkage(candidate);
  let linkage: PortalLinkageRecord | null = null;
  if (created.ok) {
    linkage = created.value;
  } else if (created.error.code === "conditional_conflict") {
    const adopted = await input.repository.getPortalLinkage(input.cognitoSub);
    linkage = adopted.ok && adopted.value?.provider === input.provider.providerCode &&
      adopted.value.enrollmentId === input.enrollment.enrollmentId
      ? adopted.value
      : null;
  }
  if (!linkage) {
    await failOperation(input.repository, operationId, owner, now, "linkage_write_failed");
    return failure("portal_unavailable");
  }

  const completed = await input.repository.markExternalOperationSucceeded({
    operationId,
    owner,
    completedAt: now.toISOString(),
    resultPointer: linkage.providerPatientId,
  });
  return completed.ok
    ? { ok: true, linkage }
    : failure("portal_unavailable");
}

async function mintLaunch(input: {
  cognitoSub: string;
  enrollment: EnrollmentRecord;
  linkage: PortalLinkageRecord;
  provider: PortalProvider;
  repository: EnrollmentRepository;
  returnOrigin: string;
  now?: Date;
}): Promise<PortalLaunchResult> {
  const now = input.now ?? new Date();
  const rawNonce = randomBytes(32).toString("base64url");
  const nonceDigest = digest(`portal-launch-nonce:${rawNonce}`);
  const attemptId = `portal-launch-attempt-${randomUUID()}`;
  const owner = `portal-launch-worker-${randomUUID()}`;
  const operationId = `portal-launch-${nonceDigest.slice(0, 32)}`;
  const idempotencyKey = `portal-launch-${digest(rawNonce)}`;

  const nonce = createLaunchNonceRecord({
    nonceDigest,
    cognitoSub: input.cognitoSub,
    provider: input.provider.providerCode,
    expiresAtEpochSeconds: epochSeconds(now) + 300,
    now: now.toISOString(),
  });
  const nonceCreated = await input.repository.createLaunchNonce(nonce);
  if (!nonceCreated.ok) {
    return failure("portal_unavailable");
  }
  const operation = await getOrCreateOperation({
    aggregateId: input.enrollment.enrollmentId,
    idempotencyKey,
    now,
    operationId,
    operationType: "portal_launch",
    repository: input.repository,
  });
  if (!operation.ok) {
    return operation;
  }

  const exchange = await input.repository.beginLaunchExchange({
    nonceDigest,
    owner,
    attemptId,
    now: now.toISOString(),
    nowEpochSeconds: epochSeconds(now),
    leaseExpiresAtEpochSeconds: epochSeconds(now) + 30,
  });
  const lease = await input.repository.leaseExternalOperation({
    operationId,
    owner,
    now: now.toISOString(),
    nowEpochSeconds: epochSeconds(now),
    leaseExpiresAtEpochSeconds: epochSeconds(now) + 30,
  });
  if (!exchange.ok || !lease.ok) {
    return failure("portal_busy");
  }

  const launch = await input.provider.mintPatientLaunch({
    providerPatientId: input.linkage.providerPatientId,
    providerCaseId: input.linkage.providerCaseId,
    returnOrigin: input.returnOrigin,
    idempotencyKey,
  });
  const launchUrl = launch.ok
    ? validatePortalLaunchUrl(
      launch.value.launchUrl,
      input.provider.allowedLaunchOrigins,
    )
    : null;
  if (!launch.ok || !launchUrl || !validOpaqueProviderId(launch.value.launchReference)) {
    await failOperation(input.repository, operationId, owner, now, launch.ok
      ? "invalid_provider_response"
      : launch.code);
    return failure("portal_unavailable");
  }

  const consumed = await input.repository.consumeLaunchNonce({
    nonceDigest,
    attemptId,
    consumedAt: now.toISOString(),
  });
  const completed = consumed.ok
    ? await input.repository.markExternalOperationSucceeded({
      operationId,
      owner,
      completedAt: now.toISOString(),
      resultPointer: launch.value.launchReference,
    })
    : null;
  if (!consumed.ok || !completed?.ok) {
    return failure("portal_unavailable");
  }

  const issued = await ensurePortalHandoffState({
    enrollment: input.enrollment,
    linkage: input.linkage,
    now: now.toISOString(),
    repository: input.repository,
    target: "issued",
  });
  return issued.ok
    ? { ok: true, launchUrl }
    : failure("portal_unavailable");
}

async function ensurePortalHandoffState(input: {
  enrollment: EnrollmentRecord;
  linkage: PortalLinkageRecord;
  now: string;
  repository: EnrollmentRepository;
  target: "ready" | "issued";
}): Promise<
  | { ok: true; enrollment: EnrollmentRecord }
  | { ok: false; code: "portal_unavailable" }
> {
  const current = input.enrollment;
  if (
    current.portalHandoff === input.target ||
    (["ready", "issued"] as const).includes(input.target) &&
      current.portalHandoff === "launched" ||
    (input.target === "ready" && current.portalHandoff === "issued")
  ) {
    return { ok: true, enrollment: current };
  }
  const transitioned = applyEnrollmentTransition(current, {
    changes: {
      portalCaseId: input.linkage.providerCaseId ?? input.linkage.providerPatientId,
      portalHandoff: input.target,
    },
  });
  if (!transitioned.ok) {
    return failure("portal_unavailable");
  }
  const updated: EnrollmentRecord = {
    ...current,
    ...transitioned.value,
    updatedAt: input.now,
    version: current.version + 1,
  };
  const saved = await input.repository.updateEnrollment(updated, current.version);
  if (saved.ok) {
    return { ok: true, enrollment: saved.value };
  }
  const reloaded = await input.repository.getEnrollment(current.enrollmentId);
  return reloaded.ok && reloaded.value &&
    (reloaded.value.portalHandoff === input.target ||
      (input.target === "ready" &&
        ["issued", "launched"].includes(reloaded.value.portalHandoff)))
    ? { ok: true, enrollment: reloaded.value }
    : failure("portal_unavailable");
}

async function getOrCreateOperation(input: {
  aggregateId: string;
  idempotencyKey: string;
  now: Date;
  operationId: string;
  operationType: "provider_provisioning" | "portal_launch";
  repository: EnrollmentRepository;
}): Promise<
  | { ok: true; operation: ExternalOperationRecord }
  | { ok: false; code: "portal_unavailable" | "portal_busy" }
> {
  const existing = await input.repository.getExternalOperation(input.operationId);
  if (!existing.ok) {
    return failure("portal_unavailable");
  }
  if (existing.value) {
    return { ok: true, operation: existing.value };
  }
  const candidate = createExternalOperationRecord({
    operationId: input.operationId,
    operationType: input.operationType,
    aggregateId: input.aggregateId,
    idempotencyKeyDigest: digest(input.idempotencyKey),
    maxAttempts: 4,
    expiresAtEpochSeconds: epochSeconds(input.now) + 86_400,
    now: input.now.toISOString(),
  });
  const created = await input.repository.createExternalOperation(candidate);
  if (created.ok) {
    return { ok: true, operation: created.value };
  }
  if (created.error.code !== "conditional_conflict") {
    return failure("portal_unavailable");
  }
  const adopted = await input.repository.getExternalOperation(input.operationId);
  return adopted.ok && adopted.value
    ? { ok: true, operation: adopted.value }
    : failure("portal_busy");
}

async function failOperation(
  repository: EnrollmentRepository,
  operationId: string,
  owner: string,
  now: Date,
  errorCode: string,
) {
  await repository.markExternalOperationRetryable({
    operationId,
    owner,
    failedAt: now.toISOString(),
    errorCode,
    nextAttemptAtEpochSeconds: epochSeconds(now) + 30,
  });
}

function validOpaqueProviderId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(value);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function epochSeconds(value: Date) {
  return Math.floor(value.getTime() / 1000);
}

function nowIso(value: Date | undefined) {
  return (value ?? new Date()).toISOString();
}

function failure<T extends
  | "portal_unavailable"
  | "portal_not_authorized"
  | "portal_busy"
>(code: T): { ok: false; code: T } {
  return { ok: false as const, code };
}
