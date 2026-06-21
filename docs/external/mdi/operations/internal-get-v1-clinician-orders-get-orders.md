# GET /v1/clinician/orders

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-v1-clinician-orders-get-orders`
- Surface: `internal`
- Method: `GET`
- Path: `/v1/clinician/orders`
- Raw URL template: `{{url}}/v1/clinician/orders?order_status=REDACTED_SCALAR&pharmacy_id=REDACTED_SCALAR&case_type=REDACTED_SCALAR&is_live=REDACTED_SCALAR&is_sandbox=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Orders`
- Source request: `Get Orders`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `case_type`, `clinicians`, `is_live`, `is_sandbox`, `order_status`, `partners`, `pharmacy_id`
- Header names: `none`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
