# GET /v1/partner/pharmacies/:pharmacy_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-pharmacies-pharmacy-id-get-pharmacy`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/pharmacies/:pharmacy_id`
- Raw URL template: `{{url}}/v1/partner/pharmacies/:pharmacy_id`
- Source folders: `Partners` / `Pharmacies`
- Source request: `Get pharmacy`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `pharmacy_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- address1: string
- address2: string
- city: string
- id: number
- latitude: number
- longitude: number
- name: string
- pharmacy_specialties: null
- phone_additional_1: null
- phone_additional_2: null
- phone_additional_3: null
- phone_additional_type_1: number
- phone_additional_type_2: number
- phone_additional_type_3: number
- primary_fax: string
- primary_phone: string
- primary_phone_type: number
- service_level: number
- state: string
- store_name: string
- zip_code: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
