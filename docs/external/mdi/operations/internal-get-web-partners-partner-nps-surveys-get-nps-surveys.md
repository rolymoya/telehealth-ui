# GET /web/partners/:partner/nps-surveys

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-get-web-partners-partner-nps-surveys-get-nps-surveys`
- Surface: `internal`
- Method: `GET`
- Path: `/web/partners/:partner/nps-surveys`
- Raw URL template: `{{url}}/web/partners/:partner/nps-surveys?per_page=REDACTED_SCALAR&page=REDACTED_SCALAR&name=REDACTED_SCALAR&key=REDACTED_SCALAR&subject=REDACTED_SCALAR&status=REDACTED_SCALAR`
- Source folders: `Internal` / `Web` / `Partners` / `NPS Surveys`
- Source request: `Get NPS Surveys`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`
- Query params: `key`, `name`, `page`, `per_page`, `status`, `subject`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
