# GET /v1/partner/medications/select

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-medications-select-get-details-for-a-specific-medication`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/medications/select`
- Raw URL template: `{{url}}/v1/partner/medications/select?dispensable_drug_id=REDACTED_SCALAR&ndc=REDACTED_SCALAR&rxcui=REDACTED_SCALAR`
- Source folders: `Partners` / `Offerings` / `Dosespot`
- Source request: `Get Details For a Specific Medication`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `dispensable_drug_id`, `ndc`, `rxcui`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- brand: boolean
- compound_ingredients: null
- dispense_unit_id: number
- display_name: string
- dose_form: string
- drug_classification: string
- generic_product_name: string
- lexi_drug_syn_id: number
- lexi_gen_drug_id: string
- lexi_gen_product_id: number
- lexi_synonym_type_id: number
- ndc: string
- otc: boolean
- route: string
- rx_cui: string
- schedule: string
- state_schedules: array
- strength: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
