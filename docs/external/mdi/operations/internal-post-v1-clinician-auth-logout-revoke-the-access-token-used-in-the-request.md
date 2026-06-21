# POST /v1/clinician/auth/logout

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-v1-clinician-auth-logout-revoke-the-access-token-used-in-the-request`
- Surface: `internal`
- Method: `POST`
- Path: `/v1/clinician/auth/logout`
- Raw URL template: `{{url}}/v1/clinician/auth/logout`
- Source folders: `Internal` / `Clinicians App (V1)` / `Logout`
- Source request: `Revoke the access token used in the request`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
