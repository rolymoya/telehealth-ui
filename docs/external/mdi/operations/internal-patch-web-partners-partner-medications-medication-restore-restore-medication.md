# PATCH /web/partners/:partner/medications/:medication/restore

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-medications-medication-restore-restore-medication`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/medications/:medication/restore`
- Raw URL template: `{{url}}/web/partners/:partner/medications/:medication/restore`
- Source folders: `Internal` / `Web` / `Partners` / `Medications`
- Source request: `Restore Medication`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `medication`, `partner`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
