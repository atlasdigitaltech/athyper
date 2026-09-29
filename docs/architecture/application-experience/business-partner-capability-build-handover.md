# Business Partner capability replacement — implementation handover

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: BP/profile ownership, current capability readers, document-reference cutover, project ownership, capability command wiring and MetaEntity company display labels are **applied to existing DEV**. Signed metadata release **19** is active. The company views, draft fixtures and capability command API are ready for scoped QA. The full legacy control/workflow replacement is still **incomplete**: Supplier/Customer tables and several lifecycle commands remain. No DEV reset has occurred.

## Capability authorization and project ownership — 25 September 2026

This checkpoint supersedes the unfinished capability-host/project items in earlier checkpoints below; it does not mark the legacy ledger replacement complete.

- The generic entity operation registry binds only `neon.bp.capability.supplier.v1` and `neon.bp.capability.customer.v1` to governed BP commands. Parent admission, explicit tenant-scoped capability permission, expected version, idempotency and strict input validation remain enforced. Metadata is not itself an authorization grant.
- Published through `node tooling/scripts/local-dev/publish-partner-capabilities.mjs --apply`: release **19**, release ID `fc589ad4-c964-5682-9c1c-a73d2c8c3256`, applied release ID `01a0d7a0-4e75-71e1-8312-bee7af660cd4`, compiled hash `sha256:967ea5e2767a4b15f73483fa623fd0e441d27a6b98b9eaa1327b563afd12157c`. The dedicated overlay preserves unrelated operations and signed live artifacts.
- With explicit user approval, `node tooling/scripts/verification/apply-catl-capability-test.dev.mjs --apply-existing-dev` granted only CATL admin the two CATL-exact capability-management permissions. Dedicated group/role `dev.partner-capability-test.v1`; membership and role binding expire **2 October 2026, 08:13:21.58304 UTC**. No qualification, restriction, payment-release or approval permission was added. The installer refuses reruns that would silently widen or extend the grant. General clean-install permission-catalog provisioning remains to be integrated; this is a scoped DEV test grant.
- `verify-partner-capabilities.live.mjs --run` passed signed-in supplier/customer enable commands, identical-evidence idempotent replay, stale-version denial and ungranted-owner denial. Both flags on dedicated test BP `01a0d757-97b0-72bc-b37f-b77ffb685a52` were restored to false using the governed commands. This verifies capability commands, not the unfinished activation/preference/credit workflows.
- Project ownership now references BP directly through the tenant-composite `project_business_partner_fk`. The guarded cutover required an empty project table, inspected function dependencies, renamed the column/index and applied no data conversion or deletion. `partner-project-reference.dev.mjs --verify-applied-dev` passes catalog verification. Clean-install DDL matches. Positive/cross-tenant project fixture tests remain to be added.
- Focused host tests cover handler binding, scoped denial, target injection, invalid coordinates and missing version; existing company-overlay tests also pass. DEV API, worker, scheduler and all three web applications are healthy.

**Remaining before full replacement verification:** legacy Supplier/Customer activation/materialization; supplier preference/customer designation/credit/lifecycle ledger writer contracts and historical role FKs; legacy company endpoints; remote workforce eligibility/publication end-to-end tests; broader approved/blocked fixtures; clean-install capability permission provisioning and dedicated capability-overlay preservation tests. Do not retire Supplier/Customer tables or claim complete end-to-end lifecycle verification yet.

## Current document activation, labels and capability readers — 25 September 2026

This checkpoint supersedes earlier statements that document schema activation and company display labels remain staged.

- Applied `node tooling/scripts/verification/partner-document-reference.live.mjs --apply-existing-dev` after the rollback probe, source-contract tests and workforce consumer tests passed. The script locked and required all 18 target document tables to be empty; no legacy UUIDs were converted. It retargeted the tenant-scoped FKs, installed 11 matching functions and five views, tested integrity fixtures inside a savepoint, discarded those test rows, then committed schema only. A catalog preflight refuses unreviewed legacy function dependencies. The workforce schema/command-marker gate is now satisfied; this is **not** proof that remote eligibility or an approved workforce publication journey passes.
- Added `--verify-applied-dev` to test the applied document contract without replaying the one-time column renames. That probe passes, including wrong-tenant, missing partner and mismatched distribution denials. Do not rerun the cutover mode now that real demo Draft documents exist.
- Aligned the 18 FK names and delete actions with clean-install source using `--align-applied-fks-dev`; constraints were replaced and validated atomically, without deleting rows. The verification mode checks live catalog authority/validation/delete action as well as data integrity. The installer now reads FK clauses directly from clean-install source rather than duplicating them.
- The eligibility reader now checks the selected BP capability flag, not legacy Supplier/Customer existence/status. Disabled capability yields the existing blocking `ROLE_INACTIVE` reason, referencing BP identity. Enabled does not skip qualification, restriction, risk, assignment, company/profile or bank checks. Old activation is no longer an exception to the capability requirement.
- Current record summary/header role badges, Roles & scope and company relationship matrix read independent BP flags. Their business-facing Supplier/Customer terminology remains, but they emit no invented role UUID. Shared response contracts permit absent historical role IDs; generated schemas are aligned. Historical capability projection returns explicit `PARTNER_CAPABILITY_HISTORY_UNAVAILABLE` rather than claiming current flags are historical evidence. Legacy supplier/customer company endpoints and lifecycle commands are not declared retired by this reader change.
- Activity mapping recognizes the actual capability outbox event codes `business_partner.business_partner_capability.enabled` and `.not_enabled`; protected-field redaction remains unchanged.
- Published scoped release **18**, ID `89a5f161-74c3-5a9e-be99-3acd049d7467`, applied ID `01a0d78c-2296-7797-84e6-b0fb2a72c6ff`, compiled hash `sha256:e763e3480ff585fd7c028793bf729a8b11d7906b6d5f33ae8c9dad58c66dc0c4`. Profile core metadata declares catalog lookups for BP, company, currency and payment terms, and explicit DDL-aligned profile-status choices. The generic tenant-scoped catalog resolver supports admitted BP/payment-term references. No component hardcodes these display values.
- Expanded fixtures: four owned Draft profiles reference a new synthetic Draft `BP-DEMO-NET30` term, filling only previously null fields on fixture-marked Draft profiles; two zero-value Draft purchase documents reference the existing CATL organization/person BPs directly. Existing records are not overwritten. No capability enablement, approval, distribution, payment instruction, grant or reset is performed.

Verification commands:

```bash
node tooling/scripts/verification/partner-document-reference.live.mjs --verify-applied-dev
node tooling/scripts/verification/verify-partner-company-views.live.mjs catl.admin catl.owner
node tooling/scripts/verification/verify-partner-company-labels.browser.mjs
```

Results: document integrity probe passed; 60 targeted master-data tests and four UI relationship tests passed; 25 document/profile source checks passed; master-data source/test and platform-host type checks passed. Signed-in company API checks pass for both actors, both partner categories and both company sections, including display labels and invalid membership. Browser checks pass for company, currency, payment-term and status labels in both sections. Current Overview and Roles & scope return 200.

**Still not complete:** legacy Supplier/Customer activation/materialization and company endpoints; supplier preference/customer designation/credit/lifecycle ledger write contracts and their old role FKs; capability command host/IAM wiring; project customer ownership; remote workforce eligibility and end-to-end governed publication; broad approved/blocked operational fixtures. These require coordinated contracts and governed writers, not aliasing old IDs or dropping live dependencies. Supplier/Customer tables remain. The business-activity provider placeholders are also not replaced with invented transaction summaries.

Fixture rerun commands (additive/idempotent, scoped to named CATL demo records):

```bash
node tooling/scripts/verification/seed-partner-profile.dev.mjs --apply-existing-dev
node tooling/scripts/verification/seed-partner-documents.dev.mjs --apply-existing-dev
```

## Current company-view activation and directory cutover — 25 September 2026

This checkpoint supersedes older staged/publication statements below.

- Root cause of the company-section 404: the former reader admission required a legacy Supplier/Customer role row. The MetaEntity provider now uses `createPartnerCompanyProfileViews` and the BP-owned profile reader. It first admits the parent record, then authorizes the explicit tenant/BP/organization/company/capability resource. It does not manufacture a legacy role ID or relax the old workflow policy.
- Viewing retained Draft company setup does not require an enabled capability or an active BP/organization assignment. Effective organization/company membership and scoped authorization are still mandatory. The separate activation guard retains operational prerequisites. Historical reads explicitly fail rather than presenting current flags as historical facts.
- The directory Supplier/Customer filter now checks the corresponding independent BP capability flag, not existence in a legacy role table. Organization/company and server-issued eligibility constraints still intersect; capability is not eligibility.
- Executed `node tooling/scripts/local-dev/publish-partner-company-profiles.mjs --apply` through the existing scoped, signed DEV publisher. Latest release: `17`; release ID `0145101d-ed0a-5dea-bacb-42c7d09d876d`; applied release ID `01a0d780-ce14-7ceb-a57f-92a89ab7be70`; compiled hash `sha256:afc7a1635c04a38b8bb8e355db06508cf496278c98f50fca3bed97e66bb3ad93`. The overlay pins unrelated live artifacts and changes only the two profile cores, company-section field bindings, BP capability/ownership declarations and Roles navigation tab. Generic profile writes remain disabled.
- Existing four CATL Draft fixtures cover organization/person × supplier/customer. No capability, qualification, payment authorization or new permission was granted. No data reset or table deletion occurred.

Verification:

```bash
node tooling/scripts/verification/verify-partner-company-views.live.mjs catl.admin catl.owner
```

Both signed-in actors pass all four partner/section combinations: published navigation, scoped 200 with one Draft BP-owned profile, missing scope 409 `ENTITY_RUNTIME_CONTEXT_REQUIRED`, and no rows for invalid organization membership. CATL admin browser verification loaded Supplier Company and its draft data through the generic entity route with explicit company/organization query coordinates. An initial browser probe selected a hidden duplicate navigation button; the heading/response-based probe then passed. This is not a full browser QA claim.

Automated checks: 22 company-reader/view/capability tests, 8 host provider/overlay tests and 7 collection-scope SQL tests pass; master-data, platform-host and records type checks pass.

**Remaining:** company reference/enum display-label metadata (the browser currently renders UUIDs/raw codes); the broader role/header/eligibility/control lifecycle cutover; capability command IAM/host wiring; staged document/workforce schema activation against matching consumers; general fixtures beyond the four Draft profiles; complete signed-in business QA. Supplier/Customer tables remain. Do not call this the full replacement or remove its schema gates.

## Applied profile ownership foundation and reader joins — 25 September 2026

Executed `node tooling/scripts/verification/apply-partner-profile-foundation.dev.mjs --apply-existing-dev` after its rollback probe passed. It locks and requires empty legacy role/profile tables rather than silently converting UUIDs. Applied changes:

- BP capability booleans, mutation-evidence kind and guarded capability command/trigger. Both flags remain false; command EXECUTE remains revoked from application/admin roles pending authorized command wiring.
- Non-null `business_partner_id`, composite tenant/BP FK and tenant/BP/company uniqueness on both company-profile tables; updated profile/remittance guards and company-case materializer.
- Legacy profile ID columns remain temporarily nullable, with their original FK meanings, for the currently published metadata. No BP UUID is copied into a Supplier/Customer field. Clean-install source uses only BP ownership; remaining legacy columns must be removed after metadata/consumer cutover, not treated as a new permanent authority.
- Active profile joins in record availability/counts, company sections, case/bank-source readers, eligibility profile resolution and generic directory company filtering now use BP ownership. The broader role lifecycle/eligibility/control decisions still contain legacy identity dependencies; this is not their full retirement.

Executed `node tooling/scripts/verification/seed-partner-profile.dev.mjs --apply-existing-dev` after a rollback run. Scope: the two existing CATL demo partners, company `catl`, one supplier and one customer profile each. All four are Draft. Existing coordinates are left unchanged. No reset, deletion, qualification, capability enablement, payment authorization or permission grant occurs.

Foundation-checkpoint verification: master-data and records type checks passed; six directory SQL tests and four target-profile reader tests passed. Applied profile guard probe, capability probe and document-reference probe passed, with their test writes rolled back. At that checkpoint company-section requests returned 404; the current activation checkpoint above resolves that failure.

```bash
node tooling/scripts/verification/partner-company-profile.live.mjs --verify-applied-dev
node tooling/scripts/verification/partner-capability-command.live.mjs --rollback-dev
node tooling/scripts/verification/partner-document-reference.live.mjs --rollback-dev
```

Do not rerun the one-time foundation installer against this already-applied schema. Complete capability/role-reader contracts, remaining control ledgers and broader demo scenarios remain pending. Prior staged-only descriptions below are historical checkpoints; the latest applied-status sections take precedence.

## Applied registration cutover

Executed `node tooling/scripts/verification/apply-partner-registration.dev.mjs --apply-existing-dev`. This additive transaction installs `master.command_materialize_business_partner_registration_case`, its explicit entry in `document.trg_guard_entity_case_mutation`, and runtime EXECUTE grants to `athyperapp`/`athyperadmin`, with PUBLIC denied. The guard retains execution, processing-state, actor and tenant checks. Installation changes no tables, business rows, user permission assignments or metadata releases.

After that function was installed, `KyselyBusinessPartnerCaseRepository.apply` was updated to select it for new role-free registration. Persisted `materializer_code` controls retries: old receipts replay the legacy authority; new receipts replay the registration authority; unknown replay authority fails closed. Supplier/Customer intake and other operations remain on their existing paths. The source workspace reports all six application services healthy.

Verification: 7 materializer-selection tests, 1 creation-replay test, registration source checks, PostgreSQL compilation/negative-context probe and service type-check pass. With refreshed CATL admin/owner sessions, `node tooling/scripts/verification/verify-catl-role-free-registration.live.mjs --run --cutover` passed creation, submission, independent owner approval, materialization and same-key replay. Case `4220ec6b-fcfd-4cf7-98c8-363ce3e79233` produced BP `01a0d757-97b0-72bc-b37f-b77ffb685a52`, without role/company/organization coordinates. The first materialization attempt exposed the missing registration entry in the database command allowlist; the scoped correction above resolved it. This verification created a dedicated synthetic registration fixture through the normal workflow. No assurance evidence was fabricated or bypassed.

## Purchasing/payment/workforce source references — 25 September 2026

Clean-install document source now uses `business_partner_id` across 18 purchasing, AP/payment and workforce tables, and `suggested_business_partner_id` for a requisition suggestion. Composite tenant/BP FKs, uniqueness, indexes, counterparty comparisons, trigger column lists and document views follow the same coordinate. Business terms such as supplier invoice number, supplier name snapshot and requisition supplier remain; they are not separate counterparty identities.

Workforce publication's target payload explicitly names `businessPartnerId` / `partnerTargets`; it must not reinterpret a legacy Supplier UUID. Its local HTTP/service/contracts and replay handling have now been aligned as detailed below; the remote eligibility authority and committed schema activation remain unverified. Supplier activation evidence and the commercial-control ledgers are intentionally not declared converted by this document-reference slice.

Fixed a stale payment guard access to `representation_evidence_id`, a column absent from both the table source and live DEV. Other posted-payment immutable-field checks remain, including the counterparty check. A regression test checks every `NEW` field in this guard against the payment table source.

Validation:

```bash
node --test tooling/scripts/verification/partner-document-reference.test.mjs tooling/scripts/verification/partner-registration.test.mjs tooling/scripts/verification/partner-sales-reference.test.mjs tooling/scripts/verification/partner-company-profile.test.mjs
node tooling/scripts/verification/partner-document-reference.live.mjs --rollback-dev
```

Results: 32 source tests pass. The existing-DEV rollback probe locks and verifies the 18 target tables are empty, retargets their references, compiles 11 functions and 5 views, and exercises synthetic commitment/invoice/payment and workforce distribution/submission records without a Supplier row. It rejects a foreign-tenant purchasing/workforce partner, a missing payment partner and a valid same-tenant partner that does not match the distribution. **All probe schema/data changes roll back.** The fixture proves storage integrity, not transaction eligibility, approval, payment release or workforce publication. General DEV demo reseeding has not been performed.

Still pending: active profile/directory/eligibility readers and metadata publication; capability command host/IAM wiring; workforce remote eligibility compatibility and end-to-end publication; activation/control/project references; general executable fixtures. Do not rebuild, activate these staged document schemas or retire Supplier/Customer until their matching consumers are ready.

## Workforce API alignment and rate fixtures — next build slice

- Workforce distribution contracts, HTTP input, eligibility adapter, service, repository and tests use `businessPartnerId`. The business-facing `suppliers` collection and Supplier Workforce naming remain intentionally unchanged. Legacy `supplierId` input is rejected, including mixed old/new coordinates.
- Both the HTTP eligibility adapter and publication service reject evidence for a different partner. The service also checks that response-due coordinates match the requested target. Denied or mismatched evidence never reaches publication persistence.
- New receipts declare `counterpartyContract: business_partner.v1` and store `partnerTargets`. Replay validates this marker rather than assuming an old UUID means Business Partner. Legacy/malformed receipts fail explicitly without conversion or deletion. Live DEV inspection found zero existing workforce publication receipts and zero distribution rows at this checkpoint.
- A read-only schema/command-marker check returns `503 WORKFORCE_PARTNER_SCHEMA_REQUIRED` before invoking the mutation against an uncut-over database. This is an intentional deployment guard, not a legacy fallback. The source-watched API now accepts the new contract; publication is **not operationally activated** while its schema remains staged.
- `control.external_workforce_rate` clean-install ownership, FK, resolution index and date-overlap exclusion now use BP identity. Existing optional partner scoping and Supplier markup terminology are retained; a rate does not authorize spend.
- Added rollback fixtures for partner-specific rates, adjacent half-open date ranges, overlapping-rate denial and foreign-tenant denial. These are automated fixtures, not general DEV demo reseeding.

Verification commands:

```bash
pnpm --filter @athyper/server-service-master-data exec vitest run src/business-partner/workforce/publication-contract.test.ts src/__tests__/supplier-workforce-distribution-http-adapter.test.ts src/__tests__/supplier-workforce-requisition-service.test.ts src/business-partner/relationships/company-profiles-reader.test.ts
pnpm --filter @athyper/server-service-master-data exec tsc -p tsconfig.json --noEmit
pnpm --filter @athyper/server-service-master-data exec tsc -p tsconfig.test.json --noEmit
node tooling/scripts/verification/partner-workforce-rate.live.mjs --rollback-dev
node tooling/scripts/verification/partner-document-reference.live.mjs --rollback-dev
```

The target profile reader remains unregistered: this slice does **not** claim the legacy profile/directory/eligibility reader cutover. Neither Supplier/Customer tables nor historical evidence have been deleted. No database reset, metadata publication or permission grant was performed.

## Implemented source slice — 25 September 2026

- Clean-install `master.business_partner.supplier_enabled` / `customer_enabled`: independent, non-null, default false. They are staged target fields, **not yet the authority used by current role readers or transactions**.
- `control.command_business_partner_capability`: validates tenant/principal session context, explicit capability/boolean, expected aggregate version, reason and idempotency key. Locks the partner; enabling requires Active; disabling does not delete setup/history or change partner status. Replays return their original receipt, not a fresh eligibility assertion.
- Capability guard rejects direct changes, registration with enabled capabilities, simultaneous changes and old/mismatched command evidence. Existing append-only mutation evidence and outbox are reused with aggregate kind `business_partner_capability`. Qualification/restriction/preference state is not read or mutated by this command.
- `business-partner/capabilities/service.ts` and `repository.ts`: typed domain operation with capability-specific tenant/record authorization before every invocation, including replay. No session impersonation or fallback to legacy tables. Operation keys are proposed bindings; no IAM registration/grant or host route has been installed.
- MetaEntity core bindings for both flags are boolean, authorized-projection and read-only/system-managed. No section or runtime artifact has been activated against these new columns.
- SQL command execution remains revoked from PUBLIC and application/admin runtime roles pending authorized workflow/consumer cutover. No new user permissions were granted.

Verified:

```bash
pnpm --filter @athyper/server-service-master-data exec vitest run src/business-partner/capabilities/service.test.ts
pnpm --filter @athyper/server-service-master-data exec tsc -p tsconfig.json --noEmit
node tooling/scripts/verification/partner-capability-command.live.mjs --rollback-dev
```

The 14 service tests pass. The existing-DEV rollback probe passes real PostgreSQL checks for tenant/actor mismatch, missing partner, null inputs, inactive-partner activation denial, direct/both-flag changes, stale version, duplicate transition, independent enable/disable, replay/conflict, old evidence reuse and atomic audit/outbox creation. The probe is specifically for the **unapplied** foundation and fails if those columns already exist; it is not a migration, reset or publication command. It uses a 2-second lock timeout and rolls back on success; connection closure rolls back on error. These checks do not certify workflow materialization, profile/document replacement, concurrent-session behavior or signed-in UI.

## Reproducible checks delivered

### Identity-only registration authority — implemented; activation status above

`master.command_materialize_business_partner_registration_case` is now implemented separately from the legacy role materializer. It accepts only a new, core-identity `new_partner` case, requires independent approval evidence at the expected case version and validates the pinned published/superseded contract before creating identity. It preserves command idempotency, row locks, category checks, lifecycle-command acknowledgement, snapshot lineage, case evidence and outbox. Its return/outbox contract has no Supplier/Customer identity coordinate. Registration does not enable capabilities, assign organizations or create qualification/preference decisions.

This function and its core-registration selector are now applied as described above; the wider role/profile/transaction readers remain unchanged because their matching schema is not yet installed. The additive registration path does not query any of the staged capability/profile columns.

```bash
node --test tooling/scripts/verification/partner-registration.test.mjs
node tooling/scripts/verification/partner-registration.live.mjs --rollback-dev
```

Four source-contract tests and a PostgreSQL rollback probe pass (function compilation; wrong tenant/actor, null version and absent-case denial). Successful independently approved materialization and replay are now verified as recorded above. The legacy materializer is intentionally still present until its other callers and signed workflow contracts move. Supplier/customer codes/types, external intake adapters, purchasing/payment/workforce consumers and general demo/import seeds are still pending; do not call this the full replacement.

### Sales-document identity slice — staged, not activated

- `document.sales_opportunity`, `document.sales_quotation` and `document.sales_order` now use `business_partner_id` in clean-install source. Composite tenant/partner foreign keys reference `master.business_partner`; indexes and trigger column lists move with the field.
- Opportunity-to-quotation and quotation-to-order validation compares Business Partner identity, retaining currency, company and organization consistency checks. This is not a claim that sales qualification/restriction execution gates are implemented.
- Repository search found no runtime sales-document service or entity metadata consumer in `server/packages`, `server/apps` or `metadata/products` for these three tables. Purchasing, payment, workforce and project consumers are a separate remaining replacement group.
- `tooling/scripts/verification/fixtures/partner-sales-reference.sql` provides a reusable rollback-only draft-order fixture proving a partner **without a Customer row** can be the counterparty. It is not added to normal DEV seeds or a payment/fulfilment-ready demo.

Verified:

```bash
node --test tooling/scripts/verification/partner-sales-reference.test.mjs
node tooling/scripts/verification/partner-sales-reference.live.mjs --rollback-dev
```

Four source-contract tests pass. The PostgreSQL probe passes draft-order creation using partner identity, cross-tenant denial and missing-partner denial, and compiles both sales-chain validators. It requires empty sales tables and refuses to reinterpret existing Customer UUIDs. It stages the change in the existing DEV transaction and rolls back all schema and fixture writes. Complete quotation/order workflow and transaction eligibility are not tested by this probe. Registration, legacy profile readers and general seed/import replacement remain pending; this slice must not be published as the complete replacement.

### Partner-owned company profile slice — staged, not activated

The next source slice is implemented:

- Supplier and Customer company-profile tables now declare `business_partner_id`, tenant/partner foreign keys and unique tenant/partner/company coordinates. Indexes and SQL profile-summary joins use that coordinate. The old role-summary views themselves remain pending retirement; they still expose role identities.
- MetaEntity profile fields, section field bindings and partner-to-profile relationship paths reference the partner directly, not a path through Supplier/Customer tables.
- Company-case materialization retains pinned-contract validation, approved-case/version checks, scope checks, finance rules, command execution/idempotency, snapshots and outbox. It writes profiles by partner ID and requires the corresponding enabled capability. Its legacy nullable `role_id` response slot stays null; no partner UUID is disguised as a role ID. Registration/role materialization and caller preflight checks are still pending retargeting.
- Profile activation checks active partner, enabled capability and effective organization/company coverage. Disabling retains setup. Remittance validation checks the partner owner directly.
- `business-partner/relationships/company-profiles-reader.ts` reads the new ownership shape with authorization before querying, explicit tenant/partner/organization/company/capability context, and no fallback to legacy identities. It remains **unregistered**, so current DEV readers are not deployed ahead of their schema.

Verification commands:

```bash
node --test tooling/scripts/verification/partner-company-profile.test.mjs
pnpm --filter @athyper/server-service-master-data exec vitest run src/business-partner/relationships/company-profiles-reader.test.ts
pnpm --filter @athyper/server-service-master-data exec tsc -p tsconfig.json --noEmit
pnpm --filter @athyper/server-service-master-data exec tsc -p tsconfig.test.json --noEmit
node tooling/scripts/verification/partner-company-profile.live.mjs --rollback-dev
```

Results: 3 source-contract tests, 4 reader tests, both type checks and the PostgreSQL rollback probe pass. The probe verifies creation, uniqueness, missing/cross-tenant owner denial, immutable owner, disabled-capability activation denial and invalid-remittance denial. It compiles the materializer but **does not execute an approved workflow**. Existing old profile rows are not converted: temporary nullable target columns let the probe exercise new fixture rows without rewriting retained data; target clean-install NOT NULL declarations are source-checked separately. All staged probe changes roll back.

**Do not rebuild or publish this partial source set:** live registration/company preflight readers, eligibility readers, fixtures and document consumers still need coordinated retargeting. Metadata hashes/releases must be compiled together at publication. No Supplier/Customer table has been removed and no document counterparty FK is claimed replaced by this slice.

From repository root:

```bash
node --test tooling/scripts/verification/partner-capability-dependencies.test.mjs
node tooling/scripts/verification/partner-capability-dependencies.mjs --live-dev --summary
node tooling/scripts/verification/partner-capability-dependencies.mjs --live-dev
```

The first command tests the scanner. The second reports source and real DEV dependency counts. The third emits per-file hashes, exact reference locations/tokens and live foreign-key/index definitions as JSON to stdout. It reads no business rows and performs no writes. `retirementReady: false` is intentional: a text scan cannot prove semantic replacement, even when matches disappear. Dynamic SQL, registered operations, permissions, integrations and polymorphic references require separate review.

## Confirmed first-pass dependency map

Live `athyper_neon` on `athyper-dev-db-1` contains 30 inbound foreign keys to `master.supplier` / `master.customer`. These are actual catalog results, not inferred from SQL source. Re-run the command for current counts and inspection timestamp.

| Replacement group | Confirmed consumers | Implementation treatment |
| --- | --- | --- |
| Commercial setup | Supplier/customer company profiles; organization-assignment reader | Retarget profile ownership to partner with tenant/company uniqueness; retain capability semantics and effective periods |
| Commercial controls | Preference, customer designation, credit review, customer lifecycle ledger | Preserve independent control decisions; replace identity references and customer-specific lifecycle writes, not the control itself |
| Purchasing and AP | Commitment, purchase requisition suggestion, order confirmation, receipt/lines, service sheet/lines, invoice, payment, remittance, sourcing award, delivery note | Replace identity coordinates through typed document contracts; preserve suggested versus actual counterparty semantics and settlement/closeout rules |
| Sales and projects | Sales opportunity, quotation, order and project | Replace customer identity references with partner references; retain customer capability/context validation |
| Workforce | Rate, requisition supplier, candidate submission, contingent work order, statement of work, worker engagement, service entry | Replace actual identity FKs and adapters without treating a person/worker identity as the commercial partner |
| Workflow | Partner case materialization, supplier onboarding completion/activation, customer lifecycle commands | Registration creates partner facts; separate capability activation and setup commands; preserve audit/idempotency and current controls |
| MetaEntity/runtime | Partner core relations, roles-scope, supplier/customer profile cores, provider registration and relation lookups | Replace identity-backed relations with partner capability fields and partner-owned profiles; no UI-only alias that leaves old writers authoritative |

Concrete source entry points:

- `server/db/ddl/planes/neon/master/03_tables.sql`, `05_constraints.sql`, `07_functions.sql`: identity tables, company profile ownership and materialization.
- `server/db/ddl/planes/neon/control/03_tables.sql`, `05_constraints.sql`, `07_functions.sql`: commercial controls and customer lifecycle authority.
- `server/db/ddl/planes/neon/document/05_constraints.sql`: transaction and workforce foreign keys.
- `server/packages/services/master-data/src/business-partner/relationships/roles-and-scope-reader.ts`: union of supplier/customer identities and profile joins.
- `server/packages/services/master-data/src/business-partner/record/repository.ts`: role/profile existence used by completeness/readiness projections.
- `server/packages/services/master-data/src/kysely-business-partner-case-repository.ts` and `kysely-business-partner-eligibility-repository.ts`: workflow and action consumers.
- `metadata/products/mdg/entities/business_partner/core.json`: supplier/customer relation bindings still name the retiring storage.

## Physical field contract to implement together

The flags and guarded writer are now implemented in clean-install source only. Remaining coordinates below still require implementation; none are an activated schema contract.

| Target | Contract |
| --- | --- |
| `master.business_partner.supplier_enabled`, `customer_enabled` | Independent non-null booleans, default false; metadata labels Enabled / Not enabled. No computed qualification/preference/restriction state stored here. |
| Supplier/customer codes and types | Preserve existing code/type data with explicit partner-owned fields and tenant uniqueness before removing role tables; do not discard external codes or collapse intercompany validation. Exact external identifier/import mappings must be inventoried before cutover. |
| Profile `business_partner_id` | Replace supplier/customer FK with `(tenant_id, business_partner_id)` partner FK; unique `(tenant_id, business_partner_id, company_code_id)` within each profile type. Keep payment terms, currency, accounting and remittance settings. |
| Organization assignment | Keep partner ownership; use one supplier/customer capability code as applicability. Validate organization membership and dates; do not infer qualification from assignment. |
| Disabling a capability | Retain profile/assignment/history rows. Govern activation changes with aggregate concurrency, permissions, reason and audit. Validate new commitments separately from existing obligations. |
| Partner Active / Inactive | Resolve current Draft/Archived materialization and retention consumers before shrinking the domain. Do not silently relabel Draft as Inactive or erase archive semantics. |
| Documents | Partner identity plus explicit or document-defined capability/context. Never rename a UUID field without changing its FK, lookup, writer and validation together. |

## Remaining before build handover

1. Complete function/trigger/RLS/grant and workflow-operation crosswalk; resolve external codes/types and Draft/Archived handling.
2. Implement clean-install DDL, guarded writers, profiles, workflow materialization and document references together.
3. Implement provider/metadata changes and shared Commercial setup presentation; remove old identity wrappers only after consumers move.
4. Update fixtures/imports/exports and test tenant isolation, profile ownership, activation history and transaction checks. Finish Qualifications/Restrictions read regression.
5. State the exact same-DEV reset/reseed command and data-loss scope if a rebuild is required, then execute only the approved procedure. Publish matching metadata, align preview and hand over signed-in manual QA.

Do not run a reset using this handover: no reset command is supplied because the compatible replacement is not yet built. No new isolated instance, broad grant, workflow bypass or destructive cleanup was performed.
