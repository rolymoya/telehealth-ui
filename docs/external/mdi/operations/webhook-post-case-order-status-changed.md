# POST /

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `webhook-post-case-order-status-changed`
- Surface: `webhook`
- Method: `POST`
- Path: `/`
- Raw URL template: `https://webhook.site`
- Source folders: `Webhooks` / `Case` / `Order`
- Source request: `Case Order Status Changed`

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
- encounter_id: string
- event_type: string
- order_details: string
- order_status: string
- timestamp: number

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
