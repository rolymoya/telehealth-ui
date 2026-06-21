# GET /partner/patients/:patient_id/dosespot/medications/history

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-patients-patient-id-dosespot-medications-history-get-medications-history`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/patients/:patient_id/dosespot/medications/history`
- Raw URL template: `{{baseUrl}}/partner/patients/:patient_id/dosespot/medications/history`
- Source folders: `Partners` / `Patients` / `Dosespot`
- Source request: `Get Medications History`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `patient_id`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].brand: boolean
- [].days_supply: number
- [].diagnosis_code: null
- [].diagnosis_qualifier: null
- [].directions: null
- [].dispensable_drug_id: number
- [].dispense_unit_description: string
- [].dispense_unit_id: number
- [].display_name: null
- [].dose_form: string
- [].drug_classification: string
- [].effective_date: null
- [].expiration_date: null
- [].generic_drug_name: string
- [].last_fill_date: string
- [].ndc: string
- [].no_substitutions: boolean
- [].otc: boolean
- [].patient_medication_history_id: number
- [].payer: string
- [].pharmacy_notes: null
- [].quantity: string
- [].refills: null
- [].route: string
- [].rx_cui: null
- [].schedule: string
- [].strength: string
- [].written_date: null

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
