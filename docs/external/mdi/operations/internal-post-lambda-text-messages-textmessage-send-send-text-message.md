# POST /lambda/text-messages/:textMessage/send

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-lambda-text-messages-textmessage-send-send-text-message`
- Surface: `internal`
- Method: `POST`
- Path: `/lambda/text-messages/:textMessage/send`
- Raw URL template: `{{url}}/lambda/text-messages/:textMessage/send`
- Source folders: `Internal` / `Lambda` / `Text Messages`
- Source request: `Send Text Message`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `textMessage`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
