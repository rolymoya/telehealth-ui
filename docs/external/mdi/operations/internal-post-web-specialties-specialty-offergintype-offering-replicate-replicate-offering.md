# POST /web/specialties/:specialty/:offerginType/:offering/replicate

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-specialties-specialty-offergintype-offering-replicate-replicate-offering`
- Surface: `internal`
- Method: `POST`
- Path: `/web/specialties/:specialty/:offerginType/:offering/replicate`
- Raw URL template: `{{url}}/web/specialties/:specialty/:offerginType/:offering/replicate`
- Source folders: `Internal` / `Web` / `Specialties` / `Offerings`
- Source request: `Replicate Offering`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `offerginType`, `offering`, `specialty`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
