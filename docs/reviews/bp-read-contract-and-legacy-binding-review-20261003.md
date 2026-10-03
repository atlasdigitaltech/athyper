# BP read contracts and legacy binding reconciliation

3 October 2026. Existing DEV only. **Read-contract implementation checkpoint; full runtime successor, governed tenant successor and independent approval are incomplete.** No release head, permission or role/group relationship changed. No migration was applied.

## Implemented and qualified offline

The shared Entity Framework now exposes `prepareSplitReadRuntime` for explicitly authored split Core/Operation read contracts. It uses the existing descriptor parser, shared list/read handler registrations, runtime qualification and compiled parent-contract validator. This follows the existing Country read integration: governed descriptor, exact published permissions, shared record provider and standard entity routing/list/detail. No entity-name dispatch or parallel provider was added.

Eight candidates cover BP and its seven scoped children. Their Core properties now explicitly declare readable list identity, columns and record navigation. The adapter requires explicit storage mappings, read policies and shared handlers; rejects unsupported operation controls, duplicate bindings, unadapted policies and masked query access; copies exact defined permissions; and leaves undefined child permission properties undefined. Required-parent and organization bindings remain in metadata and pass the existing compiled-contract validator. Banking and tax have no company scope, as directed.

The new additive identity read model fixes Person aliases, joins organization facts only for organization partners and joins lookup labels within the correct domain and tenant/global scope. It reads current BP columns directly: the older `SELECT *` identity view does not include the later capability flags. Separate identifier and tax projections mask protected values in SQL before ordinary reads. The forward migration is registered and hash-inventoried but unapplied. Reveal paths and MFA controls are unchanged.

[Hashed candidates and the exact 43-binding ledger](bp-read-runtime-contracts-20261003.json) are reproducible with:

```sh
pnpm exec tsx tooling/scripts/metadata/prepare-split-read-runtime.mts business_partner <captured-active-releases.json> docs/reviews/bp-read-runtime-contracts-20261003.json
```

The tool discovers declared relationships, computes canonical artifact hashes, qualifies shared read registrations and validates the eight Core/Operation/runtime triples. It is an **offline review preparer**, not the complete Studio successor builder. Its `publicationReady` result remains false; it does not sign, activate, approve or automatically replace the tenant head. Candidate read presentation is not a replacement for the complete existing BP experience. Nested display contracts from the previous checkpoint remain source declarations; complete nested browser integration and permitted/denied user flows still need qualification.

## The 43 legacy bindings

The tenant predecessor contains **24 read, 16 write and three reveal bindings**. Each ledger row records the exact predecessor binding and operation, including permission, effect, target, scope and preflight requirements. Only the `read` key has a proposed same-key shared binding; that is a migration requiring review, not an approved equivalence. The other 42 are unresolved and retain a preserve-predecessor obligation. No name-based permission mapping, read-only downgrade or operation removal is approved.

The current eight source Operation artifacts also retain **18 non-read operations**. These are not interchangeable with the predecessor's operation keys or controls. Their implementations and mappings must be qualified through domain-owned registered capabilities before a full successor can be produced. All non-read source operation objects remain unchanged in this checkpoint.

| Legacy effect | Operations requiring explicit reconciliation |
| --- | --- |
| read | `activity_read`, `addresses_read`, `attachments_read`, `bank_read`, `case_read`, `certificate_read`, `comments_read`, `contacts_read`, `credit_read`, `customer_company_read`, `discover`, `enter`, `export`, `identifier_read`, `identity_read`, `navigate_manage`, `navigate_overview`, `navigate_review`, `network_read`, `qualification_read`, `read`, `requests_read`, `supplier_company_read`, `tax_read` |
| write | `add_role`, `amend_partner`, `assign_organization`, `case_create`, `case_decide`, `case_materialize`, `case_submit`, `case_update`, `case_validate`, `change_bank`, `configure_company`, `import`, `lifecycle`, `qualification`, `qualification_company`, `request_supplier` |
| reveal | `bank_reveal`, `tax_reveal`, `identifier_reveal` |

Do not restore legacy bespoke routes or handlers to satisfy these counts. Read surfaces need explicit published mappings to eligible shared entities or relationships; writes need domain implementations through existing authorization, transaction, audit and idempotency contracts. Protected reveals need their existing controls preserved; changing MFA behavior requires separate owner authorization.

## Governed tenant successor and approval gate

A fresh read-only DEV capture confirmed the same predecessor coordinates as the previous checkpoint:

| Authority | Source release | Artifact hash |
| --- | --- | --- |
| Platform | `28bf5bff-caba-5a16-b971-dfc376b2b501` | `0c37e4c13904b0586c4b591e906ee5e80753f3e57a99f4affd37a6c2e6e154fa` |
| Tenant `11111111-1111-4111-8111-111111111111` | `b0515908-244d-40e9-b518-12116ddb7354` | `bfb27ee31463398b9fd1e5e2c473e1216c16967c8e019120add54a792e779ced` |

[Refreshed tenant reconciliation](bp-tenant-override-reconciliation-20261003.json) compares those heads with the revised sources. Tenant-only BP Request runtime remains retained pending its own collection-contract qualification; it is not silently promoted or removed. Existing deferred request controls remain dependencies, not new onboarding scope. The generated evidence retains source-release identities and hashes, with separate null platform/tenant author and reviewer fields.

Required next gates, in order:

1. Reconcile every root operation and surface with its exact permission and scope; implement and qualify missing registered capabilities while preserving existing behavior. Finish record presentation and nested coverage integration.
2. Assemble the complete platform successor and a separately governed tenant successor preserving approved tenant deltas and retained dependencies. Require unchanged predecessor heads or reconcile again. The eight read candidates alone are insufficient.
3. Submit exact completed releases for Platform Admin authorship and independent Platform Owner review; tenant extensions require Tenant Admin authorship and independent Tenant Owner review. Repository `AGENTS.md` requires these distinct authorities. Automated tests and service receipts cannot provide their attestations. No approval request is made for an incomplete release.
4. Apply reviewed migrations/publications through the existing DEV path and verify authorized/denied list, detail, child, organization and tenant-override flows. Only then execute the already-gated seven-permission retirement and role/group relationship cleanup.

## Verification and limits

Twenty focused tests pass: six new shared read-adapter cases and fourteen existing parent/compiled-runtime cases. The production metadata typecheck passes. Existing DEV PostgreSQL temporary fixtures prove readable Person aliases, tenant/category join isolation and identifier/tax SQL masking; all fixture work rolls back. Migration layout validation passes (122 classified files, 114 retained SQL). The eight generated read candidates pass handler-registration and parent-contract qualification.

These checks do not establish live RLS admission, full browser acceptance, complete runtime behavior, governed successor creation or independent human approval. **All seven old BP child-read permissions remain unretired.** This is an implementation checkpoint for further work, not a publishable release.
