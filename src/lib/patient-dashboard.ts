import {
  mdiCaseReverseKey,
  mdiCaseStatusMirrorKey,
  mdiLinkageKey,
  patientProfileKey,
  stripeLinkageKey,
  type AppDataError,
  type AppDataKey,
  type AppDataRecord,
  type AppDataResult,
  type BillingStatus,
  type EvidenceEventRecord,
  type MdiMirroredCaseStatus,
  type OnboardingStatus,
} from "@/lib/dynamodb/app-data";

export type DashboardCaseStatusCode =
  | "case_status_billing_ready"
  | "case_status_cancelled"
  | "case_status_clinical_review"
  | "case_status_pending"
  | "case_status_unavailable";

export type DashboardActionCode =
  | "action_needed_open_mdi"
  | "action_needed_unavailable"
  | "action_needed_waiting"
  | "benefit_status_pending"
  | "care_workflow_unavailable"
  | "cue_noop"
  | "exam_action_needed"
  | "file_action_needed"
  | "files_unavailable"
  | "open_mdi_care"
  | "open_mdi_files"
  | "open_mdi_messages"
  | "ops_review_required"
  | "refills_deferred";

export type DashboardBillingCode =
  | "billing_active"
  | "billing_cancel_pending"
  | "billing_canceled"
  | "billing_issue"
  | "billing_payment_method_needed"
  | "billing_pending_approval"
  | "billing_unavailable";

export type DashboardAccountCode = "manage_account";
export type DashboardSupportCode = "contact_support";

export type PatientDashboardRepository = {
  get(key: AppDataKey):
    | AppDataResult<AppDataRecord | null>
    | Promise<AppDataResult<AppDataRecord | null>>;
  queryByKeyPrefix(input: {
    pk: string;
    skPrefix: string;
    limit?: number;
    exclusiveStartKey?: AppDataKey;
  }):
    | AppDataResult<{ items: AppDataRecord[]; nextKey?: AppDataKey }>
    | Promise<AppDataResult<{ items: AppDataRecord[]; nextKey?: AppDataKey }>>;
};

export type PatientDashboardViewModel = {
  account: {
    code: DashboardAccountCode;
    label: string;
    residencyState?: string;
    status: string;
  };
  actions: DashboardAction[];
  billing: DashboardBilling;
  care: DashboardCare;
  caseStatus: DashboardCaseStatus;
  generatedAt: string;
  support: {
    code: DashboardSupportCode;
    label: string;
    summary: string;
  };
};

export type DashboardAction = {
  code: DashboardActionCode;
  href?: string;
  label: string;
  summary: string;
  tone: "action" | "deferred" | "support" | "unavailable";
  workflow?: "file_upload" | "messaging";
};

export type DashboardBilling = {
  canCancel: boolean;
  code: DashboardBillingCode;
  label: string;
  summary: string;
};

export type DashboardCare = {
  followUp: DashboardAction;
  refills: DashboardAction;
};

export type DashboardCaseStatus = {
  code: DashboardCaseStatusCode;
  label: string;
  summary: string;
  updatedAt?: string;
};

export async function loadPatientDashboard(
  repository: PatientDashboardRepository,
  input: { cognitoSub: string; now?: string },
): Promise<AppDataResult<PatientDashboardViewModel>> {
  const generatedAt = input.now ?? new Date().toISOString();
  const profile = await readRecord(repository, patientProfileKey(input.cognitoSub));
  if (!profile.ok) {
    return profile;
  }
  if (profile.value && profile.value.recordType !== "patientProfile") {
    return appDataErr("Patient profile key contained another record type");
  }

  const mdi = await readRecord(repository, mdiLinkageKey(input.cognitoSub));
  if (!mdi.ok) {
    return mdi;
  }
  if (mdi.value && mdi.value.recordType !== "mdiLinkage") {
    return appDataErr("MDI linkage key contained another record type");
  }

  const stripe = await readRecord(repository, stripeLinkageKey(input.cognitoSub));
  if (!stripe.ok) {
    return stripe;
  }
  if (stripe.value && stripe.value.recordType !== "stripeLinkage") {
    return appDataErr("Stripe linkage key contained another record type");
  }

  const caseMirror = mdi.value?.mdiCaseId
    ? await readRecord(repository, mdiCaseStatusMirrorKey(mdi.value.mdiCaseId))
    : { ok: true as const, value: null };
  if (!caseMirror.ok) {
    return caseMirror;
  }
  if (caseMirror.value && caseMirror.value.recordType !== "mdiCaseStatusMirror") {
    return appDataErr("MDI case status mirror key contained another record type");
  }

  const events = mdi.value?.mdiCaseId
    ? await listDashboardEvidenceEvents(repository, {
      cognitoSub: input.cognitoSub,
      mdiCaseId: mdi.value.mdiCaseId,
    })
    : await listPatientEvidenceEvents(repository, { cognitoSub: input.cognitoSub });
  if (!events.ok) {
    return events;
  }

  const caseStatus = mapCaseStatus({
    mirroredStatus: caseMirror.value?.caseStatus,
    onboardingStatus: profile.value?.onboardingStatus,
    updatedAt: caseMirror.value?.providerTimestamp,
  });

  return {
    ok: true,
    value: {
      account: {
        code: "manage_account",
        label: "Account",
        ...(profile.value?.residencyState ? { residencyState: profile.value.residencyState } : {}),
        status: accountStatusLabel(profile.value?.onboardingStatus),
      },
      actions: dashboardActionsFromEvidence(events.value),
      billing: mapBillingStatus({
        billingStatus: stripe.value?.billingStatus,
        currentPeriodEnd: stripe.value?.stripeCurrentPeriodEnd,
        unlocked: isBillingUnlocked(caseStatus.code, profile.value?.onboardingStatus),
      }),
      care: mapCareActions(Boolean(mdi.value?.mdiCaseId)),
      caseStatus,
      generatedAt,
      support: {
        code: "contact_support",
        label: "Contact support",
        summary: "For account or billing help, contact Apoth support. Medical questions stay in the care workflow.",
      },
    },
  };
}

export function createUnavailablePatientDashboard(
  input: { now?: string } = {},
): PatientDashboardViewModel {
  const generatedAt = input.now ?? "pending";
  return {
    account: {
      code: "manage_account",
      label: "Account",
      status: "Sign in to load account status.",
    },
    actions: [
      {
        code: "action_needed_waiting",
        label: "No action loaded yet",
        summary: "Dashboard details will appear after your account status refreshes.",
        tone: "deferred",
      },
    ],
    billing: {
      canCancel: false,
      code: "billing_unavailable",
      label: "Billing unavailable",
      summary: "Billing status could not be loaded yet.",
    },
    care: mapCareActions(false),
    caseStatus: {
      code: "case_status_unavailable",
      label: "Status unavailable",
      summary: "We could not load your care status yet.",
    },
    generatedAt,
    support: {
      code: "contact_support",
      label: "Contact support",
      summary: "For account or billing help, contact Apoth support. Medical questions stay in the care workflow.",
    },
  };
}

async function readRecord(
  repository: PatientDashboardRepository,
  key: AppDataKey,
): Promise<AppDataResult<AppDataRecord | null>> {
  return repository.get(key);
}

async function listDashboardEvidenceEvents(
  repository: PatientDashboardRepository,
  input: { cognitoSub: string; mdiCaseId: string },
): Promise<AppDataResult<EvidenceEventRecord[]>> {
  const patientEvents = await listPatientEvidenceEvents(repository, {
    cognitoSub: input.cognitoSub,
  });
  if (!patientEvents.ok) {
    return patientEvents;
  }

  const caseEvents = await listCaseEvidenceEvents(repository, input);
  if (!caseEvents.ok) {
    return caseEvents;
  }

  const events = new Map<string, EvidenceEventRecord>();
  for (const event of [...patientEvents.value, ...caseEvents.value]) {
    events.set(event.eventId, event);
  }

  return {
    ok: true,
    value: Array.from(events.values()).sort(compareEvidenceEventsNewestFirst),
  };
}

async function listPatientEvidenceEvents(
  repository: PatientDashboardRepository,
  input: { cognitoSub: string },
): Promise<AppDataResult<EvidenceEventRecord[]>> {
  const events: EvidenceEventRecord[] = [];
  let exclusiveStartKey: AppDataKey | undefined;
  do {
    const page = await repository.queryByKeyPrefix({
      pk: patientProfileKey(input.cognitoSub).pk,
      skPrefix: "EVIDENCE#",
      limit: evidencePageLimit,
      exclusiveStartKey,
    });
    if (!page.ok) {
      return page;
    }
    for (const record of page.value.items) {
      if (record.recordType !== "evidenceEvent") {
        return appDataErr("Evidence timeline contained another record type");
      }
      events.push(record);
    }
    exclusiveStartKey = page.value.nextKey;
  } while (exclusiveStartKey);

  return { ok: true, value: events };
}

async function listCaseEvidenceEvents(
  repository: PatientDashboardRepository,
  input: { cognitoSub: string; mdiCaseId: string },
): Promise<AppDataResult<EvidenceEventRecord[]>> {
  const events: EvidenceEventRecord[] = [];
  let exclusiveStartKey: AppDataKey | undefined;
  do {
    const pointers = await repository.queryByKeyPrefix({
      pk: mdiCaseReverseKey(input.mdiCaseId).pk,
      skPrefix: "EVIDENCE#",
      limit: evidencePageLimit,
      exclusiveStartKey,
    });
    if (!pointers.ok) {
      return pointers;
    }

    for (const pointer of pointers.value.items) {
      if (pointer.recordType !== "evidenceCaseIndex") {
        return appDataErr("Evidence case timeline contained another record type");
      }
      if (pointer.cognitoSub !== input.cognitoSub || pointer.mdiCaseId !== input.mdiCaseId) {
        return appDataErr("Evidence case pointer did not match lookup");
      }

      const event = await repository.get({
        pk: pointer.evidencePk,
        sk: pointer.evidenceSk,
      });
      if (!event.ok) {
        return event;
      }
      if (!event.value || event.value.recordType !== "evidenceEvent") {
        return appDataErr("Evidence case pointer target was invalid");
      }
      events.push(event.value);
    }
    exclusiveStartKey = pointers.value.nextKey;
  } while (exclusiveStartKey);

  return { ok: true, value: events };
}

function compareEvidenceEventsNewestFirst(
  left: EvidenceEventRecord,
  right: EvidenceEventRecord,
) {
  return Date.parse(right.recordedAt) - Date.parse(left.recordedAt) ||
    right.eventId.localeCompare(left.eventId);
}

function mapCaseStatus(input: {
  mirroredStatus?: MdiMirroredCaseStatus;
  onboardingStatus?: OnboardingStatus;
  updatedAt?: string;
}): DashboardCaseStatus {
  const code = caseStatusCode(input);
  const copy = caseStatusCopy[code];
  return {
    code,
    label: copy.label,
    summary: copy.summary,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

function caseStatusCode(input: {
  mirroredStatus?: MdiMirroredCaseStatus;
  onboardingStatus?: OnboardingStatus;
}): DashboardCaseStatusCode {
  switch (input.mirroredStatus) {
    case "billing_ready":
    case "completed":
      return "case_status_billing_ready";
    case "cancelled":
    case "declined":
      return "case_status_cancelled";
    case "assigned":
    case "clinical_review":
    case "support":
    case "tagged":
      return "case_status_clinical_review";
    case "created":
    case "processing":
    case "waiting":
      return "case_status_pending";
    default:
      break;
  }

  switch (input.onboardingStatus) {
    case "billing_ready":
      return "case_status_billing_ready";
    case "clinical_review":
      return "case_status_clinical_review";
    case "mdi_submitted":
    case "intake_ready":
    case "profile_pending":
      return "case_status_pending";
    default:
      return "case_status_unavailable";
  }
}

function mapBillingStatus(input: {
  billingStatus?: BillingStatus;
  currentPeriodEnd?: string;
  unlocked: boolean;
}): DashboardBilling {
  const code = billingCode(input);
  return {
    canCancel: code === "billing_active",
    code,
    label: billingCopy[code].label,
    summary: billingSummary(code, input.currentPeriodEnd),
  };
}

function billingCode(input: {
  billingStatus?: BillingStatus;
  unlocked: boolean;
}): DashboardBillingCode {
  switch (input.billingStatus) {
    case "active":
      return input.unlocked ? "billing_active" : "billing_pending_approval";
    case "cancel_pending":
      return "billing_cancel_pending";
    case "payment_method_collected":
      return input.unlocked ? "billing_pending_approval" : "billing_pending_approval";
    case "past_due":
      return "billing_issue";
    case "canceled":
      return "billing_canceled";
    case "not_started":
    case "payment_method_pending":
      return "billing_payment_method_needed";
    default:
      return "billing_unavailable";
  }
}

function isBillingUnlocked(
  caseStatus: DashboardCaseStatusCode,
  onboardingStatus?: OnboardingStatus,
) {
  return caseStatus === "case_status_billing_ready" || onboardingStatus === "billing_ready";
}

function dashboardActionsFromEvidence(events: EvidenceEventRecord[]): DashboardAction[] {
  const actions = new Map<DashboardActionCode, DashboardAction>();
  for (const event of events) {
    if (event.eventType !== "mdi_dashboard_cue_recorded") {
      continue;
    }
    const cueCode = event.metadata?.cue_code;
    if (typeof cueCode !== "string" || !isDashboardActionCode(cueCode)) {
      continue;
    }
    const action = actionForCueCode(cueCode);
    if (action) {
      actions.set(action.code, action);
    }
  }

  if (actions.size === 0) {
    return [
      {
        code: "action_needed_waiting",
        label: "No action needed",
        summary: "We will show a care workflow action here if MDI asks for one.",
        tone: "deferred",
      },
    ];
  }

  return Array.from(actions.values());
}

function actionForCueCode(code: DashboardActionCode): DashboardAction | null {
  switch (code) {
    case "open_mdi_messages":
      return {
        code,
        href: "/api/dashboard/workflows/messaging",
        label: "Open messages",
        summary: "Open the MDI care workflow to read or send care-team messages.",
        tone: "action",
        workflow: "messaging",
      };
    case "open_mdi_files":
      return {
        code,
        href: "/api/dashboard/workflows/file_upload",
        label: "Open files",
        summary: "Open the MDI care workflow for available files or lab notices.",
        tone: "action",
        workflow: "file_upload",
      };
    case "file_action_needed":
      return {
        code,
        href: "/api/dashboard/workflows/file_upload",
        label: "Upload requested file",
        summary: "Open the MDI care workflow to complete a requested upload.",
        tone: "action",
        workflow: "file_upload",
      };
    case "exam_action_needed":
      return {
        code,
        label: "Action needed",
        summary: "A care workflow action is pending, but this launch route is not available yet.",
        tone: "unavailable",
      };
    case "files_unavailable":
      return {
        code,
        label: "Files unavailable",
        summary: "File access is temporarily unavailable. Contact support if this blocks care.",
        tone: "unavailable",
      };
    case "benefit_status_pending":
      return {
        code,
        label: "Benefit status pending",
        summary: "A non-clinical benefit or voucher status is pending in the care workflow.",
        tone: "deferred",
      };
    case "ops_review_required":
      return {
        code,
        label: "Support review",
        summary: "Support is reviewing an account workflow signal.",
        tone: "support",
      };
    case "cue_noop":
      return null;
    default:
      return null;
  }
}

function mapCareActions(caseLinked: boolean): DashboardCare {
  return {
    followUp: caseLinked
      ? {
        code: "open_mdi_care",
        href: "/api/dashboard/workflows/messaging",
        label: "Open care workflow",
        summary: "Message your clinician or follow up in the MDI care workflow.",
        tone: "action",
        workflow: "messaging",
      }
      : {
        code: "care_workflow_unavailable",
        label: "Care workflow unavailable",
        summary: "The care workflow will be available after MDI case linkage is complete.",
        tone: "unavailable",
      },
    refills: {
      code: "refills_deferred",
      label: "Refills use care workflow",
      summary: "Native Apoth refill requests are deferred for launch. Use the care workflow for follow-up.",
      tone: "deferred",
    },
  };
}

function accountStatusLabel(status?: OnboardingStatus) {
  switch (status) {
    case "billing_ready":
      return "Onboarding complete";
    case "clinical_review":
      return "Clinical review";
    case "mdi_submitted":
      return "Intake submitted";
    case "intake_ready":
      return "Intake ready";
    case "profile_pending":
      return "Profile pending";
    default:
      return "Account status unavailable";
  }
}

function isDashboardActionCode(value: string): value is DashboardActionCode {
  return dashboardActionCodes.has(value as DashboardActionCode);
}

function appDataErr(message: string): AppDataResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation_failed",
      message,
    } satisfies AppDataError,
  };
}

const dashboardActionCodes = new Set<DashboardActionCode>([
  "action_needed_open_mdi",
  "action_needed_unavailable",
  "action_needed_waiting",
  "benefit_status_pending",
  "care_workflow_unavailable",
  "cue_noop",
  "exam_action_needed",
  "file_action_needed",
  "files_unavailable",
  "open_mdi_care",
  "open_mdi_files",
  "open_mdi_messages",
  "ops_review_required",
  "refills_deferred",
]);

const evidencePageLimit = 100;

const caseStatusCopy = {
  case_status_billing_ready: {
    label: "Clinician review complete",
    summary: "Your care request has reached the billing-ready step.",
  },
  case_status_cancelled: {
    label: "Care request closed",
    summary: "This care request is closed. Contact support for account questions.",
  },
  case_status_clinical_review: {
    label: "Clinical review",
    summary: "Your MDI care team is reviewing the request.",
  },
  case_status_pending: {
    label: "Pending",
    summary: "Your intake handoff is pending in the MDI care workflow.",
  },
  case_status_unavailable: {
    label: "Status unavailable",
    summary: "We could not load the MDI-backed care status right now.",
  },
} satisfies Record<DashboardCaseStatusCode, { label: string; summary: string }>;

const billingCopy = {
  billing_active: {
    label: "Billing active",
    summary: "Billing is active for this account.",
  },
  billing_cancel_pending: {
    label: "Cancellation scheduled",
    summary: "Your subscription is set to end at the close of the current billing cycle.",
  },
  billing_canceled: {
    label: "Billing canceled",
    summary: "This subscription has been canceled. Contact support for account and billing questions.",
  },
  billing_issue: {
    label: "Billing issue",
    summary: "Billing needs attention. No clinical details are shown here.",
  },
  billing_payment_method_needed: {
    label: "Payment method needed",
    summary: "Add a payment method when the billing step is available.",
  },
  billing_pending_approval: {
    label: "Pending clinical approval",
    summary: "Billing remains pending until the approved clinical unlock event.",
  },
  billing_unavailable: {
    label: "Billing unavailable",
    summary: "Billing status could not be loaded right now.",
  },
} satisfies Record<DashboardBillingCode, { label: string; summary: string }>;

function billingSummary(code: DashboardBillingCode, currentPeriodEnd?: string) {
  if (code === "billing_cancel_pending" && currentPeriodEnd) {
    const date = formatBillingDate(currentPeriodEnd);
    if (date) {
      return `Your subscription is set to end at the close of the current billing cycle on ${date}.`;
    }
  }
  return billingCopy[code].summary;
}

function formatBillingDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}
