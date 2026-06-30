import {
  launchOfferingSlugs,
  type LaunchOfferingSlug,
} from "./intake/precheck";

export const consentKinds = [
  "platform_terms",
  "privacy_notice",
  "telehealth_consent",
  "compounded_medication_disclosure",
] as const;

export type ConsentKind = (typeof consentKinds)[number];

export const consentGates = [
  "privacy_notice_before_precheck",
  "telehealth_and_platform_before_mdi",
  "medication_disclosure_before_billing_or_prescribing",
] as const;

export type ConsentGate = (typeof consentGates)[number];

export type ConsentTreatmentApplicability =
  | "all"
  | readonly LaunchOfferingSlug[];

export type RequiredConsentDocument = {
  consentKind: ConsentKind;
  documentPath: string;
  gate: ConsentGate;
  label: string;
  owner: "apoth" | "third_party_clinician";
  treatmentApplicability?: ConsentTreatmentApplicability;
  version: string;
};

export type ConsentEvidenceLike = {
  acceptedAt: string;
  consentKind: ConsentKind;
  version: string;
};

export type ConsentRequirementStatus = {
  acceptedAt?: string;
  acceptedVersion?: string;
  consentKind: ConsentKind;
  requiredVersion: string;
  status: "current" | "missing" | "stale";
};

export const currentRequiredConsents = [
  {
    consentKind: "platform_terms",
    documentPath: "/terms",
    gate: "telehealth_and_platform_before_mdi",
    label: "Apoth platform terms",
    owner: "apoth",
    version: "terms-2026-06-thin-phi-v2",
  },
  {
    consentKind: "privacy_notice",
    documentPath: "/privacy",
    gate: "privacy_notice_before_precheck",
    label: "Privacy notice",
    owner: "apoth",
    version: "privacy-2026-06-thin-phi-v2",
  },
  {
    consentKind: "telehealth_consent",
    documentPath: "/terms#telehealth-disclosure",
    gate: "telehealth_and_platform_before_mdi",
    label: "Telehealth consent",
    owner: "third_party_clinician",
    version: "telehealth-2026-06-thin-phi-v2",
  },
  {
    consentKind: "compounded_medication_disclosure",
    documentPath: "/terms#prescriptions",
    gate: "medication_disclosure_before_billing_or_prescribing",
    label: "Compounded medication disclosure",
    owner: "apoth",
    treatmentApplicability: ["weight"],
    version: "compound-disclosure-2026-06-legal-v1",
  },
] as const satisfies readonly RequiredConsentDocument[];

export const currentConsentVersion = currentRequiredConsents
  .map((document) => `${document.consentKind}@${document.version}`)
  .join("+");

export function consentAcknowledgementFieldName(
  consent: RequiredConsentDocument,
) {
  return `consent:${consent.consentKind}:${consent.version}`;
}

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === "string" &&
    (consentKinds as readonly string[]).includes(value);
}

export function isConsentGate(value: unknown): value is ConsentGate {
  return typeof value === "string" &&
    (consentGates as readonly string[]).includes(value);
}

export function isLaunchTreatment(value: unknown): value is LaunchOfferingSlug {
  return typeof value === "string" &&
    (launchOfferingSlugs as readonly string[]).includes(value);
}

export function requiredConsentsForGate(
  gate: ConsentGate,
  options: { treatment?: unknown } = {},
): readonly RequiredConsentDocument[] {
  const required = currentRequiredConsents.filter((consent) =>
    consent.gate === gate
  );
  if (gate !== "medication_disclosure_before_billing_or_prescribing") {
    return required;
  }
  return required.filter((consent) =>
    consentAppliesToTreatment(consent, options.treatment)
  );
}

export function requiredConsentsForPrecheck() {
  return requiredConsentsForGate("privacy_notice_before_precheck");
}

export function requiredConsentsForMdi() {
  return requiredConsentsForGate("telehealth_and_platform_before_mdi");
}

export function requiredConsentsBeforeMdi() {
  return [
    ...requiredConsentsForPrecheck(),
    ...requiredConsentsForMdi(),
  ];
}

export function requiredConsentsForCurrentOnboarding() {
  return currentRequiredConsents;
}

export function requiredMedicationDisclosureConsents(input: {
  treatment?: unknown;
} = {}) {
  return requiredConsentsForGate(
    "medication_disclosure_before_billing_or_prescribing",
    input,
  );
}

export function evaluateConsentRequirementsForGate(
  records: readonly ConsentEvidenceLike[],
  gate: ConsentGate,
  options: { treatment?: unknown } = {},
) {
  return evaluateConsentRequirements(
    records,
    requiredConsentsForGate(gate, options),
  );
}

export function evaluatePrecheckConsentRequirements(
  records: readonly ConsentEvidenceLike[],
) {
  return evaluateConsentRequirementsForGate(
    records,
    "privacy_notice_before_precheck",
  );
}

export function evaluateMdiConsentRequirements(
  records: readonly ConsentEvidenceLike[],
) {
  return evaluateConsentRequirementsForGate(
    records,
    "telehealth_and_platform_before_mdi",
  );
}

export function evaluateMedicationDisclosureConsentRequirements(
  records: readonly ConsentEvidenceLike[],
  input: { treatment?: unknown } = {},
) {
  return evaluateConsentRequirementsForGate(
    records,
    "medication_disclosure_before_billing_or_prescribing",
    input,
  );
}

export function evaluateConsentRequirements(
  records: readonly ConsentEvidenceLike[],
  requiredConsents: readonly RequiredConsentDocument[] = currentRequiredConsents,
) {
  const statuses = requiredConsents.map<ConsentRequirementStatus>((required) => {
    const recordsForKind = records.filter(
      (record) => record.consentKind === required.consentKind,
    );
    const current = recordsForKind.find(
      (record) => record.version === required.version,
    );
    if (current) {
      return {
        acceptedAt: current.acceptedAt,
        acceptedVersion: current.version,
        consentKind: required.consentKind,
        requiredVersion: required.version,
        status: "current",
      };
    }

    const latest = recordsForKind.at(-1);
    if (latest) {
      return {
        acceptedAt: latest.acceptedAt,
        acceptedVersion: latest.version,
        consentKind: required.consentKind,
        requiredVersion: required.version,
        status: "stale",
      };
    }

    return {
      consentKind: required.consentKind,
      requiredVersion: required.version,
      status: "missing",
    };
  });

  return {
    accepted: statuses.every((status) => status.status === "current"),
    statuses,
  };
}

function consentAppliesToTreatment(
  consent: RequiredConsentDocument,
  treatment: unknown,
) {
  const applicability = consent.treatmentApplicability ?? "all";
  if (applicability === "all") {
    return true;
  }
  if (!isLaunchTreatment(treatment)) {
    return true;
  }
  return applicability.includes(treatment);
}
