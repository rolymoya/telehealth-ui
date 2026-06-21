# GET /partner/subscriptions/:subscription_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-subscriptions-subscription-id-get-subscription`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/subscriptions/:subscription_id`
- Raw URL template: `{{url}}/partner/subscriptions/:subscription_id`
- Source folders: `Partners` / `Subscriptions`
- Source request: `Get Subscription`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `subscription_id`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- auto_detach_status: array
- auto_detach_status[]: string
- color: string
- description: string
- key: string
- name: string
- removable_role: string
- type: string

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- billing: object
- billing.card_id: string
- billing.expire_date: string
- billing.issuer: string
- billing.type: string
- cancelled_at: null
- category: string
- created_at: string
- deleted_at: null
- description: string
- encounter_period: number
- expires_at: string
- id: string
- metadata: array
- metadata[]: object
- metadata[].key: string
- metadata[].value: string
- partner_id: string
- patient_id: string
- price: number
- products: array
- products[]: object
- products[].description: string
- products[].image_url: string
- products[].name: string
- products[].offering_id: string
- renew_period: number
- status: string
- subscription_created_at: string
- title: string
- updated_at: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
