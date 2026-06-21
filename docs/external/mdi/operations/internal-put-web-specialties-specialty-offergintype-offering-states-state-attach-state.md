# PUT /web/specialties/:specialty/:offerginType/:offering/states/:state

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-put-web-specialties-specialty-offergintype-offering-states-state-attach-state`
- Surface: `internal`
- Method: `PUT`
- Path: `/web/specialties/:specialty/:offerginType/:offering/states/:state`
- Raw URL template: `{{url}}/web/specialties/:specialty/:offerginType/:offering/states/:state`
- Source folders: `Internal` / `Web` / `Specialties` / `Offerings` / `States`
- Source request: `Attach State`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `offerginType`, `offering`, `specialty`, `state`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
