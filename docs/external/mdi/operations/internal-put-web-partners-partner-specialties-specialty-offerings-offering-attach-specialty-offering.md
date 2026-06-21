# PUT /web/partners/:partner/specialties/:specialty/offerings/:offering

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-put-web-partners-partner-specialties-specialty-offerings-offering-attach-specialty-offering`
- Surface: `internal`
- Method: `PUT`
- Path: `/web/partners/:partner/specialties/:specialty/offerings/:offering`
- Raw URL template: `{{url}}/web/partners/:partner/specialties/:specialty/offerings/:offering`
- Source folders: `Internal` / `Web` / `Partners` / `Specialties` / `Offerings`
- Source request: `Attach Specialty Offering`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `offering`, `partner`, `specialty`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
