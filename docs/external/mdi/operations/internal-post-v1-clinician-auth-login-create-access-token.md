# POST /v1/clinician/auth/login

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-auth-login-create-access-token`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/auth/login`
- Raw URL template: `{{url}}/v1/clinician/auth/login`
- Source folders: `Internal` / `Clinicians App (V1)` / `Auth`
- Source request: `Create access token`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `none`
- Query params: `none`
- Header names: `Content-Type`, `Origin`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
