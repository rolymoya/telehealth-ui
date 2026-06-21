# PATCH /web/partners/:partner/nps-surveys/:nps_survey_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-patch-web-partners-partner-nps-surveys-nps-survey-id-update-nps-survey`
- Surface: `internal`
- Method: `PATCH`
- Path: `/web/partners/:partner/nps-surveys/:nps_survey_id`
- Raw URL template: `{{url}}/web/partners/:partner/nps-surveys/:nps_survey_id`
- Source folders: `Internal` / `Web` / `Partners` / `NPS Surveys`
- Source request: `Update NPS Survey`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `nps_survey_id`, `partner`
- Query params: `none`
- Header names: `Version`
- Body mode: `raw-json`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
