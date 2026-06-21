# GET /partner/offerings

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-offerings-get-all-offerings`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/offerings`
- Raw URL template: `{{baseUrl}}/partner/offerings`
- Source folders: `Partners` / `Offerings`
- Source request: `Get all offerings`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw`
- Body note: Body shape unavailable from Postman metadata; raw payload omitted.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].active: boolean
- [].allow_substitutions: boolean
- [].clinical_note: string
- [].days_supply: number
- [].directions: string
- [].dispense_unit: string
- [].dispense_unit_id: number
- [].dosespot_rxcui: number
- [].is_additional_approval_needed: boolean
- [].metadata: string
- [].name: string
- [].ndc: string
- [].order: number
- [].partner_medication_id: string
- [].pharmacy_id: number
- [].pharmacy_name: string
- [].pharmacy_notes: string
- [].quantity: string
- [].refills: number
- [].strength: string
- [].thank_you_note: string
- [].title: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
