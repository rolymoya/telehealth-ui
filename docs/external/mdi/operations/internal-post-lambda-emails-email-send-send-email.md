# POST /lambda/emails/:email/send

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-lambda-emails-email-send-send-email`
- Surface: `internal`
- Method: `POST`
- Path: `/lambda/emails/:email/send`
- Raw URL template: `{{url}}/lambda/emails/:email/send`
- Source folders: `Internal` / `Lambda` / `Emails`
- Source request: `Send Email`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `email`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
