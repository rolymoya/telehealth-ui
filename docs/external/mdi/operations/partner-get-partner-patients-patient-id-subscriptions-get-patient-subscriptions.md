# GET /partner/patients/:patient_id/subscriptions

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-subscriptions-get-patient-subscriptions`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/subscriptions`
- Raw URL template: `{{url}}/partner/patients/:patient_id/subscriptions?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients` / `Subscriptions`
- Source request: `Get Patient Subscriptions`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient_id`
- Query params: `page`, `per_page`
- Header names: `Version`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- data: array
- data[]: object
- data[].billing: object
- data[].billing.card_id: string
- data[].billing.expire_date: string
- data[].billing.issuer: string
- data[].billing.type: string
- data[].cancelled_at: null
- data[].category: string
- data[].created_at: string
- data[].deleted_at: null
- data[].description: string
- data[].encounter_period: number
- data[].expires_at: string
- data[].id: string
- data[].metadata: array
- data[].metadata[]: object
- data[].metadata[].key: string
- data[].metadata[].value: string
- data[].partner_id: string
- data[].patient_id: string
- data[].price: number
- data[].products: array
- data[].products[]: object
- data[].products[].description: string
- data[].products[].image_url: string
- data[].products[].name: string
- data[].products[].offering_id: string
- data[].renew_period: number
- data[].status: string
- data[].subscription_created_at: string
- data[].title: string
- data[].updated_at: string
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
- meta.links[].page: null
- meta.links[].url: null
- meta.path: string
- meta.per_page: number
- meta.to: number
- meta.total: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
