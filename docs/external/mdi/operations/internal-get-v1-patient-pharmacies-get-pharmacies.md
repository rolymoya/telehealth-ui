# GET /v1/patient/pharmacies

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-patient-pharmacies-get-pharmacies`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/patient/pharmacies`
- Raw URL template: `{{url}}/v1/patient/pharmacies?name=REDACTED_SCALAR`
- Source folders: `Internal` / `Patient App (V1)` / `Patient` / `Pharmacies`
- Source request: `Get pharmacies`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `address`, `city`, `name`, `ncpdpID`, `phoneOrFax`, `specialty[0]`, `specialty[1]`, `state`, `zip`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
