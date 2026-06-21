# GET /partner/patients/:patientId/pharmacies

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patientid-pharmacies-get-pharmacies-from-patient`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patientId/pharmacies`
- Raw URL template: `{{baseUrl}}/partner/patients/:patientId/pharmacies?sort=REDACTED_SCALAR&order=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients` / `Preferred Pharmacies`
- Source request: `Get pharmacies from patient`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patientId`
- Query params: `order`, `sort`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].address1: string
- [].address2: string
- [].city: string
- [].enabled: boolean
- [].id: number
- [].latitude: null
- [].longitude: null
- [].name: string
- [].patient_id: string
- [].pharmacy_id: number
- [].pharmacy_specialties: array
- [].phone_additional_1: null
- [].phone_additional_2: null
- [].phone_additional_3: null
- [].phone_additional_type_1: number
- [].phone_additional_type_2: number
- [].phone_additional_type_3: number
- [].primary_fax: string
- [].primary_phone: string
- [].primary_phone_type: string
- [].service_level: null
- [].state: string
- [].zip_code: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
