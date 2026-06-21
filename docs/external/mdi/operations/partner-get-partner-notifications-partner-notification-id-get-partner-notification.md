# GET /partner/notifications/:partner_notification_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-notifications-partner-notification-id-get-partner-notification`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/notifications/:partner_notification_id`
- Raw URL template: `{{baseUrl}}/partner/notifications/:partner_notification_id`
- Source folders: `Partners` / `Notifications`
- Source request: `Get Partner Notification`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `partner_notification_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- created_at: string
- id: string
- needs_ack: boolean
- notes: string
- notify: number
- partner: object
- partner.customer_support_email: string
- partner.name: string
- partner.operation_country: object
- partner.operation_country.abbreviation: string
- partner.operation_country.country_id: string
- partner.operation_country.name: string
- partner.operations_support_email: string
- partner.partner_id: string
- partner.partner_notes: string
- partner.patient_message_capability: string
- partner.support_messaging_capability: string
- partner.vouched_integration_type: string
- partner_id: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
