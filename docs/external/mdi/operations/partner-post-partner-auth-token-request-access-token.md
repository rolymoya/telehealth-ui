# POST /partner/auth/token

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-post-partner-auth-token-request-access-token`
- Surface: `partner`
- Method: `POST`
- Path: `/partner/auth/token`
- Raw URL template: `{{baseUrl}}/partner/auth/token`
- Source folders: `Partners`
- Source request: `Request access token`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `noauth`
- Path params: `none`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- client_id: string
- client_secret: string
- grant_type: string
- scope: string

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- access_token: string
- expires_in: number
- token_type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
