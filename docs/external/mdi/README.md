# MDI Generated Retrieval Docs

These files are generated from `docs/external/MD Integrations API.postman_collection.json`. The Postman collection remains the source of truth; rerun the generator when the collection changes.

The generated docs intentionally omit source scalar examples, full payload fixtures, questionnaire answers, clinical note text, message text, prescription directions, tokens, and secrets. They keep endpoint metadata, source provenance, and schema shape summaries only.

## Workflow

```sh
npm run mdi:docs
npm run mdi:docs:validate
```

Search generated docs instead of loading the full collection:

```sh
rg "Create patient|partner/patients|T-055" docs/external/mdi
rg "case_question|questionnaire|T-056" docs/external/mdi
rg "event_type|webhook|T-057" docs/external/mdi
```

## Surface Counts

- partner: 116
- internal: 954
- test: 6
- unknown: 2
- webhook: 42
- status: 1
- admin: 13

## Implementation Posture

- Prefer `partner` endpoints for Apoth server-side MDI calls.
- Prefer `webhook` examples for inbound MDI receiver contracts.
- Treat `internal`, `admin`, `test`, and `unknown` routes as default-deny unless a future ticket explicitly justifies them.
- Persist only minimal Apoth linkage/status records. Do not store questionnaire answers, clinical content, or PHI-heavy MDI payloads locally.
