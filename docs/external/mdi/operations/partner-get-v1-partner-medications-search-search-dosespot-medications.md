# GET /v1/partner/medications/search

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-medications-search-search-dosespot-medications`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/medications/search`
- Raw URL template: `{{url}}/v1/partner/medications/search?name=REDACTED_SCALAR`
- Source folders: `Partners` / `Offerings` / `Dosespot`
- Source request: `Search Dosespot Medications`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `name`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw-json`
- Body note: Shape summary only. Source scalar examples are intentionally omitted.

- address: object
- address.address: string
- address.city_id: string
- address.zip_code: string
- allergies: string
- current_medications: string
- date_of_birth: string
- email: string
- first_name: string
- gender: number
- height: number
- last_name: string
- phone_number: string
- phone_type: number
- weight: number

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].dispensable_drug_id: null
- [].is_obsolete: boolean
- [].name: string
- [].name_with_route_dose_form: string
- [].ndc: string
- [].routed_dose_form_drug_id: null
- [].rx_cui: null
- [].strength: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
