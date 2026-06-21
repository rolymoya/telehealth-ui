# GET /web/service-notifications

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-service-notifications-get-service-notifications-2`
- Surface: `internal`
- Method: `GET`
- Path: `/web/service-notifications`
- Raw URL template: `{{url}}/web/service-notifications?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR&scope=REDACTED_SCALAR&type=REDACTED_SCALAR&notify_to=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Service Notifications`
- Source request: `Get Service Notifications`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `none`
- Query params: `notify_to`, `page`, `per_page`, `scope`, `type`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
