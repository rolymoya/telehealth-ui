# GET /partner/statistics/count/cases-by-status

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-statistics-count-cases-by-status-get-case-statuses-count`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/statistics/count/cases-by-status`
- Raw URL template: `{{baseUrl}}/partner/statistics/count/cases-by-status`
- Source folders: `Partners` / `Cases` / `Case Status` / `Statistics`
- Source request: `Get Case Statuses Count`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `none`
- Header names: `none`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- approved: number
- assigned: number
- created: number
- processing: number
- support: number
- waiting: number

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
