# GET /clinician/partners/:partner_id/completed-cases

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-clinician-partners-partner-id-completed-cases-get-completed-cases`
- Surface: `internal`
- Method: `GET`
- Path: `/clinician/partners/:partner_id/completed-cases`
- Raw URL template: `{{baseUrl}}/clinician/partners/:partner_id/completed-cases?page=REDACTED_SCALAR&limit=REDACTED_SCALAR&is_sandbox=REDACTED_SCALAR&is_live=REDACTED_SCALAR&is_assigned_to_me=REDACTED_SCALAR&is_sync=REDACTED_SCALAR&is_additional_approval_needed=REDACTED_SCALAR&tags[]=REDACTED_SCALAR&clinicians[]=REDACTED_SCALAR&states[]=REDACTED_SCALAR&diseases[]=REDACTED_SCALAR&case_type=REDACTED_SCALAR`
- Source folders: `Internal` / `Clinicians App (V1)` / `Partners` / `Cases`
- Source request: `Get completed cases`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner_id`
- Query params: `case_type`, `clinicians[]`, `diseases[]`, `is_additional_approval_needed`, `is_assigned_to_me`, `is_live`, `is_sandbox`, `is_sync`, `limit`, `only_with_services`, `page`, `sort`, `states[]`, `tags[]`
- Header names: `none`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
