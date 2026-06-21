# PATCH /web/clinicians/:clinician

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-clinicians-clinician-patch-clinician`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/clinicians/:clinician`
- Raw URL template: `{{url}}/web/clinicians/:clinician`
- Source folders: `Internal` / `Web` / `Clinicians`
- Source request: `Patch Clinician`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `clinician`
- Query params: `with_relationships[]`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
