# POST /

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `webhook-post-voucher-reminder-sent`
- Surface: `webhook`
- Method: `POST`
- Path: `/`
- Raw URL template: `https://webhook.site`
- Source folders: `Webhooks` / `Voucher`
- Source request: `Voucher Reminder Sent`

## Implementation Guidance

Default implementation candidate for inbound MDI events. Verify authenticity, process idempotently, and persist only opaque IDs/status.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Authorization`, `Signature`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- access_link: string
- event_type: string
- metadata: string
- patient_id: string
- timestamp: number
- voucher_id: string

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
