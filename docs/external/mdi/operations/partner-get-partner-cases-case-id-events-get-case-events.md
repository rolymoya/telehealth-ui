# GET /partner/cases/:case_id/events

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-cases-case-id-events-get-case-events`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/cases/:case_id/events`
- Raw URL template: `{{baseUrl}}/partner/cases/:case_id/events?page=REDACTED_SCALAR&per_page=REDACTED_SCALAR`
- Source folders: `Partners` / `Cases` / `Events`
- Source request: `Get case events`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `case_id`
- Query params: `page`, `per_page`
- Header names: `Accept`, `Content-Type`
- Body mode: `raw`
- Body note: Body shape unavailable from Postman metadata; raw payload omitted.

- No generated body fields.

## Response Shape

### Response 1

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].by: string
- [].by_model: string
- [].date_time: string
- [].event_id: string
- [].model: string
- [].title: string
- [].type: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
