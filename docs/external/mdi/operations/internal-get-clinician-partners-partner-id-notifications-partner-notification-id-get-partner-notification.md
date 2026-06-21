# GET /clinician/partners/:partner_id/notifications/:partner_notification_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-clinician-partners-partner-id-notifications-partner-notification-id-get-partner-notification`
- Surface: `internal`
- Method: `GET`
- Path: `/clinician/partners/:partner_id/notifications/:partner_notification_id`
- Raw URL template: `{{baseUrl}}/clinician/partners/:partner_id/notifications/:partner_notification_id`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Notifications`
- Source request: `Get Partner Notification`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `partner_id`, `partner_notification_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
