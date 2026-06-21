# GET /web/partners/:partner/offerings/:offerginType/:offering/reviews

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-offerings-offergintype-offering-reviews-get-offering-reviews`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/offerings/:offerginType/:offering/reviews`
- Raw URL template: `{{url}}/web/partners/:partner/offerings/:offerginType/:offering/reviews`
- Source folders: `Internal` / `Web` / `Partners` / `Offerings` / `Reviews`
- Source request: `Get Offering Reviews`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `offerginType`, `offering`, `partner`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `raw`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
