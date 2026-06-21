# GET /web/specialties/:specialty/questionnaires

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-specialties-specialty-questionnaires-get-questionnaires-2`
- Surface: `internal`
- Method: `GET`
- Path: `/web/specialties/:specialty/questionnaires`
- Raw URL template: `{{url}}/web/specialties/:specialty/questionnaires?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR&with_relationships[]=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Specialties` / `Questionnaires`
- Source request: `Get Questionnaires`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `specialty`
- Query params: `order`, `page`, `per_page`, `search`, `sort`, `trashed`, `with_relationships[]`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
