# POST /partner/cases/:case_id/offerings

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-cases-case-id-offerings-create-case-offering`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/cases/:case_id/offerings`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/offerings`
- Source folders: `Partners` / `Cases` / `Offerings`
- Source request: `Create case offering`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `none`
- Header names: `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- offering_id: string
- product: object
- product.days_supply: number
- product.directions: string
- product.dispense_unit: string
- product.name: string
- product.pharmacy_notes: string
- product.quantity: number
- product.sku: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- case_offering_id: string
- clinical_note: string
- created_at: string
- deleted_at: null
- directions: string
- id: string
- is_additional_approval_needed: boolean
- is_important: boolean
- name: string
- offerable_id: string
- offerable_type: string
- order: number
- order_date: null
- order_details: null
- order_status: string
- order_updated: null
- product: object
- product.created_at: string
- product.days_supply: null
- product.deleted_at: null
- product.directions: string
- product.dispense_unit: string
- product.dispense_unit_id: number
- product.dosespot_supply_id: number
- product.effective_date: null
- product.force_pharmacy: boolean
- product.id: string
- product.is_obsolete: null
- product.metadata: null
- product.name: string
- product.ndc: null
- product.otc: null
- product.pharmacy_id: null
- product.pharmacy_name: null
- product.pharmacy_notes: string
- product.quantity: string
- product.refills: number
- product.title: null
- product.upc: null
- product.updated_at: string
- product_id: string
- product_type: string
- status: string
- status_details: null
- thank_you_note: string
- title: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
