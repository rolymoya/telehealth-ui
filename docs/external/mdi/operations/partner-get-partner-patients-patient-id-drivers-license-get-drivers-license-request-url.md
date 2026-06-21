# GET /partner/patients/:patient_id/drivers-license

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-drivers-license-get-drivers-license-request-url`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/drivers-license`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/drivers-license?fullscreen=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients` / `Workflows`
- Source request: `Get Drivers License Request URL`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `fullscreen`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- drivers_license_url: string
- verification_code: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
