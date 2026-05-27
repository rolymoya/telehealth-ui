# BAA Register

Business Associate Agreements for Apoth Health LLC. Update this register within 24 hours of signing, renewal, or termination.

| Vendor | Account / Customer ID | Effective Date | Expiry | Contact | Status | Notes |
|---|---|---|---|---|---|---|
| AWS | TBD (prod account) | TBD | Evergreen (renews with AWS agreement) | AWS Enterprise Support | **Pending** — sign via AWS Artifact before provisioning any PHI-adjacent infrastructure |
| Datadog | TBD | TBD | Annual | Datadog Account Executive | **Pending** — blocks T-042 (observability). No log ingestion of PHI until signed. |
| Persona | TBD | TBD | Annual | Persona CSM | **Pending** — blocks T-048 (KYC). KYC data contains PII/PHI-adjacent identifiers. |
| MDIntegrations | TBD | TBD | Annual | MDI Partnership contact | **Pending** — blocks T-052 (MDI phase). All clinical data flows through MDI. |
| 503A pharmacy partner | TBD (partner name TBD) | TBD | Annual | TBD | **Pending** — blocks T-066, T-032. Update vendor name when partner is confirmed. |
| Stripe | N/A | N/A | N/A | N/A | **Not applicable** — Stripe does not offer a HIPAA BAA. Per policy L-002, no PHI may flow to Stripe. Billing is keyed on internal order IDs only. See `RULES.md`. |

## How to update

1. Complete signing in the vendor portal or via AWS Artifact.
2. Add effective date, expiry, and contact email to the row above.
3. Change status to **Active**.
4. Commit with message: `compliance: BAA signed — <Vendor>`.

## Key constraint

No PHI-adjacent data (patient identifiers, clinical notes, prescriptions, intake responses) may be stored in or transmitted to a vendor that lacks an Active BAA entry in this register. If a vendor row is Pending, all integrations must treat PHI as out-of-scope until status changes to Active.
