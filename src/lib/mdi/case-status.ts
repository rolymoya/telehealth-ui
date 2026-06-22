import type { OnboardingStatus } from "@/lib/dynamodb/app-data";

export type MdiCaseStatus =
  | "assigned"
  | "approved"
  | "billing_ready"
  | "cancelled"
  | "clinical_review"
  | "completed"
  | "created"
  | "declined"
  | "processing"
  | "support"
  | "tagged"
  | "waiting";

export const mdiCaseStatuses = new Set<MdiCaseStatus>([
  "assigned",
  "approved",
  "billing_ready",
  "cancelled",
  "clinical_review",
  "completed",
  "created",
  "declined",
  "processing",
  "support",
  "tagged",
  "waiting",
]);

const caseStatusRanks: Record<MdiCaseStatus, number> = {
  assigned: 20,
  approved: 25,
  billing_ready: 30,
  cancelled: 50,
  clinical_review: 20,
  completed: 40,
  created: 10,
  declined: 50,
  processing: 20,
  support: 20,
  tagged: 20,
  waiting: 20,
};

const normalizedStatusAliases: Record<string, MdiCaseStatus> = {
  assigned: "assigned",
  approved: "approved",
  billing_ready: "billing_ready",
  cancelled: "cancelled",
  canceled: "cancelled",
  case_assigned: "assigned",
  case_approved: "approved",
  case_cancelled: "cancelled",
  case_canceled: "cancelled",
  case_clinically_approved: "billing_ready",
  case_completed: "completed",
  case_created: "created",
  case_declined: "declined",
  case_processing: "processing",
  case_support: "support",
  case_tag_added: "tagged",
  case_tagged: "tagged",
  case_transferred_to_support: "support",
  case_waiting: "waiting",
  clinical_review: "clinical_review",
  clinically_approved: "billing_ready",
  completed: "completed",
  created: "created",
  declined: "declined",
  processing: "processing",
  support: "support",
  tagged: "tagged",
  transferred_to_support: "support",
  waiting: "waiting",
};

export function isMdiCaseStatus(value: unknown): value is MdiCaseStatus {
  return typeof value === "string" && mdiCaseStatuses.has(value as MdiCaseStatus);
}

export function normalizeMdiCaseStatusName(value: unknown): MdiCaseStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalizedStatusAliases[normalized] ?? null;
}

export function isTerminalMdiCaseStatus(status: MdiCaseStatus) {
  return status === "cancelled" || status === "declined";
}

export function caseStatusRank(status: MdiCaseStatus) {
  return caseStatusRanks[status];
}

export function onboardingTargetForMdiCaseStatus(
  status: MdiCaseStatus | undefined,
): OnboardingStatus | null {
  switch (status) {
    case "assigned":
    case "approved":
    case "clinical_review":
    case "processing":
    case "support":
    case "tagged":
    case "waiting":
      return "clinical_review";
    case "billing_ready":
    case "completed":
      return "billing_ready";
    case "cancelled":
    case "created":
    case "declined":
    case undefined:
      return null;
  }
}
