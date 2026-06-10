export const consentKinds = [
  "platform_terms",
  "privacy_notice",
  "telehealth_consent",
  "compounded_medication_disclosure",
] as const;

export type ConsentKind = (typeof consentKinds)[number];

export type RequiredConsentDocument = {
  consentKind: ConsentKind;
  documentPath: string;
  label: string;
  owner: "apoth" | "third_party_clinician";
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
    label: "Apoth platform terms",
    owner: "apoth",
    version: "terms-2026-06-legal-v1",
  },
  {
    consentKind: "privacy_notice",
    documentPath: "/privacy",
    label: "Privacy notice",
    owner: "apoth",
    version: "privacy-2026-06-legal-v1",
  },
  {
    consentKind: "telehealth_consent",
    documentPath: "/terms#telehealth-disclosure",
    label: "Telehealth consent",
    owner: "third_party_clinician",
    version: "telehealth-2026-06-legal-v1",
  },
  {
    consentKind: "compounded_medication_disclosure",
    documentPath: "/terms#prescriptions",
    label: "Compounded medication disclosure",
    owner: "apoth",
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
