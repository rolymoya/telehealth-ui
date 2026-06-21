# DELETE /web/partners/:partner/internal-support-staffs/:supportStaff

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `internal-delete-web-partners-partner-internal-support-staffs-supportstaff-detach-internal-support-staff`
- Surface: `internal`
- Method: `DELETE`
- Path: `/web/partners/:partner/internal-support-staffs/:supportStaff`
- Raw URL template: `{{url}}/web/partners/:partner/internal-support-staffs/:supportStaff`
- Source folders: `Internal` / `Web` / `Partners` / `Internal Support Staffs`
- Source request: `Detach Internal Support Staff`

## Implementation Guidance

Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.

## Request Shape

- Auth type in source: `bearer`
- Path params: `partner`, `supportStaff`
- Query params: `none`
- Header names: `Version`
- Body mode: `none`
- Body note: Omitted because this surface is default-deny for Apoth implementation.

- Detailed body shape omitted for this default-deny surface.

## Response Shape

Detailed response shape omitted for this default-deny surface.

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
