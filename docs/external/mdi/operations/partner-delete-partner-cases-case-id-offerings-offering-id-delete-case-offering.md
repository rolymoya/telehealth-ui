# DELETE /partner/cases/:case_id/offerings/:offering_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-delete-partner-cases-case-id-offerings-offering-id-delete-case-offering`
- Surface: `partner`
- Method: `DELETE`
- Path: `/partner/cases/:case_id/offerings/:offering_id`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/offerings/:offering_id`
- Source folders: `Partners` / `Cases` / `Offerings`
- Source request: `Delete case offering`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `offering_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw`
- Body note: Body shape unavailable from Postman metadata; raw payload omitted.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].case_prescription_id: string
- [].clinical_note: string
- [].days_supply: number
- [].directions: string
- [].dispense_unit_id: number
- [].dosespot_prescription_id: null
- [].effective_date: string
- [].is_additional_approval_needed: boolean
- [].medication: null
- [].name: string
- [].no_substitutions: boolean
- [].partner_compound: object
- [].partner_compound.metadata: string
- [].partner_compound.partner_compound_id: string
- [].partner_compound.title: string
- [].pharmacy_id: number
- [].pharmacy_name: string
- [].pharmacy_notes: string
- [].prescription_status_details: string
- [].quantity: number
- [].refills: number
- [].status: string
- [].thank_you_note: string
- [].title: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
