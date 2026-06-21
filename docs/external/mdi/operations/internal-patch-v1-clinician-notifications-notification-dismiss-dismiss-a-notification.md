# PATCH /v1/clinician/notifications/:notification/dismiss

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-v1-clinician-notifications-notification-dismiss-dismiss-a-notification`
- Surface: `internal`
- Method: `PATCH`
- Path: `/v1/clinician/notifications/:notification/dismiss`
- Raw URL template: `{{url}}/v1/clinician/notifications/:notification/dismiss`
- Source folders: `Internal` / `Clinicians App (V1)` / `Notifications`
- Source request: `Dismiss a notification`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `notification`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
