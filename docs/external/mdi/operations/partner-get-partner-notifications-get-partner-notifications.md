# GET /partner/notifications

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-notifications-get-partner-notifications`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/notifications`
- Raw URL template: `{{baseUrl}}/partner/notifications`
- Source folders: `Partners` / `Notifications`
- Source request: `Get Partner Notifications`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].created_at: string
- data[].id: string
- data[].needs_ack: boolean
- data[].notes: string
- data[].notify: number
- data[].partner: object
- data[].partner.customer_support_email: string
- data[].partner.name: string
- data[].partner.operation_country: object
- data[].partner.operation_country.abbreviation: string
- data[].partner.operation_country.country_id: string
- data[].partner.operation_country.name: string
- data[].partner.operations_support_email: string
- data[].partner.partner_id: string
- data[].partner.partner_notes: string
- data[].partner.patient_message_capability: string
- data[].partner.support_messaging_capability: string
- data[].partner.vouched_integration_type: string
- data[].partner_id: string
- links: object
- links.first: string
- links.last: string
- links.next: null
- links.prev: null
- meta: object
- meta.current_page: number
- meta.from: number
- meta.last_page: number
- meta.links: array
- meta.links[]: object
- meta.links[].active: boolean
- meta.links[].label: string
- meta.links[].url: null
- meta.path: string
- meta.per_page: number
- meta.to: number
- meta.total: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
