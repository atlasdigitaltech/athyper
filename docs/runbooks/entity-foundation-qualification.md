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

| Command                                                   | Result                                               |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @athyper/server-contract-publication test` | 233 passed, 15 files                                 |
| `pnpm --filter @athyper/server-service-publication test`  | 458 passed, 45 files                                 |
| `pnpm --filter @athyper/server-platform-metadata test`    | 194 passed; two existing integration skips, 35 files |

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
| --------------- | ------ | ----------------------------------- |
| Authoring       | 591    | 3                                   |
| Records         | 534    | 4                                   |
| Publication     | 458    | 0                                   |
| Host            | 994    | 31                                  |

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

### Explicit UUID membership disposition checkpoint — 7 October 2026

The existing section adapter and whole-graph preservation coordinator now account
for explicitly declared redundant UUID presentation memberships. Both actual
Country and State Region source binding rosters contain a hidden list UUID
membership and an unplaced detail UUID membership. Tests retain every field and
field identity, remove precisely those two presentation memberships, and restore
the entire selected source graph with its exact original array order and optional
coordinates. The inverse uses an immutable historical copy even if the caller
mutates its original input after admission.

The installed-adapter coordinator binds the disposition in conversion proof
version 4 and verifies the exact source identities/hash and candidate inventory.
Negative cases cover forged hashes, non-UUID fields, declared section/summary
use, visible list membership, external binding references, additional display
behavior, duplicate dispositions and unexplained deletion. A synthetic full
coordinator/scalar-layout case exercises the version-4 proof path. This is not a
whole Country/State Region source conversion or canonical database receipt.

Application remains disabled. Complete normalized authorization/AI/presentation
integration, atomic source-format conversion, whole-release lowering and
canonical/deployed qualification still require implementation and evidence. No
DEV migration, member deletion, grant, initialization, release or activation was
performed by this checkpoint.

Validation for this checkpoint: 596 authoring tests pass across 106 executed files,
with three existing opt-in PostgreSQL cases excluded from the ordinary run.
Source/test and focused native-test typechecks pass; all six generated-contract
checks pass. No new skip or disabled assertion was introduced.

### Sparse ordering and native AI reconciliation checkpoint — 7 October 2026

The shared scalar layout adapter now offers explicit `dense-siblings` conversion
for sparse source positions. Actual Country and State Region list-coordinate
fixtures preserve numeric order, normalize to consecutive one-based positions,
and reconstruct original slots exactly, including an edited order. Independent
nullable section scopes remain independent. Missing convention, duplicate slots,
changed scopes, incomplete rosters and invalid native ordinals reject. This is
selected coordinate coverage, not a whole-source conversion receipt.

`prepareNativeAiSave` prepares the five AI table families inside the existing
native authoring transaction. It requires a scoped editable native 2.5 root and
its installed schema guard, checks local references and reads bounded exact
entity/tenant/draft rows. Plans use the existing shared reconciliation writer;
they do not initialize protected operation state. Existing learning provenance
is preserved on echo; attempted changes or unauthoritative candidate inserts
reject. No new command endpoint or alternate repository is introduced.

The explicitly enabled disposable PostgreSQL rehearsal passed using generated
AI DDL and the real shared writer. It verifies attribution preservation,
deferrable order swaps, rollback after a later foreign-key failure, wrong-draft
write rejection and protection of retained incoming dependents. Its prerequisite
tables/guard are synthetic and its transaction covers AI members, not complete
source-format conversion, revision/idempotency or release compilation.

Ordinary authoring regression: 607 passed across 108 executed files; four opt-in
PostgreSQL cases excluded, including this separately executed passing rehearsal.
Source/test and focused native-test typechecks, the 13-task bounded dependency
build and all six generation checks pass. No assertion was suppressed. The new
ordinary tests and explicitly enabled SQL
rehearsal are enrolled in foundation CI. Whole-source mappings, canonical atomic
application, whole-release lowering, approved host/product-write authority and
deployed F6/F8/F9 qualification remain incomplete. No DEV migration, grant,
initialization, publication or activation occurred.

### Expanded native resources and joint reconciliation checkpoint — 7 October 2026

The shared native 2.5 coordinator now binds the original graph, installed
supplemental resource/dependency inventory and context hashes to an exact final
inverse. The production combined adapter consumes selected existing read
operations, authorization/runtime declarations and AI declarations. Both actual
Country and State Region declarations pass selected resource round trips;
current typed AI edits affect the inverse. Undefined permission remains explicit
none/null, while contradictory defined permission enrollment rejects. Source
mutation, missing identities/resources, unsupported properties, unrelated member
injection, malformed output and dangling target references reject.

These component fixtures independently supply synthetic resource, label,
operation, field and relationship rosters. They do not prove a whole actual
reference graph. In particular State Region's structural relation enrollment is
still missing; synthetic AI relation IDs cannot attest it. The 2.5 orchestration
fixture is synthetic and exercises the preservation coordinator over the existing
core/layout proof. Neither fixture establishes deployed authority.

Native operation plans update only descriptor-selected columns of existing
identities. New identities and service-owned preflight changes reject. The joint
operation/AI preparation path shares the exact native draft lock/schema guard,
finite combined stored-row budget and bigint decimal-string encoding. The actual
disposable PostgreSQL 16 rehearsal uses generated AI DDL and the existing shared
writer: operation and AI edits commit together, preserve creation attribution and
unmapped controls, and both roll back after a later AI foreign-key failure.
Prerequisite operation domains, guard and tables remain synthetic. This rehearsal
does not prove the canonical schema, format transition, revision/idempotency,
historical conversion or application-role product-write authority.

Validation: ordinary authoring suite 622 passed across 111 files; four existing
opt-in PostgreSQL cases remain outside the ordinary run. The expanded joint SQL
rehearsal passed separately with
`ATHYPER_NATIVE_AI_RECONCILIATION_POSTGRES=1 pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/native-ai-reconciliation.postgres.test.ts`.
Source/test and focused native-test typechecks, all six generation drift checks
and the 13-task bounded foundation build pass. New tests are enrolled in foundation
CI; no failing assertion was disabled.

Remaining engineering: localization/badges/reference-capability/structural
relations and complete Country/State source coverage, canonical whole-format
atomic application and cross-format history, native whole-release compilation.
The existing publication rejection and cutover guards remain enforced. Approved
host/initializer/product-write evidence and deployed F6/F8/F9 remain unavailable.
No DEV migration, grant, protected-state initialization, publication or activation
occurred. This checkpoint is partial implementation evidence, not full request
completion or a gate-pass receipt.

### Source-bound relations, runtime capability and archival reads — 7 October 2026

The shared reference-relation adapter now consumes explicit legacy key-reference
semantics and independently supplied canonical identities/remote-key evidence.
Its derived relation, target and ordered field rows are source-hash-bound and
read-only. The outer coordinator/composition binds those additions in conversion
proof version 5; existing relation rows remain exact, and absent root relation
arrays are restored on inverse. Changed targets, duplicate/extra members,
incomplete mappings, stale source hashes, changed controls and uninstalled
resources reject. Nested resource/dependency/derivation pins are captured before
adapter callbacks execute; a callback-mutation regression protects proof provenance.
Label-field selection comes from an independently admitted
projection, not a replayed key-reference blob.

Actual Country and State Region declarations pass selected relation conversion
and inverse fixtures. Combined operation/authorization/AI component tests now
include the source-derived canonical relation rows and verify final supplemental
reference integrity; removal of a required State Region relation rejects. Target
entity/key/label identities and resources in these tests remain synthetic. They
do not attest published remote keys, F9 lineage, a complete native core/layout
graph, canonical SQL application or live-read authority.

The surface capability-marker adapter verifies one explicit runtime identity and
an exact installed resource pin. The scalar runtime mapping requires a registered
reference contract and writes only the existing typed capability key/version
projection. Both actual references round-trip their selected marker. Missing or
ambiguous registration, wrong runtime/version and altered source reject. This is
not a permission grant or host initialization.

Installed native host policy may explicitly declare historical snapshot versions
separately from active source versions. Tests verify admitted same-descriptor
2.4 history on a 2.5 root without DML, and rejection when archival admission,
source coordinates or descriptor hash disagree. Current authorization and schema
qualification still precede history reads. Older 2.3 decoding, descriptor-version
migration and restore/application are not implemented by this change.

Validation: 635 authoring tests pass across 113 files; four existing opt-in SQL
cases remain outside the ordinary run. Source/test and focused native-test
checks, the six generation drift checks and the 13-task bounded build pass.
The new ordinary tests are enrolled in foundation CI. No assertion was disabled.

Remaining: localization/badge mappings and full reference-source integration,
canonical 2.3-to-native atomic conversion with original/new immutable history and
revision/idempotency/readback evidence, and native whole-release compilation.
No canonical conversion transaction or release compiler is claimed by these
component proofs. Cutover/publication guards remain enforced; no DEV migration,
grant, protected-state initialization, publication or activation occurred.

### Localization/badge source accounting — 7 October 2026

Selected localization conversion resolves explicit entity/surface/field/choice
owner IDs into scoped owned labels and translations. Minimal declarations and
full translation projections round-trip without dropping text or changing
locales. The root label owner is read from the proposed change-set FK only for
native snapshots; a present unresolved or cross-scope owner rejects in current
and historical reads. There is no root-owner write command or installed-schema
claim in this checkpoint.

Selected badges become explicit typed badge bindings plus field-choice tones.
Plain enum representation is mandatory; masked/omitted fields, unrepresented
options, changed target rows and stale declaration hashes reject. Field bindings
remain separate. Scalar position conversion now respects the independently
admitted binding kind, matching the native sibling-order contract.

The existing graph coordinator/composition records badge derivations in proof
version 6 and root-label derivation in version 7. These are source-bound
append-only admissions, not arbitrary member additions or entity descriptor
rewrites. Resource metadata is captured before conversion callbacks run.

Country and State Region selected localization/choices/badge paths compose and
reconstruct their original source through the same implementation. Supplied
fixture binding IDs and all host/storage/security/resource contexts are
synthetic; this does not attest historical contributor reconstruction or full
reference-source conversion. The coordinator regression also uses synthetic
family adapters and is evidence of orchestration checks only.

Remaining engineering: complete whole-source integration, canonical 2.3-to-native
atomic application with original/new immutable history, revision/replay/rollback
and exact readback, and native whole-release compiler/reader evidence. Root-owner
DDL and native guards must be included in the reviewed conversion manifest.
No database migration/application, product-write grant, protected-state
initialization, publication or activation occurred.

Validation: 650 authoring tests pass across 116 files; four existing opt-in SQL
cases are skipped by the ordinary run. Source/test and focused native-test
typechecks, all six existing generated-contract checks and the 13-task bounded
build pass. New tests are enrolled in foundation CI. No canonical conversion SQL
qualification or native whole-release compiler test is claimed by this result.

### Canonical application/history protocol and compiler control preservation — 7 October 2026

The existing authoring repository now owns the gated conversion transaction and
original-2.3-checkpoint reader. Installed policy supplies schema/authority
qualification, actual whole-source adapters and compiler/reader implementations;
requests cannot replace those ports. Absent installed policy rejects. Canonical
plans validate typed core/layout/reference rows, exact source member inventories,
retained structural branches and enrolled field identities. They preserve member
IDs and creation attribution, prohibit catalogue initialization/remapping, and
allow only explicitly proven binding retirements. Physically present legacy
columns can become NULL only after the qualifier attests retired constraints and
nullable schema; discovery alone cannot qualify that constraint cluster.

The existing revision function advances once before member writes, establishing
its transaction-local write token. Original history, typed DML, marker/root label,
exact repository readback, compiler/reader checks, new immutable history and
receipt share one transaction/savepoint. The receipt records both graph hashes,
compiled/descriptor hashes and compiler identity/version. Replay rechecks current
admission and immutable history without DML. Original history reads use current
reader admission and the exact conversion receipt/proof, and never restore
platform controls or grant live-read authority.

The owner explicitly approved compiler preservation only in this session. The
new compiler operation reader requires exact native coordinates, revision,
descriptor and whole-operation membership, reads stored protected values and
checks the artifact retains them. Both true and false values are preserved;
missing evidence, changed values and client inputs reject. No initialization,
new MFA requirement, enforcement change or historical repair is authorized.

Protocol tests use the actual repository savepoint, canonical planner and shared
writer, with synthetic SQL transport, source/native loaders, qualification,
adapters, compiler and reader. They cover rollback of member writes/root/history/
receipts, compiler/reader failure, readback mismatch, stale source/revision,
replay after later edits, revoked admission and historical tampering. Planner
fixtures cover attribution, inventories, retained branches, legacy NOT NULL
coupling, budgets and typed-row rejection. These fixtures do not qualify actual
Country/State Region whole-source conversion or canonical PostgreSQL deployment.

Remaining: whole-source adapter installation/integration, canonical schema and
constraint qualification, complete native release lowering and reader evidence,
approved host/product-write authority and deployed F6/F8/F9. No DEV migration,
conversion application, grant, publication or activation occurred.

Validation: 669 authoring tests pass across 119 files; four existing opt-in SQL
cases remain skipped. Source/test and focused native-test typechecks, all six
generated-contract checks and the 13-task bounded build pass. The new protocol,
planner and operation-compilation tests are enrolled in foundation CI. This is
local reproducible evidence, not a remote CI or deployed qualification receipt.

### Native reference producer and shared reader composition — 7 October 2026

The native release producer composes typed structural, authorization, identity,
list settings/views, navigation, field sections, choices, badges, localization and
optional AI outputs. It does not invoke the legacy graph compiler or consume
captured legacy presentation. The selected variant requires stored read-only
column fields, one default list and one default detail surface. Unsupported
families and unrepresentable properties return named diagnostics. Contract
assertions and class profiles currently reject when nonempty; they are not
silently dropped or declared tested. Typed field-access projections must agree
with the independently installed context. Surface/section translations are
projected from their exact owned-label FKs.

`createNativeConversionApplicationPolicy` connects the existing whole-source
conversion coordinator and repository transaction protocol to the real native
producer and existing shared native runtime projection/parser. It rechecks exact
source coordinates, schema/resource context hashes, registered storage and
technical identity. Consumer and independently registered storage planes remain
distinct; mismatched storage evidence rejects. Presentation-default substitution rejects. Installed host
ports still supply independently qualified adapters, catalogue/security/provider
resources and authorization; this factory neither installs them nor grants
product-write authority. Default repository cutover remains blocked.

Eight new tests use a complete synthetic graph for this bounded compiler
variant. They exercise actual compiler and runtime-reader integration, explicit
readable identity/navigation, valid undefined permissions, stored protected-state
preservation, resource changes, reader identity mismatch, unsupported properties
and translation preservation. They do not prove complete conversion of the
actual Country/State Region source graphs or canonical SQL application.

Read-only DEV inspection command:

```sh
node tooling/scripts/verification/inspect-entity-studio-foundation.mjs --output /tmp/athyper-native-release-readiness.json
```

It reports no missing inventoried reference/core-layout/selected member columns,
32 AI column mismatches and 14 missing operation columns. Both native schema
guards remain absent. Qualification is not established; productionEnabled is
false. These counts are catalogue diagnostics, not evidence of write authority,
constraint correctness or migration approval. No database migration, conversion
application, protected-state initialization, grant, publication or activation
occurred.

Remaining: complete actual whole-source adapter integration, canonical schema/
constraint qualification and positive SQL conversion/readback/history evidence,
approved host/product-write authority and deployed F6/F8/F9. Compiler preservation
uses the existing specific owner approval; no initializer or MFA enforcement
change is introduced.

Validation: 677 authoring tests pass across 120 files; four existing opt-in SQL
cases remain skipped. Source/test and focused native-test typechecks, six
generated-contract checks and the 15-task bounded build pass. The new test is
enrolled in foundation CI. This is local evidence; remote CI and deployed
qualification are not attested.

The unchanged shared metadata suite also passes: 194 tests, with two existing opt-in cases skipped.

### Reference-binding integration and deployed schema preparation — 7 October 2026

The native compiler now preserves the existing typed reference-binding family.
Each binding must select an exact native field whose compiled reference was
resolved through the admitted relation/target-key context. Closed-property,
identity, membership and target checks reject mismatch. Unsupported lookup,
resolver and deprecated variants reject. Canonical relation references without
legacy binding rows project through the existing shared reader contract. Actual
Country/State Region source fixtures cover this family; they do not constitute
whole-source conversion proof. State Region's explicit Details navigation is a
source metadata proposal only; it has not been published or activated.

Rollback rehearsal against the actual DEV schema found missing composite-FK
anchors in generated AI DDL. Canonical generation now installs scoped unique
anchors on entity_search_profile and entity_relation. The disposable PostgreSQL
AI test starts those anchors without scoped uniqueness, proving the generator
supplies it and still rejects cross-draft references and invalid provenance.

The immutable forward migration 20261007_entity_native_resource_preparation.sql
was rehearsed with rollback, then applied to athyper_studio through the bounded
installer. Checksum:

```text
9ddaf1fd7edc0749559be10d3de6e64c0df8c2568cf0996e0fcb73afe1d3a474
```

It installs five forced-RLS AI tables and 14 dormant operation columns. Existing
authoring/history rows are compared on their exact original columns inside the
transaction. Authorization and activation-head hashes remain unchanged. The
migration ledger is written within the same application transaction; checksum
mismatch/repeated conflicting ledger entries reject. Replay recognizes only the
exact applied checksum. No existing applied migration was modified.

Commands and receipts:

```sh
node --test tooling/scripts/verification/apply-entity-native-resource-preparation.test.mjs
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --output /tmp/athyper-native-resource-preparation-dry-run.json
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-native-resource-preparation-applied.json
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-native-resource-preparation-replay.json
node tooling/scripts/verification/inspect-entity-studio-foundation.mjs --output /tmp/athyper-native-conversion-readiness-after.json
```

Reinspection: zero missing AI/operation columns; both native guards remain absent.
The four consumed native root columns are missing. There are 54 change sets and
zero owned-label-scoped change sets. All five AI tables have forced RLS; the
runtime role has no INSERT privilege on them. These are deployed schema facts,
not product-write or F6/F8/F9 qualification. Native conversion cannot apply to an
unqualified source by inventing ownership, labels, schema pins or legacy history.

Remaining: qualified source enrollment/provenance and whole-source adapters for
actual Country/State Region; canonical root/constraint cutover and positive
atomic conversion/readback/history/compiler evidence; approved host/product-write
resources and deployed F6/F8/F9. No authoring graph conversion, grants, MFA
initialization/enforcement changes, publication or activation occurred.

Validation: 683 authoring tests and 37 contract tests pass; four authoring and two
contract opt-in SQL cases remain skipped in ordinary runs. The explicit generated
AI PostgreSQL test passes. Installer SQL tests (3) and schema inspector tests (8)
pass, as do source/test and focused native typechecks, six generation checks,
migration-layout verification and the bounded build. Detailed local artifacts
are evidence of the stated checks only, not remote CI or live-read approval.

The added actual-reader relation fixtures exposed an invalid targetKey property
in the producer's keyReference object. The producer now emits the existing closed
key-reference wire shape and keeps the governed key in the relational projection.
Both retained-binding and canonical-relation variants pass the actual reader.
Source evidence was regenerated after the explicit State Region navigation edit.

The broader test-reachability check remains red for four existing runner omissions:
two platform entity-runtime contract tests have no package test script; the
platform-catalogue and publication-token tests lack root runners. None of the
new tests appears in that failure list. This checkpoint does not attest aggregate
workspace/remote CI success or modify those unrelated runner configurations.

### Native root preparation checkpoint — 7 October 2026

The typed closed `native-root-contract.ts` covers twelve enrollment properties
and explicit root/tenant/baseline coordinates. It distinguishes native format
version from descriptor schema version; rejects missing ownership/schema pins,
unknown properties, cross-scope ownership, missing extension baseline and
incomplete/duplicate locales. Shape acceptance does not authorize enrollment or
prove registered descriptors, same-owner baselines, labels or publication review.
The generator is enrolled in foundation generation/drift checks.

`20261007_entity_native_root_preparation.sql` adds ten nullable dormant columns
and a pending check. Existing roots and immutable history are compared on exact
original columns in the same transaction. DEV rollback rehearsal, application
and exact-checksum replay passed; authorization/activation heads are unchanged.
No existing applied migration was edited. Immutable applied SHA-256:

```text
3525ecc3c5c79844eaa07d35b159bb240adc7295d0311776bea88adcbee045f4
```

```sh
ATHYPER_NATIVE_ROOT_POSTGRES=1 pnpm --filter @athyper/server-contract-meta-entity-authoring exec vitest run src/native-root.postgres.test.ts
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --root --output /tmp/athyper-native-root-dry-run.json
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --root --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-native-root-applied.json
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --root --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-native-root-replay.json
```

The disposable canonical-base PostgreSQL test proves retained root tuples,
existing revision constraints and rejection of every dormant property write.
Fifteen root validation tests and four installer tests pass. All 52 contract
tests and 683 authoring tests pass; opt-in SQL tests remain separate. Contract
and authoring typechecks, contract build, seven generation checks and migration
layout verification pass. This supersedes the
previous missing-root-column observation; the absent guards, 54 unenrolled roots
and zero owned-label-scoped sources remain unresolved. Actual whole-source
Country/State Region enrollment/conversion, positive canonical atomic history
and compiler evidence, host/product-write approvals and deployed F6/F8/F9 still
require completion. No source graph, control initializer, grant, publication or
activation was applied.

### Whole-source enrollment preparation — 7 October 2026

Implemented the shared 2.1/2.2-to-2.3 legacy-source enrollment adapter and connected
it to a read-only proposal method in the existing Kysely authoring repository.
The adapter preserves every original property/member identity and reconstructs
the exact source hash from the candidate. Labels must cover every explicit
localized reference without changing fallback text or prior 2.2 localization.
The identity inventory must cover all source fields with exact owner/tenant,
non-retired status and consistent reservation provenance. No identity is allocated
by the adapter; supplied records are preparation inputs, not evidence that they
exist in PostgreSQL.

Actual Country and State Region definitions pass across Studio, Neon and Mesh
through the same implementation. Identity/provenance records in these fixtures
are synthetic. These prove whole-source retention at enrollment, not whole-source
native lowering, approved publication or installed security/storage resources.

The repository proposal uses current installed host read admission and an exact
scoped root lock. Stale revisions/hash, prior native/reference enrollment and
resolver coordinates reject. Client requests cannot supply labels, identities or
authority callbacks. Protocol tests verify revocation, stale revisions and
resolver mismatch; all SQL in the positive protocol is SELECT. The method is not
registered as a new API endpoint and writes no rows or historical snapshots.

Seven enrollment/protocol tests pass; the full authoring suite passes 690 tests
with four existing opt-in SQL skips. Source/test typechecks and foundation drift
checks pass. DEV remains at dormant schema preparation:
54 roots lack owned-label enrollment and neither native guard is installed. No
source enrollment/application, grant, control initialization, host approval or
F6/F8/F9 qualification was applied in this checkpoint. Remaining engineering is
native whole-source mapping/installation and positive canonical atomic history/
compiler qualification; independently approved host/product-write and deployed
storage/security evidence remain necessary for live deployment.

### Atomic legacy enrollment and root revision correction — 7 October 2026

`executeLegacyEnrollment` uses the existing repository transaction/savepoint and
shared readback. Its application requires current installed write admission and
independent source/schema authority. It adopts already canonical labels and bound
field identities only; it rejects missing/mismatched records or unrepresented
reference members. It allocates no records and changes no operation controls.
Original source history is captured unchanged; one revision advance, marker,
reference validation, exact loaded target, target snapshot and receipt commit or
roll back together. Replays recheck authority, receipt/hash identities, both
immutable snapshots and the enrollment proof without repeating writes.

Testing with real canonical legacy tables/root/member/receipt/history guards
found the existing root trigger advanced again during marker updates. The shared
root correction permits narrowly declared format/locale patches within the
already advanced command. Substantive/status/ownership/attribution changes keep
the existing advance and review rules. A caller-set GUC alone cannot establish
that protocol: the helper verifies the visible tuple's in-progress transaction
(including savepoint subtransactions) and same-transaction audit timestamp.
Transaction-ID epoch reconstruction accounts for adjacent wraparound IDs.
Unknown installed guard/helper bodies block correction for manual inspection.

Two immutable forward migrations were rehearsed, applied and replayed in DEV:

```text
20261007_entity_root_revision_protocol.sql
cf2b6c9227f37f5137ee44f4ae93facc6e8bcf9e206b451b50987771f5053cf9
20261007_entity_root_revision_provenance.sql
0b23a7d212f3de6af550d90b53969d7a877516543f175197bdd6d835a72d7c6e
```

The second strengthens transaction provenance; it does not rewrite the first.
Both compare original root/member/history rows within the application transaction
and preserve authorization/activation-head hashes. No grants, authoring source
allocation/enrollment, protected-state initialization, publication or activation
occurred in DEV. The original 20261002 ancestry migration remains unchanged.

```sh
ATHYPER_LEGACY_ENROLLMENT_POSTGRES=1 pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/legacy-enrollment.postgres.test.ts
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --revision --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-root-revision-applied.json
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --revision-provenance --apply=DEV-NATIVE-RESOURCE-PREPARATION --output /tmp/athyper-root-provenance-applied.json
```

The PostgreSQL test verifies exact legacy 2.2-to-2.3 source retention, actual loader
readback, unchanged members, immutable history, replay, revocation/conflict,
forged-token rejection and rollback after a late saved-snapshot rejection. It
uses synthetic UUID bootstrap, compatibility root coordinates and host authority
under a disposable superuser; it does not qualify native schema cutover, actual
Country/State Region graph conversion, product-role writes or deployed F6/F8/F9.
The test is enrolled in the existing CI PostgreSQL job. Ordinary admission and
savepoint tests also reject absent host authority without member DML.

DEV still has 54 roots without owned-label scope and no native guards. Source
ownership/descriptor enrollment, native whole-source mappings/application and
host/product-write/live qualification remain unfinished. The native pending
constraints remain in place. The complete ordinary authoring suite passes 694
tests with five opt-in SQL skips; the explicit enrollment PostgreSQL test passes.

### Whole product-definition conversion and native reader integration — 7 October 2026

The shared whole-source resolver now constructs the existing production adapters
against an exact 2.3 saved-source shape, with closed typed stage selection and
independent host-supplied resource/identity projections. It rejects stale source,
unknown/duplicate stages, byte-budget overflow, missing pins and unsupported
source declarations. Its result is returned only after the expanded coordinator
proves every original path reconstructs from the final native 2.5 graph. The
application-policy factory connects this resolver to the existing repository
conversion, native compiler and runtime reader; it installs no host or authority.

Actual Country and State Region product definitions pass this same implementation
for each declared Studio, Neon and Mesh target. Fixture saved-member IDs, labels,
stable identities, catalogue, components, provider and security/resource records
are synthetic. Missing product-compiler member IDs and empty root sections are
represented as explicit synthetic repository-save enrollment; no source property
is removed to obtain a passing conversion. The proof preserves every enrolled
member ID except the separately source-bound redundant UUID presentation
memberships; UUID fields and immutable original-source reconstruction survive.

Integration fixes:

- Expanded inverse reconstruction begins at the normalized nested boundary.
- Inline sections validate their exact field roster independently of later
  accounted badge membership; changing a field binding to a badge still rejects.
- Repeated binding labels may map to NULL overrides only through independently
  admitted equal field-label metadata; source presence/absence reconstructs.
- Explicit empty actions round-trip; nonempty actions remain unsupported.
- The common-reference check recognizes the pinned native runtime representation,
  retaining legacy enrollment by default and every existing public/read-only,
  exact-permission and tenant-scope restriction. Mixed enrollment/version drift
  reject; no permission or protected-state requirement is added or initialized.

Tests include all six entity/plane compiler-reader cases, negative source/pin/
stage/action cases, shared-adapter regressions and the existing application-policy
composition with an independently failing authority port. The production converter
contains no entity names, grants or publication/activation path.

DEV inspection at `/tmp/athyper-whole-source-dev-inspection.json` remains
`qualification=not-established`, `productionEnabled=false`: 54 roots, zero
owned-label-enrolled scopes, both native guards absent. This continuation changes
no deployed data or schema. Actual governed source enrollment, canonical native
constraint/application/history proof, approved product-write/host resources and
deployed F6/F8/F9 evidence remain outstanding. Local fixture proof does not attest
those gates or lock the full blueprint.

Verification: 705 authoring tests pass (five opt-in SQL cases excluded); 129
metadata-contract tests pass; 194 shared metadata-reader tests pass (two existing
opt-in cases excluded). Production/test and focused native-test typechecks pass,
as do generated contract drift checks. The six source/plane fixtures and shared
adapter regressions are enrolled in foundation CI. These are local conversion,
compiler and reader evidence; no new canonical PostgreSQL-native or deployed
qualification receipt is asserted.

### Canonical schema admission and DEV compatibility nullability — 7 October 2026

`native-schema-qualification.ts` provides a production catalogue inspection and
installed-policy wrapper for the existing atomic converter. The finite physical
scope comes from the reference manifest, existing graph-storage families, AI
contracts, command receipts and immutable save table. It captures actual column
nullability/defaults, domains, all table constraints/indexes, trigger bodies,
policies, owner/ACL and both native guard definitions. The reviewed fingerprint
must be independently supplied; capture is not approval. The actual transaction
role must match the selected non-admin application role. Relation locks and
reinspection precede the original host/storage/authority qualifier, which remains
required on application and replay. The wrapper is not installed by default.

The read-only command is:

```sh
pnpm exec tsx tooling/scripts/verification/inspect-native-authoring-schema.mts --output /tmp/native-schema-inspection.json
```

Its output is explicitly `qualification=not-established`, `productionEnabled=false`.
A superuser probe can prepare a physical-schema review candidate but cannot
qualify a product-writing transaction. Captured role evidence is not an ownership,
publication, storage-authority or effective-security receipt.

DEV initially had 15 structural blockers: seven native-pending constraints,
two absent native snapshot/contract guards and six retired legacy NOT NULL
columns. The immutable forward migration
`20261007_entity_native_legacy_nullability_preparation.sql` has SHA-256
`8d47d91d041cba9dc40ca6e7797a7fcc55236b7513b5758ef103a89f1a7844f0`.
It installs four legacy-presence CHECKs before relaxing the six columns, while
requiring and retaining all seven native-pending guards. It does not remove the
legacy computation/default/type-config constraint cluster, initialize ownership
or protected state, grant authority or enable native values.

Rollback rehearsal and DEV application compare all original metadata/snapshot
rows; every original row remains exact. The existing runner independently checks
unchanged authorization and activation-head fingerprints. Full database backup,
application receipt, replay receipt and schema inspection are retained at:
`~/.athyper/instances/dev/workspace/native-nullability-20261007T001237Z/`.
The applied ledger retains the exact migration hash; repeat application is a no-op.

The rollback-only probe command is:

```sh
node tooling/scripts/verification/verify-native-nullability-preparation.mjs /tmp/native-nullability-rehearsal.json
```

It runs before or after this exact applied migration. Four temporary copies of
canonical field/surface/section/operation rows accept unchanged legacy data; six
attempted legacy NULL mutations reject through the new CHECKs, and four attempted
native label mutations reject through the retained pending guards. Temporary
copies omit production triggers so these tests isolate constraint semantics;
this is not product application-role authority or native transaction/history
qualification. Production member rows are never modified by the probes.

The original post-preparation inspector reported nine blockers, but missed the
retired binding display_config NOT NULL column. The shared retired-column
inventory correction below exposed ten blockers before the follow-up migration. Existing Country
and State Region product drafts remain unenrolled; no authoring conversion,
host approval/publication or native activation occurred. Remaining schema guard
and per-constraint cutover work is engineering, while reviewed host/authority
resources and F6/F8/F9 evidence remain independent owner/deployment prerequisites.
Neither class is reported as completed by this checkpoint.

Verification for this checkpoint: 729 authoring tests pass with five opt-in SQL
cases excluded; six DEV preparation-runner tests pass. Production/test and focused
native-test typechecks, generated-contract checks and changed-file formatting
checks pass. DEV rollback-only constraint probes pass separately before and after
application. These proofs do not establish native whole-graph transaction/history
or deployed F6/F8/F9 qualification.

### Native typed-row validation and binding preparation — 7 October 2026

The canonical conversion writer and schema inspector use the same
`nativeRetiredColumns` contract. Every retired column has a negative admission
test, including the previously missed binding display_config. Inspection also
fingerprints the new typed-row function body, owner and ACL.

`33_native_typed_row_guards.generated.sql` derives structural validation from the
core/layout/operation descriptors: requiredness cannot pass through SQL UNKNOWN;
arrays enforce item constraints, dimensionality and lower bounds; member and
reference ownership includes draft/entity/tenant; field identities must be
active or reserved by the same draft; retired columns remain NULL. Unsupported
node representations reject generation. This is an invoker component, not the
complete-contract guard, resource validator or deferred final-state protocol.

`34_binding_nullability_preparation.sql` preserves legacy display_config presence
with a CHECK before dropping its NOT NULL constraint. Binding kind remains NULL
under the retained native-pending guard, so this does not enable native writes.
The forward migration `20261007_entity_native_typed_row_preparation.sql` has hash
`a56e79e3fc4353b8a704a9bbadd7ca04abe45ec009b8a9119ac87fd0a04a97f3`. It preserves
all original metadata/snapshot rows; the runner additionally compares authz and
activation-head fingerprints. DEV backup, rollback rehearsal, application and
no-op replay receipts are retained at:
`~/.athyper/instances/dev/workspace/native-row-guards-20261007T053345Z/`.

The actual post-application schema fingerprint is
`a79995a4001e9386f0c05dcbd5626515fa7a02e1058167c0e12869b137fa05af`.
It is an inspection candidate, not an independently approved installed hash.
There are nine remaining blockers: seven pending constraints and two absent
complete-contract guards. No Country/State Region draft was enrolled or converted.
No host/product-write approval, activation or deployed F6/F8/F9 was established.

Verification distinguishes three layers:

- Generated component tests use PostgreSQL with synthetic typed tables and
  resources. They verify required/null values, physical array constraints,
  cross-owner references, retired columns and version rejection. CI runs them
  with `ATHYPER_NATIVE_ROW_GUARDS_POSTGRES=1`. They do not attest canonical RLS.
- The DEV migration compares original rows and exact applied hashes. Seven
  preparation-runner tests verify migration selection and protection behavior.
- `node tooling/scripts/verification/verify-native-typed-row-preparation.mjs
/tmp/native-row-probes.json` is rollback-only. A temporary canonical binding
  copy accepts the original legacy row, rejects legacy NULL and native pending
  mutations, and the installed component rejects legacy markers and unknown
  versions. These are negative admission proofs, not positive native application.

Remaining cutover engineering includes computation/version-field constraint
replacement, native section vocabulary/order uniqueness, full root/source and
final graph validation, deferred enforcement and positive canonical repository
conversion/history/compiler/reader evidence. Existing projected-write checks
should remain unless a specific failing native fixture demonstrates otherwise.
Host/authority and deployed live-read evidence remain separate prerequisites.

Validation for this change: 749 authoring tests pass (five opt-in SQL cases
excluded), 54 contract tests pass (four opt-in cases excluded), all three
selected row-guard tests pass with PostgreSQL enabled, and seven preparation
runner tests pass. Authoring production/test/native-test typechecks, contract
typechecks and generated-contract drift checks pass. DEV rollback-only probes
pass against the applied migration. These counts do not attest live-read gates.

### Constraint compatibility and deferred layout integrity — 7 October 2026

Applied DEV migration: `20261007_entity_native_constraint_compatibility.sql`;
SHA-256: `77998c030b064d7532734f561614f7b30e9606c094c304012324d894dc6d722e`.
It compares the five exact predecessor constraint definitions, requires all seven
pending checks, and compares every original metadata/snapshot table before and
after. The existing runner also verifies authorization and activation heads.
Backup, rollback rehearsal, application, no-op replay and schema receipts:
`~/.athyper/instances/dev/workspace/native-compatibility-20261007T061056Z/`.
The resulting inspection fingerprint is
`63e8b659a022ad9a093fee948b1f86f7cc724be64f733324c357a9612dcde175`; it is not
independently approved installed evidence.

| Constraint                                            | Implemented disposition                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field computation                                     | Replace with legacy/native branches; preserve legacy computed JSON behavior; native computed fields are read-only and use consistent typed key/version pairs; missing P selections allowed in drafts |
| Runtime version field                                 | Replace with legacy-key/native-ID branches; reject mixed representations and irrelevant native version IDs                                                                                           |
| Projected-write, storage, default/type-config cluster | Retain; selected projected-write negative probe remains enforced                                                                                                                                     |
| Section kind                                          | Extend domain with subsection and add representation-specific legacy/native membership CHECK                                                                                                         |
| Section positions                                     | Add navigation scope; deferred companion trigger preserves narrower legacy ordering                                                                                                                  |
| Binding positions                                     | Include binding kind and overlay owner; NULL legacy values preserve the old uniqueness scope                                                                                                         |
| Seven pending cutover checks                          | Retain unchanged                                                                                                                                                                                     |

The new invoker layout validator checks relational shape, cyclic/cross-navigation
parents, mixed children, binding surface/field ownership, span, token, form/input
variants, filter shape and dense order. Deferred triggers cover changes to all
six relevant anchor/member tables. The schema inspector includes the validator
body and trigger definitions. This does not assert complete root/core/security/AI
validation or installed catalogue/component compatibility. The whole-graph
admission functions remain absent; the nine coarse admission blockers remain.

`native-constraint-compatibility.postgres.test.ts` loads canonical domains, base
tables and native columns into disposable PostgreSQL. Only that fixture removes
pending checks to test prospective native values; its navigation anchor and
authority are synthetic, and canonical RLS/full repository enrollment are not
claimed. It proves legacy computed/version behavior, consistent incomplete native
values, legacy/native order scopes, native subsection selection, cross-owner/cycle
rejection, late invalid writes after explicit validation, SET CONSTRAINTS,
intermediate repair and savepoint rollback. CI explicitly enables this test with
`ATHYPER_NATIVE_CONSTRAINT_POSTGRES=1`.

The shared writer recognizes navigation/surface/overlay/binding-kind moves as
order mutations and includes the legacy companion guard when installed, retaining
compatibility with older schemas. Targeted tests pass: 55 tests including the
PostgreSQL case; eight DEV preparation-runner tests. The full authoring suite
passes 751 tests with six opt-in SQL cases excluded; production/test/native-test
typechecks pass. DEV migration checks separately prove original-row preservation.

No Country/State Region draft was enrolled or converted, and no native positive
repository/history qualification, approved host/product-write grant or deployed
F6/F8/F9 evidence is claimed. Remaining engineering: complete root/core and
retained-graph final validation, guarded source transition, removal of pending
checks only after positive canonical whole-source conversion/compiler/reader
proof, and callback/performance qualification. Owner review and installed resource
evidence remain necessary for actual product-writing/deployed qualification.

### Root/core guards and retained predicate types — 7 October 2026

Applied DEV migration: `20261007_entity_native_core_root_guards.sql`. SHA-256:
`8912bd7a2cae63dd7c14985582bb17d3e33b26415cce478ccfa34f5af63fdaf8`.
Canonical DDL: 37 (core graph), 38 (root pins/transitions), 39 (retained predicate
type compatibility). All seven pending checks remain in force. Original
metadata/snapshot rows and authorization/activation fingerprints remain equal.
Backup, rollback rehearsal, application, replay and schema evidence are at:
`~/.athyper/instances/dev/workspace/native-core-root-20261007T084228Z/`.

Schema inspection fingerprint:
`fb9b7dcdebaf7f3fba98de0a1b48266957d533f432a82ce12a7f176c73ef04c0`.
It includes root/core/reference helper definitions, not just their trigger
wrappers; it is not an independently approved installation fingerprint.

Core validation covers field identities/parents/cycles, duplicate identity use,
currency references, property-family applicability, ranges/defaults, contract
pairs, runtime modes and surface settings. Special numeric values, BC dates and
out-of-range ISO dates reject. Identity catalogue changes revalidate native
consumers under root locks. Required publication selections remain P checks; a
consistent incomplete money draft remains saveable. Typed-row validation and
independently resolved resource validation still have their separate roles.

Root validation requires the exact descriptor/version, supported scope, reference
version/locales and owned root label. Ordinary edits cannot clear or replace
existing native/version/source pins. New native roots cannot bypass conversion
by inserting a native marker. Existing revision and provenance guards remain.
Deferred label/root callbacks catch root-label deletion or cross-tenant movement.
This mechanism adds no initializer, publication approval or write grant.

Retained predicate validation had an actual compatibility defect in both the
TypeScript and SQL implementations: string/bigint were absent from their type
maps. Both now support text/numeric predicates respectively, preserving large
numeric strings and rejecting wrong payload types. The forward SQL replacement
checks the exact predecessor body; the applied original DDL remains unchanged.

Validation: 753 authoring tests and 54 contract tests pass (six/four opt-in cases
excluded respectively); nine preparation-runner tests pass. Production/test and
native-test typechecks pass. Twelve targeted tests, including the expanded
PostgreSQL rehearsal, pass with the SQL opt-in enabled. Those fixtures exercise
root repin/marker rejection, stale label/catalogue references, invalid field
variants, incomplete drafts, exact large numeric predicates and rollback. They
use synthetic catalogue/label authority and are not actual product enrollment.

Remaining: aggregate whole-snapshot enforcement with retained authorization/AI
and resource semantics; canonical whole-source repository application/history
qualification; approved host/product-write authority; deployed F6/F8/F9 evidence.
There are still nine coarse schema admission blockers (seven pending checks and
two absent aggregate functions). No Country/State Region draft was enrolled or
converted, and no release was activated.


### Aggregate snapshot references and versioned reference input (7 October 2026)

The existing repository now applies `validateNativeSnapshotReferences` to current
snapshots (including save/conversion readback) and historical snapshots after the
history hash/source checks. Whole-source preparation and native release compilation
apply it too. It composes the retained reference parser and operation/AI membership
validation, binds source coordinates and counts authored rows across branches.
Installed core/layout/resource validation and independent host admission remain
separate mandatory checks. This does not implement the missing SQL aggregate
functions or attest complete retained-resource semantics.

This found missing target rows in maintained fixtures and the v1 reference
builder's nonempty read-operation `fieldKeys`. The explicit v2 builder emits no
write enrollment for read operations. Version 1 remains the default, retaining
historical descriptor-hash tests. The v2 positive fixtures use actual Country and
State Region definitions and production conversion/compiler/reader code on all
three planes, with synthetic resource authority. Negative cases reject undeclared
targets, stale references, aggregate overflow, historical read enrollment and
correctly hashed but invalid historical graphs. No production adapter silently
drops historical read field keys.

Read-only DEV inspection: both selected Country/State Region drafts remain at
revision 1, with no native marker and zero operation-field rows. Schema candidate
`fb9b7dcdebaf7f3fba98de0a1b48266957d533f432a82ce12a7f176c73ef04c0`
still reports nine blockers (seven pending checks, two absent aggregate functions).
Local inspection output: `/tmp/athyper-native-aggregate-schema-20261007.json`;
this temporary file is diagnostic evidence, not a durable approved fingerprint.
No migration, enrollment, grant, review approval or activation occurred in this step.

Remaining engineering: complete database aggregate enforcement, canonical actual
source enrollment/application/history evidence, and external resource qualification.
Approved host/product-write authority and deployed F6/F8/F9 evidence remain absent.

Validation: 760 authoring tests pass; six opt-in PostgreSQL cases remain excluded
from this run (no SQL changed). Production/test and native-test typechecks pass;
generated foundation drift checks pass. The recorded historical v1 descriptor
hash tests remain unchanged and pass. No skipped test or historical fixture hash
was changed to accommodate v2.


### Database aggregate guard installation (7 October 2026)

Applied forward migration `20261007_entity_native_snapshot_guards.sql`, SHA-256
`6c555f7fc63d11b66b90aa58e02c2ff28327c09ba8519e842093646189942eb4`.
The predecessor guard body is pinned; all applied predecessor files remain unchanged.
Evidence directory:
`~/.athyper/instances/dev/workspace/native-snapshot-20261007T093544Z/`
contains the pre-application database backup, application/replay receipts, canonical
schema inspection and foundation inspection. Rollback rehearsal/application compare
all original metadata/history rows and authorization/active-head fingerprints;
repeat application reports a no-op.

The aggregate v1/v2 entry points compose existing root/core/layout/typed/reference
checks and local operation/AI/ownership constraints. Deferred callbacks validate
final transaction state on member mutations and both sides of draft moves.
Materialization mapping scope derives from its parent. No host grants, protected
state initialization, MFA enforcement or publication approval changed.

Two nonexistent retirement columns were removed from the shared guard/writer map:
`entity_runtime_profile.id_field_key` and `entity_operation.field_keys` are derived
JSON projections, not SQL columns. Tests now compare retirement names with actual
canonical CREATE TABLE definitions. Generated code no longer queries the absent
component/capability-binding/overlay dictionaries; non-NULL selections reject with
`NATIVE_REFERENCE_STORAGE_UNAVAILABLE` until their storage/resource resolution is
implemented and qualified. This is an explicit remaining engineering limitation.

Validation: 758 authoring tests pass (six opt-in exclusions), 55 contract tests
pass (four opt-in exclusions), and ten migration-runner tests pass. The two removed
retirement columns eliminate two dynamically generated retirement test cases; no
test was blanket-skipped. The expanded disposable PostgreSQL constraint/aggregate
rehearsal passes; all four typed-row guard tests also pass with PostgreSQL enabled.
Production/test and native-test typechecks pass. PostgreSQL coverage includes an
empty consistent partial draft, profile membership, late invalid edits, version
mismatch, unavailable resource selection and savepoint rollback. This component
fixture is not canonical whole-source repository/RLS qualification.

Post-application schema candidate:
`1e03c285538ab4b06d7551e0083294275f22f6cf8d25bfad2b10eeee2ee472f0`.
Seven pending constraints remain; both aggregate functions now exist. This hash
is captured evidence, not an independently approved installation fingerprint.
Actual Country and State Region drafts remain revision 1, with zero owned-label
rows and no native marker. Actual enrollment/application/history, complete resource
resolution, approved host/product-write authority and deployed F6/F8/F9 remain
unqualified. No native cutover or activation occurred.

### UI component resource storage/resolution — 2026-10-07

Implemented the closed typed resource descriptor, generated catalogue DDL, tenant/
level/target-plane SQL reference checks and independent installed-resource resolver.
Authoring/compiler composition replaces component rosters with resolved catalogue
and installed evidence; the compiler context hash includes that evidence and the
reader recheck uses the same resolver. Existing admission, initializer, security and
storage ports remain intact. This composition is available for the approved host;
no deployed host has been admitted by this work.

DEV migration `20261007_entity_ui_component_catalogue.sql`, SHA-256
`64b3aa01ca5d813bdd95ebb8a337528cdb3ab29e064d71ffc2ea7c48c39d5dbe`,
was rehearsed with rollback, applied and replayed successfully. Backup and receipts:
`~/.athyper/instances/dev/workspace/component-catalogue-20261007T095600Z/`.
Every original metadata/history row and authorization/head fingerprint is unchanged.
The empty catalogue has forced RLS, no new grants, immutable rows and typed checks.
Installed resource evidence cannot be inferred from its presence. Candidate schema
hash: `5fda0edf0e1cd00931941f846b8f6e615d29129bfb0854ec34065365124f42f4`.
Seven pending cutover constraints remain. No native enrollment or activation ran.

Validation: 766 authoring tests pass (six opt-in exclusions), 57 contract tests
pass (four opt-in exclusions), 11 migration-runner tests pass. Both PostgreSQL
suites pass (one aggregate scenario and four typed-row tests), including immutable
catalogue mutation rejection. Authoring typechecks and generated-contract drift
checks pass. These are framework/component proofs, not canonical whole-source
Country/State Region history or deployed RLS/host qualification.

Remaining: governed catalogue installation/read authority and host composition;
actual Country/State Region enrollment/application/history; approved product-write
and protected-state initialization provenance; deployed F6/F8/F9 evidence. Component
slots, capability-binding and overlay resource dictionaries are not implemented by
this checkpoint. No approval or resource identity has been fabricated.

### Actual reference-source and saved-history inspection — 2026-10-07

`inspectLegacyEnrollmentEvidence` loads the actual source through the existing
Kysely authoring repository. It requires a read-only repeatable-read/serializable
transaction, exact draft UUID, bounded source/history size and bounded history
rows. It validates the legacy graph and uses canonical stored labels/identities
for an enrollment proof only when those dependencies already exist. It never
allocates resources or writes history. This operator diagnostic provides no
application admission, product-write grant, independent review or host approval.

Executed against DEV with a 32 MiB source/aggregate-history limit, 1,000-history-row
limit and 30-second statement timeout. Evidence is retained privately at
`~/.athyper/instances/dev/workspace/enrollment-inspection-20261007/sources.json`.

| Source | Draft | Actual repository source hash | Saved history |
| --- | --- | --- | --- |
| Country | `28e155d7-9f18-48fd-9f4d-847ff80f7e87` | `259eb6b00119e4f685d43fa72806d78c8845422c4df79b34acc20dc262d12cae` | Two snapshots; checksums valid; current revision 1 matches |
| State Region | `9672c64b-b40f-43ce-8a2f-e0fbebd1154e` | `1056cb869b001425762fb5e979f4de91c0f747e824565010bb3018a4a0ead304` | Two snapshots; checksums valid; current revision 1 matches |

Both actual graphs pass legacy validation. Both report exactly these enrollment
blockers: `LEGACY_ENROLLMENT_LABELS_NOT_ENROLLED`,
`LEGACY_ENROLLMENT_IDENTITIES_NOT_ENROLLED` and
`LEGACY_ENROLLMENT_SOURCE_OWNERSHIP_UNDECLARED`. No target enrollment hash is
reported while these are unresolved. A valid historical checksum does not attest
historical author/reviewer authority or authorize restoration of protected state.

Seven focused tests cover valid/missing history, bad checksums, duplicate/future/
fractional revisions, tenant mismatch, a rehashed current-source substitution and
rejection of writable diagnostic transactions before source access. Authoring
production/test typechecks pass. This is actual source/history inspection, not
actual enrollment, native application, conversion-history proof or deployed
F6/F8/F9 qualification. Pending cutover guards remain; no DB mutation occurred.

Reproduce with exact scoped coordinates (codes are not runtime dispatch):

```sh
pnpm exec tsx tooling/scripts/verification/inspect-legacy-enrollment.dev.mts --output /tmp/enrollment-evidence.json 28e155d7-9f18-48fd-9f4d-847ff80f7e87 9672c64b-b40f-43ce-8a2f-e0fbebd1154e
```

### Source-bound label enrollment preparation — 2026-10-07

`prepareLegacyLabelEnrollment` reuses the existing typed label commands and reducer.
It deduplicates exact explicit localization declarations and preserves translations,
recording source paths and temporary references. It rejects conflicting keys/text,
missing required translations, locale mismatch, stale source hashes, duplicate or
invalid JSON-pointer mappings and command/byte-budget overflow. Reviewed mappings
for plain legacy strings must specify both the source path and label key; saved
text must match exactly. No UUIDs, label keys or translations are guessed. A
proposal hash binds the source hash, command batch and mapping provenance.

The existing read-only DEV inspector accepts `--label-plan-config PATH` after its
output argument. The config explicitly supplies `defaultLocale`, `requiredLocales`
and the existing normalized command policy; optional `declarationsByDraft` supplies
reviewed source-path declarations for each exact draft. This is proposal input, not
authorization. English (`en`) is the proposed locale for this run, not an approved
host locale. Other locale choices require regeneration and review.

Actual DEV results, against the same source hashes recorded above:

- State Region: **prepared**, 15 explicit labels and 16 existing typed commands.
- Country: **blocked**, `LEGACY_LABEL_DECLARATIONS_REQUIRED`; 48 candidate field,
  surface, section, binding and operation text locations exported with null label
  keys for review. The current source-file fixture has localization declarations;
  that does not establish them in the older saved Country graph.

Private review artifacts:
`~/.athyper/instances/dev/workspace/label-enrollment-proposal-20261007/config.json`
and `proposals.json`. The latter contains State Region's exact batch and Country's
mapping candidates. Candidate enumeration is a review aid, not proof that every
nested display declaration has a completed native mapping. Source history remains
checksum-valid. No command was applied, UUID allocated, grant changed or activation
performed. Existing host admission/database authority must qualify before execution;
this preparer does not supply a new writer or bypass those controls.

Validation: 778 authoring tests pass (six opt-in exclusions), including both current
reference definitions through the same preparer/reducer, explicit legacy mappings,
source conflicts, translation preservation and budget rejection. Typechecks pass.
Actual field-identity/source-ownership enrollment, native application/history,
approved host/product-write authority and deployed F6/F8/F9 remain unfinished.

### Field-identity release lineage — 2026-10-07

The existing reference command writer rejects identity reservation for an entity
with releases (`F9_IDENTITY_SOURCE_REQUIRED`). This guard remains unchanged.
`legacy-field-lineage.ts` now compares current and historical field members and
validates supplied source-hash-bound correspondences. Exact field equality apart
from member ID is deliberately conservative; altered semantics, labels or keys
need separate review. Duplicate mappings, missing members and stale hashes reject.
Unmapped fields are reported explicitly. No UUID allocation, field-name join,
protected-state restoration, authority grant or identity retirement occurs.

The existing read-only enrollment inspector loads releases under the exact entity
and tenant coordinates. It verifies each snapshot using the existing database hash
function and its release contract hash; a missing/cross-scope snapshot remains an
integrity failure rather than disappearing from the inventory. The separate
canonical-JSON source hashes used by the correspondence validator are recorded
explicitly; they do not replace the historical database contract hashes. Release
row and aggregate-byte limits apply before the comparison. This is not proof of
human authorship/review, signature trust, current activation or installed F9 access.

Actual DEV receipt:
`~/.athyper/instances/dev/workspace/field-lineage-20261007/sources.json`.
Country: 13 release snapshots with valid hashes; all 22 current fields lack direct
member-ID correspondence in each snapshot. State Region: one valid release
snapshot; all nine current fields lack direct member-ID correspondence. A field
name match cannot clear this finding. Supplied, reviewed correspondence and a
qualified canonical stable-identity allocation/install path remain required.
The actual source and saved-history hashes remain unchanged.

Validation: 783 authoring tests pass (six opt-in exclusions); production/test
typechecks pass. New cases cover exact candidates, same-name/different-ID rejection,
changed declaration review, ambiguous IDs, supplied correspondence, source-hash
mismatch, duplicate mappings, changed semantics and incomplete coverage. No actual
enrollment/database mutation ran. Source-ownership initialization, approved
host/product-write composition and deployed F6/F8/F9 remain unfinished engineering
and governance work; this diagnostic is not a replacement for those components.
