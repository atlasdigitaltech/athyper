# Default accounting-profile catalog

Status: locked by user approval. The two code/name/subledger mappings below are finalized. The profile identities were loaded into all three local development business tenants on 2026-09-05. Posting-policy qualification remains pending.

## Locked defaults

| Code | Name | Direction | Subledger |
|---|---|---|---|
| `ACP-AP-STANDARD` | Standard Supplier Accounting | INBOUND | AP |
| `ACP-AR-STANDARD` | Standard Customer Accounting | OUTBOUND | AR |

ACP identifies an accounting profile; AP/AR identifies its subledger. These are locked new identifiers, not aliases for existing historical profiles. Direction follows Athyper's document-flow model, not cash movement.

## Configuration boundaries

A profile is a stable identity in `master.accounting_profile`. Its effective-dated policy, accounting events, posting entries and scoped routing belong to `control.accounting_profile_policy`, `accounting_profile_event`, `accounting_profile_entry` and `accounting_profile_assignment`. A master identity alone is insufficient evidence of posting readiness.

Keep company, currency, industry, payment period and bank account out of generic profile names. Configure company ledger mappings, tax rules and dimensions separately. PO/non-PO and document type are routing inputs; they may require distinct policies where posting behavior differs. Never collapse those differences by renaming an existing profile.

Advances, advance recovery, retention release, capital acquisition, inventory and intercompany accounting are optional event/policy configurations. Introduce additional stable profiles only where lifecycle or posting behavior needs a separately selected policy. Do not create one default profile for every payment term or expense category.

## Historical source findings

The AP non-PO blueprint defines four profiles: `AP_NON_PO_STANDARD`, `AP_NON_PO_CAPEX`, `AP_ADVANCE_SUPPLIER`, `AP_RETENTION_RELEASE`. Its companion aggregate defines four policies, nine events and eighteen posting entries. It is an AP-specific implementation, not a complete generic AP/AR catalog. Standard AR policies must be designed and qualified separately.

The blueprint uses a zero-UUID creator for master profiles, force-updates conflicting records to active, and embeds a fixed 2026 policy effective date. Those behaviors must not be copied into default provisioning. Use valid tenant-local principals, preserve customized records and historical references, and validate complete policy dependencies before activation.

The standard AP policy's expense line uses `payment_suspense` with a business-intent resolution marker. Verify the resolver obtains the intended account; do not treat a placeholder suspense account as a universal operating-expense mapping.

## CirrusAtlantic next implementation

Prepare its tenant-owned standard AP identity and policy, resolve company-scoped ledger accounts and tax/dimension dependencies, and qualify balanced journals, reversals, settlement and effective-date selection. Then use the resulting profile UUID in Northwind's governed company-finance request. Keep GBP, payment term selection and current remittance independently controlled.

The load creates profile identities only; it does not establish posting-policy approvals or posting qualification.

## Reference

[Microsoft posting profiles overview](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/pstg-prfles-ovrvw) describes profiles as configuration mapping subledger transactions to ledger accounts. Athyper's locked names and default count are local design choices.

## Local development load receipt

Loaded 2026-09-05 into Athyper, Technostat and CirrusAtlantic: 17 active payment terms, one discount tier and two active accounting-profile identities per tenant. A second execution left IDs and timestamps unchanged. Business-partner assignments were not changed. Posting policies and automatic integration into future tenant provisioning remain separate work.

[Native load receipt](../../governance/evidence/business-partner/local/2026-09-05/three-tenant-locked-finance-defaults.json). Loader: `server/db/scripts/seed/load-locked-finance-defaults.sql`.
