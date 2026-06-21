import "server-only";

import {
  type AppDataRepository,
  type MdiLinkageRecord,
  getMdiLinkage,
} from "@/lib/dynamodb/app-data";
import {
  type MdiWorkflowLaunchResult,
  type RequestMdiWorkflowUrlOptions,
  requestMdiWorkflowUrl,
} from "@/lib/mdi-workflows";

export type MdiCareWorkflowActionCode =
  | "care_workflow_unavailable"
  | "open_mdi_care"
  | "refills_deferred";

export type MdiCareWorkflowReasonCode =
  | "mdi_case_not_linked"
  | "mdi_not_linked"
  | "no_approved_refill_route"
  | "open_mdi_messaging";

export type MdiCareWorkflowCapability = {
  actionCode: MdiCareWorkflowActionCode;
  reasonCode: MdiCareWorkflowReasonCode;
  workflow?: "messaging";
};

export type MdiCareWorkflowCapabilities = {
  followUpCare: MdiCareWorkflowCapability;
  refills: MdiCareWorkflowCapability;
};

export type MdiCareWorkflowCapabilityResult =
  | { ok: true; value: MdiCareWorkflowCapabilities }
  | { ok: false; fallback: "unavailable" };

export function getMdiCareWorkflowCapabilities(
  repository: AppDataRepository,
  input: { cognitoSub: string },
): MdiCareWorkflowCapabilityResult {
  const linkage = getMdiLinkage(repository, input.cognitoSub);
  if (!linkage.ok) {
    return { ok: false, fallback: "unavailable" };
  }

  return {
    ok: true,
    value: capabilitiesForLinkage(linkage.value),
  };
}

export async function requestMdiFollowUpCareWorkflowUrl(
  repository: AppDataRepository,
  input: { cognitoSub: string },
  options: RequestMdiWorkflowUrlOptions,
): Promise<MdiWorkflowLaunchResult> {
  return requestMdiWorkflowUrl(
    repository,
    { cognitoSub: input.cognitoSub, workflow: "messaging" },
    options,
  );
}

function capabilitiesForLinkage(linkage: MdiLinkageRecord | null): MdiCareWorkflowCapabilities {
  if (!linkage) {
    return {
      followUpCare: {
        actionCode: "care_workflow_unavailable",
        reasonCode: "mdi_not_linked",
      },
      refills: {
        actionCode: "refills_deferred",
        reasonCode: "no_approved_refill_route",
      },
    };
  }

  if (!linkage.mdiCaseId) {
    return {
      followUpCare: {
        actionCode: "care_workflow_unavailable",
        reasonCode: "mdi_case_not_linked",
      },
      refills: {
        actionCode: "refills_deferred",
        reasonCode: "no_approved_refill_route",
      },
    };
  }

  return {
    followUpCare: {
      actionCode: "open_mdi_care",
      reasonCode: "open_mdi_messaging",
      workflow: "messaging",
    },
    refills: {
      actionCode: "refills_deferred",
      reasonCode: "no_approved_refill_route",
    },
  };
}
