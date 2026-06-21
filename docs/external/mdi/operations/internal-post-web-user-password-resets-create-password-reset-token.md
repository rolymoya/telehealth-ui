# POST /web/user/password-resets

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-web-user-password-resets-create-password-reset-token`
- Surface: `internal`
- Method: `POST`
- Path: `/web/user/password-resets`
- Raw URL template: `{{url}}/web/user/password-resets`
- Source folders: `Internal` / `Web` / `User` / `Password Resets`
- Source request: `Create Password Reset (Token)`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `none`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
