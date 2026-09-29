# Compilation recovery checkpoint

Cosmetic relocation is frozen. The user authorized compilation before completing
the remaining structural work; this supersedes the earlier Phase A no-build gate.
Tests have now been executed; the latest host test run is green.
The current test gate is zero diagnostics in register-services.ts, even if other
host files still fail; run pnpm test at that boundary before preflight persistence.

Latest measured host source status (2026-09-26): **1 diagnostic**, including
0 in register-services.ts. Command: `pnpm --dir server/apps/platform-host exec
tsc -p tsconfig.json --noEmit` (exit 2). Full output is captured in
history/compiler-after-test-fixture-cleanup.txt. This is a partial checkpoint,
not completion of Phase B.

## Results

| Check | Result |
| --- | --- |
| Initial host source typecheck | 238 diagnostics; captured in history/compiler-baseline.txt |
| Entity-governance contracts typecheck | Passed (including test-source compilation) |
| Entity-governance service typecheck | Passed |
| Mesh plane typecheck | Passed |
| Neon plane typecheck | Passed after retiring the deleted BP route suite |
| Records service typecheck | Passed (including test-source compilation) |
| Metadata platform typecheck | Passed (including test-source compilation) |
| Latest host source typecheck | 1 diagnostic in entity-case-preflight.ts; 0 in register-services.ts |
| Full host test run (latest) | 73 files passed, 3 skipped; 532 tests passed, 25 skipped (live suites opt-in) |
| Separate disposable PostgreSQL scope run | 1 file passed; 8 tests passed; container removed |
| Separate disposable PostgreSQL collection preparation run | 1 file passed; 16 tests passed; container removed |
| New qualification/handler-registry tests | 2 files passed, 7 tests passed |
| Shared entity metadata/read/routes/permission-transition imports via tsx | Passed without loading legacy registration |
| Diff integrity | Passed |

## Removed legacy registrations

Live collection preparation checkpoint (2026-09-26): 16/16 tests passed against
real repository SQL functions and disposable fixture tables; teardown confirmed.
See history/tests-after-live-collection-preparation.txt for the exact gate, cases and
limits. Fresh host suite is 532 passed/25 skipped (16 newly opt-in tests were
executed separately); typecheck retains only the preflight error. No production
DDL deployment, full-schema qualification or runtime activation occurred.

Hash/preparation checkpoint (2026-09-26): the exact five empty governance arrays
reproduce the previous descriptor hash when removed in the regression test.
Updated the intentional new-shape expectation without changing historical artifacts.
Studio now has 140 passing tests; publication 270; host 532 passed/9 skipped.
Studio/publication typechecks pass; host retains the single preflight error.
See collection-hash-preparation-checkpoint.md for SQL/adapter compatibility changes
and limits: DDL remains undeployed and generic live activation is still pending.

Studio collection producer checkpoint: binding persisted through existing surface
layout JSONB, validated with a shared metadata parser and emitted into the compiled
descriptor. See studio-collection-binding-checkpoint.md. Contracts, Studio and
publication typecheck; publication has 265 passing tests and host 532 passed/9
skipped. Studio has 131 passed/1 failed due to a descriptor hash fixture mismatch
also reproduced without the new binding emission. DDL source updated but not
deployed; generic activation and preflight completion are not claimed.

Collection compiler extraction (2026-09-26): shared/collections/compiler.ts now
requires explicit reviewed collectionCompilation bindings; implicit BP defaults are
removed. See publication-collection-extraction.md for the availability change:
Studio producer-side binding emission is still pending, so unbound native graphs
reject rather than fall back. Publication typecheck passes with 265 passing tests;
fresh host results remain 531 passed/9 skipped and the single gated preflight error.
No metadata publication or runtime activation was performed.

Shared publication extraction (2026-09-26): see
publication-shared-extraction-checkpoint.md and the pre-change per-source
consumer map. Preview environment guard and neutral case-contract types now have
dependency-free shared modules with compatibility exports. Publication typecheck
passes; 253 publication tests pass. Fresh host checks remain 531 passed/9 skipped
and the single deliberately gated preflight diagnostic. Collection compilation,
case behavior and authenticated review migration remain pending.

Publication audit checkpoint (2026-09-26): independently reran the disposable
scope PostgreSQL suite before any publication edits: 8/8 passed, exit 0, 1.56s;
container cleanup confirmed. publication-export-audit.md records 105 barrel
symbols (68 generic, 22 BP-specific, 15 hybrid), source-level dispositions,
85 consumer files and all public package subpaths. Authenticated release-review
still accepts a BP packet format, so its generic-looking name does not establish
generic evidence handling. Only audit tooling/docs changed; publication and
preflight source remain untouched. No new full-suite/typecheck result is claimed.

Live scope checkpoint (2026-09-26): history/tests-after-live-scope-bindings.txt records
the separate PostgreSQL fixture and full host runs; source typechecking remains
at the same single preflight error. Host Studio authoring/publication and worker
release-review seams were confirmed by source inspection. The initial Phase 4
inventory is bp-metadata-migration-inventory.md: renamed publication files still
contain BP-specific implementations, so host cleanup is not whole-package cleanup.
No metadata migration or production authorization qualification is claimed.

Latest test-fixture checkpoint: backend mapping/intents now pass explicit
permission transitions (empty for exact-permission releases, three declared
source/target mappings for the transition fixture). A changed target rejects
the stale transition at construction. Retired BP provider assertions and their
orphaned import were removed from partner-section-contract.test.ts; still-used
publication validation and overlay checks remain. No production authorization
or metadata was changed. The three targeted suites passed (24 tests), followed
by the full host run recorded in history/tests-after-test-fixture-cleanup.txt.
Typechecking separately still reports only the deliberately gated preflight
repository import; Phase B and startup verification are not complete.

Latest ownership checkpoint: removed BP/workforce SQL branches from parent
admission in favor of exact trusted entity/plane bindings. Generic Records parent
read remains mandatory. Added a concrete tenant-scoped scalar-row SQL provider with
read-only snapshot/actor stamping and mandatory catalog validation; it does not
implement relationship or snapshot ownership. Products without bindings now deny.

Task-policy authorization now consumes explicit taskPolicyPermissions and a generic
revision authorizer. No BP permission string is generated. Missing permission
bindings make the operation unavailable; immutable-author/MFA/entitlement checks
and target-plane write-time maker-checker checks remain. The old authorizer/test
were replaced; preserved and expanded tests pass.

New targeted suites: 19 tests pass. Full run: 507 pass, 1 skip, three previously
identified suite-loading failures. See history/tests-after-generic-ownership-bindings.txt.
The sole compiler error remains untouched preflight. See generic-ownership-bindings.md
for configuration requirements and the limits of dummy-driver SQL verification.
No product binding, BP metadata definition, catalog, DDL or live data was changed.

The scope/Studio paragraphs below describe the preceding checkpoint.

Latest scope/Studio checkpoint: replaced legacy authority/vertical tests with
generic permission and real-IAM contact-verification coverage before deleting them.
Readiness now tests onboarding ownership through its registrar, including scheduler
exclusion and selected-but-missing-database registration. The replacement 20 tests pass.
The four new exact-binding scope registry tests also pass.

Written branch/consumer/permission inventory precedes removal in
stored-scope-authorization-inventory.md. Host case scopes now require explicit
trusted bindings, rejecting unbound operations; the bespoke SQL adapter is deleted,
not renamed into a generic implementation. BP Studio definition/case-contract
registrations, bootstrap schema wiring and container definition field are removed.
Generic Studio authoring/publication and release-review paths are preserved.

The latest full run has no executed-test failures but still fails to load three
suites: business-partner-backend-intents and business-partner-backend-mapping lack
explicit transition fixtures; partner-section-contract imports a deleted provider.
These are not counted as passes. See history/tests-after-scope-publication-cleanup.txt.
Preflight remains the sole compiler error and its source is untouched.

Still pending: BP capability-parent assignment guard, workforce-specific parent
admission, task-edit policy's BP-named definition authorizer, and real persisted scope
providers. These security checks were not replaced by broader/default authorization.
BP metadata definitions, DDL and deployed data were not changed.

The following paragraphs record earlier cleanup checkpoints.

Latest: removed BP 360/eligibility construction, routes, jobs, metrics, readiness,
BP import adapters and container fields; supplier documents/communications routes,
polling, notification callbacks, denial owner and SLA callback are removed together.
Generic workflow completion uses its existing database evaluator. Backend authorization
composition accepts explicit entityBackends instead of a BP-specific wrapper.
Generic entity resource/document/intake routes remain; concrete trusted providers
must be registered through their typed bindings. Missing providers reject; they do
not fabricate empty successful records. Generic resource provider migration is NOT
claimed complete. Reference/record reads continue through existing generic services.

The final host error is the deliberately unresolved preflight repository import.
Full test results are captured in history/tests-after-bespoke-runtime-removal.txt: failures
include missing transition fixtures, retired section/provider and Master Data tests,
and a stale readiness source assertion. No failures were hidden or called passes.
BP publication/authoring wiring, stored-scope/preflight and an assignment guard
remain: this is not yet an entity-only host. Do not remove the guard by weakening
authorization or implement preflight before governance decisions are resolved.

Earlier checkpoints below are historical; their unrun-test statements describe
those measurements, not the latest run.

Removed the complete obsolete BP case construction/validator/workflow/intake/import
registration cluster and supplier selection, completion and task route registrations,
plus case HTTP telemetry/readiness. Removed BP case operation fallback handlers,
including the generic-named create/submit/materialize wrappers that still called
the retired BP service. These operations are not claimed as generically implemented.

Generic intake routing remains with an explicit entityIntakeProviders dependency;
absent providers are unresolved, not successful stubs. Generic record import/export,
collaboration operations and their authorization remain. Atlas no longer installs
the BP submit command bus: configured commands use their explicit owner; local
unregistered commands reject. Activity presentation uses the generic record path.
The remaining 360 case-read callback uses authorized Records queries for entity_case.

Removed the retired request container field, unused supplier submission adapter,
BP context/reference adapters and their dedicated tests. Residual supplier document/
communication adapters are NOT yet removed: their retired case authority now
explicitly denies instead of inheriting generic authorization. This denial is a
temporary safety boundary, not a replacement capability. Complete their removal
with the remaining document/notification dependencies.

Preflight reader remains gated on governance decisions documented in the DDL
mapping. Neither typecheck nor test-execution gates have passed. No tests run.
Removed source/tests are recoverable from Git; no DDL/data/deployed process changed.

Removed BP-specific Atlas case/insight tools from both local and configured tool
registries, their case-context owner and container field. Generic entity reads,
attachment grounding, configured tools and their authorization remain. Local
tool availability now rejects mutation requests because that registry only
contains the generic read tool. Updated AI composition assertions require
retired BP tools to remain unregistered; these tests have not been run.

Fresh pre-edit compilation confirmed 109 diagnostics. After this removal the
latest source compile reports 107; the requested register-services.ts-zero test
gate is not reached. DDL mapping is documented separately in
entity-case-preflight-ddl-mapping.md. It records sources and unresolved semantics,
not approval to install a persistence reader or a claim of deployed schema parity.

Publication qualification now uses the generic callable authorization registry via
shared/entity-runtime/publication-qualification.ts. Host composition accepts explicit
entityAuthorizationRuntimeRegistrations; it does not manufacture callable evidence
from published declarations. The existing injected publication qualifier is retained.
Without either configured callable coverage or that injected qualifier, declared
operations fail qualification. This is not automatic discovery or a claim that
production registrations are all wired.

The deleted BP case/read/reveal registration imports and obsolete action/export
qualification adapters are removed from this path. The latter adapters and their
dedicated tests had no remaining production consumers and were deleted. Generic
record import/export handlers and service authorization remain unchanged.
New qualification tests cover absent coverage, exact callable semantics, changed
plane/permission, duplicates, and non-execution during qualification. Tests were
written but not executed; source typechecking excludes test files.

Earlier removals cover obsolete workforce/HR/engagement and BP invitation
construction, HTTP routes, associated readiness, invitation expiry registration,
invitation telemetry and retired container fields. These capabilities are retired,
not replaced by successful generic stubs. No remaining composition references to
the removed invitation service or workforce container field were found.

Latest removals retire the supplier/customer capability adapter and its host
fallback selection, plus governed-internal BP case construction, HTTP registration
and readiness. Shared case telemetry remains because the BP request routes still
use it. Generic dispatcher permission/input/version/idempotency checks are unchanged;
unregistered operation handlers still fail with
ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE, not a successful no-op.

The retired capability adapter's dedicated test was removed with its implementation.
New generic handler-registry tests cover exact-key selection, unresolved keys,
non-execution during selection and registered-handler precedence over fallback.
They have NOT been run; tests now run at zero register-services.ts diagnostics.
Removed code/tests are recoverable from Git. No data or deployed services changed.

### Preflight replacement contract established

Entity-governance contracts now exports EntityCasePreflightEvidence and
EntityCasePreflightEvidenceReader. They describe snapshot/hash, validation version,
metadata release, workflow ownership/work-item status, and approval evidence under
one tenant/plane-scoped read-only transaction. Missing evidence is not success;
authorization and actor separation remain policy checks, with commands required
to recheck evidence under write locks. Contracts typechecking passes.

This is only the replacement port: the persistence adapter and runtime evaluator
are still pending. The existing preflight implementation has deliberately not been
renamed or weakened to hide its missing repository dependency.

DDL inspection found a prerequisite for that adapter: common/document/03_tables.sql
uses submitted/in_review/materialized statuses, snapshot-backed payloads and
validation finding rows; EntityChangeCaseRecord still uses pending_approval/applied
and the new evidence port assumes a validation outcome/version. These are not
drop-in storage equivalents. Establish an evidence-backed mapping (including
completed evaluations, submission/decision actors and workflow ownership) before
implementing the reader. Do not infer successful validation from zero findings,
or rename statuses without checking command and workflow evidence.

### Historical measurements

| Checkpoint | Host diagnostics |
| --- | --- |
| Initial baseline | 238 |
| Integration removal | 188 |
| Pilot/profile-match removal | 162 |
| Workforce and invitation removal | 127 |
| Capability adapter and governed-internal case removal | 115 |
| Generic publication qualification | 109 |
| Retired Atlas BP tools | 107 |
| Whole case registration removal | 52 |
| Bespoke runtime removal (latest) | 1 |

Removed the three BP-only composition blocks for Mesh publication/disclosure/network
exchange, Neon profile projection/account-bank linkage, and cross-plane delivery/
reconciliation. Their routes, job registrations, schedules, telemetry and readiness
probes were removed together, along with unused imports and retired container fields.
The delivery-only internal recipient context helper was also removed.

Generic entity routes and adjacent control/governance services were outside these
blocks and retained. Remaining protected intake explicitly fails with 503 while its
deleted provider is unavailable; it does not capture plaintext or pretend success.
No data, DDL, permissions, secrets, queues or deployed processes were mutated.

`planes/neon/src/neon-route-review.test.ts` covered only the retired BP projection,
matching and bank-linkage endpoints and was deleted with those endpoints. Existing
generic/security tests were not removed to suppress errors. The transaction actor
source assertion now targets the extracted coordinator and retains all checks.
Git can recover the removed code and test.

## Authorization boundary

The missing hard-coded BP permission-transition module is no longer imported.
The remaining mapping requires explicit trusted transitions from its host dependency,
validated against the target profile by the shared validator. Missing input throws;
an empty list explicitly declares no transitions. Deferred/mismatched/duplicate
transitions are rejected. No source/target permissions are inferred from names.
Backend release verification and source-plus-target checks remain unchanged.
Callers previously relying on the deleted implicit map must supply reviewed input;
otherwise the capability fails closed. This is not a claim that BP authorization
migration is complete.

## Remaining work

### Historical follow-up registration removal checkpoint

The next source typecheck reduced host diagnostics from **188 to 162** (128 now
in register-services.ts). Finance source compilation passes. No tests were run.

Removed:

- Company-pilot runtime construction and route registration, including its obsolete
  permission-alias rewrite. Company-case metadata publication is retained separately.
- Profile-match service, route registration, metrics, readiness probe, container
  field and its retired permissions from the bespoke admission list.
- Deleted BP finance journal-activity reader from the 360 activity provider list.
  The remaining 360 composition retains unavailable-provider semantics; it does not
  return invented finance data. Generic finance services are unchanged.
- Deleted Neon BP import adapter registration; Mesh and Studio import adapters remain.
- BP-only shadow construction/route/wrapper wiring for the configuration field that
  no longer exists. Generic backend enforcement and entity authorization shadow
  support remain unchanged.

That historical checkpoint is captured in history/compiler-after-pilot-match-removal.txt. Generic
record-resource construction still references decision/company-profile providers;
those cannot be removed as independent blocks without replacing that dependency.
Case preflight's workflow/validation evidence has not been weakened or renamed away.
These deletions are recoverable from Git. No DDL, data or deployed process changed.

Host compilation is not green. BP core/360/case/eligibility registrations, their
deleted-module imports and the generic preflight persistence replacement remain.
The next retained-dependency boundaries are pinned generic header/section reads
(currently supplied by BP providers), actual callable registration coverage for
publication qualification, and the evidence-backed preflight reader.
Do not bypass these checks or return invented records to unblock compilation.
Isolated profiles are still blocked. No API startup, live login or behavioral
verification is claimed. Do not perform the next plane extraction or cosmetic
reorganization before closing the remaining compilation/registration boundary.
