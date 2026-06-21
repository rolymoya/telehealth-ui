# GET /v1/partner/patients/:patient_id/dosespot/formulary

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-v1-partner-patients-patient-id-dosespot-formulary-get-coverage`
- Surface: `partner`
- Method: `GET`
- Path: `/v1/partner/patients/:patient_id/dosespot/formulary`
- Raw URL template: `{{url}}/v1/partner/patients/:patient_id/dosespot/formulary?patient_eligibility_id=REDACTED_SCALAR&ndc=REDACTED_SCALAR`
- Source folders: `Partners` / `Patients` / `Dosespot`
- Source request: `Get coverage`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `patient_id`
- Query params: `ndc`, `patient_eligibility_id`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- Item: object
- Item.Alternatives: null
- Item.Brand: null
- Item.Copays: null
- Item.FormularyStatus: null
- Item.Otc: null
- Item.RealTimeFormularyRequestStatus: number
- Item.Restrictions: null
- Item.TherapeuticAlternatives: array
- Item.TherapeuticAlternatives[]: object
- Item.TherapeuticAlternatives[].Copay: object
- Item.TherapeuticAlternatives[].Copay.CopayTier: null
- Item.TherapeuticAlternatives[].Copay.DaysSupply: null
- Item.TherapeuticAlternatives[].Copay.FlatCopayAmount: null
- Item.TherapeuticAlternatives[].Copay.FlatCopayAmountFirst: null
- Item.TherapeuticAlternatives[].Copay.IsDrugSpecific: boolean
- Item.TherapeuticAlternatives[].Copay.MaximumCopayAmount: null
- Item.TherapeuticAlternatives[].Copay.MaximumCopayTier: null
- Item.TherapeuticAlternatives[].Copay.MinimumCopayAmount: null
- Item.TherapeuticAlternatives[].Copay.OutOfPocketMaximum: null
- Item.TherapeuticAlternatives[].Copay.OutOfPocketMinimum: null
- Item.TherapeuticAlternatives[].Copay.PercentCopayAmount: null
- Item.TherapeuticAlternatives[].Copay.PharmacyType: null
- Item.TherapeuticAlternatives[].DefaultDispenseUnitID: number
- Item.TherapeuticAlternatives[].DispensableDrugId: number
- Item.TherapeuticAlternatives[].DisplayName: string
- Item.TherapeuticAlternatives[].DisplayStrength: string
- Item.TherapeuticAlternatives[].FormularyInfo: object
- Item.TherapeuticAlternatives[].FormularyInfo.FormularyAbbreviation: null
- Item.TherapeuticAlternatives[].FormularyInfo.FormularyStatusId: number
- Item.TherapeuticAlternatives[].FormularyInfo.FormularyStatusMessage: null
- Item.TherapeuticAlternatives[].FormularyInfo.IsGeneric: null
- Item.TherapeuticAlternatives[].FormularyInfo.IsRx: null
- Item.TherapeuticAlternatives[].FormularyInfo.Ndc: null
- Item.TherapeuticAlternatives[].FormularyInfo.OrderRank: number
- Item.TherapeuticAlternatives[].FormularyInfo.ProductId: number
- Item.TherapeuticAlternatives[].FormularyStatus: null
- Item.TherapeuticAlternatives[].FullDisplayString: string
- Item.TherapeuticAlternatives[].HasGHB: boolean
- Item.TherapeuticAlternatives[].IsDetox: boolean
- Item.TherapeuticAlternatives[].Ndc: string
- Item.TherapeuticAlternatives[].RxCUI: number
- Item.TherapeuticAlternatives[].Schedule: number
- Result: object
- Result.ResultCode: string
- Result.ResultDescription: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
