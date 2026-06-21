# GET /partner/cases/:case_id/orders/:order/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-orders-order-events-get-case-order-events`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/orders/:order/events`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/orders/:order/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Partners` / `Cases` / `Orders`
- Source request: `Get Case Order Events`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `case_id`, `order`
- Query params: `page`, `per_page`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].auditable_id: string
- [].auditable_type: string
- [].by: string
- [].by_model: string
- [].created_at: string
- [].date_time: string
- [].event: string
- [].event_id: string
- [].id: string
- [].inserted_id: null
- [].ip_address: string
- [].is_acknowledged: boolean
- [].model: string
- [].new_values: object
- [].new_values.case_id: string
- [].new_values.date: string
- [].new_values.details: null
- [].new_values.external_id: string
- [].new_values.id: string
- [].new_values.number: string
- [].new_values.pharmacy_id: string
- [].new_values.prescriptions_id: string
- [].new_values.status: string
- [].old_values: array
- [].tags: null
- [].title: string
- [].type: string
- [].updated_at: string
- [].url: string
- [].user: null
- [].user_agent: string
- [].user_id: null
- [].user_type: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
