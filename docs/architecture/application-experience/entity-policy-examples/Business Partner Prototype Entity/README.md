# Business Partner meta-entity descriptor set

These are proposed compiled descriptors for review. They use the proposed
`athyper.entity-runtime-descriptor/2.0` contract; they are **not** accepted by
the current runtime parser and do not create browser-accessible table endpoints.

Each file describes one Neon handler surface. `storage.sourceObjects` records
the authoritative tables/projections for compiler and reviewer traceability.
Clients call the declared handler keys; Neon applies authorization, tenant RLS,
effective-date checks, context validation, redaction, and materialization.

| Descriptor | Surface |
| --- | --- |
| `business_partner.json` | Canonical tenant-wide Business Partner identity and aggregate references |
| `business_partner_identity.json` | Aliases, external references and classifications |
| `business_partner_contact.json` | Contacts, roles and communication channels |
| `business_partner_address.json` | Canonical addresses and effective owner links |
| `business_partner_identifier.json` | Identifiers and tax registrations |
| `business_partner_relationship.json` | Commercial and governance relationships |
| `supplier.json`, `customer.json` | Role identities |
| `business_partner_operating_organization_assignment.json` | Effective role participation in an Operating Organization |
| `supplier_company_profile.json`, `customer_company_profile.json` | Company-specific role extensions |
| `business_partner_banking.json` | Protected banking usage and remittance controls |
| `business_partner_certification.json`, `business_partner_qualification.json`, `business_partner_commodity_capability.json` | Individually publishable compliance child entities |
| `business_partner_compliance.json` | Composite compliance section that composes those child entities |
| `business_partner_attachment.json` | Versioned document assets and owner links |
| `business_partner_risk.json` | Risk, credit evidence and reviews |
| `business_partner_request.json` | Governed request drafts, evidence, validation and materialization |

`businessContext` is declarative. It declares required coordinates and
capabilities, but never grants them. `handlers` and `serverPolicies` identify
the Neon-controlled enforcement boundary.
