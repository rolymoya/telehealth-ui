export function canonicalMdiPatientId(value: string): string | null {
  if (isCanonicalMdiPatientId(value)) {
    return value;
  }
  const uuid = canonicalUuidFragment(value);
  return uuid ? `mdi_patient_${uuid}` : null;
}

export function canonicalMdiCaseId(value: string): string | null {
  if (isCanonicalMdiCaseId(value)) {
    return value;
  }
  const uuid = canonicalUuidFragment(value);
  return uuid ? `mdi_case_${uuid}` : null;
}

export function isCanonicalMdiPatientId(value: string) {
  return /^mdi_patient_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value) &&
    !unsafeIdentifierFragments.some((pattern) => pattern.test(value));
}

export function isCanonicalMdiCaseId(value: string) {
  return /^mdi_case_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(value) &&
    !unsafeIdentifierFragments.some((pattern) => pattern.test(value));
}

function canonicalUuidFragment(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value.replaceAll("-", "").toLowerCase();
}

const unsafeIdentifierFragments = [
  /@/,
  /\d{1,3}(?:\.\d{1,3}){3}/,
  /(?:^|[_-])(email|first[_-]?name|last[_-]?name|phone|address|dob|birth|ssn)(?:$|[_-])/i,
  /(?:^|[_-])(questionnaire|question|answer|diagnosis|symptom|clinical|medication|condition|note)(?:$|[_-])/i,
  /(?:^|[_-])(secret|token|authorization|bearer|api[_-]?key|payload|metadata)(?:$|[_-])/i,
];
