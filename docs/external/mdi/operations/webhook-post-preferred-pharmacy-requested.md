# POST /

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `webhook-post-preferred-pharmacy-requested`
- Surface: `webhook`
- Method: `POST`
- Path: `/`
- Raw URL template: `https://webhook.site`
- Source folders: `Webhooks` / `Patient` / `Workflows`
- Source request: `Preferred Pharmacy Requested`

## Implementation Guidance

Default implementation candidate for inbound MDI events. Verify authenticity, process idempotently, and persist only opaque IDs/status.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `Accept`, `Authorization`, `Content-Type`, `Signature`
- Body mode: `raw`
- Body note: Raw body example omitted because it is not parseable as strict JSON or may contain PHI-like examples.

- No generated body fields.

## Response Shape

No response examples summarized from source.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
