# GET /dosespot/patients/:patient_id/prescriptionbenefits

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-dosespot-patients-patient-id-prescriptionbenefits-get-patient-prescription-benefits`
- Surface: `internal`
- Method: `GET`
- Path: `/dosespot/patients/:patient_id/prescriptionbenefits`
- Raw URL template: `{{url}}/dosespot/patients/:patient_id/prescriptionbenefits?patient_eligibility_id=REDACTED_SCALAR&ndc=REDACTED_SCALAR&pharmacy_id=REDACTED_SCALAR&quantity=REDACTED_SCALAR&days_supply=REDACTED_SCALAR&dispense_unit_type_id=REDACTED_SCALAR`
- Source folders: `Internal` / `Dosespot` / `Patients`
- Source request: `Get Patient Prescription Benefits`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient_id`
- Query params: `days_supply`, `dispense_unit_type_id`, `ndc`, `patient_eligibility_id`, `pharmacy_id`, `quantity`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
