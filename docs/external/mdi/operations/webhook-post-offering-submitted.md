# POST /

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `webhook-post-offering-submitted`
- Surface: `webhook`
- Method: `POST`
- Path: `/`
- Raw URL template: `https://webhook.site`
- Source folders: `Webhooks` / `Case` / `Offering`
- Source request: `Offering Submitted`

## Implementation Guidance

Default implementation candidate for inbound MDI events. Verify authenticity, process idempotently, and persist only opaque IDs/status.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- case_id: string
- event_type: string
- metadata: string
- offerings: array
- offerings[]: object
- offerings[].case_offering_id: string
- offerings[].clinical_note: string
- offerings[].created_at: string
- offerings[].deleted_at: null
- offerings[].directions: string
- offerings[].id: string
- offerings[].is_additional_approval_needed: boolean
- offerings[].is_important: boolean
- offerings[].name: string
- offerings[].offerable_id: string
- offerings[].offerable_type: string
- offerings[].order: number
- offerings[].order_date: null
- offerings[].order_details: null
- offerings[].order_status: null
- offerings[].order_updated: null
- offerings[].product: object
- offerings[].product.created_at: string
- offerings[].product.days_supply: null
- offerings[].product.deleted_at: null
- offerings[].product.directions: string
- offerings[].product.dispense_unit: string
- offerings[].product.dispense_unit_id: number
- offerings[].product.dosespot_supply_id: number
- offerings[].product.effective_date: null
- offerings[].product.force_pharmacy: boolean
- offerings[].product.id: string
- offerings[].product.is_obsolete: null
- offerings[].product.metadata: null
- offerings[].product.name: string
- offerings[].product.ndc: null
- offerings[].product.otc: null
- offerings[].product.pharmacy_id: null
- offerings[].product.pharmacy_name: null
- offerings[].product.pharmacy_notes: string
- offerings[].product.quantity: string
- offerings[].product.refills: number
- offerings[].product.title: string
- offerings[].product.upc: null
- offerings[].product.updated_at: string
- offerings[].product_id: string
- offerings[].product_type: string
- offerings[].status: string
- offerings[].status_details: null
- offerings[].thank_you_note: string
- offerings[].title: string
- offerings[].updated_at: string
- timestamp: number

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
