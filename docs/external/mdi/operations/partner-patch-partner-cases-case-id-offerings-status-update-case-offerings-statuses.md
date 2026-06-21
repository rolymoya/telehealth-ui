# PATCH /partner/cases/:case_id/offerings/status

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-patch-partner-cases-case-id-offerings-status-update-case-offerings-statuses`
- Surface: `partner`
- Method: `PATCH`
- Path: `/partner/cases/:case_id/offerings/status`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/offerings/status`
- Source folders: `Partners` / `Cases` / `Offerings`
- Source request: `Update case offerings statuses`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

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
- [].is_additional_approval_needed: boolean
- [].medication: null
- [].name: string
- [].no_substitutions: boolean
- [].order: number
- [].partner_compound: object
- [].partner_compound.metadata: string
- [].partner_compound.name: string
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
