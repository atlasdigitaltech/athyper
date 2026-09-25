# Business Partner coordinated implementation

Status: in progress. **Main DEV was rebuilt from the cleaned DDL, reseeded and published on 2026-09-24.** Banking and qualification/restriction readers now use the cleaned authorities. This is not completion of all qualification/restriction commands or transaction adapters. Person enablement remains approval-gated. Historical checkpoints below must not be read as current deployment status.

Authorities: [locked data-model addendum](business-partner-data-model-cleanup-addendum.md) and [proposed access model](partner-access-model.md). Locking the data design does not approve live role assignments. Follow DDL fields → MetaEntity → API/command → permission and scope → tab/action → acceptance tests for each slice.

Next partner-facts design: [complete DDL and MetaEntity plan](business-partner-facts-ddl-metaentity-plan.md) covers organization/person identity, shared collections and bank-account instruments, including source-versus-target status, field ownership, UI binding, implementation order and acceptance. It is a plan, not a claim that person enablement or the presentation cleanup is deployed.

## 1. First increment: separate qualification navigation

### Current deployed checkpoint — 2026-09-24, coordinated main DEV rebuild

**CATL archive access and preview repair:** separately approved `seed-catl-partner-archive.sql` grants only tenant-exact `neon.collaboration.comment.archive_own` and `neon.collaboration.attachment.archive`. Live projections expose `archive_own`, attachment `archive` and `unlink`; no other-author comment deletion is implied. Moderation is **not granted or complete**: governance has an internal moderation service, but this deployment has no published moderation permission or exposed moderation decision route. Adding a dead grant would not enable a working moderation workflow.

The image-preview failure was missing `PREVIEW_RENDERER_BASE_URL` and renderer network access in the source API/worker deployment. Applied `tooling/scripts/local-dev/dev-preview.compose.yaml` over the existing DEV source compose file, recreating only API/worker and reusing `athyper-dev-preview-renderer-1`. No new instance, database rebuild or data deletion. Renderer qualification passed actual PNG/PDF conversions and rejected invalid/unsupported inputs. The existing acceptance PNG changed from unavailable to processing to **ready** through the normal derivative jobs and scanning path. Keep this overlay when recreating the source services; it does not alter the base generated compose configuration.

**CATL collaboration restored — verified signed-in:** explicitly approved `tooling/scripts/local-dev/seed-catl-partner-collaboration.sql` grants CATL admin tenant-exact comment read/create and attachment read/create/finalize/download through a dedicated six-permission role. No delete, archive, moderation or other-principal grants were added. `align-catl-partner-preview.mts --collaboration --apply` aligned retired preview permission references and activated revision 5 (change set `586c4311-7ca3-4ccd-965a-63be035048fa`, artifact `355fbe445ec0e0f266b7aa35ebfe8467a5576ea4ad3d565a70d7af10912050f6`). Capability-parent admission now supplies a tenant candidate for explicitly tenant-directory partners after authorized record admission, retaining server-resolved organization candidates and per-action permission checks. Commercial assignments are not prerequisites for these partner facts.

Acceptance on existing DEV: Comments and Files buttons visible; both section endpoints **200**; browser comment creation **201** and posted text visible; PNG staging **201**, finalize **200**, active file visible; authorized download **200** and actual object retrieval **200**, 68 bytes. One clearly labeled acceptance comment and `catl-collaboration-acceptance.png` remain on CATL's demo partner. No scanning or download controls were bypassed. Capability policy suite: **21 tests passed**, including tenant-parent admission, caller-supplied organization rejection, parent denial and existing tenant/plane isolation tests. This checkpoint does not assert new live cross-tenant acceptance or completion of unrelated Network/notification issues.

**CATL preview reactivation — verified signed-in:** following explicit approval, `align-catl-partner-preview.mts --apply` activated preview revision 4, change set `d22d5008-28a8-438e-b319-a933bef2afdd`, signed artifact `d7b73699d3a14a20f33dfd37735bb4dc23c68fbfa3671d50511bef05a0919609`. Read/navigation bindings use the existing cleaned domain permissions; list storage uses `master.business_partner_identity_current` rather than retired organization fields on the header. The obsolete cross-permission v2 admission exception was replaced by normal v1 intersection semantics because read source/target permissions now coincide. No grants, reveal/MFA controls or database data changed. Unsupported unmapped target actions remain denied. Prior signed artifacts and the original draft are preserved; this is an explicit local preview successor, not a replacement for the original Studio draft's future authoring cleanup.

Actual CATL saved-session acceptance: `list-descriptor` **200**, `/list` **200** with `BP-DEMO-CORE-001` and country `GB`, Overview **200**. Headless browser loaded `/mdg/business-partner/partners`, rendered Aster Research Services (Demo), found no unavailable-list message and no failed Business Partner runtime responses. Additional read-section checks reached `network` and found **404 ENTITY_RUNTIME_RESOURCE_NOT_FOUND**; do not claim the Network section is complete. This supersedes the directory-blocked checkpoint below.

**Live acceptance correction:** the directory remains blocked for CATL. Saved-session HTTP reproduction returned 403 after release 4. The running API has `ATHYPER_LOCAL_PREVIEW_ROOT` enabled and selects CATL's signed local graph head `1bb51a55381fb20f6aa36b35d3a15385da32af1ca2e6975c8b65f7127ebef598` (change set `782c6aba-e584-4519-b5f3-ca98f9caa380`). Its root read requires `neon.relationship.bp_target.read`, which is absent from the rebuilt permission catalog. Live denial is `missing_permission`. The earlier standalone checks exercised the published root permission without the API's preview overlay, so did not establish endpoint acceptance. The local preview/draft has been preserved; no target grants were synthesized and no authorization fallback added. Reconcile this active graph and its permission contract with the cleaned deployment before claiming list acceptance.

Post-login directory correction: the first compiled-artifact bootstrap activated the UI payload but omitted `authz.entity_operation_binding`, so CATL's existing partner-read grant was rejected as `operation_binding_missing`. The bootstrap now signs a tenant-context `business_partner.read` authorization projection with the artifact and stages/activates it atomically with the runtime payload; no human grants or write operations are added. Signed successor **release 4** is active: source `e08a1214-cfa3-4c93-abd9-925897e2a772`, applied `01a0d3cb-9844-7e53-a849-478ee473e137`, artifact hash `5bd2fdfa5fdc6fc73ba95de10f276ef055bacbd6aef7307613ff40b38a99a239`. Attempts 2/3 failed shape validation before target commit and are recorded as failed deployments, not active releases. Repository acceptance now also exercises the actual permission resolver and authorizer for each tenant's admin; all three partner-directory checks pass. This proves directory authorization, not a completed signed-in browser journey or new command bindings.

Post-rebuild login correction: the retained IAM users have runtime subject IDs different from the fixture subjects. The initial reseed omitted subject reconciliation, causing successful IAM login followed by zero available application contexts (`reason=access`); this was not simply session expiry. Executed the existing runtime-subject reconciler against main DEV (Studio 28, Neon 139, Mesh 50 bindings corrected), retaining principals and their permissions and leaving IAM credentials/MFA untouched. `seed-main-dev.mts` now includes this step; `--identity-only` repairs bindings without replaying authorization seed packs. Verified CATL admin identity resolution and active membership under `athyperapp`, not just PostgreSQL superuser. Signed-in browser acceptance still requires a successful browser retry.

- Replaced the eight obsolete qualification/restriction SQL dependency sites. Coverage evaluation uses OR between groups, AND between dimensions, dimension-local selections and exclusions, explicit all/selected modes, purpose-specific countries, context and document/line targets. Missing coordinates cannot turn narrow approval into broad approval. Conditional or unpinned qualifications do not grant execution.
- Identity parent compatibility is derived from relationships; retired header storage was not restored. Commercial reads expose whitelisted coverage rather than raw scope metadata or a fabricated supplier/customer role.
- Rebuilt **the existing DEV** Neon, Studio and Mesh databases using `rebuild-main-dev.mjs --confirm-replace-dev-no-backup`. No new instance or backup. Previous database contents were removed without recovery backup, as explicitly authorized. Foundation passed; receipt directory: `~/.athyper/instances/dev/receipts/rebuild-1790257977078`. DDL SHA: `d993e00c5a083fb6a0740423cedc817ebf15e252927ac8c934f943c99ba6fce6`.
- Reseeded tenant fixtures, existing approved access configuration and `BP-DEMO-CORE-001` independently in Athyper, Technostat and CirrusAtlantic. Demo instruments remain inactive; no supplier/customer/company assignments were invented. Restored the two configured publication service identities from existing verified DEV configuration, without creating credentials, human grants or signing keys.
- Signed publication activated: source release `359b0178-2a4b-407d-b214-980358fab13b`, applied release `01a0d3b4-7d98-7762-8dfb-a1b0e58caea4`, 118 artifacts, SHA-256 `17b42243ebc951cbdf04a3ff6990f4a81a35ec67ee161cacb3c7dca7038953c7`. Existing DEV Ed25519 signing key used; operator-authorized bootstrap does not claim human workflow approval.
- Live catalog confirms absence of `master.bank_account_usage`, `master.bank_account_company_usage`, `document.business_partner_bank_verification` and `master.bank_account_link`; presence of `payment_instrument`, `payment_instrument_link`, `bank_account` and organization identity; no retired bank verification columns or qualification/block inline role/company/organization columns.
- Fixed host readiness to check instrument-backed banking instead of the retired verification table. API `/readyz` returns **200**, with all checks healthy. Extended the pre-rebuild dependency tripwire to host composition so this dependency is checked too.
- Acceptance: 8 grouped-scope tests and 6 eligibility-service tests; master-data TypeScript check; full Neon rollback DDL/metadata check and actual three-plane foundation build. `verify-partner-cutover-main-dev.mts --confirm-main-dev` exercises real repositories in all three tenants: bank reads/capture/idempotent replay, wrong-tenant lookup denial, qualification reads, fail-closed eligibility, populated restriction reads and payment-only action matching. Synthetic writes roll back. These are repository checks, not signed-in authorization tests.
- Remaining: saved CATL browser state resolves anonymous, so signed-in HTTP/browser acceptance is not claimed. Reviewed qualification/restriction action wrappers and complete document-context adapters remain future implementation; the internal assembly primitive stays ungranted. The legacy business-date evaluator conservatively overlaps restrictions for the day, not a newly implemented execution-instant transaction gate.

### Historical source DDL cleanup — before the coordinated rebuild above

#### Banking consumer alignment follow-up — source-only checkpoint at that time

- Registration now writes `payment_instrument`, its shared-PK bank subtype, a provisional directory reference and the generic partner link in one transaction. Protected storage, fingerprint-only persistence, idempotency and failed-capture cleanup remain. Company-scoped registration is rejected; no supplier/customer prerequisite is added.
- Masked Banking and reveal readers use `payment_instrument_link`. Account lifecycle comes from the instrument; bank names/countries come from the directory or provisional reference. Summary completeness no longer requires bank verification. Mesh disclosure rendering does not import owner verification or company acceptance into Neon.
- Removed usage/verification/application API handlers and UI controls. Retired bank-change case creation returns an explicit retirement error. Historical received payloads/audit labels are retained, not rewritten. Dedicated directory-resolution permission is defined with MFA and independent-actor checks; **no live grant was added**.
- Banking metadata and the three-tenant demo seed target the cleaned schema. Synthetic instruments are inactive. Stable bank-specific API identifiers/entity codes remain compatibility names for instrument-backed resources; they are not retained old tables.
- Validation: 25 Neon service/retirement tests, 7 disclosure tests, 10 Banking UI tests and 4 fixture tests passed. Neon, master-data and partner UI TypeScript checks passed. Full Neon DDL plus compiled metadata activation/read-back and Banking storage-binding checks passed **inside a rolled-back transaction in main DEV**, using `verify-main-dev-ddl-rollback.dev.mjs --confirm-rollback-only-dev --plane=neon --check-banking-metadata`.
- **Not deployed:** the broader staged DDL also removes qualification role columns, inline block scope and alias/parent header fields. Remaining qualification/restriction readers and operational command/evaluator contracts must be aligned before a full rebuild; examples remain in `kysely-business-partner-eligibility-repository.ts` and `kysely-business-partner-360-commercial-controls.ts`. Do not substitute “any matching scope row” for full grouped coverage evaluation merely to make queries compile. Identity parent projection also needs coordinated verification against `business_partner_identity_current`.
- Live read-back still finds all three demo partners and the old banking usage/verification tables. No live tables were dropped, no metadata release was replaced, and no isolated instance or backup was created in this follow-up. Removed legacy verification source/test files are recoverable from version control where tracked.
- `tooling/scripts/local-dev/partner-cutover-preflight.mjs` currently identifies eight remaining qualification/restriction SQL dependency sites in the two files above and no retired banking table references in production Neon/master-data TypeScript. The DEV rebuild script now runs this check **before any database alteration or deletion**. This is a dependency tripwire, not a replacement for grouped-scope, target/context, permission and transaction acceptance.

Implemented in canonical SQL, not as a drop-at-the-end migration:

- Added `master.payment_instrument`; generalized `master.bank_account_link` into `master.payment_instrument_link`, retaining generic owner and optional company coordinates. Bank-account details use a tenant-consistent shared primary key to the instrument. Treasury house configuration now references `payment_instrument_link_id` and validates a company-owned bank subtype. Instrument lifecycle is no longer duplicated on bank-account details.
- Removed `master.bank_account_usage`, `master.bank_account_company_usage`, `document.business_partner_bank_verification`, verification columns/guards/catalogs/permissions and the seeded verification task. Unknown-bank names/countries remain solely on `bank_provisional_reference`; generic bank projections remain masked. Bank-only instrument admission and deferred subtype completeness are enforced.
- Removed `control.business_partner_qualification_classification` and its automatic category-to-classification linking trigger. Explicit selected declarations now belong to decision scope, with tenant/partner validation. No replacement evidence/link/revision table family was introduced.
- Removed qualification role IDs and qualification/block header organization/company coverage. Added explicit commercial-capacity, declared-commodity, country-purpose and all/selected coverage; header-only validity; context/target fields; canonical block action arrays and GIN lookup support; scope sealing and deferred completeness. `control.assemble_partner_decision` is internal, not granted to application roles; idempotent API/permission wrappers are still required. Legacy role-based qualification creation and legacy bank-verification case commands reject explicitly rather than fabricate target decisions.
- Removed the partner aliases array and header parent pointer. Alias and current-parent projections derive from their collections. Parent relationships retain cycle prevention and gain non-overlapping single-parent enforcement.
- Removed the 11 already-retired request CREATE/dependency/DROP scaffolds, retaining shared entity-case storage. Deleted obsolete banking-usage and commodity-cutover SQL files and their manifest entries.
- Extended common contact responsibilities with same-owner `address_link_id`, scoped temporal uniqueness and ownership guards. Added address-specific channel and provisional-bank-address owner registry entries. These common changes also affect Studio and Mesh.

Validation uses **the existing main DEV database container only**. No isolated instance or database and no backup was created. Full manifest checks execute inside a rollback-only transaction; existing records and published releases remain intact. The verifier temporarily locks application schemas, so run it during a quiet local-development interval.

Checks:

```sh
node --test tooling/scripts/verification/business-partner-ddl-cleanup.test.mjs server/db/scripts/__tests__/business-partner-foundation/business-partner-entity-case-cutover.test.ts
node tooling/scripts/verification/verify-payment-instrument-ddl.dev.mjs
node tooling/scripts/verification/verify-partner-decision-ddl.dev.mjs
node tooling/scripts/verification/verify-main-dev-ddl-rollback.dev.mjs --confirm-rollback-only-dev --plane=neon
node tooling/scripts/verification/verify-main-dev-ddl-rollback.dev.mjs --confirm-rollback-only-dev --plane=studio
node tooling/scripts/verification/verify-main-dev-ddl-rollback.dev.mjs --confirm-rollback-only-dev --plane=mesh
```

Ten source regression tests pass. Instrument and decision SQL checks pass, including subtype completeness, linked-coordinate immutability, unsupported future instruments, canonical action sets, sealed scope mutation denial, explicit dimensions, header-owned validity and foreign-tenant classification denial. Full Neon, Studio and Mesh manifest rollback checks passed; these checks reuse existing cluster roles/extensions and do not rebuild IAM or Infisical.

**Not completed by this DDL work:** person-partner enablement/`person_id` (the current organization-only rule remains until the recorded ownership/privacy approval), full MetaEntity and generated-type rebinding, TS/TSX readers/writers and removed-feature consumer retirement, permission/action wrappers, operational eligibility evaluation, fixture adaptation, metadata publication and signed-in acceptance against this new schema. Existing live DEV still contains the earlier banking/control tables until that coordinated cutover. Do not deploy this source schema alone.

### Earlier navigation increment

Implemented in source: Qualifications now has its own tab outside Partner 360, in both presentation metadata and the older-panel compatibility adapter. Existing section identity `qualifications-certificates` remains for URL/handler compatibility. This increment does not implement the future qualification schema or revise grants.

| Layer | Current binding / change |
| --- | --- |
| DDL authority | `control.business_partner_qualification` in `server/db/ddl/planes/neon/control/03_tables.sql`; unchanged in this increment |
| MetaEntity | `metadata/products/mdg/entities/business_partner_qualification/core.json`; existing handler projection, generic writes disabled |
| Parent presentation | `metadata/products/mdg/entities/business_partner/presentation.detail.json`: move qualifications from 360 sectionKeys into dedicated qualifications tab |
| API/reader | Existing `neon.bp.section.qualifications-certificates.v1` binding in `server/apps/platform-host/src/composition/register-services.ts`; existing `/api/neon/business-partners/:id/360/qualifications` route |
| Permission/scope | Preserve `neon.relationship.business_partner_qualification.read`, server scope authority, non-discoverability on denial and pre-query authorization metadata. No new grants or claim of live authorization acceptance |
| UI compatibility | `packages/planes/neon/business-partner/src/360/panel-definition.ts`: fallback and old-panel realignment place qualification outside facts and preserve its section key |
| Acceptance | Node source-contract tests plus panel/compatibility Vitest tests; positive/negative signed-in API acceptance and metadata publication still pending |

Certificates, industries, commodities and banking remain facts in the compiled presentation. Requests, Roles & scope, transactions and activity remain reachable until their replacement slice is ready. No empty Restriction/Risk/Performance tabs are exposed without implemented readers and permission consumers.

Validation executed:

```sh
node --test tooling/scripts/verification/business-partner-workspace-contract.test.mjs
# In packages/planes/neon/business-partner:
./node_modules/.bin/vitest run src/360/panel-contract.test.ts src/360/company-relationships.test.ts
```

Result: 3 source-contract tests and 7 panel/compatibility tests passed. Static contract checks are not database, API-security or browser acceptance.

## 2. Identity slice: current-to-target dependency map

The [identity field/writer contract](business-partner-identity-field-writer-contract.md) now specifies field ownership, subtype/profile fields, atomicity, imports, Mesh compatibility and acceptance. Storage remains unchanged. Source inspection found that existing import is commercial/org-scoped and ordinary non-child amendments dispatch to a Mesh-specific materializer; neither is assumed to be a ready role-free local identity writer.

### Identity implementation increment: input boundary

Implemented `server/packages/services/master-data/src/business-partner-identity-contract.ts` and its focused unit tests. The module validates organization identity create input, applies patches without confusing omission with null, keeps display/legal names distinct, validates organization profile tuples/dates and adapts explicitly extracted legacy organization identity. Person input fails with PERSON_PARTNER_ENABLEMENT_PENDING; no client flag enables it. Managed fields, role/company inputs and wrong-subtype fields are rejected.

The initial library was staged; the next increment below connects it to the approved legacy registration materialization path. Lookup UUID syntax validation does not prove lookup admissibility: the consuming transactional writer must resolve active tenant/shared lookup values, validate country references, authorize the operation, enforce optimistic concurrency and persist the aggregate atomically. The legacy adapter must only receive identity extracted under a supported pinned legacy contract; it neither verifies approval nor modifies an old snapshot.

Validation: 30 focused Vitest tests passed and standalone strict TypeScript checking of the module passed. No full-package typecheck, disposable database acceptance, production writer integration, publication or grant changes are claimed. Next implementation boundary remains the coordinated SQL materializer/import/read-projection cutover; do not drop current header columns merely because the new input module passes unit tests.

### Organization legal-name storage/writer/reader slice

Source implementation now adds master.business_partner_organization_identity in `server/db/ddl/planes/neon/master/33_partner_organization_identity.sql`, included in the Neon clean-install manifest. This slice contains legal_name, tenant/partner keys and audit fields only; other organization fields still have their single authority on the header pending the next slice. No duplicate legal-form/profile storage was added. The script explicitly refuses a populated partner store: it is not an existing-DEV migration or an authorization to reset DEV.

- Legacy registration inserts atomically initialize the required organization identity from their name payload through a header insert trigger. Later display-name changes do not synchronize into legal_name. Deferred subtype consistency, tenant/actor FKs, tenant RLS, immutable coordinates and aggregate-version advancement protect the new table. Person creation remains forbidden by the existing domain.
- The case repository invokes `validateLegacyRegistrationIdentity` before an approved new_partner materialization, resolving legal form against active admissible tenant/shared lookups. It leaves pinned payloads unchanged and skips this precheck on already-materialized retries. It rejects the new nested identity payload until that contract has a complete materializer.
- Mesh profile-change SQL and current-profile comparison read/write legal name from the subtype; header name remains display label. Legacy result snapshots still use their pinned name field for the legal name. Candidate matching now separates legal/display matching and records algorithm version 2.
- Existing commercial import name writes explicitly update the subtype as well as the legacy display field. Its supplier/org setup behavior is unchanged: role-free import is still pending, not silently enabled by this slice.
- Overview/Identity metadata now distinguishes Display name and Legal name; the registered readers and identity field-permission projection supply the new value. Existing read permission boundaries remain; no IAM capability assignment is inferred from table grants.

Validation completed: 163 targeted master-data tests, 17 Mesh matching/change tests, 4 source-contract tests and 1 isolated PostgreSQL DDL test (185 total); source TypeScript checks for master-data and Neon-plane packages; metadata layout/reference verification. The disposable test uses minimal surrounding tables, not the full Neon manifest. It tests initialization, display/legal independence, version advancement, missing/deleted subtype rejection, coordinate immutability, tenant denial and forbidden app deletion. Its container is removed after execution. Full manifest installation, complete metadata compilation/publication, host-wide typecheck and signed-in browser/HTTP acceptance remain pending.

Deployment boundary: deploy DDL, API readers/writers and metadata together against a verified clean-build environment. Do not run the updated readers against an old database lacking the subtype; do not apply this baseline to existing DEV data or publish its metadata alone. The following slice moves the remaining organization fields; person enablement and general local amendment remain separately gated.

### Organization profile cutover — source implemented, release acceptance pending

The organization subtype now owns controlled legal form, registration country, incorporation date, business type, founded year and the employee-count/date/scope tuple. The header no longer stores those fields. `legal_form` is a derived lookup code in the security-invoker `master.business_partner_identity_current` view. The obsolete `18_business_partner_business_profile.sql` header extension was removed from source and the manifest; its contents remain recoverable through Git. Manifest ordering installs the subtype/projection before dependent views.

Internal/core/commercial registration materializers and Mesh amendment use `master.update_business_partner_organization_identity` for these fields. Registration activation reads the post-profile aggregate version instead of assuming version 1. The existing commercial import adapter routes organization fields to this helper without changing its role/org semantics. Readers, case comparisons, MetaEntity field bindings, development list descriptor and principal executable fixtures now follow the subtype/projection. The list descriptor source version is bumped; no release was published. Generic writes remain disabled in BP core metadata.

The patch boundary checks tenant/actor context, allowed field names/types, country format before casting, lookup admissibility and complete headcount tuples. Omitted fields are retained; explicit nullable values clear. Unchanged retired lookup selections can be retained. No-op profile replay does not advance the aggregate version. Person partners remain rejected.

Validation in this slice:

- 78 targeted tests passed: 37 identity/registration unit tests, 31 Neon import/matching/scope tests, five workspace binding contracts, four demo seed contracts and one isolated PostgreSQL identity test covering multiple SQL assertions.
- Master-data and Neon production-source TypeScript checks passed. Broader Neon test typechecking still reports bank-verification integration import/dependency errors; DB tooling typechecking reports cross-package `rootDir` and other tooling errors. Neither is reported as green.
- Metadata layout/reference verification passed (132 relocated files, 121 entity JSON files); this is not full compilation or publication.
- Fresh Neon manifest execution passed the changed master schema, functions, subtype, views and grants, then failed at `planes/neon/authz/16_compiled_entity_runtime_permission.sql`: `Compiled entity runtime Business Partner permission count mismatch`. No assertion was bypassed or permission seed changed. Both disposable test containers were removed; live DEV data and grants were untouched.

The follow-up below resolves the foundation failures and proves isolated compiled activation and core-registration commands. Before live deployment, complete the coordinated application rollout and authenticated acceptance, including import/Mesh amendment journeys. Historical integration expectations (including amendment result versions) also need reconciliation against the new aggregate. Do not independently deploy the readers or run the old organization-name consolidation publication helper against this new contract. General local identity amendment, role-free import and person enablement remain separate unfinished work.

### Full-foundation and isolated publication acceptance — 2026-09-24

Two clean-install failures are corrected without adding permissions or weakening data-loss guards:

- `authz/16_compiled_entity_runtime_permission.sql` still expected 36 permissions after the prior removal of `neon.business_partner_commodity_capability.read`. Its three lists already contained 35. The assertion now requires 35 and the declared combined permission/scope count is 70. The regression test compares all lists, uniqueness, counts and workforce company scope; MFA/SoD and grants are unchanged.
- `master/32_remove_legacy_commodity_capability.sql` combined `to_regclass` and a static query against an absent table in one SQL expression. PostgreSQL resolves the relation before Boolean evaluation. Nested PL/pgSQL existence branches now prevent parsing the absent-table/column query. Populated legacy capability/origin tables still cause refusal; repeat cleanup on the clean baseline succeeds.

The [full-foundation disposable test](../../../tooling/scripts/verification/business-partner-foundation.disposable.test.mjs) now builds the complete Neon manifest from scratch on a newly created, network-isolated PostgreSQL 16 container, then runs:

1. Existing organization-only schema assertions and the [identity cutover command journey](../../../server/db/scripts/tests/integration/business-partner-identity-cutover.sql): draft, recorded validation, submit, independent checker approval, materialization, exact replay and wrong-tenant denial. Registration creates no supplier/customer/org assignment. Organization write plus activation yields aggregate version 3; result snapshot retains the pinned payload. Subsequent subtype patch preserves the display label and advances the aggregate version. Application-role reads succeed within the tenant and return no partner across tenants.
2. The [compiled publication fixture](../../../tooling/scripts/verification/business-partner-cutover-publication.fixture.mts): compile the current metadata with the production compiler, validate every BP core storage binding against the built schema, sign/verify the payload with an ephemeral Ed25519 test key and reject altered bytes, stage/verify/activate using runtime publication functions, inspect the exact active payload/hash and prove staging replay. Activation before verification is rejected.
3. Permission seed replay; cleanup replay with absent legacy objects; refusal when synthetic legacy capability or origin rows exist.

Result: **full build and all listed assertions passed**. This turn also passed 12 compiled-artifact/collection compiler tests and seven identity/permission/workspace tests (20 top-level tests including the foundation test). Metadata layout/reference checks passed. SQL fixture transactions roll back and the disposable containers are removed, so there is no retained deployment or test data.

Reproduce:

```bash
RUN_BP_FOUNDATION_DISPOSABLE=1 node --test tooling/scripts/verification/business-partner-foundation.disposable.test.mjs
RUN_BP_IDENTITY_DISPOSABLE=1 node --test tooling/scripts/verification/business-partner-organization-identity.disposable.test.mjs tooling/scripts/verification/business-partner-permission-seed.test.mjs tooling/scripts/verification/business-partner-workspace-contract.test.mjs
pnpm --filter @athyper/server-service-publication exec vitest run src/__tests__/compiled-entity-artifact-compiler.test.ts src/__tests__/compiled-entity-collection-compiler.test.ts
```

**Boundary:** this proves database commands and isolated runtime activation, not Studio maker/checker publication approval, deployed HTTP/browser acceptance, real-user MFA, or complete import/Mesh journeys. The fixture supplies test validation results and a test contract, not production rule evaluation. Live DEV schema, active release and grants were not changed. A fresh application environment using this schema (or a separately authorized existing-DEV rebuild) is needed before live publication and signed-in acceptance; do not publish this release into the old schema alone. The broader tooling/typecheck issues noted above remain open.

| Layer | Baseline / next coordinated change |
| --- | --- |
| DDL | `server/db/ddl/planes/neon/master/{02_domains,03_tables,05_constraints}.sql`: currently organization-only; implement organization subtype, person reference and common legal_classification according to addendum §1.1 |
| Dependent SQL | Same directory: `06_indexes.sql`, `08_triggers.sql`, `09_views.sql`, `11_grants.sql`; preserve hierarchy/alias derived behavior while removing duplicate fields |
| MetaEntity | `metadata/products/mdg/entities/business_partner/core.json` and `presentation.section.identity.json`; rebind moved organization fields rather than leave references to deleted header columns; define subtype metadata and conditional organization/person surfaces |
| Reader/command | `server/packages/services/master-data/src/kysely-business-partner-360-sections.ts`, `business-partner-360-service.ts` and registered identity handler; inventory all creation/materialization/import writers before changing storage |
| Permission | Existing parent identity section uses `neon.relationship.business_partner_identity.read`; this does not authorize unrestricted person or sensitive-person reads. Complete consumer/scope map and person-field policy before enablement |
| UI | Identity in Partner 360, conditional on structural category; person partners must not render organization-only fields or gain workforce membership |
| Acceptance | Clean-install DDL, subtype exclusivity, tenant-consistent person FK, sole proprietor person, unauthorized-person-field denial, existing organization regression, alternate writer parity and compiled metadata binding tests |

Identity storage is not changed in the first increment. Named Business Partner, People/Workforce and privacy/security acceptance is still required before enabling person partners; no assumption of approval from an administrator username.

### Separate application acceptance environment — 2026-09-24 (superseded and removed)

Historical checkpoint only: the user subsequently directed rebuilding main DEV without backup and removing isolated BP environments. Instance `63b7db2dbd52`, its owned containers, volumes, networks, private instance directory and detached checkout have now been removed. The older disposable `athyper-bp2-acceptance-20260923` database container and its volume were also removed. These database contents were deleted without backup. The following bullets record the earlier work, not an active environment or pending provisioning plan.

The user authorized a separate clean instance; shared DEV is not rebuilt or republished. Instance `63b7db2dbd52` uses Docker project `athyper-local-63b7db2dbd52`, its own databases, volumes, ports, secrets and IAM realm `local-63b7db2dbd52`.

- Detached checkout: `/home/chandravel_natarajan/.athyper/qualification/bp-identity-cutover-20260924/source`. Initial snapshot `9e0ca3d9eda84fa1b72601426d84757133dcee87`; isolated runner repairs advance this checkout to `802fc112b`. These commits do not advance the developer branch or stage its worktree.
- Runtime receipts: `/home/chandravel_natarajan/.athyper/local-dev/environments/63b7db2dbd52/`. `foundation.json` records successful Studio, Neon and Mesh builds with DDL SHA-256 `f94501839045a2a95a2164d9e91dad01f4734bcda713184ade05e2f44978d0b4`.
- The explicit `--separate-checkout` admission requires a clean detached checkout and independent dependencies. Same-checkout operation alongside shared DEV remains prohibited. Foundation staging uses `/tmp` without disabling the database container's read-only root. Only this isolated database was tuned to `max_locks_per_transaction=512` and restarted after the full manifest exceeded the default lock budget; no shared DEV service was restarted.
- Runner/lifecycle/admission tests: **16 passed**. Shell syntax and targeted whitespace checks passed.
- API, worker, scheduler, Neon and Studio are **ready** (`processes.json`). Neon `http://neon.63b7db2dbd52.localhost:22627` and Studio `http://studio.63b7db2dbd52.localhost:22629` passed browser page/login-redirect checks, including isolated IAM realm, callback and PKCE. Mesh database is initialized, but its web application is not started. Mail is not provisioned.
- Independent requester, approver, steward and unauthorized IAM accounts exist (`identity.json`); their credentials stay in the instance's private secrets directory. No product grants or DEV sessions were copied. Browser smoke explicitly records `authenticatedJourneyPassed: false` and `releaseQualified: false`.
- Startup repairs also reserve process-metrics ports for worker/scheduler only; API retains its main HTTP metrics surface. The two isolated database pools were restarted after foundation so fresh connections see database-plane settings. Shared DEV services retained their existing uptime.
- **Former next step, cancelled:** isolated fixtures, signing and publication. Acceptance now uses main DEV as recorded below; no further isolated instance is required.

### Main DEV rebuild, seed and publication — 2026-09-24

Under explicit user authorization, rebuilt `athyper_studio`, `athyper_neon` and `athyper_mesh` in `athyper-dev-db-1` from the current full foundation. No backup was taken. IAM, Infisical and QA were not rebuilt. Pre-existing `*_pre_rebuild_20260924` databases were left untouched, not created by this execution.

- Reusable execution scripts: `tooling/scripts/local-dev/rebuild-main-dev.mjs`, `seed-main-dev.mts`, `seed-main-dev-bp-access.sql` and `bootstrap-main-dev-metadata.mts`. Destructive rebuild requires `--confirm-replace-dev-no-backup`; metadata bootstrap refuses an existing release/activation head.
- Foundation receipt: `/home/chandravel_natarajan/.athyper/instances/dev/receipts/rebuild-1790252368420/receipt.json`, with `foundation.log` alongside it. DDL SHA-256: `f94501839045a2a95a2164d9e91dad01f4734bcda713184ade05e2f44978d0b4`.
- Reseeded baseline tenants and identities, then `BP-DEMO-CORE-001 — Aster Research Services (Demo)` for Athyper, Technostat and CirrusAtlantic using `tooling/fixtures/business-partner-core/seed.mjs`. No supplier/customer records or company assignments were added; both role-table counts are zero.
- Installed tenant-scoped demo read grants and the previously approved CATL registration maker/checker split. MFA and separation-of-duty controls remain unchanged. Restored CONNECT for the existing DEV Atlas writer account after database recreation; no new role memberships were added for that repair.
- All six main DEV source application services are healthy and run the current mounted source. Readers and rebuilt schema are deployed together.
- Removed retired commodity-capability metadata artifacts and active release/dependency references that prevented compilation against the cleaned DDL.
- Signed and activated BP metadata release 1: `f7bd9f2e-d9c3-4de7-8973-840e241bf727`; applied release `01a0d365-5d3e-7213-8fd8-bd0aeb211351`; publication key `metadata.compiled_entity.business_partner`; 118 artifacts; hash `7fba69fd42b6b385be3e35f0d6e579cfa7b2316373f59583221733dece521948`. Used existing DEV Ed25519 key `athyper-dev-publication-ed25519-20260905`, not a new signing service. Bootstrap provenance explicitly records operator authorization, not a claimed human workflow approval.
- Publication receipt: `/home/chandravel_natarajan/.athyper/instances/dev/receipts/bp-rebuild-publication.json`. Read-back confirmed Studio `published / signed / activated` and the matching Neon activation head.
- Tests: 10 fixture/permission/workspace Node tests and 12 compiler tests passed. `server/db/scripts/tests/integration/business-partner-identity-cutover.sql` passed against this main DEV database with `BUSINESS_PARTNER_IDENTITY_CUTOVER_COMMANDS_OK`; its test transaction rolled back. This covers registration/materialization, replay, subtype updates and tenant isolation, not browser authentication.
- **Remaining:** signed-in positive/negative browser acceptance. Saved NEON CATL admin, CATL owner and Athyper admin states currently resolve as anonymous; the live section verifier stopped requesting normal CATL admin login refresh. Do not report browser acceptance or broader BP phase closure from database checks alone. No rebuild or new instance is needed for this remaining check.

## 3. Remaining coordinated slices

1. Identity field/writer contract, then DDL, metadata, APIs and person-access tests together.
2. Shared collections and common cross-plane contact/address responsibility checks.
3. Payment instrument generalization and excluded Neon banking functionality removal, including API consumers and permission bundles; retain the explicit Mesh boundary.
4. Qualification/restriction/scope storage and command invariants; implement Restrictions navigation only with its authorized reader. Validate array membership, scope sealing and header-owned validity.
5. Operational setup: adapt existing setup authorities, then replace Roles & scope presentation without silently removing existing actions.
6. Transactions and risk/performance views: preserve document-side access and context lineage; no eligibility inferred from tab visibility.
7. Publication and signed-in positive/negative acceptance per slice. Provisioning requires separately reviewed exact grant differences, approval scope and rollback instructions.

For every permission mapping record enforced/observed/unverified status, required coordinates, MFA/separation where applicable, all alternate paths and test evidence. Never infer runtime enforcement merely from a permission string in metadata. Do not copy retired bank verification capabilities into new Finance roles.
