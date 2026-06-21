# DELETE /partner/patients/:patientId/pharmacies/:pharmacyId

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-patients-patientid-pharmacies-pharmacyid-remove-pharmacy-from-patient`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/patients/:patientId/pharmacies/:pharmacyId`
- Raw URL template: `{{baseUrl}}/partner/patients/:patientId/pharmacies/:pharmacyId`
- Source folders: `Partners` / `Patients` / `Preferred Pharmacies`
- Source request: `Remove pharmacy from patient`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patientId`, `pharmacyId`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- No generated response fields.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
