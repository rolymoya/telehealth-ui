# PATCH /web/partners/:partner/services/:service

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-services-service-update-service`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/services/:service`
- Raw URL template: `{{url}}/web/partners/:partner/services/:service`
- Source folders: `Internal` / `Web` / `Partners` / `Services`
- Source request: `Update Service`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `service`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
