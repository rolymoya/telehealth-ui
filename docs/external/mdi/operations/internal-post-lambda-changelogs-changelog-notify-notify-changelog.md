# POST /lambda/changelogs/:changelog/notify

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-post-lambda-changelogs-changelog-notify-notify-changelog`
- Surface: `internal`
- Method: `POST`
- Path: `/lambda/changelogs/:changelog/notify`
- Raw URL template: `{{url}}/lambda/changelogs/:changelog/notify`
- Source folders: `Internal` / `Lambda` / `Changelogs`
- Source request: `Notify Changelog`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `noauth`
- Path params: `changelog`
- Query params: `none`
- Header names: `Signature`, `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
