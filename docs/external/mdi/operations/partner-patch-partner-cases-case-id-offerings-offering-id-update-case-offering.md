# PATCH /partner/cases/:case_id/offerings/:offering_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-patch-partner-cases-case-id-offerings-offering-id-update-case-offering`
- Surface: `partner`
- Method: `PATCH`
- Path: `/partner/cases/:case_id/offerings/:offering_id`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/offerings/:offering_id`
- Source folders: `Partners` / `Cases` / `Offerings`
- Source request: `Update case offering`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`, `offering_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- product: object
- product.day_supply: number
- product.directions: string
- product.quantity: number

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].case_offering_id: string
- [].clinical_note: string
- [].created_at: string
- [].deleted_at: null
- [].directions: string
- [].id: string
- [].is_additional_approval_needed: boolean
- [].is_important: boolean
- [].name: string
- [].offerable_id: string
- [].offerable_type: string
- [].order: number
- [].order_date: null
- [].order_details: null
- [].order_status: null
- [].order_updated: null
- [].product: object
- [].product.created_at: string
- [].product.days_supply: null
- [].product.deleted_at: null
- [].product.directions: string
- [].product.dispense_unit: string
- [].product.dispense_unit_id: number
- [].product.dosespot_supply_id: number
- [].product.effective_date: null
- [].product.force_pharmacy: boolean
- [].product.id: string
- [].product.is_obsolete: null
- [].product.metadata: null
- [].product.name: string
- [].product.ndc: null
- [].product.otc: null
- [].product.pharmacy_id: null
- [].product.pharmacy_name: null
- [].product.pharmacy_notes: string
- [].product.quantity: string
- [].product.refills: number
- [].product.title: string
- [].product.upc: null
- [].product.updated_at: string
- [].product_id: string
- [].product_type: string
- [].status: string
- [].status_details: null
- [].thank_you_note: string
- [].title: string
- [].updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
