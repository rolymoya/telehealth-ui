# GET /partner/dispense-units

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-dispense-units-get-dispense-units`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/dispense-units`
- Raw URL template: `{{baseUrl}}/partner/dispense-units`
- Source folders: `Partners` / `Dispense Units`
- Source request: `Get dispense units`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `not specified`
- Path params: `none`
- Query params: `name`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- []: object
- [].abbreviation: string
- [].active: boolean
- [].dispense_unit_id: number
- [].name: string
- [].plural: string
- [].singular: string
- [].singular_or_plural: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
