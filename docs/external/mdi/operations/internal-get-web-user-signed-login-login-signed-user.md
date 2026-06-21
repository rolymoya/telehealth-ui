# GET /web/user/signed-login

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-user-signed-login-login-signed-user`
- Surface: `internal`
- Method: `GET`
- Path: `/web/user/signed-login`
- Raw URL template: `{{url}}/web/user/signed-login?email=REDACTED_SCALAR&expires=REDACTED_SCALAR&signature=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `User` / `Login`
- Source request: `Login Signed User`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `none`
- Query params: `email`, `expires`, `signature`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
