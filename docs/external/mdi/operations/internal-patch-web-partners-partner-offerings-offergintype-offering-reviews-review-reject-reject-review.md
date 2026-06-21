# PATCH /web/partners/:partner/offerings/:offerginType/:offering/reviews/:review/reject

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-offerings-offergintype-offering-reviews-review-reject-reject-review`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/offerings/:offerginType/:offering/reviews/:review/reject`
- Raw URL template: `{{url}}/web/partners/:partner/offerings/:offerginType/:offering/reviews/:review/reject`
- Source folders: `Internal` / `Web` / `Partners` / `Offerings` / `Reviews`
- Source request: `Reject Review`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `offerginType`, `offering`, `partner`, `review`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
