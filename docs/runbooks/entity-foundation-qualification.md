# Country and Principal foundation qualification

Started 2026-09-30, baseline commit `0fedc0e97c7a4c5f6b20586d0776c888680435f7`.
Scope: shared Entity Framework hardening using Country and Principal. This is
not authorization to expand Atlas, restructure deployment planes, publish every
working-tree metadata draft, or onboard additional entities.

## Pilot and integration points

Country is the system-owned reference/read-only baseline. Principal is a
system-authored definition over tenant-owned records; its parent remains
read-only. Its existing `principal_profile` and
`principal_notification_preference` dependents are the writable pilot, with
owner authorization and optimistic versions. Do not make the identity parent
writable to satisfy a qualification checklist. PII classification does not by
itself establish `masked_only` enforcement.

- Canonical definitions: `metadata/entities/{country,principal,principal_profile,principal_notification_preference}`.
- Authoring: `server/packages/planes/studio/meta-entity-authoring/src/authoring/{product,table-product}.ts`.
- Publication: shared host publication composition, native lowering, compiled
  runtime contracts and the authorization activation guard. Native lowering's
  rejection of top-level graph relations must not be confused with supported
  published record-presentation relationships used by Principal.
- Provider/enforcement: published metadata reader, generic record query/mutation
  services, `published-tenant-authorizer.ts`, transactional owner enforcement and
  server-derived parent collection scope.
- Routes: all three apps' `/app/entity/[entityCode]/[[...segments]]` adapters →
  `createEntityReadRoute` → `EntityReadSurface` → shared list/detail runtimes.

Existing Principal dependents remain separate Entity Framework entities. The
second-stage live pilot required a shared audit-contract catalogue upgrade;
entity definitions, grants and active metadata release heads were not changed.

## Repeatable source qualification

Run `pnpm qualify:entity-foundation` from the root. It runs:

1. The complete authoring suite, including Country/Principal product, localization,
   structural/configuration changes, intake compilation and binding lifecycle.
2. The complete Records package suite, including owner access, parent scope,
   authorization, mutations, query and transfer controls.
3. The complete Publication package suite, including failure/retry, activation
   admission and rollback route tests.
4. The complete Host suite, including actual Principal product compilation and
   owner authorization, table publication and verification endpoint permissions.

All four run even after a failure. Missing/malformed reports, zero executed
tests, test failures, process errors and source changes during the run fail the
command. Required security/pilot test files must execute without skipped cases;
other package integration skips are reported separately. JSON counts and logs are written through the repository artifact-path
helper, outside source by default. Summary includes commit, working-tree
fingerprints, clean/frozen status, skipped counts and explicit unqualified gates.
A passing dirty-tree run is local source evidence, not a frozen-commit receipt.

The `entity-foundation` CI job is independent of the quality job and required by
`ci-success`. Full workspace, database and browser checks remain required; this
bounded command does not replace them. Branch protection still needs separate
verification by a repository administrator.

## CI entrypoint disposition

The obsolete `qualify:business-partner-r9` invocation referred to a removed
bespoke application and a removed `business-partner-evaluations.test.ts`.
Its own historical runbook records removal in `870f08f52`. The invalid invocation
is removed; no dummy success alias or invented equivalent evaluation is added.
Existing AI/owner package tests remain in the full workspace test command.
Historical BP-EVAL-001–013 and live Atlas behavior are **not qualified** by the
Country/Principal gate. Atlas admission requires its own reviewed release gate.

The workspace step now runs `pnpm run test:workspace` without the invalid Turbo
coverage argument. It claims test execution only. Runner-specific coverage
instrumentation and thresholds have not been introduced.

## Stage-two evidence and remaining gates (historical)

The broader authoring failures are repaired without recreating removed bespoke
editors: shared graph fixtures now exercise configuration changes, structural
validation, intake compilation and invalid inputs. The binding source check
recognizes the existing tested cleanup helper. All 52 authoring files / 230 tests
passed, and the complete suite now runs in the foundation gate.

The live Neon pilot exposed two shared runtime defects: edit-form authorization
omitted the record coordinate, and PostgreSQL bigint versions were dropped from
browser read responses. The shared form client, form runtime, HTTP route and
record surface service now carry the coordinate and preserve safe integer versions.
Owner denial and unsafe-version regressions are tested. DEV uses the mounted
checkout with runtime/Next watchers; this is not an immutable image release.

A third defect prevented every audited create: no active audit contract matched
`records.record.created`. Canonical audit seed 13 and the new
`20260930_entity_record_audit_contracts.sql` register six exact event/operation
pairs, metadata-only, without granting authority. Only this migration was applied
through the normal forward runner and recorded in all three DEV ledgers. Its SHA256
is `c2e2aa270692903aad21f09366bc75dae22bde8c57d44174d1a8fe80f5d924a9`.
Existing migration bytes/receipts were preserved. Inventory reconciliation records
removed callers as historical and keeps unmanifested runtime-source/capability
upgrades operational; it does not silently add them to startup replay.

Masked query execution already rejected filter/sort/group/search inference. The
shared presentation service now also suppresses forbidden query controls and
choice-provider calls, and omits masked options from list/detail/form descriptors.
Tests use the actual published authorizer and query service to check list/detail
masking, query denial before SQL, export admission and revocation. No real masked
field policy was published merely to manufacture live evidence.

| Gate                | Current evidence / remaining requirement                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI execution        | Entrypoints repaired; full authoring and masking regressions are required; disposable audit upgrade runs in the blocking job. Remote green CI and branch rules remain unverified.                                                                                                             |
| Country reference   | Authenticated Neon list/detail, cursor, search, equality filter, sort and anonymous denial passed. Studio/Mesh browser flows are not claimed.                                                                                                                                                 |
| Principal writes    | Neon Profile create and edit passed through the real parent-scoped UI, including replay, stale conflict, immutable owner and invalid-field rejection. Unique fixture rows cleaned up; audit retained. Notification Preference browser writes and live identity revocation remain unqualified. |
| Security            | Three-plane owner/tenant/admin/conflict probes passed with rollback; some probes install required policies within the rolled-back transaction. They are not proof those policies were already deployed. Studio fresh canonical RLS/security-definer checks and negative probes passed.        |
| Masked disclosure   | Source masking and metadata-enumeration regressions passed; the shared fix is consumed by DEV source mode. Live browser/network/export disclosure under an actual masked-only published policy remains open.                                                                                  |
| Schema upgrade      | The audit-contract pre-upgrade fixture passes upgrade/replay/checksum and failed-transaction recovery checks on three planes. This is a targeted upgrade rehearsal, not a complete ERP baseline qualification.                                                                                |
| Deployed activation | Four existing entity heads per plane are active with matching release/artifact coordinates, verified timestamps, payload receipts and activation events. This readback does not exercise new partial activation or recovery against deployed targets.                                         |
| Broad database gate | Studio passes. Fresh Neon canonical DDL fails in `planes/neon/master/08_triggers.sql`: `trg_company_code_supplier_profile_remittance` references absent `supplier_id`. This unrelated supplier-schema repair needs its own scope; no whole-database pass is claimed.                          |
| Bulk onboarding     | Remains capability-gated; sensitive/workflow-heavy and broad expansion stay closed.                                                                                                                                                                                                           |

Final source qualification: **1,870 passed / 30 skipped** (authoring 230,
records 413, publication 392, host 835). Required pilot/security files had no
skips. Authoring, Records, Host, descriptor-client and form-detail typechecks
passed. CI entrypoint policy, qualification failure tests and migration inventory
checks passed. Evidence:
`entity-foundation/2026-09-30T07-48-49.245Z-3125059/summary.json`.
The final audit upgrade rehearsal, including canonical replay/drift/wrong-plane
checks, passed at
`entity-audit-upgrade/2026-09-30T07-47-51.161Z-3119042/summary.json`.

The broader seed-contract lint also remains red in five existing seed files
(audit reference, banking reference, contact-person reference, Neon control
reference and Business Partner reference). These files are unchanged by this
activity. The new audit catalogue is separately exercised by the upgrade harness;
the general seed linter scans only `12*seed.sql` canonical files and seed packs.
Neither that harness nor the source qualification makes the workspace-wide
seed/database gate green.

The security-definer checker now recognizes the exact publication recovery
function's dedicated owner and verifies that role is non-login, non-superuser and
cannot bypass RLS; the exception does not admit other functions or `row_security=off`.

Repeatable stage-two commands:

```sh
pnpm qualify:entity-foundation
pnpm qualify:entity-audit-upgrade       # private disposable PostgreSQL only
pnpm qualify:entity-activation-dev      # existing DEV heads, SELECT only
pnpm qualify:principal-dev             # authenticated Neon, disposable fixture writes
node tooling/scripts/verification/qualify-country-dev.mjs
```

DEV commands deliberately target the existing DEV container/session and refuse
unauthenticated use. Do not substitute production coordinates. Live qualification
creates a uniquely named fixture Principal using the fixture connection, then
writes Profile through the user's ordinary UI/BFF authorization. Only those
fixture records are removed. Tokens and request headers are never written to
receipts. The Principal receipt includes relevant source hashes and descriptor
release/hash pins.

Stage-two evidence under `~/.athyper/instances/dev/artifacts/`:

- `principal-write-journey/2026-09-30T07-47-24.048Z-3116462/summary.json`:
  full Neon Profile journey, passed and cleaned up.
- `entity-activation-dev/2026-09-30T07-45-13.565Z-3104853/summary.json`:
  twelve current activation readbacks, passed.
- `entity-audit-upgrade-dev/2026-09-30T07-34-55.202Z-3049827/summary.json`:
  scoped DEV migration application receipt.
- Each `qualify:entity-foundation` and `qualify:entity-audit-upgrade` run creates
  its own timestamped summary with pass/fail, logs and explicit scope. Consult the
  actual summary, not merely the presence of an artifact directory.

Prior DEV evidence in `principal-authorization-recovery-20260930.md` remains
historical. New source runs distinguish dirty-tree evidence from frozen-commit
qualification; current activation readback is not publication failure injection.

Next batches remain capability-gated: Country-like references first; tenant/owner
writes after pilot closure; masked or workflow-heavy entities only after their
additional gates. Atlas expansion and broad schema/deployment changes remain
separate work.

## Stage three: disclosure, recovery and database failures

The next-stage instruction extends the cleanup to the existing database/seed
failures. All work continues through shared Entity Framework and publication
integration points. No entity-specific UI or alternate provider was introduced.

The database gate now calls
`server/apps/platform-host/scripts/qualification/entity-foundation-lifecycle.mjs`
on its own disposable three-plane PostgreSQL cluster. It compiles the actual
Principal definition, signs two releases, verifies their artifacts and activates
them through the real publication orchestrator and SQL repositories. The second
release masks `name`. No DEV masked policy is published by this qualification.

Failure injection interrupts Mesh before activation and Neon after activation
but before acknowledgement. The previous Mesh head remains usable. Actual
least-privilege recovery discovery, recovery job and apply job handlers select and
recover both targets. Repeated delivery leaves one acknowledgement per deployment
and no duplicate activation events; replaying the superseded release cannot
regress the active head. The fixture substitutes artifact transport, queue delivery
and the maker/checker qualification receipt; this is not a deployed queue outage
or maker/checker qualification.

Real HTTP routes resolve the activated metadata using a non-bypass database role.
Signed test identities pass through the actual JWT/JWKS authentication adapter.
List/detail values and descriptors never disclose a database canary in the masked
field, while an authorized field remains visible. Masked sort/filter/group requests
are rejected, search excludes the masked field, choices remain suppressed,
anonymous access fails and fixture authority revocation fails closed. Principal
is read-only and has no enabled export: denied forms/exports do not qualify an
editable masked field or enabled masked export. These are isolated live HTTP
checks, not DEV browser or production IAM-revocation evidence.

Scheduled discovery previously ignored `activated` deployments with missing
acknowledgements. Canonical Studio discovery now includes those stale deployments,
without selecting completed, failed or fresh deployments. Its dedicated owner
receives SELECT on the acknowledgement coordinate only. The new forward migration
`20260930_publication_ack_recovery.sql` preserves older migration bytes. A private
upgrade test installs the old function, proves the lost acknowledgement is missed,
applies/replays the upgrade and checks unchanged deployment rows and wrong-database
rejection.

Only that new migration was applied to DEV Studio through the normal migration
runner; replay and ledger checksum were verified. No pending recoverable coordinates
were present at readback. SHA256:
`b58ba0f553da0a8e26c284391d25c0b7c28dd68c89aac6de16d41b18c49170e7`.
Receipt: `publication-ack-recovery-dev/2026-09-30T08-17-23.750Z-3284340/summary.json`.

Database/seed repairs:

- Neon remittance trigger now watches its actual `business_partner_id` column.
- Five seed files now meet existing seed-contract rules, with explicit natural-key
  conflicts, seed-owned field convergence, no-op guards and semantic assertions.
  Seed lint passes all 73 files; the 22 historical baseline exceptions are unchanged.
- Tenant-specific supplier pilot data is retained as an explicit operation under
  `server/db/scripts/operations/reference-seeds/neon-supplier-pilot.sql`, outside
  canonical global seeds. Existing DEV policy data is untouched.
- Fresh foundation checks exercise all three planes, seed replay/drift restoration,
  wrong-plane rejection, RLS/security-definer checks and their negative controls.
- Removed bespoke Business Partner fixture references were removed from the CI
  runner. The snapshot suite now has an explicit isolated-container contract.
  Entitlement fixtures bound their SQL to their owning tables; bank fixtures use
  applicability queries and retain unsupported-native-rule rejection checks.

Repeat with:

```sh
pnpm verify:ci-database
pnpm --dir server/db db:seed:contract:lint
node --test server/db/scripts/tests/integration/publication-recovery-discovery.test.mjs
pnpm --dir server/db db:verify:migration-layout
pnpm qualify:entity-foundation
```

Database qualification owns and removes its containers; it never consumes DEV
credentials. Passing canonical installation is not qualification of every historical
migration combination. Broad onboarding remains capability-gated; live masked
editing/export, actual identity revocation and Notification Preference browser
writes still require their own evidence.

The database runner's targeted typecheck passes. The broader
`pnpm --dir server/db typecheck` remains red: existing provisioning scripts import
removed Business Partner modules, its package root excludes imported workspace
sources, and additional legacy type errors remain. This cleanup does not restore
removed bespoke provisioning or claim a green whole-workspace typecheck.
The full error log is retained in the stage-three evidence bundle.

Final stage-three results:

- `pnpm verify:ci-database`: **passed**, with **297 service tests passed,
  zero failed and zero skipped**, plus the three-plane foundation, seed,
  authorization, lifecycle, recovery and masked HTTP checks. Source fingerprint
  remained unchanged during qualification.
- `pnpm qualify:entity-foundation`: **1,870 passed / 30 optional skips**;
  required security and pilot test files executed without skips.
- Seed lint, recovery schema upgrade/replay, migration inventory and the database
  runner typecheck passed. The broader DB package typecheck limitation above remains.

Receipts under `~/.athyper/instances/dev/artifacts/`:

- `ci-integrity/2026-09-30T08-23-06.074Z-3321692/database.json`
- `entity-foundation/2026-09-30T08-23-06.218Z-3321832/summary.json`
- `entity-foundation-stage3/2026-09-30T08-23-53.738Z-3329300/summary.json`

The stage-three bundle includes the full database/package typecheck failure log,
passing runner typecheck, isolated entitlement and recovery upgrade results,
seed lint and final source/database logs. These results supersede the historical
stage-two database and seed blockers above; they do not certify remote CI or
production deployment.

## Stage four: enabled export admission and DB typechecking

The shared Entity Framework now qualifies `entity.record.export.v1` only when
its transfer runtime is installed. Tenant/owner authorization admits a published
collection export operation, and generic three-plane table products lower their
plane-specific permission codes together with their authorization profiles.
Existing `common.*` identity permission codes and owner administration remain
unchanged. Export discovery exposes only classification-approved plain fields
with published export query permission. Workers and downloads recheck field
classification; request admission, worker authorization and URL issuance retain
independent authorization checks.

`pnpm --dir server/db typecheck` now passes, including its separate CI runner
configuration. The repairs include workspace source resolution, existing module
JS interop and concrete provisioning types. Six orphaned test files referencing
removed bespoke Business Partner provisioning modules were removed; their deleted
implementations were not restored. DB package tests pass **119 tests / 2 skips**.
The remaining migration/projection/trusted-device tests now assert the current
manifest, release-scoped operation IDs and extracted identity route implementation.

The enabled-export Records regression covers permitted output, masked-field
rejection, and classification changes between request, worker and download.
Records has **414 passing tests / 4 optional skips**. Authoring and Host also
include permission-lowering and installed-export registration regressions.

Export lifecycle audit contracts are canonical on all three planes. Upgrade
`20260930_entity_export_audit_contracts.sql` was applied and replay-checked on DEV
through the normal migration runner. Its immutable SHA-256 is
`0d4ddeb4cca8a0bca74a7d8c44fb4006b0449ea589c69e5c0e56008439af5519`.
Isolated old-schema upgrade, replay, wrong-plane/checksum/drift rejection and
transaction-failure checks passed on all three planes:

- `entity-audit-upgrade/2026-09-30T09-08-10.573Z-3565895/summary.json`
- `entity-export-audit-dev/2026-09-30T09-09-35.944Z-3575380/summary.json`

DEV browser qualification uses a separately published `principal_disclosure_probe`
through the standard Entity routes and provider. Its name is masked and only its
code is exportable. The draft, exact probe permission catalogue and proposed
publication policy are recorded in
`masked-export-dev/2026-09-30T09-06-24.475Z-3556173/`. The original Country/Principal
heads are preserved. No release or activation row is manually manufactured.

Owner password/OTP verification and independent policy activation succeeded at
2026-09-30T09:36:55Z. Policy `0984266a-25c4-4863-b352-03cc262bd078`, version 1,
was executed through the normal authenticated workload endpoint. The running DEV
source API was missing its workload mount; the existing
`deploy/compose/instance/compose.publication-workload.yaml` overlay was applied to
its API and worker with the existing private `workload.json` configuration and
platform authority tenant. No routing bypass or manual release writes were used.
Keep this overlay when recreating those source services for publication work.

Release `4e1ce73c-8342-469c-a6d2-f180770ff9f3` activated on Studio, Neon and Mesh.
Readback verifies matching artifact/release coordinates, verified payloads and
activation events, alongside the original Country/Principal family releases.
The qualification alias remains published without the temporary probe grants.

The live Neon browser and enabled export gate now **passes**:

- Standard list/detail UI and API responses mask the canary name; metadata does
  not expose masked filter/sort controls, and masked query attempts are denied.
- Export discovery offers only `code`. The standard UI submits the selected-row
  CSV export. Real queued CSV, JSON and XLSX jobs each complete with exactly one
  fixture row, containing only its permitted code. Masked field projections fail.
- Revoking the temporary export permission denies fresh export requests and new
  download URL issuance in the same authenticated browser session.
- Anonymous reads are denied. Temporary permissions and the canary principal are
  removed by cleanup. Immutable publication, transfer and audit evidence remains.

The script explicitly chooses CSV because the standard UI defaults to XLSX.
Rejected-query checks distinguish a problem response's caller-supplied request
URI from server-returned record data. Earlier failed qualification attempts are
retained; the successful receipt below supersedes their test-script assumptions.
Previously issued signed URLs remain subject to expiry; this gate does not claim
to revoke an already issued URL.

Final evidence under `~/.athyper/instances/dev/artifacts/`:

- `entity-foundation/2026-09-30T09-26-01.073Z-3672060/summary.json`:
  **1,873 source tests passed / 30 optional skips**.
- `ci-integrity/2026-09-30T09-26-24.948Z-3675643/database.json`:
  **297 PostgreSQL tests passed / 0 skips**, fresh three-plane DDL, seed replay,
  drift rejection, security/RLS, signed publication and isolated HTTP lifecycle.
  Source remained stable during this successful run.
- `entity-activation-dev/2026-09-30T09-39-37.882Z-3749762/summary.json`:
  all five entity publications verified across three planes.
- `masked-browser-dev/2026-09-30T09-41-49.858Z-3763034/summary.json`:
  live standard browser, actual export artifacts, authorization revocation and
  cleanup; screenshots alongside the receipt.
- `entity-foundation-stage4/2026-09-30-final/summary.json`: consolidated pointers
  and logs. DB, Records, Authoring and Host package typechecks pass.

These close the requested DEV masked-policy and enabled-export gates and the DB
package typecheck blocker. They qualify the published tenant/owner reference and
writable pilot capabilities; workflow-heavy and other sensitive entity profiles
still require their own capability qualification. Production rollout is separate.


## Studio reference slice: Country and State Region

Scope added 7 October 2026. This execution record concerns the DDL-led Studio
reference slice in blueprint §7.9.3. It does not extend or supersede the older
Country/Principal live pilot above. The blueprint remains the design authority.

### Missing-fixture repair checkpoint

The 35 failures reproduced in the audit were missing-source fixture dependencies:
31 publication-contract, one metadata and three publication-service cases.
Tests now use maintained synthetic review artifacts in the publication contract
package's test fixtures, plus the historical seven-record correction scope.
No removed application or production metadata was restored. Assertions remain,
and projection/compiler fixtures run through the current artifact compiler.
The parent-scope cases also exercise the current runtime validator for each
historical scope. Test fixtures are not signed releases or deployed evidence.

Executed on 7 October 2026:

| Command | Result |
| --- | --- |
| `pnpm --filter @athyper/server-contract-publication test` | 233 passed, 15 files |
| `pnpm --filter @athyper/server-service-publication test` | 458 passed, 45 files |
| `pnpm --filter @athyper/server-platform-metadata test` | 194 passed; two existing integration skips, 35 files |

Owner inputs requested: approved host release ID/hash, protected-state initializer
owner/key/version/hash, and named product-write/F6/F8 assignees and target dates.
The owner confirmed Platform Admin / Platform Owner as the author/proposer and
independent-review roles. Named people, target dates, host pins and initializer
provenance remain pending; role confirmation is not a release approval receipt.
Preservation-only MFA approval does not establish initialization authority.

The broader aggregate run found two further host boundary assertion failures
(stale explicit import allowlists) and one unloadable historical section suite.
These tests now admit only the existing recovery-parser / telemetry imports and
use local historical compatibility fixtures. All 30 targeted host cases pass.
Production handlers and isolated-entrypoint composition were not changed.
All three repaired publication/metadata package typechecks pass. Six generated
contract drift checks pass. The initial aggregate run changed during execution
and is not a success receipt. The subsequent clean/stable run at commit
`943d10d585bc4a4b7299315a55ef221fc879b143` passed on 7 October 2026:

| Aggregate suite | Passed | Existing optional/integration skips |
| --- | --- | --- |
| Authoring | 591 | 3 |
| Records | 534 | 4 |
| Publication | 458 | 0 |
| Host | 994 | 31 |

Evidence: instance artifact
`entity-foundation/2026-10-06T18-55-28.971Z-632081/summary.json` records
`stable=true`, `frozenCommit=true`, `passed=true`, identical clean-tree
fingerprints, and `qualification=source-tests-only`. No required qualification
file was missing or skipped. This existing aggregate's declared entity scope is
Country/Principal; these totals are regression evidence, not a whole-source
Country/State Region conversion receipt. Remote CI, deployment and live reads
remain independently unqualified.

Whole-source conversion, technical-binding disposition, atomic application,
whole-release compilation and deployed F6/F8/F9 remain open. Cutover remains
disabled. No migration, conversion application, publication or activation was
performed at this checkpoint. F5 remains required for production, not for
bounded synthetic inspection.

### Prior Studio component execution evidence

The following dated execution paragraphs were moved from blueprint §7.9.3
without changing their historical results. Their counts are historical; they
are not current whole-source, remote CI or deployed qualification receipts.

Local verification on 6 October 2026: closed-contract tests cover unknown properties/variants, explicit NULL versus absence, ownership, duplicate/orphan members and translation completeness. Codec fixtures preserve all 31 Country localization labels with their declared English/Malay/Arabic values; State Region has no localization sidecar, so its fixture extracts only explicitly declared label pairs into an English-only synthetic resource. No full State Region definition conversion, inferred translation or publication is claimed. Generated source hashes pin both fixture inputs. The existing product-localization consumer validates compiled output; the selected typed-column projection also loads back losslessly with cross-draft rejection. Explicit legacy identity maps are synthetic test inputs until historical identity provenance qualifies.

Commands: `pnpm entity:foundation:generate`, `pnpm entity:foundation:check`, contract-package tests and the authoring package's `owned-label-codec.test.ts`. CI is configured to run the generated-output check and both test suites; this configuration is not a remote CI success receipt. A deliberately modified generated artifact was rejected by the drift check and restored. Navigation negative tests also run through the shared runtime contract. No database migration, host publication, operation permission/MFA change or runtime deployment is performed by this proof.

Early measurement (not an approved budget): Node v24.19.0, local single-process concurrency 1, 20 in-memory encode/decode/compile iterations over 1,365 synthetic owned labels with no translations produced 309,240 UTF-8 bytes, approximately 9.04 ms p50 and 11.71 ms p95. This is a label-codec baseline, **not** the 1,365-binding graph/save benchmark: database/index/snapshot/backup costs, host hardware qualification, cold/warm distributions and approved limits remain F3/F5 work.

Validation: 409 authoring tests passed, with two opt-in database tests skipped in the ordinary suite. The new disposable PostgreSQL 16.15 rehearsal was run separately and passed using actual native tables, indexes, graph guards, revision function and repository snapshot path. It covers attribution, same-identity updates, failed pre-migration ordering, sibling swaps, default switches, competing-default rollback, explicit versus implicit child deletion, concurrent stale-save rejection, no-op saves and unchanged immutable historical snapshots. Its minimal external fixtures and administrative connection do not establish deployed RLS, independent human approval or business live-read authority. CI runs the unit checks and opt-in disposable rehearsal explicitly. Typecheck, generated-contract check and migration-inventory verification also pass. Nineteen existing host product-review/published-reader/evidence tests passed; these are automated host fixtures, not deployed end-to-end evidence.

Verification: 37 typed-contract tests pass, including nine layout semantic cases; 461 authoring tests pass with two opt-in tests excluded, including six layout codec/storage/position cases. Four inspection tests prove missing-column reporting and that complete column presence still cannot qualify cutover. Both affected packages pass production and test typechecks; all four generated-contract drift checks pass. These are component implementation fixtures and read-only schema inspection, not authenticated deployed authoring/live-read evidence.

Verification: 467 authoring tests pass (two opt-in cases excluded); targeted compiler/publication and shared reader/storage tests cover separate hashes, source/tenant mismatches, pin erasure, unknown versions, persisted provenance, compile/sign/dispatch rechecks and correctly signed target rejection without installed qualification. Affected package typechecks and four generation checks pass. Broader suites are not green: publication contracts have 31 failures, platform metadata has one failure and publication services have three failures involving missing Business Partner/Core/Operation/request fixtures or their absent release documents. These failures are not qualification evidence and remain visible; no fixture is fabricated or historical artifact restored to bypass them. Native command/idempotency/snapshot integration, history-preserving whole-graph conversion, full normalized release lowering, governed product writes, approved host/protected-state initialization and deployed F6/F8/F9 remain outstanding. No DEV migration, grant, publication or activation is performed in this continuation.

Verification: 482 authoring tests pass (two opt-in cases excluded), including 15 native command/compiler-rejection/save-protocol tests; 37 contract tests pass. The existing shared-writer PostgreSQL rehearsal passes separately. Package typechecks and four generation drift checks pass; the two native test files are included in foundation CI. The save-protocol tests mock SQL and do not establish native SQL cutover, transaction rollback in a deployed role, host admission or live-read qualification. The PostgreSQL rehearsal proves existing scoped writer behavior and dormant migration preservation/guard rejection; it does not exercise a converted native draft. Whole-graph history-preserving conversion, positive native PostgreSQL save/load/history qualification, coordinated normalized label/reference editing on version 2.4, complete release compilation, governed product writes, approved host/protected-state initialization evidence and deployed F6/F8/F9 remain outstanding. No migration, grant, publication or activation is applied in this continuation; prior applied migrations and historical artifacts remain unchanged.

Verification: 490 authoring tests pass (three opt-in cases excluded); the positive native PostgreSQL rehearsal passes separately. Native test/source typechecks, generated-contract drift checks and whitespace checks pass. The new PostgreSQL and conversion/runtime tests are enrolled in foundation CI. Native test typechecking has a focused configuration because the existing inherited test configuration excludes `*.test.ts`; this does not silently change broader historical test compilation. Fresh read-only DEV inspection at `/tmp/athyper-entity-native-continuation.json` confirms zero missing selected tables/columns and forced RLS, while `cutoverQualified=false`, `qualification=not-established` and `productionEnabled=false`. No applied migration, grant, historical snapshot, host approval record, protected-state initialization, publication or activation is changed. Complete release compilation, canonical native database qualification, governed product writes, approved host/initialization evidence and deployed F6/F8/F9 remain unfinished.

Verification: 495 authoring tests pass, with three opt-in cases excluded. Production and focused native-test typechecks pass, and all four generated-contract drift checks pass. The adapter tests are enrolled in foundation CI. Fresh read-only inspection at `/tmp/athyper-entity-production-adapters.json` reports no missing selected tables, `qualification=not-established` and `productionEnabled=false`; this is schema inspection, not canonical database qualification. Cutover stays disabled. This continuation applies no migration, grant, historical repair, publication or activation, and does not initialize or alter MFA controls. Earlier preservation approval does not supply new-operation initialization authority.

Verification: 564 authoring tests pass with three opt-in cases excluded. The new cases cover Country and State Region authorization/runtime on all three planes, none versus unavailable permission evidence, resource-version/pin mismatches, source hashes, field-policy grouping, SQL operation projections and actual inline section membership/order. All 39 contract tests pass with both isolated PostgreSQL component cases enabled. The operation rehearsal uses the canonical base CREATE TABLE and domains plus generated additive columns: the original tuple hash and legacy handler constraint remain intact, and every one of the 14 target additions rejects non-NULL writes behind the pending check. It uses a disposable UUID-default stub and does not exercise canonical host governance or converted repository writes. Source/focused test typechecks, six generator checks, six inspection tests and the 13-task bounded build pass; the new authoring tests are included in foundation CI.

Verification: 579 authoring tests pass with three opt-in cases excluded, including actual repository read/history tests using explicitly synthetic host/SQL projections, reference/guard/version rejection and expanded save/replay tests. Contract tests pass (37; two opt-in cases excluded); source/focused native-test typechecks pass. The existing disposable PostgreSQL core/layout save rehearsal also passes after the snapshot checks; it exercises the original 2.4 SQL path, not deployed 2.5 storage or independent authority. Seven read-only inspection tests pass. DEV reinspection at /tmp/athyper-native-snapshot-readiness.json confirms both schema guards absent, 14 operation target columns and 32 AI properties missing, qualification=not-established and productionEnabled=false. Atomic whole-source conversion, remaining display/geometry mappings, expanded mutation/compilation and deployed host/F6/F8/F9 qualification remain unfinished. Approved host and protected-state initialization evidence remain unavailable. No DEV migration/application, grant, initialization, release or activation occurs in this continuation.

Verification: 591 authoring tests pass with three opt-in cases excluded; source and focused native-test typechecks pass. Read-only DEV inspection at `/tmp/athyper-native-section-readiness.json` continues to report qualification=not-established, productionEnabled=false, both native schema guards absent, five AI tables and fourteen operation columns missing. Native whole-release lowering and atomic conversion application remain unimplemented; approved host/initialization evidence and deployed F6/F8/F9 evidence remain missing. No database migration/application, grant, protected-state initialization, release or activation occurs in this continuation.

Verification: Country and State Region's actual AI declarations round-trip through this selected component with synthetic admitted rosters. Seven positive/negative mapping tests pass; all 542 authoring tests pass with three opt-in cases excluded. Contract tests pass (37; the new PostgreSQL case is opt-in); that case also passes separately against disposable PostgreSQL 16 using the actual generated AI DDL and explicitly synthetic prerequisite tables/guard/UUID functions. It checks cross-draft FK rejection, NULL/invalid provenance, invalid arrays and forced-RLS default denial. This is not canonical product-writer or host qualification. Five read-only inspection tests pass, and /tmp/athyper-native-ai-readiness.json reports all five AI tables and their 32 target properties absent in DEV, qualification=not-established and productionEnabled=false. Source/focused native-test typechecks and all five generation checks pass. Remaining authorization/runtime, section/binding and complete graph mappings, atomic application, whole-release compilation and deployed F6/F8/F9 are still open; missing host/initialization evidence remains a separate blocker.

Read-only DEV reinspection at /tmp/athyper-native-navigation-readiness.json confirms zero missing selected tables/core-layout columns, cutoverQualified=false, qualification=not-established and productionEnabled=false. No migration or activation was performed. Remaining nested adapters and complete source-path coverage, atomic conversion application in the canonical repository, whole-release compilation, governed product-write authority and deployed host/F6/F8/F9 evidence remain unfinished. Approved host release/hash and protected-state initialization evidence are still missing; preservation approval does not establish either source.

Read-only DEV inspection at /tmp/athyper-native-presentation-readiness.json still reports zero missing selected tables/core-layout columns, cutoverQualified=false, qualification=not-established and productionEnabled=false. Repository inspection confirms reference commands cannot be separately applied to native drafts. A complete conversion therefore still needs one canonical transaction covering normalized additions, retired legacy values, original/new immutable snapshots, revision/idempotency receipt and exact readback; this continuation does not implement that application transaction or relax pending/legacy-required guards. Whole-release compilation and remaining authorization/runtime/AI/section/binding/target mappings remain unfinished. Host release/hash, approved protected-state initialization source and deployed F6/F8/F9 evidence remain missing. No migration, grant, operation initialization, publication or activation occurred.

Verification: 535 authoring tests pass with three opt-in cases excluded, including the production navigation, list-settings, readable-header and resource-dependency cases. Source and focused native-test typechecks, the bounded dependency build and four generation drift checks pass. The nested conversion/compiler test files are included in foundation CI. This evidence establishes component behavior only; complete graph conversion, atomic application, whole-release publication and deployed qualification remain open.
