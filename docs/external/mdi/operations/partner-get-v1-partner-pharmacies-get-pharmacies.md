# GET /v1/partner/pharmacies

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-pharmacies-get-pharmacies`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/pharmacies`
- Raw URL template: `{{url}}/v1/partner/pharmacies?name=REDACTED_SCALAR`
- Source folders: `Partners` / `Pharmacies`
- Source request: `Get pharmacies`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `address`, `city`, `name`, `ncpdpID`, `phoneOrFax`, `specialty[0]`, `specialty[1]`, `state`, `zip`
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
- [].id: number
- [].latitude: number
- [].longitude: number
- [].name: string
- [].pharmacy_specialties: array
- [].pharmacy_specialties[]: string
- [].phone_additional_1: null
- [].phone_additional_2: null
- [].phone_additional_3: null
- [].phone_additional_type_1: number
- [].phone_additional_type_2: number
- [].phone_additional_type_3: number
- [].primary_fax: string
- [].primary_phone: string
- [].primary_phone_type: number
- [].service_level: number
- [].state: string
- [].store_name: string
- [].zip_code: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
