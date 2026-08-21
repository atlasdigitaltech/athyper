# Finance Posting-Role Foundation

## Ownership

`finance.posting_role` is the canonical lookup domain. It is global and tenant-extensible. Role metadata carries the finance domain, expected normal balance, and whether the role is always required for posting readiness.

The legacy `control.payment_settlement_posting_role` lookup remains active for compatibility. `control.posting_role_alias` maps legacy and alternate codes to canonical codes. Existing accounting-profile, payment, supplier-override, and asset-policy values are migrated without rewriting those source records.

`control.book_posting_rule` remains the cross-book journal cascade engine. It is not an account-determination table and is not used as a substitute for posting-role account mapping.

## Account assignment

`control.posting_role_account_map` assigns one canonical role to a GL account for a company and ledger book. Assignments are effective-dated, prioritized, versioned, tenant-scoped, and audited.

The database rejects:

- unknown role codes;
- books not assigned to the company for the effective range;
- accounts outside an active company chart;
- inactive or non-posting accounts;
- accounts blocked for automatic posting;
- normal-balance incompatibility;
- overlapping active mappings at the same priority.

Higher priority wins when different-priority mappings overlap. Updating a mapping supersedes the old version and creates a new row.

## Resolution contract

`control.resolve_posting_role_account(tenant, role, company, book_code, date)` preserves the original runtime signature. It delegates to `control.resolve_posting_role_account_trace`, returning the selected GL account only when every resolution gate succeeds.

The trace reports role normalization, canonical/alias selection, company-book resolution, mapping candidates, selected priority/version, and final account postability. Both functions reject a tenant argument that differs from `app.current_tenant_id`.

## Readiness

Required company/book cells are the union of:

- catalog roles marked `mandatory_for_readiness`;
- posting roles used by active accounting-profile entry templates;
- roles used by effective company payment-settlement rules;
- roles used by effective company asset-class book policies.

Missing or invalid required cells create a blocking Finance Setup conflict and reduce the GL/posting-control readiness percentage. Optional catalog roles remain visible in the matrix but do not reduce readiness.

## Workbench workflow

Open:

`/finance/setup/company/{companyCode}/configure?tab=posting_roles`

The matrix shows roles as rows and assigned books as columns. A Finance Manager can filter required or unresolved roles, assign a compatible postable GL account, create successor versions, retire mappings, and inspect the live resolution trace.

Phase 3 permissions remain parked. Authentication, tenant context, tenant RLS, company context, book context, and audit identity are already preserved.

