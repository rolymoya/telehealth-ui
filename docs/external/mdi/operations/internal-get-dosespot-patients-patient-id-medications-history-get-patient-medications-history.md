# GET /dosespot/patients/:patient_id/medications/history

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-dosespot-patients-patient-id-medications-history-get-patient-medications-history`
- Surface: `internal`
- Method: `GET`
- Path: `/dosespot/patients/:patient_id/medications/history`
- Raw URL template: `{{url}}/dosespot/patients/:patient_id/medications/history?start_date=REDACTED_SCALAR&end_date=REDACTED_SCALAR&page_number=REDACTED_SCALAR`
- Source folders: `Internal` / `Dosespot` / `Patients`
- Source request: `Get Patient Medications History`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient_id`
- Query params: `end_date`, `page_number`, `start_date`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
