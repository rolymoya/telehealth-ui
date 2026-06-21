# POST /admin/partners/:partner/medications/:medication/replicate

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `admin-post-admin-partners-partner-medications-medication-replicate-replicate-medication`
- Surface: `admin`
- Method: `POST`
- Path: `/admin/partners/:partner/medications/:medication/replicate`
- Raw URL template: `{{url}}/admin/partners/:partner/medications/:medication/replicate`
- Source folders: `Internal` / `Admin` / `Partners` / `Medications`
- Source request: `Replicate Medication`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `medication`, `partner`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
