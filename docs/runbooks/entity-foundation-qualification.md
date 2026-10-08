# Entity Framework foundation qualification

Started 2026-09-30, baseline commit `0fedc0e97c7a4c5f6b20586d0776c888680435f7`.
Historical starting scope: shared Entity Framework hardening using Country and Principal. This is
not authorization to expand Atlas, restructure deployment planes, publish every
working-tree metadata draft, or onboard additional entities.

<a id="current-local-native-build"></a>

## Current delivery — approved local native rebuild: Country and State Region

Recorded 9 October 2026. This section is the single current execution plan and status location. The [blueprint local exception](../blueprints/entity-studio/blueprint.md#local-native-build-exception) is the normative scope authority. Sections below this current section retain historical execution evidence; do not interpret their old “remaining” lists as the current backlog.

### Approval and supersession

The project owner explicitly approved, in the conversation headed “Decisions for Audit 1 comments”:

1. The local build profile's keep, simplify and defer lists.
2. Rebuilding the local Studio metadata schema after a recoverable `pg_dump`, with fresh native drafts and fresh identities and no adoption; this extends the 8 October disposal approval.
3. Writing the four Country/State Region list/read operations with the proposal's declared `requires_mfa=false`, without the revision-4 source-row initializer.

The subsequent request authorizes recording this detailed plan. These are owner decisions, not installed resources or independent publication approvals. The exact initialization permission does not grant ordinary clients access to protected-state mutation or set defaults for future entities/operations.

**Superseded for this local delivery:** preservation of obsolete drafts inside the active schema; historical conversion; historical identity reconstruction; adoption of the 31 old reserved identities and its tests; source-row initializer locks/reservations; in-place predecessor-cutover rehearsal; a second rehearsal environment; detailed per-finding dossiers. Backups retain historical material. Existing migration capability/evidence is not deleted or declared qualified.

**Retained:** complete typed graphs, canonical commands/rows, shared compiler and UI, no entity hardcoding, exact permissions, tenant/record isolation, current authorization on replay, application-role persistence, transaction integrity, required component semantics, existing supported AI declarations, independent human publication review and artifact verification.

### Current status — installed local reset, 9 October 2026

The owner approved execution and refreshed separate Admin/Owner sessions. Four expanded
component candidates were authored, independently approved, published and activated.
A current Studio backup and separate Neon/Mesh backups were successfully restored before
reset. The exact scoped reset committed at `2026-10-08T20:27:11Z`: 1,551 obsolete rows
across 23 tables; Entity roots, business data, IAM and migration history were preserved.
Fourteen historical Entity publication releases and two obsolete identity-review releases
were withdrawn without deleting their publication artifacts/receipts. Affected old heads
were removed in Studio (four), Neon (two) and Mesh (two). Country 13 and State Region 1
are therefore **no longer active**. No new Entity activation is claimed.

All seven pending cutover checks are now removed in actual DEV; final aggregate guards
and restricted fresh-identity grants remain. Actual application login
`athyper_dev_product_command` reports zero schema blockers, fingerprint
`8e1b311886771a5010c3408ce3b4897fa761ad00e325c6c7780145354ac732bc`.
Complete fresh proposals and pinned production startup configuration are mounted in the
control API. Four authenticated production requests succeeded: State Region apply/replay
and Country apply/replay, all HTTP 200. Both fresh product drafts are native version 2 at
revision 1, attributed to the real Platform Admin. Each has immutable revisions 0 and 1
and exactly one command receipt. Country has 22 fields/identities; State Region has nine.
The four approved operations retain `requires_mfa=false`. No old identity was adopted.

| Entity       | Fresh draft ID                         | Stored graph hash                                                  | Compiled hash                                                      |
| ------------ | -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Country      | `f3aaa770-da84-4aad-83fd-9af62a305299` | `6562efa0fa82d571b13490f9a1533c6899f2fa2a407beeaf60556e7d77275206` | `40bb0af0e4a658a1b0036eeda2216213415519e538da49d1bb038fd153721812` |
| State Region | `6f64254e-8d1d-429b-9929-e98df9f38dcf` | `0cf8d01d312819ec5819317cce50b37b062f9b3577e6d6601adaafb86628f4b0` | `7a1cfb9400fec00825e800a372f713773cc691ed6c9a17658f128eddcca38828` |

Replay returned the same hashes/revision with `replay=true`, without allocating new
members or history revisions. Transactional audit contains four successful enrollment
events with the actual Admin actor and Studio/platform authority scope. Negative actual
requests reject unauthenticated access (401), a client-supplied actor (400), and a changed
proposal pin (403). Failed pre-fix writes rolled back all replacement roots/members.
The application login is `athyper_dev_product_command`, under its configured restricted
role and transaction-bound admission; no administrator SQL inserted the fresh graphs.

Integration corrections installed during execution: the gateway bootstrap route,
component envelope/payload adaptation, admitted pre-insert product-target validation,
exact private source-free initializer declarations, explicit storage values/native
weight decoding, canonical readback/replay hashing, and reuse of the registered
`metadata.entity.product.enrollment` transactional audit contract. DDL 59–61 retains the
normal RLS policies and old source-copy path; only the four approved exact operation IDs
are enrolled in the source-free private declaration table.

Private evidence: `~/.athyper/instances/dev/workspace/native-reset-20261009/` contains
`backup-location.json`, `plane-backups.json`, `logical-dispositions.json`,
`reset-receipts.json`, `installed-schema.json`, `startup.json`, `proposals/manifest.json`,
`bootstrap-receipts.json`, `bootstrap-database-readback.json`,
`bootstrap-audit-readback.json` and `negative-request-receipts.json`. `host-composition.json` is a local implementation pin,
**not** a published host approval or deployed F6/F8/F9 qualification. The initializer
contains only the four specifically approved source-free false values.

Executable commands used: `pnpm db:setup:rebuild-entity-metadata --mode plan-cleanup
--scope <private-scope.json>`, then `--mode backup-verify`; generated exact-PK SQL was
rollback-rehearsed before execution through `psql -X -v ON_ERROR_STOP=1`. Studio cleanup,
final schema and logical disposition ran in one transaction; each other plane's runtime
disposition used its own transaction. Foreign keys remained enforced throughout.
The control API was started using the private `control.compose.json` and actual schema
inspection used its `scripts/operations/inspect-native-bootstrap-schema.ts` with the
mounted application-role URL. Bootstrap uses authenticated POST to
`/api/platform-control/meta-entity-authoring/change-sets/:id/bootstrap-native`, with
`entityId`, exact `proposalHash` and stable `idempotencyKey`; repeat the same request for
replay. The executable local transport is `NODE_EXTRA_CA_CERTS=~/.athyper/platform/secrets/tls.crt
node ~/.athyper/instances/dev/workspace/native-reset-20261009/bootstrap-references.mjs`.
It loads the private authenticated Admin session and exact current manifest, applies each
proposal and replays the same request. No token is printed. A proposed command is not a
successful execution receipt.

Canonical readback exposed two further integration defects: missing explicit storage
values in maintained product proposals and legacy numeric decoding of native search
weights. The product builder now declares those values before hashing; native search
weights use decimal strings. `nativeBootstrapReadbackJson` compares member sets by ID
(reference, AI, label and identity collections) while retaining every semantic position,
value and nested configuration order. UTC timestamp fractional padding to six digits
preserves microseconds. It does not equate missing required properties with defaults.
Compiler context must match the original proposal before rebinding to the verified
stored graph hash. Replay checks the original request hash and separately validates the
receipt's exact immutable stored graph hash; SQL ordering is not mistaken for mutation.
These fixes passed focused regression tests and actual application-role bootstrap/replay for both entities.

Validation: 912 ordinary authoring tests pass (11 opt-in exclusions), 20 host tests and
10 cleanup/final-schema tests pass. The opt-in PostgreSQL test proves declaration
acceptance, forged identity/value rejection, private-table denial and the real relation
binding trigger under admitted versus unadmitted application sessions. Host typecheck
remains blocked by the unrelated preferences `group`/`groups` error at
`entity-views-routes.ts:317`. Failed actual bootstrap transactions left zero replacement
roots, fields and identities (`failed-bootstrap-rollback.json`). All required installed
DDL hashes are recorded in `additional-installation.json`; complete reset SQL passed rollback
rehearsal before installation. Actual graph write/readback/replay is established; local live-read positive/negative
acceptance and independent Entity publication/activation remain required.

| ID  | Deliverable                              | Status      | Available evidence / actual gap                                                                      | Next action                                                                   |
| --- | ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| L0a | Local preparation and backup             | Executed    | All three backups restored; exact scoped cleanup manifest executed                                   | Retain recovery evidence                                                      |
| L1  | Complete native proposals                | Executed    | Both complete proposals saved and compiled through canonical application readback                    | Retain pinned proposal and compiler evidence                                  |
| L2  | Clean schema and startup composition     | Executed    | Final guards/grants installed; zero pending checks; actual startup used                              | Retain installed schema/configuration pins                                    |
| L3  | Actual native bootstrap and replay       | Complete    | Both drafts committed at revision 1 and replayed; exact hashes, audit and immutable history verified | Proceed to L4/L5                                                              |
| L4  | Working local live-read integration      | In progress | Adapter pieces exist; semantic qualifier and concrete deployed bindings remain incomplete            | Implement bounded validation and actual storage/security/identity composition |
| L5  | Human review, publication and activation | Not started | Existing infrastructure/component releases are not new native Entity delivery                        | Submit concrete Entity candidates and use independent review/worker paths     |
| L6  | Local manual-test handover               | Not started | Old Entity heads cleared; no replacement Entity activation yet                                       | Complete L3–L5 and verify standard UI                                         |

Status vocabulary: **Not started / In progress / Blocked / Implemented / Tested / Installed / Executed / Complete**. Awaiting authentication is a blocked execution step. “Complete” requires the checkpoint's executed exit, not merely code or component tests. A blocker needs an exact failed command/assertion and next action. No new snapshot count, test total or release ID is invented here.

Current implementation order is **L0a (non-destructive harness/inventory/backup verification) → L1 (complete replacement graphs and startup assembly) → L2 (explicit destructive rebuild/final constraints/grants)**, as one sequential integration effort. Reset installs the final native integrity contract directly; it is not required merely to obtain an empty target. The reset executor must not destroy source inputs before L1 and its scoped manifest are ready. L4 preparation may run independently only with a separate assigned implementer and isolated changes. Do not split unfinished production composition across uncoordinated sessions.

### Ownership, scope and progress updates

| Responsibility                         | Accountable role                               | Assignment / commitment                                                                                   |
| -------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| L0–L3 integrated delivery              | One shared Entity/host integration implementer | Named person not supplied; current authorized engineering continues, staffing is not a new technical gate |
| L4 storage and security implementation | Storage/provider and authorization maintainers | Named assignees not supplied; otherwise continue sequentially                                             |
| Product candidate authorship           | Platform Admin                                 | Existing authenticated human author; request refreshed session only for a ready command                   |
| Independent candidate review           | Platform Owner                                 | Concrete candidate review, never inferred from scope approval or a session refresh                        |
| Local delivery acceptance              | Project owner                                  | Review L3 evidence and L6 handover; no new general implementation approval required                       |

The independently owner-approved Tree A1/P-T1/B1 work is not revoked by this delivery fence; it remains separate and is not added to the cleanup critical path. Existing grouping/hasChildren issues enter the pre-reset baseline only when reproduced or linked to inspected evidence, not merely because another audit mentions them.

No accepted calendar delivery commitment was supplied. Older C0–C6 dates and estimates are superseded planning proposals, not current deadlines. Size L0 small–medium, L1 large, L2 medium–large, L3 medium, L4 medium–large and L5/L6 medium plus human review turnaround. Replace these with named/date commitments when supplied or a grounded implementation estimate after the first harness run; do not silently assign a one-day promise or repeat “two hours” placeholders.

Freeze this delivery to Country/State Region and necessary shared-framework fixes. Composer UI, Board/Calendar/Gantt work, other business-entity onboarding, historical migration, release sets and unrelated capability expansion are excluded unless the owner changes scope. Preserve unrelated concurrent work. A required correctness defect stays in this delivery; other findings become deferred limitations. Scope/control changes require their specific decision, not another general permission request.

Each update records: checkpoint; completed implementation and executed result; evidence revision/run; exact blocker; next corrective action; DEV impact (none/schema rebuilt/drafts created/releases activated). Report meaningful changes rather than recurring “full request incomplete” statements. If the same critical failure persists for two working days, a scope decision appears, or an accepted target is missed, escalate harness output plus a short blocker/options statement. Never automatically drop State Region or bypass controls.

### L0a — non-destructive harness and executable-command register

Use the actual production environment/file configuration loader and composition, not hand-built test options or a replacement mock resolver. Native-bootstrap config/startup wiring is an implementation task. The DEV-only control API check is not sufficient for independently executable reset tools or workers; each destructive setup entrypoint checks its actual local target and scope.

The harness has explicit **reset/fresh-build** and **resume/verify** modes. Reset never occurs on routine verification or replay. One run reports passed/failed/blocked/not-run for each stage; a failed or blocked required exit makes the overall run non-successful. Negative tests expected to reject are separate from positive acceptance. Run all independently evaluable diagnostics, marking dependent checks blocked rather than falsely passed.

| Command/capability                                                                                                                          | Current executable status                                                                             | Use / required correction                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:setup:rebuild-entity-metadata`                                                                                                     | Delegated script repaired; inspect/backup-verify/verify modes implemented; reset deliberately rejects | Default inspects only; use explicit modes below; this is not yet a working destructive reset                                                 |
| `pnpm exec tsx server/apps/platform-host/scripts/operations/build-native-bootstrap-proposals.ts <native-input.json> <new-output-directory>` | Existing offline bundle constructor                                                                   | Accepts complete graphs or entity.native-reference-input/1 definitions plus actual read-only catalogue inspection; does not authorize writes |
| Integrated local reset/bootstrap/verify command                                                                                             | **Not implemented / no executable invocation claimed**                                                | Record exact supported command/flags here only when implemented                                                                              |
| Authenticated Entity bootstrap, review and worker invocation                                                                                | Existing framework pieces; complete local-profile execution not established                           | Record real invocation and sanitized result when assembled; no placeholder command counted as evidence                                       |
| `pnpm dev:publish`                                                                                                                          | Existing DEV overlay/machine-credential tooling                                                       | Not an accepted substitute for human Admin/Owner Entity review; use the authenticated shared path unless compatibility is proven             |

Keep the transport manifest's strict shape unchanged. Diagnostics are qualification output, not a new authoring property bag. One run-level header records time, code revision, environment, source/proposal hashes and relevant resource identities; each finding needs only code, source path, classification and status. Do not print credentials or tokens. Record actual login/effective role and admission outcome at the relevant command boundary, not six repetitive dossiers.

Store machine-readable results in the existing private qualification workspace, e.g. `~/.athyper/instances/dev/workspace/`, and link the exact run location here after execution. No new report file or evidence framework is required. Executed local-build result paths are recorded below. The existing 8 October backup path below is historical recovery evidence, not a backup of future changes.

### L0a executed preparation — 9 October 2026 local time

Implemented `tooling/scripts/local-dev/entity-native-build.mjs` and repaired the delegated `server/db` script. Seven colocated Node tests pass, including mode/target validation, untruncated dependency counts, SQL identifier quoting, restore comparison and reset rejection before any Docker invocation. Existing root invocation now works from the repository:

```sh
pnpm db:setup:rebuild-entity-metadata --mode inspect
pnpm db:setup:rebuild-entity-metadata --mode backup-verify
pnpm db:setup:rebuild-entity-metadata --mode verify
```

`inspect` is also the default and only reads source state. `backup-verify` captures a private Studio custom-format archive plus cluster globals, restores the archive into a randomly named temporary database, compares metadata dependencies/constraints/routines/triggers and records restored row counts, then removes the temporary target. Existing cluster roles are reused; this does not prove global-role restoration or cross-database recovery. The source is not reset or quiesced in this preparation run, so a later destructive run needs a current backup and controlled write window. These two modes return success for their requested preparation only; their report still sets `ready=false`. `verify` returns nonzero while end-to-end prerequisites remain missing. `--mode reset` explicitly rejects with `LOCAL_RESET_BLOCKED:L1_AND_RESET_MANIFEST_NOT_ESTABLISHED`; no destructive executor is claimed implemented.

Executed receipt: `~/.athyper/instances/dev/workspace/entity-native-build-b690cb4d-d638-4ae8-bc60-ebed77394a19/result.json`. Run timestamps are UTC 8 October 18:33:20–18:33:51 (9 October local), revision `c703d9cca9c6cb22ffedf45b8eefde9762175424` with working-tree changes. Archive SHA-256: `010a4087d5a56208a34c1725a46f0eb49c38555797d7a68e32c784938787f3af`. Restore and schema comparison passed; temporary database removed. Inventory counts: **294 touching-metadata FKs = 182 internal + 25 external inbound + 87 outbound**; all seven pending checks remain. Exact constraint definitions, grants/RLS catalogue, routines, triggers, field identity IDs, draft coordinates and table counts are captured without query truncation. Logical dependency closure and row-level removal dispositions are still not established.

The first run (`entity-native-build-8ac888a9-f8ca-4e97-ac04-bff9387f0bcc`) restored successfully but correctly reported an inspection-comparison failure: PostgreSQL flattened redundant `AND` nesting in three CHECK expressions. The comparator now uses PostgreSQL's pretty constraint deparser, retains raw definitions for exact predecessor evidence, and rejects changed expressions/validation status; no application constraint was changed. The successful second run above is the recovery receipt. Implementation hashes are now included on subsequent runs; neither this receipt nor the unit tests claims production startup or application-role acceptance.

The actual `--mode verify` run returned exit 1 with `ready=false`, L1 blocked and reset/bootstrap/replay/live reads/publication not run. Receipt: `~/.athyper/instances/dev/workspace/entity-native-build-75151685-fe2b-4c4d-b056-69c0ad33ca6b/result.json`. This verifies honest incomplete reporting, not positive production acceptance.

### Row-scoped cleanup and declared-operation preparation — 9 October

The preparation CLI now supports the read-only command:

```sh
pnpm db:setup:rebuild-entity-metadata --mode plan-cleanup --scope /home/chandravel_natarajan/.athyper/instances/dev/workspace/entity-native-cleanup-scope-20261009.json
```

The private scope file names the two approved product entity IDs, database and purpose. This finite cleanup selection is data, not a runtime Entity allowlist. The planner preserves Entity roots, seeds candidate obsolete draft/release/field-identity rows, follows actual FK column pairs and primary-key tuples (including composite keys), checks declared owner/tenant scope, terminates cycles and reports protected or out-of-scope dependents. AI/onboarding and the general publication ledger are never automatically enrolled for deletion. Missing primary keys or exceeded traversal/row budgets reject. No DELETE/DDL statements are emitted; `executable=false` is unconditional until a separate reset implementation proves its remaining prerequisites.

Actual read-only run: `~/.athyper/instances/dev/workspace/entity-native-build-698d536d-f6e1-4804-9ec2-a56255b9fd0c/cleanup-plan.json` and `result.json`; 1,551 candidate rows across 23 tables, zero protected/out-of-scope FK findings in this run. Included candidates: 16 change sets, 14 Entity releases, 31 field identities, 63 labels, 326 fields, 652 surface-field bindings, 47 draft snapshots and four obsolete source-initializer records. This is candidate FK closure, not authority to clear publication heads: logical resource/publication/activation dependencies remain unclassified and the source was not quiesced. Recompute before destructive use. No rows changed.

`createDeclaredOperationBootstrap` now implements the approved source-free operation preparation contract. Trusted configuration pins an initialization declaration hash with exact entity/draft/member coordinates, operation keys/full-operation hashes and explicitly false values; omission/true values, altered members, duplicate/extra declaration properties, other targets and populated roots reject. Preparation checks creation admission and locks the fresh native revision-one root, then emits insert-only operation plans through the existing canonical writer. It reads no revision-4 operations and grants no ordinary protected-state update access. This is an implementation component accepted by the existing bootstrap policy, **not installed host configuration, DB grants or actual initialization of the four DEV operations**. The actual approved two-entity declaration still awaits complete graph assembly; the profile marker/hash alone is not human review or permission.

Validation: 23 authoring tests pass, including the declared initializer through canonical bootstrap/compile/replay with simulated SQL transport; no old source-reader query occurs. This is not PostgreSQL application-role proof. Thirteen cleanup/preparation Node tests pass and cover finite scope, owner boundaries, preserved dependents, cycles/composite keys, malformed keys and explicit CLI scope. Fresh-identity allocation and the concrete production resource resolver remain unfinished. No reset, new native draft or activation occurred.

### Fresh identity persistence — 9 October

Implemented the fresh identity branch in the canonical native bootstrap writer and compiler-resource composition. The trusted resource resolver selects `identityMode: fresh`; request graphs cannot select their own mode. Every field must have exactly one proposed identity with matching entity/draft/actor, reserved state, no prior release/retirement provenance, valid parent membership and no cycles. Parent rows insert first under the fresh-root admission and graph transaction. Collisions reject without upsert; the existing installed/adoption path is retained. The resource evidence fingerprint includes identity mode.

The focused application test compiles and records the fresh roster, then replays without further allocations. Repository failure tests include the fresh branch and verify rollback of root/history/member writes using simulated SQL. A disposable PostgreSQL test uses the canonical identity table/trigger and INSERT policies with a synthetic admission function: authorized explicit coordinates pass only after the new narrow grant; missing admission, wrong actor/token, duplicate insert and UPDATE/DELETE reject; rollback leaves no row. This is database constraint/grant evidence, **not authenticated DEV bootstrap or whole-graph PostgreSQL evidence**.

Executable checks:

```sh
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/native-bootstrap-identities.test.ts src/native-bootstrap-application.test.ts
ATHYPER_FRESH_IDENTITY_POSTGRES=1 pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/native-fresh-identity.postgres.test.ts
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/control-plane/product-command-runtime.test.ts src/composition/control-plane/native-bootstrap-resources.test.ts
```

Validation for this checkpoint: the full authoring package passes 906 tests (11 environment-dependent skips); the fresh-identity PostgreSQL check passes separately; the host runtime/resource suites pass 27 tests. Authoring native-test TypeScript and changed-file formatting pass. The broader host typecheck reports `entity-views-routes.ts:317` using `group` against `SaveableListStateV1` (`groups`); whole-tree formatting reports six concurrent files outside this change. These are not reported green or included in this change. Migration layout verification passes (172 classified files, 164 retained SQL).

`58_native_fresh_identity_privileges.sql` is maintained clean-build DDL, not an installed DEV migration. The production entrypoint still lacks the complete proposal/resource resolver configuration. Both real complete graphs, startup assembly and cleanup dispositions remain necessary before reset. No DEV identity inserts, replacement draft commits or new activations are reported by this checkpoint.

### L1 graph and production startup implementation — 9 October 2026

Implemented the shared `buildNativeReferenceProduct` assembler and production
`assembleNativeBootstrapCompilation` composition. The maintained reference definitions
supply fields, relations, labels, readable identity, navigation, views, permissions,
storage/provider settings and AI; actual catalogue facts supply storage types and hashes.
Fresh member and identity coordinates are allocated once into the immutable proposal.
UUID presentation, unsupported source features, missing targets and incompatible storage
reject. List and detail components are selected separately by declared data type.

`control-api.ts` now constructs and supplies native bootstrap composition through
`PLATFORM_CONTROL_NATIVE_BOOTSTRAP_CONFIGURATION_FILE`. The private absolute-path JSON
file uses `entity.local-native-startup/1`: proposal manifest/hash, final database schema
pin, command budgets, component publication pins, exact approved operation declarations,
and explicit target/domain/reference/identity contracts. Current authenticated admission,
component verification/deployment, descriptor and storage checks remain on the command
path. No callback or authority is accepted from proposal JSON. This code is implemented;
a real startup configuration has **not** been installed or the service restarted for it.

Executed proposal generation against DEV using the application login
`athyper_dev_product_command` in a read-only transaction (no write admission):

```sh
pnpm --filter @athyper/server-platform-host exec tsx scripts/operations/build-native-bootstrap-proposals.ts \
  /home/chandravel_natarajan/.athyper/instances/dev/workspace/native-reference-assembly-20261009/input.json \
  /home/chandravel_natarajan/.athyper/instances/dev/workspace/native-reference-assembly-20261009/proposals
```

The input uses `entity.native-reference-input/1`, maintained definition documents,
explicit graph/target/component coordinates and a private database URL file. Manifest
hash: `e8201afb133f1fa7e2dc20cb78f352ca24cac7f81a34e057c0ca88a5c512bc47`.
The same workspace's `compilation-results.json` records successful native compilation
and runtime parsing with actual catalogue facts and **proposal component semantics**:

| Entity       | Fields / fresh identities | Sections / bindings | AI fields | Proposed draft ID (not a database draft) |
| ------------ | ------------------------- | ------------------- | --------- | ---------------------------------------- |
| Country      | 22 / 22                   | 4 / 43              | 19        | `f3aaa770-da84-4aad-83fd-9af62a305299`   |
| State Region | 9 / 9                     | 2 / 17              | 6         | `6f64254e-8d1d-429b-9929-e98df9f38dcf`   |

**Concrete remaining resource gap:** installed list text v2 supports string only;
these graphs also need enum, boolean and datetime list fields. The installed detail
component cannot satisfy list usage. Workspace `list-text-candidate.json` proposes those
capabilities, retaining the existing implementation pin; `candidate-status.json`
explicitly records approval and deployed qualification as not established. Existing
component declarations were inspected administratively, not loaded as application-role
installation evidence. Seven renderer conformance tests pass, but they do not constitute
new deployment evidence or independent publication approval. Compiler-only resource pins
in this semantic rehearsal are not installed authority.

Validation: full authoring package **909 passed, 11 environment-dependent skips**;
four host composition/runtime suites **32 passed**; native-test TypeScript passes.
The broader host typecheck still fails at `entity-views-routes.ts:317` (`group`
versus `groups`) in concurrent Tree work; it is not claimed green.

The production entrypoint regression test verifies that the real entrypoint constructs
and supplies the composition, alongside executable factory tests and both-entity compiler
and runtime-reader tests. It does not prove authenticated endpoint execution. The current
next step is expanded component qualification/approval/installation, final cleanup/schema
setup and real pinned startup configuration, followed by whole-graph application-role
commit/readback/replay/rollback. No DEV cleanup, replacement draft write, Entity
publication or activation occurred in this checkpoint. Existing revision-4 drafts remain
unchanged. Formal F6/F8/F9 acceptance is not established.

### Expanded renderer deployment and final-schema rehearsal — 9 October 2026

**Implemented → tested → installed → executed:** the fixed Studio renderer bundle
is deployed and serves HTTPS; component catalogue installation is still pending human
proposal/review and worker activation. The source database is unchanged. The final
schema is installed/executed only in a temporary restored database, not in DEV itself.

A dependency check found that the former deployed bundle predated the shared fix that
prevents unresolved references from exposing technical identifiers. Rather than qualify
that older implementation or deploy concurrent edits, built Studio from detached commit
`4f4867ecf` in `/tmp/athyper-list-scalar-20261009`. The production build passes; 13 list/detail
renderer conformance tests pass against that checkout, including the newly added unresolved
reference case. The test file was copied into the detached checkout; renderer sources
remain at the recorded commit. The temporary packaging attempt which dereferenced pnpm
symlinks failed startup; preserving internal standalone links corrected it. No failed
packaging is represented as a passing deployment.

Current deployment workspace:
`~/.athyper/instances/dev/workspace/component-list-scalars-20261009/`.
`bundle/component-manifest.json` hash is
`c9ccf3b846f1151755569e4fead7f4bffc111e6bcd666321b871e4d149b6c7e5`.
All **1,634 files** verify through the actual component qualifier; Studio `/readyz` and
an HTTPS-served static asset return 200, and the asset matches the inventoried bytes.
`verified-deployment-recheck.json` records this execution. This is not authenticated
Entity list/detail acceptance or human publication approval.

Four exact candidates are mounted in the existing resource-review source directory:

| Resource                       | Proposed release ID                    | State                    |
| ------------------------------ | -------------------------------------- | ------------------------ |
| `shared.entity.list` v3        | `df78097a-7a90-4c72-a919-7d9855082b24` | Unsubmitted / unapproved |
| `shared.entity.detail` v3      | `575bd38d-f7db-487c-a472-4e33d336542b` | Unsubmitted / unapproved |
| `shared.entity.text` v3        | `455c96dc-f406-4e42-97fe-21b11c9b7c9f` | Unsubmitted / unapproved |
| `shared.entity.detail-text` v3 | `0534591b-2a9f-4128-95c0-67d4939b8d94` | Unsubmitted / unapproved |

`candidates.json` contains exact source hashes. The expanded list text declaration covers
string, boolean, enum and datetime; matching surface/detail candidates pin the rebuilt
implementation. The preliminary single `candidate.json` is explicitly superseded.
Both stored human sessions were expired when checked. Admin refresh has been requested
for submission; independent Owner approval is separate and has not been inferred.
The new verifier manifest recognizes these candidate declarations. Old catalogue entries
are retained, but bootstrap checks against the newly pinned deployment will reject old
component pins until the successor resources are approved/installed and selected.

Executable read-only deployment recheck (use a new output filename):

```sh
NODE_EXTRA_CA_CERTS=/home/chandravel_natarajan/.athyper/platform/secrets/tls.crt \
  pnpm --filter @athyper/server-platform-host exec tsx scripts/operations/qualify-component-deployment.ts \
  /home/chandravel_natarajan/.athyper/instances/dev/workspace/component-list-scalars-20261009/probe.json \
  /absolute/new-deployment-evidence.json
```

Regenerated both complete proposals with these exact candidate component IDs through the
actual read-only application catalogue path. `native-proposals/manifest.json` hash:
`9c83cc6f5793b70c2f868919fdbc05ddc6938e29fc9cfd43643407a49d2cbe6d`.
Proposed draft IDs stay as above; proposal hashes are now Country
`0abece2e7d87e97b416d13defd85b80a5cbc19465f4cd680acf80f32bc4fa7da`
and State Region `67f4ff6114429569514e7c1d479e30f01bdfcaafc49c2f1ed011caa8ada9f686`.
They are files, not committed drafts. Do not reuse the superseded command hashes.

Extended the existing preparation harness with a real schema rehearsal:

```sh
pnpm db:setup:rebuild-entity-metadata --mode rehearse-schema
```

It captures a fresh Studio dump, restores it, rejects disabled aggregate guards and
partially removed predecessor checks, then transactionally removes the seven pending
checks and applies canonical `58_native_fresh_identity_privileges.sql` in the temporary
restore only. Row counts and guard definitions remain unchanged; schema-profile replay
passes. A real connection using `athyper_dev_product_command` performs canonical schema
inspection in a read-only transaction and reports **zero blockers**. No fixture authority
is used for that inspection, but this does **not** exercise authenticated graph writes.

Executed receipt:
`~/.athyper/instances/dev/workspace/entity-native-build-d25387e0-1650-4f45-9d60-598421c5a408/`.
The archive hash is `73953f60105afeb9784155603311f34984bc9ed4894be4871a74eb3b12be6f43`;
`application-schema.json` records the actual login and complete inventory. The temporary
database was removed. Its database-specific fingerprint is not a deployable DEV pin.
The source DEV retains all seven checks, original drafts and identities. `reset` remains
unimplemented pending logical cleanup dispositions; do not invoke the rehearsal SQL
against the source database. Fresh backup/quiescence remains necessary for actual reset.

`compose.native-bootstrap.yaml` now provides the opt-in read-only startup directory mount
and `PLATFORM_CONTROL_NATIVE_BOOTSTRAP_CONFIGURATION_FILE`. It has not been enabled:
install the final DEV schema, resolve actual approved component pins, and generate the
exact configuration/initialization binding for the accepted proposals before startup.
No placeholder hash or restored-database fingerprint is an installed configuration.

Validation: 10 preparation/profile tests, 11 host qualifier/startup/compiler tests, 13
renderer tests, production Studio build and actual schema rehearsal pass. The broader
host typecheck still fails on the concurrent `entity-views-routes.ts:317` `group`/`groups`
mismatch. Next: authenticated Admin submission → independent Owner review → component
worker activation, then scoped cleanup/final schema installation and native startup.
No new Entity publication or activation, native draft commit or manual-test handover is
claimed by renderer deployment or the schema rehearsal.

### L1 — complete graphs, fresh identities and approved initial values

Pin the maintained source definitions and declared target scope. Assemble both graphs through shared code selected by metadata. Include root/provenance, fields/types/keys, relations, labels, navigation/sections/views/bindings, selected components, operations, exact permission semantics, storage/runtime settings, supported AI declarations and dependencies. AI can be processed last but cannot silently disappear from the accepted graph.

Report source coverage alongside diagnostics. A zero finding count is insufficient if a source family was skipped. Resolve each required finding as supported mapping, shared-framework fix, explicit metadata correction or owner-approved scope removal. Free-text disposition cannot clear an invalid compiler input. Keep UUIDs internal for routing; explicitly correct invalid visible technical bindings. Equal label text does not establish common label identity. Validate actual physical types/provider capabilities and readable relation targets.

Allocate fresh field identities for the new graphs and persist them through the canonical command. Bind stable proposed IDs to the proposal before retry; do not allocate a new set on every command attempt. A fresh reset run may have new identities. Prove uniqueness, valid parent/reference membership, atomic rollback and replay without duplicate allocation. No old identity adoption or historical mapping resource is required by this profile.

Implement trusted local bootstrap initialization for exactly the four approved list/read operations with their declared `requires_mfa=false`. The declared-operation preparation implementation now satisfies the existing bootstrap policy shape without source copying; actual complete proposal binding, production startup installation and final DB guards/grants are still pending. Bind the scope through approved proposal/operation coordinates, not entity-name dispatch or a blanket false default. Ordinary mutation clients remain unable to write protected state. No revision-4 rows or initializer reservations are needed after the rebuild.

Exit: both complete native graphs compile with supported resource bindings; all required paths are accounted for, and proposed IDs/operation declarations remain stable for execution and replay.

### L2 — backup, scoped rebuild and production composition

**Local-build scope:** there is no current QA/STG/PRD deployment assumed by this plan. Cleanup and native delivery are the active work; historical upgrade and formal environment-promotion qualification stay deferred. Rebuild the approved Entity scope, not every object in `metadata` regardless of dependents. `assertBootstrapPlansEmpty` checks the target member plans; it does not require deleting unrelated metadata or all historical records.

#### Verified inbound dependency inventory — 9 October 2026

Read-only administrative inspection of `athyper_studio` in `athyper-dev-db-1` found **25 cross-schema FK constraints** referencing `metadata` (audit reported 15). This is installed schema evidence, not application-role qualification. The counts below are FK edges, not row counts. Refresh at execution and inventory intra-metadata dependencies, views/routines/triggers/grants and logical resource/activation references too; this FK list is not the whole reset manifest.

| Dependent table                                     | Referenced metadata tables                          | FK edges | Default disposition for scoped reset                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot.entity_contract_revision`                 | entity, entity_change_set, entity_release           | 3        | Classify exact obsolete Entity histories; preserve unrelated histories and their complete parent closure                                           |
| `snapshot.entity_contract_test_run`                 | entity, entity_change_set                           | 2        | Remove only scoped obsolete test history; preserve other rows and composite-key parents                                                            |
| `snapshot.entity_numbering_test_artifact`           | entity, entity_change_set, entity_numbering_binding | 3        | Same scoped evidence classification; do not discard shared numbering dependencies                                                                  |
| `snapshot.entity_release_artifact`                  | entity, entity_release                              | 2        | Back up/remove only approved obsolete artifacts; preserve required unrelated artifacts and parents                                                 |
| `snapshot.entity_draft_save`                        | entity_change_set (two keys)                        | 2        | Remove scoped obsolete draft history only with its graph; fresh drafts create new history                                                          |
| `publication.entity_release_link`                   | entity_release                                      | 1        | Remove affected obsolete link only with a consistent scoped publication/projection disposition                                                     |
| `publication.entity_baseline_release_link`          | entity_release, entity_baseline_import              | 2        | Same; retain links/parents required by preserved consumers                                                                                         |
| `publication.entity_authorization_successor_link`   | entity_release, entity_baseline_import              | 2        | Same; do not break unrelated authorization lineage                                                                                                 |
| `publication.entity_runtime_restoration_link`       | entity_release                                      | 1        | Same; retain required restoration evidence                                                                                                         |
| `ai.atlas_learning_inbox`                           | entity_change_set                                   | 1        | Preserve; currently empty, recheck before reset; no authorization to delete learning data                                                          |
| `onboarding.onboarding_case`                        | entity_flow                                         | 1        | Preserve; currently empty, retain required flow metadata/structure                                                                                 |
| `onboarding.onboarding_case_step`                   | entity_flow_step                                    | 1        | Preserve; currently empty, retain required flow-step metadata/structure                                                                            |
| `entity_command_private.admission`                  | entity                                              | 1        | Quiesce command activity; classify expired/reset-scoped admissions; retain table/routine security                                                  |
| `entity_command_private.operation_bootstrap_source` | entity, entity_change_set, entity_operation         | 3        | Old source-copy evidence is unnecessary for this approved fresh path; clear only obsolete scoped references, without granting private-table access |

Additional observed row counts: `ai.atlas_learning_inbox=0`, `onboarding.onboarding_case=0`, `onboarding.onboarding_case_step=0`, `snapshot.entity_contract_revision=46`, `metadata.entity_field_identity=31`, `metadata.entity_field_identity_adoption=0`. Empty dependent tables still have DDL dependencies. These values are an inspection baseline, not permission to assume they stay empty or to remove all 46 revisions. The 63-label count and exact activation heads cited in earlier material were not reverified in this inspection; capture actual values before reset instead of copying stale counts.

The inspection used `pg_constraint` joined to source/referenced `pg_class`/`pg_namespace`, filtering `contype='f'`, referenced schema `metadata` and dependent schema other than `metadata`. Record exact constraint definitions and composite keys in the setup inventory. Default/RESTRICT row deletion is not automatic cascading deletion. `DROP ... CASCADE` may remove inbound constraint objects rather than dependent table rows, leaving an apparently populated but unprotected schema; it is not a preservation technique.

#### Binding cleanup decisions

- **Preserved dependency closure:** preserve IDs and full meaning of metadata parents needed by out-of-scope AI/onboarding/platform/history rows. Prefer retaining those objects/rows; if rebuilding is necessary, extract/restore complete parent and required child closure with original IDs, validate all FKs and compare preserved content. Never fabricate stub parents or reinterpret an old identity. This does not adopt those IDs into fresh drafts.
- **Obsolete Entity closure:** existing approval permits removal of specifically inventoried obsolete local Entity drafts/snapshots/releases/test artifacts and affected links/projections after backup. Identify entity/release/draft coordinates, tenant/plane scope and reason. Do not globally truncate snapshot/publication/runtime schemas, erase unrelated audit data or infer obsolescence from a table being empty.
- **Old identities:** inventory all 31 existing identities and references before reset. Remove only those within the obsolete deletion closure; preserved historical identities retain their original meaning (retire through an applicable existing lifecycle where needed). Fresh field IDs must not reuse them. Do not restore old IDs as new field identities or retain adoption as a prerequisite.
- **Constraints and routines:** no blanket inbound-FK disabling. Any temporary DDL reconstruction names each object, restores its definition/grants and validates it before services resume. Unknown preserved-state dependencies stop destructive setup until disposition; they do not block independent graph/startup implementation.
- **Initializer:** the old `operation_bootstrap_source` reader is not a required dependency under the new owner approval. Do not preserve obsolete source rows solely to keep using it. Implement the bounded approved fresh-operation initialization instead; ordinary protected-state controls stay unchanged.

The setup inventory is emitted and recorded before destructive execution, with preserve/remove/recreate actions and dependency closure. Producing it is authorized engineering, not another general approval gate. Scope expansion into preserved business/AI/onboarding state requires a specific decision; do not silently expand cleanup.

#### Recovery proof and pre-reset defect baseline

Verify the **newly captured** backup by restoring it into temporary local targets, checking command exit, required schemas/routines/roles and representative counts/FK integrity, then remove the temporary targets. Do not substitute the successful 8 October restore proof for a later dump. No second long-lived environment is required. Keep the source instance intact until restoration succeeds; failed restoration blocks destruction. Quiesce writers/workers over the capture/reset window, and record any cross-database consistency limits.

One compact harness baseline captures:

- Exact pending constraint definitions, migration inventory and final-schema differences.
- Old field-identity IDs/status/reference scope, label IDs/counts and graph/source hashes.
- Affected publication keys, release IDs, activation heads and installed resource fingerprints by destination; do not infer their identity from aggregate counts.
- Preserved dependency counts/content checks and explicitly removed object/row coordinates.
- Known failing assertions: missing bootstrap startup composition, unsupported graph mappings if found, pending schema readiness, and live-resource semantic qualification rejection. Record fixed historical trigger/key/order/privilege bugs as historical, not active failures without reproduction.

After reset, compare preserved state, confirm removed obsolete state is not still active on a consuming plane, and check fresh identities are disjoint from the old set. Reset success does not fix missing production assembly or semantic validation; those still need code and executed tests. This baseline is a small machine-readable run result, not another audit report.

Prepare the complete graph/startup implementation before discarding its old inputs. The owner has authorized reset; do not ask again merely because setup is destructive within the approved scope. Dependency inspection is still required to determine that scope concretely.

1. Enumerate Entity metadata tables, dependent snapshots/receipts/private command references, affected obsolete publication/runtime projections and required shared resources. Preserve IAM, business data, unrelated services and migration history. Retain or reinstall shared component/descriptor/provider dependencies. Avoid uncontrolled `DROP ... CASCADE` or schema-wide deletion of unrelated state.
2. Stop affected writers/workers, capture a fresh recoverable backup including required roles/dependencies, restore-verify that exact backup in temporary local targets, and record the recovery command/location and result without credentials. Restore on setup failure where transactional rollback cannot recover the reset. Backup/restore is an approved local tradeoff, not a claim of simultaneous cross-database snapshot protection.
3. Rebuild the scoped canonical structures through maintained setup/migrations, install final native constraints/guards and restricted grants, and reinstall required framework resources. Preserve immutable migration files/hashes. Explicitly handle schema recreation alongside the retained migration ledger; an already-recorded migration will not automatically recreate dropped objects.
4. Load the actual host configuration and assemble the trusted proposal/compiler/provider/identity/resource bindings. Missing required config remains an actionable failure. Resolve current local resource pins automatically where possible; no no-op qualifier, candidate self-authorization or administrator graph seeding.

Acceptance expects **zero `_native_pending_ck` blockers**, final integrity checks present/enabled, and application-role access that is neither superuser nor BYPASSRLS nor inherited admin. Print all underlying schema blockers, not just `NATIVE_SCHEMA_NOT_READY`. Prove valid writes and focused invalid graph writes reach and fail their intended constraints; an unrelated permission rejection is not replacement-integrity evidence.

The old seven-predecessor transition and adoption rehearsal are not this clean-path gate. The seven-check constraint-release upgrade migration is deferred, not cancelled or claimed implemented: before an upgraded baseline is supported, author and rehearse that migration against a restored copy of the upgraded database. No QA/STG/PRD environment exists by assumption in this local plan; do not force an upgrade rehearsal ahead of local native delivery or a future clean-install-only environment. New-run fingerprints need not match discarded DEV values; bind internally consistent values for this run and reject within-run mismatch. Formal signed qualification dossiers are deferred; existing artifact verification and required semantic checks are not disabled.

### L3 — actual command execution, replay and rollback

Use a current authenticated Platform Admin session and the actual product-command application role. Request refresh only when an executable command is ready; never request or log tokens. Current author admission remains required for initial execution and replay.

Run each entity command in its own transaction. Verify complete canonical readback, graph hash, compiler output and runtime parsing; capture draft coordinates, revision and command result. Prove replay returns matching hashes with unchanged root/revision/members/identities/snapshots/command receipt. The existing audit path may append a correctly classified replay event; do not require globally unchanged audit row counts or disable auditing.

Inject a controlled failure using a separate local test proposal within the approved reset scope. Confirm no partial root, fields, identities, history or success receipt remains. Reauthorize on retry. Keep the accepted two-entity proposal input unchanged; reset is not a substitute for rollback or replay.

If Country succeeds and State Region fails, retain Country's unpublished draft and retry State Region. The combined milestone remains incomplete. There is no cross-entity coordinator, compensating deletion of committed history, or automatic publication from bootstrap.

**Milestone A:** both fresh drafts committed through the actual application path, exact graph readback and compilation verified, both commands replayed, and controlled failure rolled back. Old revision-4 drafts or fixture-only SQL results cannot satisfy this exit. Applicable authorization remains required for any real storage access even though formal F6/F8 dossiers are deferred.

### L4–L6 — real local reads, review, activation and UI handover

L4 implements bounded live-resource semantic qualification and actual production storage/current-security/identity adapters. `RESOURCE_LIVE_READ_QUALIFICATION_REQUIRED` must be replaced by real validation, never unconditional success. No new allow branch for local runtime is authorized. Pre-publication compiler/provider tests prepare the path; final standard-UI acceptance is after new release activation.

**9 October continuation — implemented/tested, not installed or executed:**
`compileNativeLiveReadResources` now lowers a complete native graph through
`compileNativeRelease` into linked security/storage candidates and live-read pins.
It preserves explicit permission declarations, requires matching permission
catalogue coordinates and provider pins, maps every field to its stable identity,
and rejects unsupported masks, ownership controls and non-direct storage. It does
not grant storage access or attest installation, review or deployment. The control
resource qualifier can now compare a submitted candidate against this independently
resolved native source; missing source composition still raises
`RESOURCE_LIVE_READ_QUALIFICATION_REQUIRED`. Rehashing an altered policy or changing
its resource coordinate does not pass this comparison.

The integration trace also confirms that the ordinary authoring review/publication
path remains legacy-only: `loadGraph` rejects native roots with
`NATIVE_AUTHORING_READER_REQUIRED`, `validateGraph` reports
`NATIVE_GRAPH_RELEASE_COMPILATION_NOT_QUALIFIED`, and `compileGraph` rejects normalized
sources. The existing human-reviewed publisher also requires legacy adoption receipts
and layout markers. Those guards must not be removed to publish native drafts.
The next integrated change must connect the native reader/compiler and canonical
source/review pins through review, release allocation and target preparation, using
native target rows and fresh authorship evidence rather than fabricating adoption.
A session refresh cannot fix these code paths.

Executed checks for this continuation:

```sh
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/native-live-read-compilation.test.ts src/native-release-compilation.test.ts
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/control-plane/resource-source-qualification.test.ts
pnpm --filter @athyper/server-plane-studio-meta-entity-authoring run typecheck
```

The focused suites passed 18 and 5 tests respectively; authoring production/test
typechecks passed. The changed-file formatting gate passed. Host typechecking still
reports the pre-existing `entity-views-routes.ts:317` `group`/`groups` mismatch;
this continuation does not claim a green host build. No current DEV proposal was regenerated, no database write was
executed, and no Entity candidate was submitted, approved, published or activated
in this continuation. The last executed draft state remains revision 1 for both
entities. Runtime installation/resolution, actual live-read requests and manual UI
handover remain pending; these component results do not satisfy L4–L6.

**9 October native review cleanup — implemented/tested, not installed:**
The product review service now compiles native 2.5 sources directly and reads target
rows instead of legacy layout markers. `/adopt` is no longer registered. Submit
requires the native draft author; approve requires an independent actor and the
exact prior submission receipt. Replay, changed-source rejection, transactional
receipt failure and independent review checks remain covered. Historical adoption
receipts retain their read contract; no historical rows or applied migrations are
rewritten.

Canonical `62_native_product_review.sql` and the registered forward migration
`20261009_native_product_review.sql` replace the receipt INSERT policy. The policy
requires native product version 2, authenticated human identity binding, exact
revision, author submission and independently submitted hash correspondence. It
allows neither adoption nor graph writes. The old Address-dependent adoption
rehearsal has been replaced with a disposable PostgreSQL policy test, including
wrong author/tenant, self-review, stale revision/hash, non-native source and rollback
cases. This is policy regression evidence, not authenticated DEV execution.

Executed checks: the full authoring suite passed **919 tests with 11 opt-in skips**;
`PRODUCT_REVIEW_POSTGRES=1 pnpm --filter @athyper/server-platform-host exec vitest run
src/composition/control-plane/product-review.postgres.test.ts
src/composition/control-plane/product-review.test.ts` passed 5 tests including the
actual PostgreSQL policy run. Authoring production/test typechecks passed. Migration
layout verification reports 173 classified files and 165 retained SQL files. Host
typecheck still reports the existing `entity-views-routes.ts:317` mismatch.

**Not deployed:** the control host has no trusted native review source resolver yet
and explicitly rejects with `NATIVE_REVIEW_HOST_NOT_CONFIGURED`. The publication
worker's legacy plan/adoption handling has not yet been replaced. Do not install the
new policy or restart the review host as a delivery claim until source compilation,
review lifecycle snapshots and native release preparation work together. Installed
live-read resolution and UI verification are also pending. Both executed DEV draft
states remain revision 1; no new Entity review/publication/activation occurred.

L5 uses existing authenticated human Admin proposal and independent Owner approval for concrete candidates, then the shared publication workers. A refreshed Owner session alone is not candidate approval. Verify signed artifacts as required by the existing protocol, explicit declared targets, deployment acknowledgements and activation. No automatic assumption that `dev:publish` machine credentials attest human review. Request logins only for ready commands/candidates.

L6 verifies both entities against the new activated artifacts:

- Authorized list and detail requests succeed; an expected denial fails for the intended reason.
- Valid undefined entity permissions do not gain invented grant requirements; tenant/record boundaries remain enforced.
- Supported search, filters, sorting and pagination work; State Region resolves Country through readable reference labels.
- Compiled presentation excludes visible technical UUID bindings; actual default/saved views, reference labels and fallbacks do not expose UUIDs. Internal artifact UUIDs remain valid routing/identity data.
- Navigation uses explicit published groups/sections and the standard shared UI, with no invented Overview/display identity.

**Milestone B:** both new Entity releases independently reviewed, published and activated; final API/UI smoke results identify their exact active artifacts. Handover includes environment/URLs, entity and draft IDs, proposal/compiled hashes, release/deployment IDs, declared planes/destinations, acknowledgements, tested accounts/roles without secrets, tested behaviors, known limitations and recovery location. Old-release baseline testing does not qualify.

Handover wording: **Local native build and manual-test readiness verified. Formal QA/staging qualification remains subject to the entry checklist.** Do not claim full F6/F8/F9 qualification from local smoke evidence. Local manual testing is distinct from creating/promoting to a separate QA environment.

### QA-entry and later capability checklist

| Item                                       | Local treatment                                                                           | Required next boundary                                           | Current result                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Installed-database upgrade compatibility   | Clean rebuild; historical predecessor rehearsal deferred                                  | Before claiming upgrade support / applicable QA upgrade testing  | Deferred, not passed                           |
| Formal F6 storage authority                | Real local provider/scope smoke behavior required                                         | Before QA live-data qualification                                | Formal evidence pending                        |
| Formal F8 effective security               | Actual exact-permission/tenant/record checks required                                     | Before QA live-data qualification                                | Formal evidence pending                        |
| Formal F9 identity resolution              | Fresh identities and current reader resolution locally                                    | Before QA qualification of supported identity path               | Formal evidence pending                        |
| Historical F9/adoption/conversion          | Excluded; material retained in backup                                                     | Only before offering that migration capability                   | Not a universal fresh-native QA blocker        |
| Resource provenance/qualification packages | Current consistent resources and protocol verification retained; formal dossiers deferred | QA promotion and applicable resource acceptance                  | Pending                                        |
| Replay/concurrency/audit qualification     | State-preserving replay, current authorization and rollback locally                       | Broader QA negative/concurrent scenarios                         | Broader suite pending                          |
| Environment containment                    | Explicit local setup guard and no runtime bypass                                          | Before enabling a QA/staging deployment profile                  | Proof pending                                  |
| Recovery and staging rehearsal             | One DEV environment with recoverable backup                                               | QA recovery acceptance; separate staging rehearsal as applicable | Future reset backup/execution not yet recorded |
| Independent review and target delivery     | Required locally, not waived                                                              | Before local L5 and every later release                          | New native Entity delivery pending             |
| F5 retention/capacity                      | Not a local smoke prerequisite                                                            | Before production enablement                                     | Deferred                                       |

Close applicable checklist items or record a specific owner disposition before promotion; do not silently carry local exceptions into another environment. Security/authentication/runtime correctness is not waived by shortening evidence. No general promise that every historical migration feature must exist before fresh-native QA.

### Latest execution and next action

**Current update:** complete proposal graphs and production startup composition are implemented; a fixed renderer bundle is deployed, but its component candidates await authenticated submission and independent approval. Final schema/grants pass restored-database rehearsal and application-login catalogue inspection. Logical cleanup dispositions, source DEV reset/final setup, actual startup configuration and native bootstrap/replay remain unfinished. No replacement draft, Entity publication or activation occurred. Milestones A and B are not complete.

## Historical evidence boundary

All following entries are chronological evidence from the earlier foundation approaches. Their commands, receipts and test results retain their original scope. Their adoption/source-copy/legacy-conversion requirements and stale “remaining” statements are superseded for the current local profile by the section above. Do not delete old evidence, rewrite historical results, or treat historical component approvals as approval of new native entities.

## Owner-authorized DEV reset preparation — 2026-10-08

The owner authorized scoped disposal of obsolete local Entity authoring/publication
state and a fresh native Country/State Region bootstrap. Legacy conversion is outside
the immediate handover scope. IAM, business data, platform services, migration history,
independent publication review and existing MFA controls remain preserved.

Private backup directory: `~/.athyper/instances/dev/workspace/entity-native-reset-20261008T054638Z`.
Custom-format backups for Studio, Neon, Mesh, IAM and Infisical plus cluster globals
were captured with restrictive file permissions. All five database archives passed
full restore rehearsals in temporary databases, which were then removed; checksums
and results are in `manifest.json`. This was a sequential per-database logical backup,
not a simultaneous cluster snapshot. No production/local source database was reset.

The current four Country/State Region list/read operations all store
`requires_mfa=false`. Fresh-operation initialization is a separate approval scope
from the previous persistence/compiler preservation approvals. An exact revision-4,
source-row-hash-bound proposal is captured in `operation-initialization-proposal.json`
in the same private directory. The owner approved this exact scope on 8 October;
this conversation decision is not installed authority or a publication-review receipt.
Source rows remain intact. Native bootstrap, reset application and deployed live-read
integration remain unfinished independently of this decision. No publication or
activation occurred during backup preparation.

The source document hash is
`7326147996a695b2062fe081fadfd0d04318944690907cc281f5cc3b45c9d2f4`.
A fresh read-only DEV check confirms all four source values and revision pins still
match; `operation-source-recheck.json` records that administrative inspection, not
application-role qualification. The private proposal now records the owner decision.

`createApprovedOperationBootstrap` implements the bounded source-copy insert plan
and is accepted explicitly by native supplemental preparation after its existing
root/schema guard. Trusted host configuration pins the independently approved source
hash and exact fresh target IDs. Transactional source locks/rechecks reject missing
or changed sources, different tenants/targets, existing target members, reused source
member IDs, non-read operations and client protected-state properties. Ordinary saves
still reject new operations without this separately installed initializer. No default
for future entities, enforcement change or publication approval is introduced.

Validation: 847 authoring tests passed, seven opt-in tests skipped; package production
and test typechecks passed. The bootstrap PostgreSQL opt-in test was run separately
and passed. It uses the real admission transport and source-reader SQL with minimal
fixture Entity tables: admitted exact-source reads pass; absent/forged admission,
wrong hash, changed revision/value, cross-tenant target, sealed target, direct source
reads, approval-table writes and committed-token reuse reject. It does not qualify a
complete native graph, authenticated DEV command or publication.

The application role's existing restrictive read policies admit only its target
draft and do not allow locking old operation/entity rows. Forward migration
`20261008_entity_native_operation_bootstrap.sql` now supplies a bounded
`read_operation_bootstrap_source` routine instead of widening those table grants.
It requires current transaction admission and exact privately installed approval,
source and fresh-native-target coordinates; it locks that evidence and source through
the outer transaction. The private installation table has no application/issuer
write or read grant. The migration itself installs no approval rows or operations.
Its SHA-256 is `b35ac2e66391ddc34c5be7b5a8c68d0da8e64cf0f77e46503cdaeb67056fbbcf`.
DEV rollback rehearsal, ledger-backed application and exact-hash replay passed; authorization assignments
and activation heads were unchanged. Receipts are `operation-reader-rehearsal.json`
and `operation-reader-installation.json` in the backup directory. This is installed
reader infrastructure, not installed source/target bindings or handover completion.
DEV privilege inspection confirms reader EXECUTE but no application SELECT/INSERT
on the private evidence table and no UPDATE on operation columns. The installation
table remains empty. Fifteen migration-runner tests and migration-layout validation
also pass.

Fresh native root creation, whole-graph command composition, target-specific approval
installation and live-read adapters remain unfinished. No data reset, new draft
creation, operation insertion, Entity publication or activation occurred.

### Fresh native bootstrap command — repository implementation

`KyselyMetaEntityAuthoringRepository.executeNativeBootstrap` now connects the
insert-only typed graph planner to root creation, revision advancement, initial
and saved immutable snapshots, exact native readback, the existing native release
compiler and runtime projection/parser. An installed server policy resolves the
proposal; request data contains only coordinates, proposal hash and idempotency key.
Admission and schema/resource qualification run again on replay. Missing host policy,
changed proposal/history, reader storage mismatch and failed audit reject. A savepoint
rolls back root, members, history and receipt even when a caller catches the failure
inside its own transaction. Compilation/parsing here does not publish a release or
attest live storage/security qualification.

Evidence: 855 authoring tests passed, seven opt-in PostgreSQL tests skipped. Production
and native-test typechecks passed. Eight new transaction-protocol scenarios use a
simulated SQL transport and the real compiler/parser; they do not establish canonical
PostgreSQL grants, constraints or authenticated DEV execution. The existing compiler
fixture is shared without changing its assertions or protected-control values.

Deployment remains explicitly incomplete. The existing governance resolver admits an
already-created draft, and the application's grants do not create a fresh product
root. The private operation-source installation table also requires an existing target
FK, so preallocation/installation must be integrated with root creation rather than
inserting a placeholder via an administrator. A narrowly scoped creation admission,
qualified native constraint/grant installation, real proposal/resource resolution and
target-specific initializer installation remain required. Deployed F6/F8/F9 adapters,
independent publication review and activation follow. No additional general owner
approval is requested; these are implementation gaps. No DEV data was reset, no
replacement draft was created and no new Entity release was published or activated
by this checkpoint. The refreshed Admin session was not used to fabricate evidence.

### Product-root creation admission installed — 8 October

The next admission step is implemented: `creationEntityId` is an explicit optional
product-command scope, captured in the request hash and the private admission ticket.
The control API resolves current human/IAM authoring authority against the exact
system-owned product entity for a fresh target; it rejects conflicting existing roots.
Existing-draft commands retain their previous admission path. Creation has no review
receipt requirement and grants no publication authority.

Forward migration `20261008_entity_product_draft_creation.sql` installs a restrictive
root INSERT policy and `admitted_creation` verifier. The verifier requires the current
transaction/login/actor/tenant ticket, exact entity and draft, unexpired admission,
and current system ownership locked through commit. INSERT permits only the canonical
root-creation columns; native pins and operation controls are not granted. Exact SQL
effects still depend on the canonical writer; the ticket is scope enforcement, not
a comparison of SQL against the request body.

SHA-256: `f2f3842ef241c4f3b13eec87693be1d07c5257ed6306834c0c2f3d37f5d0768f`.
DEV rollback rehearsal, ledger-backed installation and exact-hash replay passed.
Receipts `product-creation-{rehearsal,installation,replay}.json` are in the existing
private backup directory. Authorization assignments and activation heads were
unchanged. DEV privilege inspection confirms root-ID INSERT and verifier EXECUTE,
with no native-version UPDATE grant. This supersedes the earlier absence of a
fresh-root INSERT privilege; it does not establish complete native-write authority.

The isolated PostgreSQL application-role test passed with missing/ordinary tickets,
wrong entity/target/actor, changed ownership, private-ticket writes, native-pin updates
and consumed-token reuse rejecting. Authorized INSERT and rollback pass. This test
uses real admission SQL/RLS but a minimal root schema and synthetic issuer, not an
authenticated DEV graph bootstrap. Nine control-governance tests and sixteen migration
runner tests pass. The authoring suite passes 856 tests with eight opt-in tests skipped;
the new PostgreSQL test was explicitly enabled and passed separately. Authoring, native-test
and host typechecks pass. The source-mounted control API was restarted and is healthy;
an unauthenticated session request still returns 401. Initializer target installation, native member grants/constraint
qualification, actual bootstrap endpoint composition and deployed live reads remain
open. No Entity draft, operation, release or activation was created by installation.

### Initializer evidence and native INSERT privileges installed — 8 October

The four owner-approved source bindings are now installed in DEV for exactly two
reserved future draft UUIDs. `native-bootstrap-targets.json` and the
`initializer-evidence-{rehearsal,installation,replay}.json` receipts reside in the
existing private backup directory. Source hash remains
`7326147996a695b2062fe081fadfd0d04318944690907cc281f5cc3b45c9d2f4`.
The operational installer locks/rechecks every original source row/revision/value,
rejects existing targets and conflicting evidence, and replays without overwriting
installed rows. It installs no operation, draft or publication-review receipt.
DEV readback: four bindings, two target IDs, zero existing target roots; the command
role still has neither SELECT nor INSERT privileges on the private evidence table.

Forward migration `20261008_entity_operation_bootstrap_reservation.sql` replaces only
the target FK with deferred target-integrity triggers, retaining all source FKs. This
allows preallocation without an administrator-created placeholder draft. A present
target must be the matching native product root; deletion of a pinned target rejects.
The existing source reader still requires the real matching empty target and current
transaction admission. Migration SHA-256:
`df9539898ceee1d9102be4e81fa677f869d073f5c2eb73ff544e7d10e335f032`.

Forward migration `20261008_entity_native_bootstrap_privileges.sql` installs a finite
INSERT-column inventory for the selected typed/reference families and retained
structural bindings. Restrictive policies require exact creation admission, product
root, initial revision and actor. Its operation trigger rechecks/locks the independently
approved source and rejects a changed protected value. No operation UPDATE/DELETE
permission is granted. SHA-256:
`e71084c437e409747179e4922b3aee60db770cdea0d34ffa164a0f4ab749e3ac`.
DEV rollback rehearsals, ledger-backed installation and grants replay passed; receipts
are `initializer-reservation-*` and `native-grants-*` in the private backup directory.
Authorization assignments and activation heads were unchanged. All seven native
pending constraints remain: these installed privileges do not enable cutover.

The opt-in PostgreSQL test now proves reservation-before-root, mismatch rejection,
reserved-target retention, exact protected-value insertion, changed-value rejection,
missing creation-ticket rejection and rollback under the application login. It also
retains the earlier source-change/read-isolation checks. The minimal fixture schema
is not a whole canonical graph or deployed F6/F8/F9 proof. Column-inventory tests
compare the SQL grants with the selected typed descriptors; installer tests prove
hash rejection and rollback-by-default. Whole-graph constraint cutover, live resource
resolution, bootstrap endpoint composition and deployed live reads remain unfinished.
Validation: 856 authoring tests passed (eight opt-in skips), the enhanced PostgreSQL
test was explicitly enabled and passed, 21 installer/migration/inventory tests passed,
and production/native-test typechecks, migration layout and formatting passed.
Both original drafts remain revision 4 with no native marker.
No replacement draft, new Entity publication or activation occurred.

### Native proposal bundle construction — 9 October

Implemented `buildNativeBootstrapProposalBundle` and an offline construction command.
Input is `{ maximumBytes, maximumMembers, proposals: [{ authorId, proposal }] }`, where
`proposal` contains exactly `{ title, branchCode, baseReleaseId, graph }` and `graph` is
complete native 2.5 authoring data. This command does not translate legacy definitions or
supply installed compiler contexts. It checks typed core/layout/operation/AI rows, local
reference closure, label completeness, unique target coordinates and budgets. Manifest
entries bind exact authors, entities, drafts and content hashes. Output includes stable
command coordinates for replay. Actor and tenant are still resolved through IAM at execution.

Implemented command, from repository root:

```sh
pnpm --filter @athyper/server-platform-host exec tsx scripts/operations/build-native-bootstrap-proposals.ts /absolute/native-input.json /absolute/new-bundle-directory
```

The output directory must be new. Documents use exclusive writes with private permissions;
the manifest is written last, and an interrupted partial directory cannot load as a valid
bundle. No database write, startup installation, approval, publication or activation occurs.

Validation: 21 tests passed across `native-bootstrap-bundle.test.ts` and
`native-bootstrap-proposals.test.ts`; host production typecheck passed. Tests execute the
real command, read its two synthetic complete graphs through the existing production
reader, verify stable retry inputs and no overwrite, and reject invalid references,
partial rows, foreign ownership, extra authority input and budget excess. This is proposal
transport evidence, not a production-entrypoint or canonical PostgreSQL acceptance result.

**Implemented → tested. Not installed → not executed for DEV.** Actual complete
Country/State Region native graph construction, production startup resource composition
and canonical authenticated bootstrap/replay remain unfinished. No replacement draft or
Entity activation was created by this checkpoint.

### Complete AI declaration resource assembly — 9 October

The native bootstrap wrapper now replaces caller-supplied AI context with
`resolveNativeBootstrapAi`. It resolves insight-provider identities through the production
`resolveAtlasEntityToolManifest` used by publication and the tool factories. Navigation and
presentation bindings share the existing metadata publication vocabulary; these hashes are
content identities, not installation receipts or execution grants. Field access, search
membership and relation linkage are checked against the selected native graph and its
resolved authorization roster. Nonempty declarations cannot silently become absent.

Executed checks:

```sh
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/control-plane/native-bootstrap-ai.test.ts src/composition/control-plane/product-command-runtime.test.ts
pnpm --filter @athyper/server-platform-host exec tsc -p tsconfig.json --noEmit
pnpm --filter @athyper/server-contract-metadata exec vitest run src/__tests__/entity-ai.test.ts src/entity-ai-manifest.test.ts
pnpm --filter @athyper/server-contract-metadata exec tsc -p tsconfig.json --noEmit
```

Results: 23 host tests and 51 metadata-contract tests passed; both production typechecks
passed. The two actual reference definitions preserve their full AI declarations with
real manifest hashes in these tests; their surrounding graph identities/authority are
still synthetic. This does not establish complete native DEV proposals or bootstrap.
The inspected private canonical rehearsal likewise uses a reduced three-field synthetic
graph and fixture authority, and cannot serve as complete two-entity acceptance evidence.

Status: **implemented and tested; not installed or executed as DEV bootstrap**.
No database writes, replacement drafts, publication or activation occurred. Complete
proposal construction, base compiler/schema/initializer/component assembly and startup
wiring remain unfinished; the composition-boundary acceptance and actual commit/replay
milestone have not passed. Deployed F6/F8/F9 remains separate outstanding integration.

### Native authorization assembly — 9 October

`resolveNativeBootstrapAuthorization` now assembles compiler authorization from the
shared read-callable inventory, exact native permission/scope declarations and the
application-resolved stable identities. The bootstrap wrapper replaces caller-supplied
handler/resolver/permission rosters. Valid absence remains `none`; a defined permission
keeps its exact code. Duplicate/foreign/deprecated permission rows, missing or duplicate
scope bindings, alternate scope coordinates, unsupported handlers and altered operation
semantics reject. No MFA initialization or enforcement changed.

The implementation inventory is shared with real runtime handler registration. Its
fingerprint describes compatibility, not a signed resource or evidence of permission
catalogue availability, current grants, storage ownership or deployed F8 enforcement.
Those checks remain independently required. Tests compile both absent and defined
permissions, qualify the result against the actual runtime registry and invoke the
registered list/read callables; negative cases verify scope and semantics rejection.

Executed from repository root:

```sh
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/control-plane/native-bootstrap-authorization.test.ts src/composition/control-plane/product-command-runtime.test.ts src/composition/shared/entity-runtime/__tests__/entity-read-registrations.test.ts src/composition/shared/entity-runtime/__tests__/country-authorization-boundary.test.ts src/composition/control-plane/native-bootstrap-provider.test.ts
pnpm --filter @athyper/server-platform-host exec tsc -p tsconfig.json --noEmit
```

Results: 55 tests passed and host production typecheck passed. No database command,
resource publication, new draft or activation ran. Full startup assembly remains
incomplete: complete native proposals, schema/initializer/component and remaining
compiler resource composition, application bootstrap/replay and deployed F6/F8/F9
are not established by these tests. The control API bootstrap option remains unbound.

### Native record-provider assembly — 9 October

The production bootstrap wrapper now replaces supplied `compiler.listProviders` with
capabilities exported by the shared record service. The implementation profile supports
generic read-only table access, table/compact projections, exact/no counts, 100-row pages,
20 flat filters and ten sort levels. Page-size enforcement and compiler assembly share
the same constant. Unsupported provider modes, custom handlers, estimated counts,
nested filter depth and excess limits reject; no declaration is silently rewritten.
The fingerprint identifies this implementation contract, not a signed resource approval
or deployed storage/security evidence. Existing independent resource qualification remains.

Executable checks (from repository root):

```sh
pnpm --filter @athyper/server-platform-host exec vitest run src/composition/control-plane/native-bootstrap-provider.test.ts src/composition/control-plane/product-command-runtime.test.ts
pnpm --filter @athyper/server-service-records exec vitest run src/kysely-record-repository.test.ts src/__tests__/entity-list-service.test.ts src/__tests__/multi-scope-query.test.ts src/__tests__/records-query-contract.test.ts
pnpm --filter @athyper/server-platform-host exec tsc -p tsconfig.json --noEmit
pnpm --filter @athyper/server-service-records exec tsc -p tsconfig.json --noEmit
```

Results: 31 focused host tests and 42 affected record tests passed; both production
typechecks passed. These are implementation tests, not authenticated DEV requests.
No DEV mutations, replacement drafts or activations were performed in this checkpoint.
The startup entrypoint still does not compose the full native proposal/base resource
resolver. Complete compiler/schema/initializer assembly, canonical bootstrap/replay,
approved live resources and deployed F6/F8/F9 remain required before handover.

### Physical compiler bindings and reference publication — 9 October, 00:06 MYT

The native product-command composition now replaces its supplied storage catalogue with
PostgreSQL facts read through the admitted application transaction. It checks the selected
storage plane against the configured Studio connection, validates the proposed catalogue
hash, and rechecks physical facts during qualification/replay. Facts cover exact column
storage types, domain-chain nullability, constraints, enum values and default/generated
expressions. Views, foreign tables, unsupported codecs/arrays and incomplete catalogues
reject. This is physical compilation evidence, not storage ownership or authorization.

Read-only DEV execution used login `athyper_dev_product_command`, effective role
`athyper_product_command_app`, database `athyper_studio`. No business rows were selected.
The current facts are:

| Object                | Columns | Catalogue hash                                                     |
| --------------------- | ------- | ------------------------------------------------------------------ |
| `shared.country`      | 28      | `afc7b035b11a62473ab0ba4caf2f2a669dd11add14c366d03272ed928ee8f083` |
| `shared.state_region` | 15      | `19f0ed73275bc769640357d7ffcba1326fce0455fb82ee8f505efeef02e2457c` |

Private receipt and executable inspection script:
`~/.athyper/instances/dev/workspace/native-storage-catalogue-20261009/inspection.json`
and sibling `inspect.mts`. The script uses the existing private application connection;
it does not provide an authenticated bootstrap command or a publication approval.

The publication lowering step previously rejected **every** nonempty relation graph,
including references already supported by the shared runtime. It now accepts only fully
represented single-target read-only references, preserving their exact mapping and target.
Source/compiled differences, polymorphic/mutable/to-many relations, orphan targets/mappings,
missing runtime references and changed target/key mappings reject. All six Country/State
Region × Studio/Neon/Mesh whole-source fixtures now exercise this actual publication
lowering step after native compilation; their resource/identity/permission context remains
synthetic, so they do not attest DEV publication or deployed F6/F8/F9.

Validation: 893 authoring tests passed (10 opt-in skips); the subsequent catalogue-only
run passed 9 tests after adding constraint/enum/generated-expression fingerprint coverage.
489 publication tests passed
(5 skips), 36 focused host tests passed, and authoring/publication production/test and
host production typechecks passed. No DEV migration, new draft, publication or activation
was performed by this checkpoint.

**Still not implemented end-to-end:** the complete production native proposal and base
resource assembly/startup binding, registered provider/handler/AI resource closure,
canonical bootstrap/rollback/replay for both entities, approved live security/storage
resources and the deployed F6/F8/F9 adapter. Independent Entity candidate review and
activation follow those concrete candidates. These are engineering gaps; refreshing a
login cannot close them. Both existing drafts remain revision 4. The old active releases
remain baseline-only testing, not handover of the new native path.

### Installed compiler identity reads — 8 October, 15:39 UTC

The production native proposal composition now resolves the compiler's stable-identity
roster through the admitted application transaction. It replaces supplied key/parent
mappings with exact installed rows, rejects missing/duplicate/retired/foreign identities,
and rechecks that roster during qualification, including replay. This supplies the
identity roster only: it does not establish the separate identity-resource publication
pin, provider/catalogue resources, or source-bound reservation adoption.

A real PostgreSQL application-role regression demonstrated that the existing identity
SELECT policies returned zero rows before the fresh root was inserted. Forward migration
`20261008_entity_native_bootstrap_identity_read.sql` extends only those SELECT policies
using the existing entity-bound creation admission. No new role/table grant, mutation,
initializer or publication authority is added. The test proves exact entity visibility,
wrong-actor/no-ticket rejection and tenant isolation, including when an unrelated broad
permissive policy exists. It uses real admission/RLS and reduced fixture tables, not DEV
end-to-end bootstrap evidence.

DEV installation and no-op replay completed using the existing runner:

```sh
node tooling/scripts/verification/apply-entity-native-resource-preparation.dev.mjs --native-bootstrap-identity-read --apply=DEV-NATIVE-RESOURCE-PREPARATION --output ~/.athyper/instances/dev/workspace/native-bootstrap-identity-read-20261008/application.json
```

Migration SHA-256: `b60826e4b277549aad553bf74dd51cef0d422128280fab3f13e9ccdf41ebb4c6`.
The sibling `replay.json` records the repeated invocation. Rollback rehearsal passed;
original authoring/history data, authorization rows and activation heads were unchanged.
The runner's `authorizationAndHeadsUnchanged` field fingerprints rows, not the intentionally
changed identity SELECT policy. Existing verified DEV backup remains available.

Validation: 885 authoring tests passed (10 opt-in skips), the separate PostgreSQL
creation/admission test passed, and 36 focused host composition tests passed. The host regression confirms that
installed rows replace a supplied compiler roster and changed rows reject even without
optional component composition. Authoring
production/test typechecks passed; migration layout contains 172 classified files and
164 retained SQL files. No replacement draft or new Entity activation was produced.
Complete native proposals, provider/compiler resource assembly and startup configuration,
canonical bootstrap/replay and deployed F6/F8/F9 remain unfinished. This migration does
not remove any of the seven pending cutover constraints or attest manual-test readiness.

### Native command-host integration and push recovery — 8 October

Formatting-only commit `40d34fd74` repaired the committed shared Entity files without
staging ongoing implementation. Push checks passed from an isolated committed checkout
with the remote branch as the formatting comparison base; the branch was pushed through
that commit. Existing working files were formatted separately, preserving their changes.

`createProductNativeBootstrapHost` is now composed by the production proposal resolver.
It requires the current entity-bound creation ticket, actor and platform authority tenant,
then reads the exact installed descriptor through the existing signed publication reader
and current human-review eligibility adapter. The original host admission also executes;
its denial and snapshot-version restrictions are preserved. No general editing or operation
initializer is supplied. This is implementation evidence, not an installed DEV bootstrap.

Targeted verification: 16 authoring resource/bootstrap tests and 25 host composition tests
passed. The signed-resource cases reject absent admission, wrong descriptor, revoked review,
revoked original host admission, tenant scope, extra batch properties and unsupported intent.
Host and authoring typechecks passed. Existing native graph resources are still required:
this command-host composition does not make test compiler/provider/identity fixtures trusted.

**Open execution boundary:** the control API startup still lacks complete native proposals
and their production compiler/provider/identity resolver configuration. Consequently actual
bootstrap/replay, deployed F6/F8/F9 and new Entity publication/activation are not attested.
No new credentials or human approval can substitute for that unfinished engineering.

### Complete-graph persistence and reader corrections — 8 October, 15:03 UTC

The reference definitions contain nonempty entity-facing AI declarations. The canonical
bootstrap writer already writes them, but the application role previously had only scoped
SELECT on those families. Forward migration
`20261008_entity_native_bootstrap_ai_privileges.sql` now grants column-specific INSERT
on profile, field, binding and reference rows, fenced by the existing creation admission,
product root, actor and initial revision. No UPDATE/DELETE, term INSERT, learned-candidate
promotion or provider-execution authority is added. Non-NULL profile vocabulary is rejected,
consistent with the compiler's existing unsupported-vocabulary diagnostic. Earlier applied
migration bytes remain unchanged.

Installed Studio DEV hash:
`879dcb5a787f8b666e94d4c6a5d70e5d5aa0b624d5f6629979dddca71ece3be2`.
Rollback rehearsal, application and ledger replay passed. Private receipts:
`~/.athyper/instances/dev/workspace/native-bootstrap-ai-20261008/application.json`
and `replay.json`. Receipt field `authorizationAndHeadsUnchanged` refers to the
runner's row fingerprint; the documented INSERT privileges intentionally changed.
Both source drafts remain revision 4, and all seven pending cutover checks remain.

The whole-source test also exposed seven reader failures introduced by detail-renderer
projection: badge and field bindings for the same field were incorrectly treated as
ambiguous field placements. The shared projection now selects only field placements for
detail renderers, leaving badges to their record-presentation contract. Genuine duplicate
field bindings still reject; binding order does not select a renderer. This code correction
is tested, not a claim that a replacement Entity release has been deployed.

Executed verification:

- `ATHYPER_PRODUCT_CREATION_POSTGRES=1 pnpm --filter @athyper/server-plane-studio-meta-entity-authoring exec vitest run src/product-draft-creation.postgres.test.ts`
  — passed. Restricted application login, real admission transport and canonical policy
  SQL; reduced member tables, not whole-graph or authenticated DEV qualification.
  Positive inserts and negative entity/draft/actor/tenant/revision/column/mutation tests
  pass, including a conflicting permissive policy and denied vocabulary/term writes.
- `pnpm --filter @athyper/server-plane-studio-meta-entity-authoring test`
  — 880 passed, 10 opt-in tests skipped; the PostgreSQL test above ran separately.
- `pnpm --filter @athyper/server-platform-metadata test`
  — 207 passed, two skipped. Both package typechecks passed.
- `node tooling/scripts/testing/run-foundation-tests.mjs tooling/scripts/verification/native-bootstrap-privileges.test.mjs tooling/scripts/verification/apply-entity-native-resource-preparation.test.mjs`
  — 29 passed.
- `node server/db/scripts/checks/ddl/migration-layout.mjs`
  — 171 classified files, 163 retained SQL files.

**Handover remains incomplete.** The actual control API still lacks the complete native
proposal and production compiler/provider/identity resource resolver configuration.
Neither migration installation nor fixture compilation establishes that resolver. Actual
bootstrap/replay, approved security/storage resources, deployed F6/F8/F9 and independent
Entity review/publication/activation remain required. No replacement draft or Entity
activation was produced by this correction; do not use the older active releases as
acceptance evidence for the new path.

### Expanded detail component deployed and activated — 8 October

`shared.entity.detail-text` version 2 is now published and active in Studio. Platform
Admin `df0159b0-2bdc-55e8-944b-efaa9ed9b8e5` proposed and distinct Platform Owner
`41bf4855-6aa1-5e43-bc11-ee2cfa647693` approved through authenticated control API
requests (both HTTP 200). The existing worker performed publication/activation; no
manual ledger inserts or RLS changes were used.

- Source release: `0aa96821-1995-4b99-abd5-2cc215d15265`.
- Deployment: `01a11bf6-ae32-7ed9-9d67-9b42f0bda004` (one acknowledgement).
- Applied release: `01a11bf6-b410-7364-ac59-1df052a06766`.
- Catalogue ID: `7e441d1f-44ea-4963-8fee-d2f404480f87`.
- Source hash: `d922c59d76812953a880eda7ac688bf23411dc44a2a131c30f38148307a03af0`.
- Manifest hash: `dc8861bef417251ed120edf7fa92bd06e3dc37361ceaf1469c33812e6dff9847`.
- Deployment-bundle hash: `a802a9187de2d563d45a0ec4a70f19041cd0abc0e5edd22071de5208093d4126`.

Evidence resides in `~/.athyper/instances/dev/workspace/component-scalar-candidate-20261008`:
proposal/approval responses, delivery/replay logs, exact native component pin and HTTPS
chunk evidence. All 1,634 bundle files passed integrity qualification; 22 conformance
tests passed. Studio `/readyz` and control API `/livez` returned HTTP 200. HTTPS chunk
`2aru9tyeetpsy.js` exactly matched build SHA-256
`84ab1d64d5df1fc80f38ea65bd899e6172fe8f4f2af8b8041d8e9430dccb8995`.
The source-compose worker and deployed control API use the new bundle evidence; existing
component declarations remain included. Worker delivery was executed twice with
`publish-dev-reviewed-resources` and the exact `delivery-request.json`; both runs returned
the same compilation, deployment and applied-release IDs.

This closes the expanded detail component delivery, not native entity bootstrap. Both
original drafts remain revision 4. Complete native proposal files, production resource
bindings and actual bootstrap/replay remain unimplemented; no new Country/State Region
publication, activation or deployed F6/F8/F9 acceptance is claimed. The manual QA
handover remains unavailable.

### Complete-graph display prerequisite — 8 October

The checked-in Country definition includes boolean, enum and datetime fields; State
Region includes enum and datetime fields. Their detail sections select these fields.
The explicit shared detail `text` parser previously accepted only string/reference
kinds, despite the existing record component already formatting the scalar types.
The parser now accepts boolean, enum, date and datetime content without selecting a
fallback renderer or changing field authorization. UUID/JSON/numeric combinations
remain unsupported. Tests exercise the actual record component, server display values,
localized booleans/options, semantic time elements and escaped content.

Executed: `node tooling/scripts/testing/run-foundation-tests.mjs
 tests/foundation/entity-detail-renderer-conformance.test.tsx
 tests/foundation/entity-localization.test.ts
 tests/foundation/entity-record-fields-conformance.test.tsx` (27 tests across the
three files, run in two invocations), and `pnpm --filter @athyper/studio build` (passed).
This is source/build evidence only. No new deployment manifest, component approval,
component activation, native draft or Entity activation is claimed. The installed
string-only component declarations remain unchanged and cannot be used as proof of
these additional capabilities.

The immediate exit criterion has **not** been met: actual complete native graph
proposals and production resource resolution remain unfinished, followed by canonical
application/replay and deployed F6/F8/F9. No acceptance command for those unimplemented
integrations is presented as executable or passing. RLS and the approved initializer
were not changed.

### Bootstrap resource composition — 8 October

The product-command runtime now accepts `nativeBootstrapResources` alongside the pinned
proposal resolver. The shared composition joins installed component evidence to the whole
native compiler, retaining the independently resolved schema, host, reader, identity
adoption sources and existing approved operation initializer. It rejects descriptor/graph
mismatches and hosts without native snapshot version 2. Initial and replay qualification
re-resolve resource evidence in the original admitted transaction; schema, host-release,
compiler/reader/identity changes and current owner revocation reject. It does not supply
fixture authority or alter initializer/enforcement behavior.

Validation: 43 tests passed across bootstrap resources, proposals, components and product
command runtime; host typecheck passed. The positive compiler test is synthetic and is
not actual Country/State Region enrollment. Database inspection confirmed both original
drafts at revision 4 and zero security/storage resource releases. No database mutations,
cleanup, replacement drafts, publication or activation occurred in this checkpoint.

Still required for installation: actual native proposal graphs and independently resolved
non-component compiler/provider/identity bindings, reviewed schema cutover evidence and
control API configuration. Source-semantic security/storage qualification and deployed
F6/F8/F9 composition remain unfinished. Manual UI handover of the new path is unavailable.

### Live-read composition and restricted lock reader — 8 October

`createLocalEntityLiveReadEvidence` now connects the records-service evidence port to the
publication service's exact signed local-resource reader. Shared service composition
accepts either this installed-resource composition or the existing custom evidence port;
competing configurations reject. The adapter binds the authenticated caller and original
transaction, resolves current security explicitly, verifies capability content hashes,
and closes escaped evidence after the protected read succeeds or fails. Source-descriptor,
provider and permission qualification still require their trusted owning implementations;
missing installation is never replaced with draft evidence. Masks remain unsupported by
this bounded adapter.

Actual DEV inspection found `athyper_runtime` could SELECT activation tables but could
not acquire the previous direct `FOR SHARE` query. The publication reader now invokes
`runtime_meta.fn_locked_live_read_resources` instead. The new dedicated
`athyper_definer_live_read` is non-login, non-superuser and RLS-bound. Its UPDATE policies
permit scoped locking but reject new row images; the runtime role receives routine
EXECUTE only. The routine limits tenant/plane/principal scope, resource kinds, key count
and response size. No Entity permission, MFA control or activation authority changed.

Studio DEV migration `20261008_entity_locked_live_read_resources.sql` is installed with
SHA-256 `09eb32054ee2ca679573819283442e61fae44b6ad0a2e6f52ad50888cbef9bc8`.
The pre-install dump, rollback rehearsal, installation, replay and exact role checks are
under `component-deployment-20261008-v3/` (`studio-before-live-read-lock.dump` and
`live-read-lock-*.json`). Authorization rows and activation heads were unchanged. The
actual runtime-role probe used SET SESSION AUTHORIZATION, returned no invented evidence
for an absent resource, and retained `UPDATE=false` / routine `EXECUTE=true`.

Disposable PostgreSQL proved a positive tenant-scoped resource read, denied direct locking,
wrong/missing scope rejection, superseded-resource exclusion and an activation update
blocked until the reader transaction released its locks. Host tests cover caller/transaction
changes and escaped evidence; signed publication tests reject content from a different
plane even with a valid new signature. These are implementation/database proofs, not
human resource approval or deployed positive F6/F8/F9 evidence.

Validation: 14 host composition tests, one opt-in PostgreSQL lock/privilege test,
seven signed-resource tests, 20 effective-security tests, 24 database security-boundary
tests and 26 migration-runner tests passed. Host typecheck, migration layout,
security-definer generation checks and formatting of this change pass. Fresh-database
manifests now include the existing live-read projection definition before the reader.
The boundary suite preserves rejection by the immutable older signature inventory and
checks repeatability of the current hardening contract; PostgreSQL-rendered policy
expressions remain subject to exact comparison rather than a weakened normalizer.

**Remaining:** complete bootstrap compiler/schema/initializer composition, real native
proposal graphs and command application; source-semantic security/storage qualification
and installed owner/provider/catalogue bindings; then independent Entity review,
publication/activation and authorized/denied live requests. DEV still has zero
security/storage authoring-resource releases. Country/State Region remain revision 4;
no replacement draft, cleanup, new Entity publication or activation occurred. The new
operational migration was applied to Studio only; other plane upgrades are not claimed.

### Reviewed components activated and bootstrap assembly — 8 October

This checkpoint supersedes the expired-session/unsubmitted status below. The four v3
component candidates were submitted by authenticated Platform Admin and independently
approved by the distinct Platform Owner principal. The existing publication worker
published and activated all four in Studio. Each has one deployment acknowledgement;
a second worker invocation returned exactly the same compilation, deployment and applied
release identities. No Entity draft or Entity activation changed.

| Component                    | Source release                       | Activated deployment                 |
| ---------------------------- | ------------------------------------ | ------------------------------------ |
| shared.entity.list v2        | e8e4dc0c-3658-41fe-9a02-3a55b6b5e533 | 01a11ba2-c2e4-75d8-b469-3bd668fbe0ec |
| shared.entity.detail v2      | a40a14b0-d2be-4a32-a1d1-1cfa66093a68 | 01a11ba2-d733-7635-8668-6d0eec957b8b |
| shared.entity.text v2        | 45569947-da4c-46a4-9d69-9acd3bbc6fa0 | 01a11ba2-eac8-794d-b676-b98b6a87fb2e |
| shared.entity.detail-text v1 | 5057aa47-cc7c-4dbe-aee8-cf5a91cd803a | 01a11ba2-ff28-780d-a703-acf046d9c104 |

Token-free receipts are in the private DEV workspace
`component-deployment-20261008-v3/`: `proposal-receipts.json`,
`approval-receipts.json`, `delivery-evidence.json`, `delivery.log` and
`delivery-replay.log`. `native-component-pins.json` records the four exact current
head-backed catalogue IDs and manifest/release hashes. Historical catalogue rows remain.

`createNativeBootstrapComponents` assembles explicit proposal component selections through
the restricted installed-evidence reader before child graph rows exist. It requires host
admission, exact configured pins and the canonical transaction; missing pins, changed
hashes/IDs, stale host scope and invalid selections reject. Both saved-graph resolution
and bootstrap share the capability projection. This removes the component-context
ordering dependency without granting catalogue writes or using fixture authority.

Validation: 27 focused host tests and 28 authoring tests passed; host typecheck passed.
The assembler is implemented and tested, but complete installed bootstrap composition
(schema, compiler, host and initializer bindings) and deployed F6/F8/F9 remain open.
Authenticated native list/detail acceptance is not established by component activation.
Both original drafts remain revision 4; no reset, replacement draft or cutover occurred.

### Native component evidence grant installed — 8 October

`20261008_entity_product_component_resource_read.sql` is installed in DEV. Exact source
SHA-256: `2ba4fcb6e24f5455e64869ef7c8750e52598cc88fc245d910805157271fcf46a`.
The existing migration runner rehearsed rollback, applied it once and verified ledger
replay. Authorization rows and activation heads were unchanged. Receipts are under
`~/.athyper/instances/dev/workspace/component-deployment-20261008-v3/`:
`native-component-read-rehearsal.json`, `native-component-read-installation.json`,
`native-component-read-replay.json` and `native-component-read-role-check.json`.

The application role has EXECUTE on the admitted exact-component reader, no EXECUTE on
the catalogue installer and no SELECT on `publication.release`. A read without command
admission rejects `COMPONENT_RESOURCE_ADMISSION_REQUIRED`. These actual-role checks used
SET SESSION AUTHORIZATION and do not establish authenticated positive bootstrap.

`createNativeComponentEvidenceReader` reuses the same signed-artifact/current-deployment
verifier as installation and returns the exact component contract/runtime key. It does
not grant host admission or install rows. PostgreSQL tests use the canonical routines
and fixture admission to cover positive reads, missing/wrong admission, tenant mismatch,
response limits and denied direct ledger/installer access. Existing installation tests
still verify immutable replay and rollback. Nine host verification tests, the PostgreSQL
rehearsal and 26 migration-runner tests passed; host typecheck and migration layout passed.

Both human sessions were expired when rechecked. Four v3 candidates remain prepared,
not submitted or approved. Refreshed Admin authentication has been requested; separate
Owner review remains required. No replacement drafts, Entity publication, activation,
reset or cutover occurred. Complete bootstrap resource assembly and deployed F6/F8/F9
remain unfinished; this migration closes the component-evidence read-grant dependency.

### Detail deployment and native proposal composition — 8 October

Studio now serves `component-deployment-20261008-v3/bundle` from the private DEV workspace.
The manifest pin is `dd4a3ad7f200efdebb79673b3f64e4668af9cb1ead3af7af1264fff4d689d428`.
All four declarations and 1,634 files pass the actual deployed-component verifier.
The shared detail-renderer chunk was fetched over HTTPS with status 200 and SHA-256
`71f4746e0d88c7914444f530e550603a993eb2e0cb0e02b3b4532c378b04164c` matching installed bytes;
readyz returns 200. The prior deployment configuration is retained in
`component-deployment-20261008-v3/source.compose.before.json`. No catalogue rows were
rewritten. The old three component rows remain installed; their previous approvals do
not qualify these changed implementation inventories under the new deployment pin.

Four immutable, **unsubmitted/unapproved** candidates are prepared:

| Component                 | Version | Source release                       |
| ------------------------- | ------- | ------------------------------------ |
| shared.entity.list        | 2       | e8e4dc0c-3658-41fe-9a02-3a55b6b5e533 |
| shared.entity.detail      | 2       | a40a14b0-d2be-4a32-a1d1-1cfa66093a68 |
| shared.entity.text        | 2       | 45569947-da4c-46a4-9d69-9acd3bbc6fa0 |
| shared.entity.detail-text | 1       | 5057aa47-cc7c-4dbe-aee8-cf5a91cd803a |

`review-candidates.json`, per-component source inventories, `conformance.log` and
`http-evidence.json` are in that directory. Text remains string-only, with separate
list/detail declarations and no masked-representation qualification. Twenty conformance
checks cover explicit text, actual shared record-fields rendering, list modes and the
existing Country read path across three planes. They are executable source tests plus
deployed byte evidence, not authenticated native Entity acceptance. Admin and Owner
sessions were expired at this checkpoint; refreshed Admin authentication was requested
for proposals, with independent Owner review still required afterward.

`native-bootstrap-proposals.ts` implements the pinned, author/coordinate-bound proposal
reader and the native bootstrap policy adapter. The shared product-command composition
accepts it only alongside installed reference resources, rejects competing compositions,
and preserves canonical transaction admission. Twenty-five focused host tests pass,
including tampering, unknown authority fields, traversal/symlink escape, byte limits,
duplicate pins, changed author/transaction and replay revalidation. This does **not**
configure DEV with fixture resources: actual compiler/schema/host/initializer bindings
are still required before enabling the endpoint.

DEV verification: both existing drafts remain revision 4, three component catalogue rows
exist, and there are zero security/storage resource releases in the authoring-resource
ledger. No replacement Entity drafts or new Entity activations occurred. The installed
bootstrap resource composition, component review/installation and F6/F8/F9 deployment
remain open. No data reset or cutover constraint removal ran.

### Explicit detail field-renderer binding — 8 October

The native runtime projection now carries detail bindings independently of list bindings.
The metadata parser validates the closed detail selection, the records service copies it
only for authorized detail fields, and the public descriptor/parser and shared record
fields renderer retain it. Unknown renderers and unsupported field kinds reject; ambiguous
detail defaults and duplicate placements reject instead of selecting an arbitrary binding.
The bounded text renderer preserves escaped formatted content and the existing reference
link element. No new permission, MFA behavior or entity-specific dispatch was introduced.

Validation: 206 metadata tests passed (two opt-in skips), 30 records-service tests
passed, and eight renderer checks passed. Metadata, records and form/detail typechecks
and changed-file formatting passed. DEV still reports revision 4 for both drafts.

Evidence: metadata projection tests cover separate list/detail choices and ambiguous or
unsupported bindings; records-service tests cover authorized delivery and exclusion of a
denied field; foundation renderer tests cover escaping, Unicode and reference preservation.
This is source implementation evidence, not deployed component qualification. The installed
text component remains list-only. The control API still lacks nativeBootstrap composition;
the live-read resource qualifier explicitly rejects absent semantic qualification.
No proposal resolver, F6/F8/F9 adapter or new Entity activation is claimed by this change.

### Native bootstrap control boundary — 8 October

The existing product reference command service and control host now accept an optional
installed native bootstrap resolver. The authenticated `bootstrap-native` endpoint accepts
only the target draft, entity, proposal hash and idempotency key. It issues entity-bound
creation admission, verifies `admitted_creation` in the application transaction and resolves
the proposal through trusted host composition. The canonical schema qualifier wraps the
repository policy on every execution, including replay; request-supplied graph, actor,
tenant, initializer and schema evidence reject. Audit remains inside the repository's
atomic bootstrap policy. Unconfigured routes remain absent.

This closes the service/route composition gap, not the deployed resource resolver.
DEV inspection still reports all seven native pending constraints. No constraint was
dropped, replacement draft created, release published or activation changed. Whole-graph
canonical PostgreSQL rehearsal, installed proposal preparation and deployed F6/F8/F9
remain required before this endpoint can be enabled in DEV. Focused service/HTTP tests
pass, covering creation scope, failed admission, schema rejection on replay, authentication,
closed request validation and missing bindings. These tests use mocked database transport;
they are not canonical database or live-read evidence.

### Canonical rehearsal: fresh-root visibility corrected — 8 October

A complete DEV Studio dump was restored into disposable PostgreSQL 16.15, preserving
canonical triggers, RLS, grants and existing data. The native repository command ran
under a separate application login with a synthetic issuer ticket and synthetic graph.
It reproduced `Change-set scope must match its Entity scope`: the root INSERT trigger
could not read its Entity because the old read policy required an existing admitted
draft. This was an actual canonical-schema integration defect missed by the reduced
root fixture, not a failure of human review or a reason to bypass authorization.

Forward migration `20261008_entity_product_creation_entity_read.sql` adds a private
creation-entity predicate bound to login, transaction, backend, actor, authority tenant,
expiry and revocation. Both permissive and restrictive Entity SELECT policies retain
their prior draft/relation paths and add only exact admitted system-entity creation.
The next rehearsal failure was missing SELECT on the five AI tables used for whole-graph
emptiness/readback. The same migration adds admission-scoped reads, with no AI writes.
It changes no protected state or pending cutover constraint. Migration SHA-256:
`c7a49bb38d64328dede529cdade13912112ff0d51c573aede546fcb4cab727a8`.

DEV rollback rehearsal, installation and no-op ledger replay succeeded; authorization
assignments and activation-head fingerprints were unchanged. Receipts are
`native-read-scope-{rehearsal,installation,replay}.json` in the existing private backup
directory. `studio-before-native-read-scope.dump` is the newly restored backup;
`canonical-bootstrap-rehearsal-20261008.json` records its checksum and limitations.
The disposable container was removed. DEV retains all seven pending constraints.

After removing pending checks only in that disposable copy, the synthetic graph reached
the field-identity guard and rejected its uninstalled fixture identity. This is not a
whole-graph success or proof that the actual two onboarding graphs are ready. Separately,
DEV inspection confirms all 31 installed identities are reserved to older drafts; the
current guard rejects reuse from another root. The native proposal/reset implementation
must resolve this explicitly, preserving the approved source operations and security
controls. No identity lifecycle guard or source row was changed here.

The existing opt-in product-creation PostgreSQL test now loads the canonical root scope
trigger and original Entity read policies, reproduces the pre-fix failure, and verifies
the correction, wrong actor/tenant denial, missing admission, scope isolation, rollback,
replay rejection and AI read-only boundaries. This regression test passed. The 19 migration
runner tests and migration layout check passed (162 classified files, 154 retained SQL).
Installed proposal resolution, complete native graph persistence/compiler proof and
F6/F8/F9 live-read composition remain open. No replacement draft/publication/activation.

### Restricted component installer and host evidence adapter — 8 October

Continuation: the control API proposal/review qualifier and worker compile/sign/dispatch,
loader and installer now share the optional pinned deployment-evidence verifier. It
requires an exact typed component source and hashes every listed installed bundle file
on each call. Missing configuration stays disabled; changed hashes, capability escalation,
path/symlink escapes, duplicate registrations and additional unqualified planes reject.
`PUBLICATION_COMPONENT_DEPLOYMENT_{ROOT,MANIFEST,HASH}` is operator configuration, not an
HTTP input or resource approval. Its closed attestation schema is documented in the
blueprint's component catalogue section. An operator-pinned capability attestation must
be backed by renderer conformance evidence; tests of the verifier do not establish that
attestation for the actual candidates.

DEV now serves a standalone Studio production build from the read-only bundle at
`~/.athyper/instances/dev/workspace/component-deployment-20261008-v2/bundle`.
`ATHYPER_NEXT_DIST_DIR=.next-component-qualification pnpm --filter @athyper/studio build`
passed compilation and typechecking. Static assets/public files are included in that
bundle. The former source-mode configuration is retained in
`component-deployment-20261008/source.compose.before.json`; the current private
`source.compose.json` selects the production mount for Studio and the same evidence
mount for the publication worker. Neon/Mesh deployment modes are unchanged.

The exact deployment manifest pin is
`8d30c9da90b7fa5d86078c65508d9bd90f9d4370622c6e284fc08bc663151c78`.
All three component declarations and 1,634 installed files passed the real host verifier.
`http-evidence.json` records readyz=200 and a renderer JavaScript chunk served over HTTPS
with exactly the installed SHA-256. This is deployed-byte/readiness evidence, not an
authenticated native list/detail acceptance result.

`conformance.json` and `conformance.log` bind 14 passing renderer checks to this manifest
and hashed test sources: text escaping/Unicode/highlighting/reference labels/missing
values, registered table/compact modes and list column behavior. The initial combined
run also passed three existing Country detail-read checks. Its later rerun failed on
a concurrent Calendar workstream import (`list-calendar.js`), recorded separately in
`combined-rerun.json`/`.log`; no broader green claim is made for that rerun.
These reuse actual framework implementations. No synthetic resource becomes approved by
passing them. `renderFieldValue` is now explicitly exported by the list package. Its
proposed component is string/list-only with maskedRepresentationSafe=false. The detail
field descriptor has no field rendererKey binding; detail text support is not claimed.

The control API was restarted with the optional `compose.component-review.yaml` overlay
and the read-only verified bundle. Its livez check passes. `review-candidates.json` in the
private deployment directory identifies three immutable unapproved sources mounted in
the existing producer directory. After a Platform Admin session refresh, all three exact proposals were submitted
successfully through the control API (HTTP 200, status preparing). `proposal-receipts.json`
records list `7c2e8db4-640c-47c8-8c36-308ddcdfe459`, detail
`884d2f0d-344b-4c4a-8ec9-40da40f95a41`, and text
`61b7f610-a478-474e-a8ba-aee9e6d099b3`. Platform Owner independently approved all three through the same control API.
`approval-receipts.json` records HTTP 200 and the separate reviewer. The DEV-only
`publish-dev-reviewed-resources` command reuses the configured worker source qualifier,
compiler, signer, dispatcher, activation orchestrator and release transition repository.
It accepts at most 16 exact release-ID/source-hash requests, resolves the existing worker
service principal and neither creates review evidence nor edits resource sources.

All three releases are now published with active Studio catalogue rows and one deployment
acknowledgement each. `delivery.log` and `delivery-replay.log` record identical IDs on replay:

| Component            | Deployment                           | Applied release                      |
| -------------------- | ------------------------------------ | ------------------------------------ |
| shared.entity.list   | 01a11b7a-d0ba-705b-9256-ccb7db699a82 | 01a11b7a-d6be-728e-a773-523a39ce0fa4 |
| shared.entity.detail | 01a11b7a-e3c2-70b8-8542-a081afe12236 | 01a11b7a-e934-7f84-a13f-bc994f29219b |
| shared.entity.text   | 01a11b7b-0172-7d8c-989a-3f7a7dd9c998 | 01a11b7b-0779-7189-9588-dcc94697bdb1 |

This clears the empty catalogue and component-resource publication blocker. Detail field
renderer binding, native proposal/bootstrap resolution and F6/F8/F9 remain unfinished.
No replacement Entity draft or new Country/State Region activation was created.

`createComponentCatalogueInstaller` now binds the existing publication loader to the
transactional catalogue installer. It reads exact active/reviewed source evidence through
a restricted routine, verifies source/payload/artifact hashes, re-verifies the retained
Ed25519 document with the host's current verifier, and reruns component qualification.
Shared Studio publication composition carries this installer into the activation transaction
only when an implementation qualifier is configured. A missing qualifier still rejects.

Forward migration `20261008_entity_component_catalogue_installation.sql` installs two
SECURITY DEFINER routines with fixed search paths, PUBLIC execution revoked and EXECUTE
only for `athyper_publication_service`. No direct catalogue INSERT/UPDATE/DELETE grants
are added. The locked reader joins the current activation head, payload, independently
reviewed release, deployment and artifact under the current tenant. Installation derives
all typed columns from that source and accepts only exact immutable replay. This boundary
trusts the publication service's cryptographic/implementation checks; it does not treat
persisted verification flags as a substitute for those checks.

DEV rollback rehearsal, installation and ledger replay passed, with authorization and
activation fingerprints unchanged. Migration SHA-256:
`b4bced1b97b948b345b0e84d3b07d9cd72e05a1bac624e052577e9bb705f65df`.
Receipts: `catalogue-installation-{rehearsal,applied,replay}.json` in
`~/.athyper/instances/dev/workspace/component-resource-candidates-20261008/`.

The separate opt-in `ATHYPER_COMPONENT_INSTALLATION_POSTGRES=1` rehearsal uses an
isolated Docker PostgreSQL 16 instance and the canonical catalogue/routines. It proves
rollback, exact replay, direct-write denial, wrong-tenant denial, self-review rejection,
inactive/changed source rejection and immutable conflicts using synthetic publication
rows. Six host tests separately use real Ed25519 signatures and cover source tampering,
revoked signing trust, implementation rejection and transaction/qualifier requirements.
Neither substitutes for approved DEV resources or combined deployed activation evidence. The opt-in
rehearsal is explicitly enabled in CI. Local checks also passed: 880 authoring tests
(ten opt-in exclusions), 18 host composition tests, 25 migration-runner tests, host/native
test typechecks, migration-layout validation and the changed-file formatting gate.

The shared list renderer now explicitly handles the `text` key, preserving preformatted
text/highlighting without inferred status/date decoration. Seven existing board/card
foundation cases pass with the added assertions. The bounded list-only text resource is now reviewed and installed against the deployed
bundle above; detail field-display binding remains unqualified.

The DEV catalogue now contains three active components. Both existing Entity drafts
remain revision 4, with all seven pending native-cutover checks retained. Installed native
proposal resolution and deployed F6/F8/F9 remain open. No replacement Entity draft or
new Country/State Region activation occurred.

### Component publication and installation integration — 8 October

Implemented `entity_ui_component` through the existing artifact parser, approved-source
compiler/sign/dispatch paths, verified loader and immutable applied-payload projection.
The loader requires a dedicated component qualifier; the current unconfigured host rejects
with `RESOURCE_COMPONENT_QUALIFICATION_REQUIRED`. A valid signature does not manufacture
registered implementation or reviewer evidence. Studio is the initial supported destination.

The local activation repository now requires a transactional component installer before
activating this resource kind. `installNativeComponentCatalogue` accepts only qualified
active-source evidence, inserts derived typed columns and verifies exact readback. It rejects
conflicting immutable rows. Tests prove missing installer/transaction denial and propagation
of installation failure; these mocked transaction tests are not PostgreSQL rollback proof.
The concrete locked evidence adapter and restricted catalogue INSERT authority still need
host integration and database qualification. No catalogue rows were installed.

Forward migration `20261008_entity_component_resource_review.sql` was rollback-rehearsed,
applied and ledger-replayed in DEV. It extends only pinned resource-kind lists in six
existing review/verification functions, retaining human/independent-review/source checks.
SHA-256: `de5a4284f86f28f56babd5522483df16a00bc711b28ea6cb947492e272913244`.
Receipts are `lifecycle-{rehearsal,installation,replay}.json` in the existing private
component candidate directory. Authorization and activation heads remained unchanged.

Field-display inspection: `renderCardValue` explicitly registers `number.progress` and
`date.due`; the rehearsal's `text` key currently reaches the existing plain-text fallback.
That is not qualified explicit component registration. No claim of text-component approval
or deployed qualification is made, and composer/UI wiring remains deferred.
Remaining: real component implementation qualification, locked installation-evidence adapter,
restricted catalogue installation grants, independent candidate review and activation.
Installed native proposal resolution and F6/F8/F9 also remain open. No replacement drafts
or component/entity publication or activation occurred during this checkpoint.

Validation: 880 authoring tests passed (nine opt-in tests skipped), 233 publication
contract tests passed, and 475 publication-service tests passed (five opt-in exclusions)
before three additional activation tests also passed. Migration runner: 24 tests passed;
layout: 167 classified files / 159 retained SQL. Native-test, publication-service and
platform-host typechecks pass. These results do not establish deployed resource qualification.

### Component source and projection preparation — 8 October

The current publication pipeline supports descriptor, identity-review and live-read
resource kinds, but not a UI-component resource kind or catalogue activation installer.
An empty catalogue cannot be fixed by treating the native compilation fixture as reviewed
installation evidence. This remains engineering work, not merely a missing user approval.

Added the closed typed `entity.ui-component-resource/1` source and
`compileUiComponentProjection`. Source hashes cover the declaration and explicit
implementation binding; release hashes and installed status are derived only after the
independent qualification callback validates evidence. Wrong source/implementation hashes,
invalid release hashes, injected projection properties and invalid applicability reject.
The helper performs no database writes and is not a publication or installation adapter.

Fixed an adjacent integration issue: catalogue resolution used `FOR SHARE`, requiring
UPDATE privileges despite its SELECT-only role. Immutable catalogue reads now use SELECT;
the independent installed-resource/host policy remains mandatory in the transaction.

Two unapproved Studio surface candidates are prepared at
`~/.athyper/instances/dev/workspace/component-resource-candidates-20261008/index.json`:
shared list (`EntityListRuntime`) and detail (`EntityDetailRuntime`), tied to actual package
source inventories. The index explicitly records missing approval, host registration and
publication support. These hashes describe package-local source, not transitive dependency
or deployed bundle qualification. No field-display candidate, other-plane qualification,
approved release hash or installation evidence was invented.

Remaining implementation: add the component resource to the existing publication
contract/review/compiler/dispatch/activation path, establish runtime-registration and
field-display evidence, then project approved resources into the catalogue under restricted
installation authority. Installed proposal resolution and F6/F8/F9 remain unfinished.
No DEV migration, catalogue row, replacement draft, publication or activation occurred.

Validation: 876 authoring tests passed (nine opt-in tests skipped); component source
and projection/resolver tests, contract/native-test typechecks, formatting and source
candidate parsing passed.

### Scoped component catalogue validation reads installed — 8 October

Forward migration `20261008_entity_product_component_validation_read.sql` adds SELECT
with matching permissive/restrictive policies: only active product components referenced
by the admitted draft's surfaces, sections or four field-component bindings are visible.
No catalogue write/installation grants or new resource rows were introduced. Admission
continues to bind actor, authority tenant, login, backend, transaction, expiry and revocation.
SHA-256: `6e540c9c1fd54137c6fe91668c3f651c8161faf187b500eed7caf0e76bc0fac5`.

DEV rollback rehearsal, installation and ledger replay passed; authorization and activation
heads were unchanged. Receipts `component-read-{rehearsal,installation,replay}.json` are in
the existing private backup directory. Actual drafts remain revision 4, seven pending
checks remain, and no replacement draft, publication or activation occurred.

The opt-in PostgreSQL product-creation test passes with the real admission implementation
and new policies. It covers six reference locations; excludes unrelated, foreign-tenant
and deprecated rows; denies no-admission/wrong-actor/wrong-tenant reads; verifies a broad
permissive policy cannot bypass the restrictive fence; rejects writes, truncation and
revoked admission. Reduced member/catalogue fixtures isolate authorization; they do not
attest component publication. All 23 migration-runner tests pass.

The restored canonical bootstrap now passes the catalogue permission check and reaches
`NATIVE_TYPED_ROW_INVALID:entity_surface`. Predicate-level inspection identifies absent
component catalogue references for the rehearsal's surfaces. This is resource completeness,
not another permission failure: no synthetic resources were installed in DEV. The restored
copy uses synthetic admission/resources and copy-only pending-check removal, and rolls
back; it is not deployed qualification. Approved component resource installation, installed
proposal resolution and deployed F6/F8/F9 remain unfinished.

### Native bootstrap dependency ordering corrected — 8 October

`native-bootstrap-plans.ts` now separates navigation groups from the remaining reference
families: groups precede layout sections/bindings, then views, view fields and predicates
follow. The canonical scoped writer and all foreign keys remain unchanged. Operations
still use the existing approved-source initializer before their dependent rows. This is
shared family ordering, with no entity-specific branch or new persistence path.

A regression executes the bootstrap writer and asserts both bindings and views are
inserted before view fields. The restored canonical DEV rehearsal under the application
role now passes `entity_surface_view_field_field_binding_id_fk` and reaches aggregate
validation. Its next error is `42501: permission denied for table ui_component_contract`
inside `fn_assert_native_typed_rows`. Installed catalogue read scope must be resolved;
no broad grant, synthetic catalogue resource or validation bypass was added to DEV.

The disposable rehearsal still uses synthetic host/admission/resources and removes the
seven pending checks only in its restored copy. It rolls back; it does not attest actual
DEV enrollment, installed proposal resolution or F6/F8/F9. No DEV migration, replacement
draft, publication or activation occurred. Both actual drafts remain revision 4 and
all seven pending checks remain installed.

Validation: 866 authoring tests passed, nine opt-in tests skipped; native-test typecheck
passed. The restored canonical PostgreSQL rehearsal ran separately as described above.

### Native field-key uniqueness installed — 8 October

Forward migration `20261008_entity_native_field_key_uniqueness.sql` replaces the legacy
NULL-key collision with a partial non-NULL legacy-key unique index retaining NULLS NOT
DISTINCT tenant semantics. A separate per-draft stable-identity unique index prevents
repeated native identity membership. The identity catalogue still owns business-key
uniqueness. Exact predecessor and catalogue/guard preflight reject missing or changed
prerequisites. Both indexes are created before dropping the predecessor constraint;
duplicate existing data or any failure rolls back the migration. No rows or grants change.
SHA-256: `8df1d78d9b5d8a71e67647624db537e56bdce2fcc41687e982bbadf693a02698`.

DEV rollback rehearsal, installation and ledger replay passed with unchanged authorization
and activation-head fingerprints. Receipts are `native-field-key-{rehearsal,installation,replay}.json`
in the existing private backup directory. Both drafts remain revision 4 with NULL native
layout; seven pending cutover checks remain and no adoption rows are committed.

The canonical restored-DEV bootstrap now passes native field insertion under the
application role. Its next failure is `entity_surface_view_field_field_binding_id_fk`:
bootstrap plans insert reference view-field rows before their layout field bindings.
This requires a shared writer dependency-order/deferral correction, not removal of the FK.
That rehearsal uses synthetic admission/resources and removes pending checks only in its
disposable copy; it is not deployed qualification. No replacement draft, publication or
activation occurred. Installed proposal resolution and deployed F6/F8/F9 remain open.

Validation: the opt-in canonical PostgreSQL suite passes, including migration application
and predecessor rejection, multiple native NULL keys, duplicate stable identity rejection,
duplicate product/tenant legacy keys, and independent draft/tenant scope. Index behavior
is isolated using the actual installed index definitions; full graph completeness remains
separate evidence. All 22 migration-runner tests pass.

### Native field-trigger compatibility installed — 8 October

Forward migration `20261008_entity_native_field_contract_trigger.sql` is installed in
DEV with migration-ledger replay. It pins the exact legacy function definition, requires
the typed/snapshot guard infrastructure and an enabled deferred field snapshot trigger,
and changes only the explicitly native-root branch. Native fields require all retired
field JSON/key columns to be NULL; legacy roots retain the original contract validation.
It changes no authoring rows, grants, protected state or pending cutover checks.
SHA-256: `4ea65e290ad185254a2895897f747696a0ef7256f9514a3e3dd315a123593fd5`.

The canonical restored-DEV rehearsal under the application role now passes the legacy
trigger. Its next failure is `entity_field_key_uq`: the legacy NULLS NOT DISTINCT
constraint treats multiple native NULL `field_key` values as duplicates within a draft.
A forward constraint disposition must preserve legacy key uniqueness and native stable
identity/key uniqueness before cutover. Pending checks were removed only in that disposable
copy to reach downstream validation; its synthetic admission/resources are not deployed
qualification. The transaction rolled back. No replacement drafts or adoption rows were
committed in DEV; no publication or activation occurred.

Validation: the opt-in canonical PostgreSQL constraint suite passes, including the actual
legacy trigger body, native NULL acceptance, native legacy-payload rejection, unchanged
legacy validation, disabled guard rejection and unexpected predecessor rejection. Its
trigger probe isolates BEFORE validation; aggregate deferred-validation cases are tested
separately in the same suite. All 21 migration-runner tests and migration layout pass
(164 classified files, 156 retained SQL). Installation/replay receipts report unchanged
authorization and activation heads in `native-field-trigger-{rehearsal,installation,replay}.json`
in the existing private backup directory. Installed proposal resolution and deployed
F6/F8/F9 remain unfinished; this correction does not establish whole-graph qualification.

### Fresh-root identity adoption installed — 8 October

`native-bootstrap-identities.ts` now runs inside the canonical bootstrap after root
initialization and before any member writes. It resolves every field identity against
stored entity/tenant/key/parent provenance. Active or same-draft identities need no
adoption; another draft's reservation requires explicit trusted source coordinates.
Missing, retired, foreign, duplicate and unused mappings reject. This implementation
reuses existing identities; first-time identity allocation remains the existing separate
reservation contract, and no replacement UUID is invented by bootstrap.

Forward migration `20261008_entity_native_identity_adoption.sql` adds immutable adoption
evidence without changing `introduced_change_set_id` or identity lifecycle state. Its
restricted command independently checks the creation admission, locked source field and
revision, immutable snapshot/hash and original identity/key. Deferred constraints require
the final target field and exact revision-1 proposal snapshot; failed bootstrap rolls all
adoptions back. No direct adoption writes are granted. The three existing identity guards
are amended only at their reservation predicates, rejecting unexpected predecessor bodies.
The native schema fingerprint includes adoption storage and routines.
Migration SHA-256: `ed3a092a8124cb9c79f725d5ea14002c63add546d67def3ef0fe1352290cd12f`.

DEV rollback rehearsal, installation and ledger replay passed. Original reservation row
fingerprints, authorization assignments and activation heads were unchanged. Receipts
`identity-adoption-{rehearsal,installation,replay,verification}.json` are in the existing
private backup directory. All 31 reservations retain their original provenance, and DEV
has zero adoption rows: evidence must be committed with each completed replacement graph.
No replacement root, Entity publication or activation was created. Seven pending checks
remain intact.

A disposable canonical DEV copy exercised source-bound adoption through the actual
application-role repository. It passed that stage, then failed on the existing legacy
`trg_validate_entity_field_contract`: native NULL `type_config` is still rejected. No
trigger was bypassed and no native graph committed. This identifies the next compatibility
fix, not a whole-graph or live-read success. The disposable container was removed.

Validation: 865 authoring tests passed, nine opt-in exclusions; the new opt-in PostgreSQL
adoption test ran separately and passed. It proves positive adoption, rollback for missing
final target/snapshot, stale hash and wrong-target denial, immutable provenance, matching
replay and conflicting replay rejection, and retained source references. That focused test
uses a synthetic admission port and reduced graph; it does not attest authenticated DEV
execution. Production/native-test typechecks, 20 migration tests and layout checks passed.
Installed proposal resolution, native legacy-trigger compatibility, whole-graph cutover and
deployed F6/F8/F9 remain outstanding.

## Live-read resource publication transport — 2026-10-08

Host composition follow-up: `ServiceRegistrationDependencies.entityLiveReadEvidence`
now passes an explicitly installed evidence port into `createEntityServices` and
its shared list/detail/pinned-parent read composition. It is separate from mutation
authorization. No environment flag or request can fabricate this dependency. The
deployment readiness gate remains closed for unqualified version-1.1 resources.
Focused host tests: 37 passed, including missing/rejecting evidence preventing
repository list/detail calls. Host typecheck passes. This closes a dependency
forwarding gap only: no production evidence adapter is supplied by the entrypoint,
and no native conversion, publication or activation occurred in this follow-up.

Active-resource reader follow-up: `withLockedLocalLiveReadResources` now reads exact
local activation coordinates with shared head/release/payload row locks in the
caller transaction, enforces tenant/plane and size bounds, and invokes the existing
signed-resource verifier before the protected callback. The accessor expires when
the callback exits; missing resources prevent callback execution. It intentionally
supports active installations only. Driver-fixture tests cover signed resources on
three planes, exact retrieval, missing-row rejection and callback-lifetime enforcement.
They do not prove PostgreSQL lock contention or application-role privileges. Records
composition, current-security/provider/identity coverage and deployed qualification
remain unfinished; no DEV grants, native conversion or activation changed here.

Reason for withheld handover: DEV Studio reports both existing heads as `active`
with NULL `failure_code` (Country 13, State Region 1, activated 1 October). This is
ledger evidence, not a new end-to-end UI test. They are not recorded failed releases
blocking successors. The control entrypoint still does not supply `nativeConversion`
to product-command composition. The replacement drafts therefore have no installed
whole-source conversion path, and new live-read resources lack their complete
consumer evidence composition. Publication was not attempted; there is no new
publication failure being hidden as an approval delay.

Manual-test handover check (2026-10-08): read-only DEV Studio queries confirm Country
draft `28e155d7-9f18-48fd-9f4d-847ff80f7e87` and State Region draft
`9672c64b-b40f-43ce-8a2f-e0fbebd1154e` remain product drafts at revision 4 with
`native_core_layout_version` NULL. `metadata.ui_component_contract` has zero rows;
there are no active `entity_security_manifest` or `entity_storage_authority` payloads
in Studio. Existing local heads are `metadata.reference.country` release 13 and
`metadata.reference.state_region` release 1. These older heads are not qualification
of the new native path. No new entity publication/activation was attempted. Native
conversion resources/grants, canonical history qualification and deployed evidence
composition must finish before the requested new-path manual-test handover.

Follow-up: the shared native runtime projection and publication lowering now support
explicit version-1.1 live-read contracts. Source coordinates are checked against the
immutable publication source, then validated by the real runtime parser. Historical
version-1.0 output remains unchanged. A native compiler/reader fixture covers exact
pin preservation, source mismatches, malformed hashes and immutable output. This is
projection implementation, not a qualified security/storage resource producer or
installed runtime evidence adapter. No DEV mutation or activation occurred in this
follow-up. Native conversion and deployed F6/F8/F9 remain incomplete.

Follow-up validation: 11 native compilation tests, 194 metadata tests (2 skipped),
474 publication tests (5 skipped); authoring, metadata and publication typechecks.

The shared publication pipeline now accepts closed `entity_security_manifest` and
`entity_storage_authority` resources. They reuse `publication.release`, independent
resource review, signing, dispatch and local payload activation. The resource's
explicit plane determines compilation coordinates; the loader rejects a different
plane, changed content hash or missing semantic-qualification adapter. Tenant-scoped
resource payloads retain that tenant in the local projection. Existing descriptor
and identity-review resources remain Studio-only.

Local live-read projections retain the original signed document as derived immutable
verification input. `verifyLocalLiveReadResource` checks exact release coordinates,
artifact/payload/content hashes, resource pin, tenant, plane and current signing-key
trust. A cached successful signature flag is insufficient. This verifier is **not**
the locked database evidence adapter: its caller must still hold the active-head
locks and establish local installation, current security, provider and identity
coverage. The existing descriptor/identity qualifier explicitly refuses to qualify
live-read resources using its narrower evidence.

Two forward migrations were rehearsed and applied to DEV Studio, preserving prior
migration hashes, authoring/snapshot rows, authorization and activation heads:

| Migration                                           | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `20261008_entity_live_read_resource_review.sql`     | `f6d6a5094eb97d812a12233422d3996c8728d78ac97e603434541525d1236c28` |
| `20261008_entity_live_read_resource_projection.sql` | `9f6ea1f5d650fc13e3464439b959d1258cb0bf69c6ad7108f794d965fef5744d` |

Private migration receipts are in the existing
`resource-review-candidates-20261008/` workspace directory. PostgreSQL rehearsals
prove proposal/review separation and immutable sources for the three tested kinds,
and stage/verify/activate for all four resource kinds, with every fixture rolled
back. These rehearsals use synthetic evidence; they do not attest human approval
or installed live-read authority. Signed-resource tests cover all three planes,
changed-source rejection, missing adapters, tenant isolation and key revocation.

Validation: publication contracts 233 tests passed; publication service 474 passed,
5 environment-dependent tests skipped; focused host 6 passed; migration runner
14 passed. The separate DEV PostgreSQL runs passed three review scenarios and one
projection scenario, all rolled back. Contract, service, authoring and host
typechecks passed. Migration-layout verification reports 157 classified files and
149 retained SQL files. These are local test results, not a deployed live-read pass.

**Not completed:** installed whole-source conversion resources, restricted native
writer grants, canonical conversion/history, version-1.1 descriptor production and
the deployed F6/F8/F9 evidence adapter. No new resource release or native conversion
was published/applied. Both reference drafts remain at revision 4 and native cutover
stays disabled. No MFA or UI work is included.

## Native conversion command bridge — 2026-10-08

The existing product-reference command service now supports native conversion through
its issuer/application separation and serializable transaction. The optional
`convert-native` route accepts only draft coordinates, expected revision/source hash
and an idempotency key. Actor, product scope, candidate, schema and resource evidence
cannot be supplied by the caller. The host must resolve the conversion policy inside
the admitted transaction; the bridge always wraps it with canonical schema
qualification before calling the existing atomic repository conversion. Conversion
and replay both use the host's transactional audit sink. Audit failure propagates to
the outer transaction. Unit coverage of this bridge is not a deployed rollback proof.

The optional route is not registered without its installed composition. DEV does not
have that composition yet; this checkpoint does not enable the route or cutover.
Existing ownership and identity commands retain their installed bindings.

Read-only DEV inspection of the actual `athyper_dev_product_command` login records
schema fingerprint `c105b6e472988ad71326bc299f33ef086353a73fa47d905c430bd8ac95f3593c`
in private `resource-review-candidates-20261008/native-cutover-schema.json`. It finds
seven pending cutover constraints: change set, field, operation, runtime profile,
surface, section and field binding. This is an inspection candidate, not independently
qualified schema evidence. `metadata.ui_component_contract` contains zero rows.
Both enrolled drafts remain at revision 4, with native markers unset.

The remaining work is engineering, not a request to repeat enrollment approval:

- Resolve whole-source conversion against installed component/catalogue/provider,
  authorization and initialization evidence; the whole-source positive tests still
  use synthetic contexts. Package and rehearse the restricted native-write grants
  and guard transition with that exact conversion.
- Execute canonical conversion, exact native readback, history, replay and rollback
  under the application login before changing DEV cutover markers.
- Implement the version-1.1 live-read resource producer/installation and Records
  evidence adapter. The native compiler currently emits version 1.0; the host still
  rejects live-read readiness without F6/F8/F9 evidence. Signed descriptor and
  identity-review resources qualify enrollment, not those live-read resources.

Validation: 838 authoring tests pass (6 opt-in skips), 12 focused host tests pass;
authoring and host typechecks pass. No DEV DDL, grants, native conversion,
publication or activation is performed in this checkpoint. No MFA or UI change.

## Published resources and actual reference enrollment — 2026-10-08

This checkpoint supersedes the pending producer/review status below. Platform Owner
approved all three exact Admin proposals through the authenticated control endpoint;
approval replay preserved attribution and timestamps. The existing worker compiled,
signed, dispatched and activated the descriptor and both identity-review resources.
All three release rows are now `published`, with matching Studio activation
acknowledgements. Attempt 1's runtime-compatibility rejection is retained; attempt 2
activated after wiring the existing loader and activation guard.

| Actual DEV result                              | Country                            | State Region                       |
| ---------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Product ownership / platform publication owner | Installed                          | Installed                          |
| Current draft revision                         | 4                                  | 4                                  |
| Current fields with stable identities          | 22 / 22                            | 9 / 9                              |
| Historical releases with valid original hashes | 13 / 13                            | 1 / 1                              |
| Retained breaking rebind findings              | 1 type change                      | 2 reference-binding changes        |
| Ownership and identity command replay          | HTTP 200; same revision/identities | HTTP 200; same revision/identities |

Enrollment used a fresh authenticated Platform Admin, transaction-bound command
admission, installed exact resource pins, signature verification and current human
review eligibility. The 292 accepted historical correspondences and three explicit
exceptions retain the independent Owner attribution. Installed identities are
reserved authoring identities; this is not a claim that deployed F9 resolution is
qualified. Historical artifacts and existing protected controls remain intact.

Worker resource qualification now reuses the publication transaction and restores
its worker context after human-eligibility reads. This avoids pool exhaustion under
concurrent queue jobs. Ledger reads no longer request write-dependent row locks;
immutable source hashes and current review are checked at compile/sign/dispatch
and again in the activation transaction. The loader separately validates resource
shape and the installed descriptor pin. Current eligibility uses an explicit
read/execute dependency inventory, preserving existing RLS and granting no IAM
mutation or review-authority functions to the worker.

The control host's resource verifier accepts only the configured DEV public key
and fingerprint through the shared verification-only trust resolver. It uses the
worker's existing signing key, recovered from its configured secret store; it adds
no private key or signing capability to enrollment. Its control-policy signing
configuration is unchanged. The resource reader now safely decodes PostgreSQL
bigint release numbers; unsafe coordinates still reject. Deferred field validation
required explicit execution grants plus only policy `id`/`status` reads. Failed
identity attempts rolled back before the successful installation.

Applied forward migrations, each with rollback rehearsal and unchanged-data checks:

| Migration                                                       | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20261008_entity_authoring_identity_constraint_execution.sql`   | `0a7fc25e62960c24476bb61aac1222dd765bf77a840f3559b0218ac18b346ab1` |
| `20261008_entity_authoring_identity_graph_validation.sql`       | `e23565df8aa9dcea88ed7671e07105f660afedf322bad7a5343e08129d60c40a` |
| `20261008_entity_authoring_identity_policy_validation.sql`      | `bf21469e817d3159454dcd3c4a578656c8b4bf33af3a5bcb0941d151ac274768` |
| `20261008_entity_authoring_resource_entitlement_evaluation.sql` | `409f18303271582fbfd98f516774651126ca04f81d201fa816dc9e9f9b9763c5` |
| `20261008_entity_authoring_resource_entitlement_reads.sql`      | `6809e739caca8793e8ec3024fdd2be339ef3317fde184bd9f256e72f1f876e1e` |
| `20261008_entity_authoring_resource_scope_evaluation.sql`       | `b4bef03f4df67ecc016e60d324edc232843ff48a8b0bb257bc84f0677a1d3544` |
| `20261008_entity_authoring_resource_worker_reads.sql`           | `737a55ab856e67b6129c26df771021357288f7e2c2ba202f12b76664ecfe9989` |

Private token-free evidence is under
`~/.athyper/instances/dev/workspace/resource-review-candidates-20261008/`:
`approval-receipts.json`, `enrollment-receipts.json`,
`installed-enrollment-evidence.json`, exact resource pins and migration receipts.

Validation: 833 authoring tests pass (6 opt-in skips), 467 publication-service tests
pass (3 opt-in skips), 31 focused host tests pass, host typecheck passes. Gateway
matching and migration-layout checks pass. These local tests are distinct from the
actual DEV authenticated commands, worker execution and readback above.

**Still pending:** canonical native conversion/cutover and complete deployed
F6/F8/F9 live-read qualification. No production enablement or UI work is claimed.

## Authenticated resource producer/review integration — 2026-10-08

Generated resource proposals now use the existing publication repository and
`publication.release` ledger. The explicit typed source is preserved in immutable
release metadata; this is generated resource output, not another writable Entity
authoring graph. Proposal replay checks coordinates, hashes and attribution.
The repository participates in an existing transaction instead of opening a
nested transaction. A shared coordinator binds proposal/approval to the exact
source hash, current authorization, semantic qualification and transactional audit.
Named identity reviewers must match the authenticated approving principal.

The isolated control host now registers the optional endpoint
`POST /api/platform-control/meta-entity-authoring/resources/:id/review`, accepting
only `action` (`propose` or `approve`) and `expectedSourceHash`. Generated source
files come from the read-only host mount, never the HTTP request. Existing edit/
review permission evaluation and platform-authority admission remain in force.
No existing authentication or MFA behavior changes. Narrow SQL functions provide
proposal/approval/read access; no general publication INSERT/UPDATE is granted.
A trigger preserves generated source coordinates/content and established review
attribution. The current reviewer adapter requires both authenticated proposal/
approval audit evidence and current active human, identity-binding and tenant-wide
IAM eligibility. Merely setting `approved_by` cannot satisfy that adapter.

The control entrypoint binds configured reference policies to the existing trusted
signature verifier, current eligibility adapter and transactional audit. Producer
configuration uses `PLATFORM_CONTROL_RESOURCE_SOURCE_DIRECTORY` and
`PLATFORM_CONTROL_RESOURCE_DESCRIPTOR_HASH`; installed-reference configuration
uses `PLATFORM_CONTROL_REFERENCE_RESOURCE_POLICY_FILE`. The latter remains unset
until actual approved resources are published and activated. The DEV-only compose
resource-review overlay mounts proposed sources without enabling enrollment.

DEV installed the following forward migrations after rollback rehearsals:

| Migration                                               | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `20261008_entity_authoring_resource_review.sql`         | `82cc228c89e8556dc5bd3404fdc64ff34f21c899b3ec6f858b6212ba127ba329` |
| `20261008_entity_authoring_resource_history.sql`        | `a72acd153610ad7dce027073350b67ed16dbc89c3794909d12869d93218c1bcd` |
| `20261008_entity_authoring_resource_current_source.sql` | `dbee0cd69f90f88a55efc74a79f65232a08e59492b08c2582d2e2e795095b40b` |

The two source readers expose exact product-draft history/current saved revision
without general snapshot or normalized label-table grants. Current source graph
and snapshot hash must both match the proposed source hash. Historical integrity,
complete correspondence, plan hash and known compatibility findings are checked
through the existing lineage validator. No historical graph or controls are edited.

Three **unapproved** candidate files and their canonical hashes are recorded in
`~/.athyper/instances/dev/workspace/resource-review-candidates-20261008/index.json`:
a proposed descriptor bundle of the seven generated contract artifacts, plus the
two previously prepared source-bound identity reviews. The descriptor bundle is
proposed content, not an assertion that all its capabilities are deployment-qualified.
The Platform Owner remains the nominated independent reviewer. All three pass
read-only source qualification under the control role; this diagnostic deliberately
has no authenticated review authority. The running DEV review endpoint returns 401
without authentication and the health endpoint returns 200. The stored Admin
session was refreshed. At 03:47 UTC, all three exact proposals and their replays
returned HTTP 200 through the public gateway under the authenticated Platform
Admin. Each replay preserved release ID and creation time; all statuses remain
`preparing`. Token-free responses are in `proposal-receipts.json` beside the index.
The gateway now routes only the exact resource-review path to the control host.

Validation: publication suite 467 tests pass, contract suite and host/typechecks
pass; the focused host group has 37 passing tests. The explicit PostgreSQL test
proves proposal/approval replay, self-review rejection, immutable source and lack
of authenticated provenance from bare fixture ledger approval; everything rolls
back. Migration receipts confirm existing rows and heads unchanged.

**Still pending:** independent named review, publication/
activation with the approved-source worker adapter, installed resource pins and
actual enrollment. No real resource approval was fabricated. Country/State Region
ownership and identities remain unchanged; deployed F6/F8/F9 is not established.

## Approved-source adapter and scoped resource reads — 2026-10-08

The publication service now provides a concrete approved-source adapter over the
existing release ledger and an owning-store snapshot reader. The complete source
coordinates/payload hash must equal `publication.release.release_hash`; status,
plane-kind declaration and independent author/reviewer attribution must agree.
Current review eligibility and semantic resource qualification remain mandatory
host ports at compile/sign/dispatch. The bounded read-only file adapter rejects
path traversal, symbolic links, writable mounts and oversized files. It supplies
source content, not approval; no file can declare itself trusted.

Installed DEV `20261008_entity_reference_resource_reads.sql`, SHA-256
`05f6e0e487433366c04a7dd0e6a3f3055a1db726590d91fdbdf8145ae1d491c1`,
after rollback rehearsal. Two SECURITY DEFINER functions expose only installed
descriptor/identity-review evidence under a live transaction/backend/login/actor/
tenant-bound command admission. Identity reads additionally match the admitted
draft and entity. Functions use a fixed search path, revoke PUBLIC execution and
grant only execution to the command role; no publication/runtime table SELECT is
granted. The canonical reader uses these functions and retains signature/hash and
current review checks. Existing metadata/snapshots/authorization rows and heads
were unchanged. Private receipt: `identity-correspondence-20261008/resource-reads-installed.json`.

The rollback PostgreSQL role test rejects unadmitted and forged-scope calls,
asserts no broad underlying table reads, and checks an admitted missing resource
returns no evidence. Its admission is a fixture; it does not prove retrieval of a
real approved resource. Host configuration now validates exact pins and bounded
budgets, excludes approval claims, and checks installed function privileges before
composing reference policies.

DEV inspection found **zero** descriptor/identity-review resource releases.
Consequently no actual approved resource, ownership or identity installation is
claimed. Remaining engineering is the producer/review workflow integration and
entrypoint binding of current eligibility/semantic qualification to these adapters;
real independently approved source resources and their exact pins are then needed.
The optional command binding remains disabled. Deployed F6/F8/F9 remains unqualified.

Validation: publication suite 464 passing tests (two explicit PostgreSQL opt-ins);
focused host configuration/runtime and resource reader tests; source and host
typechecks; explicit DEV restricted-role rollback test and migration rehearsal.

## Resource publication and host composition — 2026-10-08

The shared publication contract now carries Studio-only `entity_authoring_descriptor`
and `entity_identity_review` artifacts. Compilation, signing and dispatch require
an exact approved source and an explicit current qualification adapter. Resources
use the existing signed envelope/manifest, immutable compilation, payload projection
and activation head; they create neither a parallel ledger nor Entity runtime rows.
Installed readers now verify that same envelope format, including release number,
payload hash and signing-key coordinates, before resolving descriptor/review content.

The control host can compose the canonical ownership/identity policies from an
installed descriptor pin, trusted verifier, current reviewer-eligibility callback
and transactional audit adapter. Identity reviews are selected by exact entity,
draft and source hash; missing or ambiguous installed evidence rejects. Admission
rechecks descriptor availability and exact actor/entity/draft scope. These bindings
are optional and remain disabled in DEV until real configuration is supplied.

DEV installed `20261008_entity_authoring_resource_projection.sql`, SHA-256
`c8b38846dec2f8af92a13d79f931aa6f6d3751b2de22b06ee8883417f09753e5`,
after rollback rehearsal and exact predecessor-function preflight. This forward
migration exempts the two payload resource kinds from Entity-row projection checks;
it retains existing activation integrity checks. Existing rows and activation heads
were unchanged. Private receipt: `identity-correspondence-20261008/resource-projection-applied.json`.
The separate PostgreSQL test stages/verifies/activates both kinds and rolls back;
its verification fixture is not human approval or deployed resource qualification.

Validation: publication service 461 tests pass; authoring baseline 830 tests pass
(six opt-in exclusions), plus two new policy-composition cases. The focused resource
reader/policy suite passes six tests. Ed25519 round-trip, absent qualification,
source drift, scope changes, revoked descriptor and ambiguous review rejection are
covered. PostgreSQL activation rehearsal passes.

**Still required:** the approved-source publication adapter, installed current
reviewer-eligibility/verifier configuration, restricted resource-read privileges,
and actual independently approved descriptor/review releases. No Country/State
Region ownership or identity rows changed. Native conversion and deployed F6/F8/F9
are not established by this checkpoint. The earlier reader-only status below is
historical and superseded for publication support, not for live authority.

## Installed-resource readers and restricted grants — 2026-10-08

`installed-reference-resources.ts` adds a concrete SQL read adapter over existing
`publication.release`, signed artifacts, immutable compilations and local
`runtime_meta` activation heads. Exact configured release/key/unsigned/artifact
hashes must agree; the adapter locks those rows, checks both unsigned and signed
content hashes and verifies Ed25519 through the installed verifier. It requires
current independent human-review authorization on every read. No latest-version
fallback, new release ledger or request-provided approval is introduced.
The identity-review store binds the receipt's named principals to the approved
resource release and re-resolves it for authorization. Descriptor resolution
checks the closed versioned wrapper and exact descriptor-content hash.

Restricted enrollment grants were rehearsed, then installed in DEV:
`20261008_entity_reference_command_privileges.sql`, SHA-256
`d0e07b0e4198501947d368abc188253b9c13e7615f182d347fae5b5434e6c276`.
The application role receives only ownership/reference-marker root updates,
field-identity/attribution updates, reserved-identity inserts and scoped historical
and reference-member reads. Restrictive policies constrain reads/writes to the
admitted NULL-tenant product draft. Identity lifecycle/deletion, field meaning,
native cutover, publication and review writes are not granted. Exact command SQL
still trusts the canonical writer; these grants do not independently attest review.
Existing data and activation heads were compared unchanged. The runner's
`authorizationAndHeadsUnchanged` field refers to authorization **rows** and heads;
this migration intentionally changes the documented database ACL/policy surface.

The disposable canonical PostgreSQL test proves reservation and historical reads
under the restricted role, denial of field-key/lifecycle/delete/cutover writes,
and absence of identity/history visibility without admission. Its admission
function is explicitly a fixture; the separate real DEV application-role test
proves unadmitted reads/writes remain denied after installation. No actual Country
or State Region ownership/identity enrollment occurred. Private installation
receipt: `identity-correspondence-20261008/reference-grants-installed.json`.

Validation: 830 authoring tests passed (six opt-in exclusions); explicit native-test
typechecking, canonical PostgreSQL rehearsal, installed DEV role verification,
13 migration-runner tests and migration replay passed. Migration layout covers
143 classified files and 135 retained SQL files.

**Remaining deployment work:** bind the installed verifier and current governance
eligibility adapter, qualify resource-read privileges and connect the resolver to
the control entrypoint. The new descriptor/review resource kinds are explicit
reader contracts; the publication compiler/activation registry does not yet
produce/install them. Approved resources and named review evidence must pass that
path before these readers can return live authority. No approved resource was
fabricated or substituted with a fixture. Native conversion and live qualification
remain pending actual enrollment.

## Reference command transport and review validation — 2026-10-08

The control-plane composition accepts optional shared reference enrollment
bindings. The two authenticated routes are `initialize-ownership` and
`install-identities` under the existing change-set API. Closed requests contain
only entity/draft coordinates, revision, source hash and idempotency key. Actor and
platform authority scope come from the verified session; reviewer, tenant and
schema input injection rejects. The transport uses the existing isolated
issuer/application connections and serializable product-command admission,
validates the exact admitted entity, resolves current installed policies inside
the transaction and invokes the canonical repository. It retains distinct conflict,
denial and committed-but-cleanup-failed responses. UI remains deferred.

`createLegacyIdentityReviewResolver` validates an immutable, exact-source
`entity.legacy-identity-review/1` receipt with named proposer/reviewer, descriptor
and complete plan hash. It rejects publication receipts, self-review, changed
content, cross-scope evidence and invalid principals. The required trusted store
must independently verify authenticated review provenance, eligibility, revocation
and resource trust on every call; a content hash is not authority. The writer
still validates the complete historical plan independently. No chat response or
role label becomes a named review receipt.

Validation: 826 authoring tests pass (six opt-in exclusions), including 12 new
transport/review/composition cases. Authoring, explicit native-test and host
typechecks pass. The explicit installed-role DEV PostgreSQL test also passes:
label authority remains available and unadmitted/direct ownership writes reject.
The explicit native-test check found and fixed a readonly-array mutation in the
previous PostgreSQL fixture; ordinary package test typechecking inherits the
production test exclusion, so this dedicated check remains necessary.

**Installation boundary:** these optional routes are not enabled by the running
control entrypoint or gateway. A concrete trusted review store/authorization
adapter, approved descriptor resolution, restricted ownership/identity role
privileges and entrypoint configuration remain to be implemented and qualified.
No DEV rows, grants, deployments or activation changed in this checkpoint. Actual
reference enrollment, native conversion and deployed F6/F8/F9 remain incomplete.
This transport is shared framework integration, not evidence of installed authority.

## Ownership and identity command checkpoint — 2026-10-08

The shared repository now exposes `executeLegacyOwnershipInitialization` and
`executeLegacyIdentityInstallation`. Both require installed admission/audit ports,
exact product/draft/actor coordinates, source hash, revision and idempotency key.
Ownership pins come from installed policy, never client input. Initialization
advances exactly once and preserves the legacy graph; the typed root and immutable
command receipt record ownership because legacy JSON does not encode that tuple.

Identity installation additionally requires a serializable transaction and an
independently resolved named review bound to the complete source/history plan.
Self-review, revoked review, unknown compatibility, incomplete history and an
existing unreconciled identity catalogue reject. It allocates reserved identities,
updates existing field rows, constructs the same validated 2.3 graph and checks
exact readback. Replay verifies saved bindings and revalidates admission/review.
Audit failure rolls back allocation, root changes, receipt and snapshots together.
No new operation or protected-state initialization is included.

DEV schema preparation was rehearsed and installed through the existing migration
runner: `20261008_entity_legacy_ownership_initialization.sql`, SHA-256
`de601b594de70cce19f915c911a9ad4f09ae2dd8d1fefd3786b30eeae47ad337`.
It pins the predecessor constraint/function definitions, retains the native cutover
block, forbids ownership re-pinning and requires same-transaction revision/history
proof. Existing metadata/history rows, authorization data and activation heads
were compared unchanged. No application grants were added. Receipt:
`~/.athyper/instances/dev/workspace/identity-correspondence-20261008/ownership-schema-installation.json`.

Validation: 814 authoring tests pass, six opt-in exclusions; the explicit canonical
PostgreSQL enrollment rehearsal passes, including ownership/identity replay,
audit rollback and revoked/self-review rejection. Twelve migration-runner checks
pass; migration layout inventories 142 classified files and 134 retained SQL files.
The PostgreSQL command proof uses fixture authority, not deployed human governance.

**Still open:** install restricted application-role command privileges and runtime
bindings, resolve the approved descriptor and named historical review, persist and
consume deployed F9 correspondence/findings, apply actual reference enrollment,
then native conversion and deployed F6/F8/F9 qualification. Country and State Region
ownership and identity rows have not changed. The accepted disposition is retained;
it is not substituted for named-review attribution. UI remains deferred.

## Active Studio reference-slice execution plan — 2026-10-07

This section governs execution tracking for **Country and State Region Studio
reference authoring**, separately from the older Country/Principal pilot below.
The Entity Studio blueprint remains the design authority. This dependency-based
sequence supersedes the earlier chat-only six-activity ordering. Scope/sequencing
is authorized by the owner; it is not release approval or a passed qualification.

| Milestone                                        | Work and dependencies                                                                                                                                                                                                                             | Accountable engineering role                                                                                                                                   | Named assignee / target date                                         | Concrete exit evidence                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 — governed bootstrap/product writes           | Compose the existing authenticated governance capability with typed commands and the actual NULL-tenant DB role/RLS/function path. Bootstrap uses the existing API/CLI; a published composer UI is not its prerequisite.                          | Platform/tenant governance maintainer; shared authoring persistence maintainer                                                                                 | Pending owner assignment / pending target date; requested 2026-10-07 | Actual application-role authorized command commits canonical rows and immutable history; revoked/forged scope and unauthorized direct DML reject. Independent author/reviewer separation proved through existing governance. No superuser receipt substitutes for this proof. |
| P — parallel preparation                         | Review label mappings, identity correspondence and ownership provenance; build host composition and F6/F8 adapters. Does not wait on M1 for pure preparation; applying changes does.                                                              | Shared authoring maintainer; identity/migration maintainer; storage/provider maintainer; authorization-framework maintainer                                    | Pending named assignments / dates                                    | Exact-source proposals, coverage findings, typed adapters and meaningful positive/negative tests. These do not clear enrollment or live-read gates.                                                                                                                           |
| M2 — canonical enrollment                        | Apply source ownership, stable identities and labels through qualified commands after M1 and each command's actual dependencies. Do not impose a blanket ownership-before-label dependency where the legacy command contract does not require it. | Shared authoring persistence maintainer; identity/migration maintainer with authorization reviewer                                                             | Pending owner assignment / pending target date                       | Both actual drafts have canonical owned labels, validated field identities and source provenance; revision/conflict/replay/rollback and original-history preservation pass.                                                                                                   |
| M3 — native conversion and compiler/reader proof | Depends on complete M2 resource/ownership enrollment and installed required dependencies.                                                                                                                                                         | Shared authoring/compiler maintainer                                                                                                                           | Pending owner assignment / pending target date                       | Both actual graphs convert atomically; exact native readback, immutable pre/post history, whole-release compile and reader compatibility pass. Pending cutover constraints change only through the qualified forward migration.                                               |
| M4 — publish host and qualify deployed reads     | Depends on M3 plus installed F6/F8 resources and F9 mappings. Publish/activate through independent governance. F5 additionally gates production.                                                                                                  | Host/plane maintainer; F6 storage/provider maintainer with platform governance review; F8 authorization-framework maintainer; F9 identity/migration maintainer | Pending named assignments / dates                                    | Exact approved resource/release hashes, signed publication/activation evidence and authenticated positive/negative deployed tests, including revocation, plane lag and unmappable legacy pins.                                                                                |

**Publication roles:** Platform Admin proposes; Platform Owner independently
reviews. These roles do not replace the engineering owners above. Assignments and
calendar dates must come from the responsible people, not be manufactured by an
agent. Missing assignments are escalated to Platform Owner during delivery
planning; a deadline or assignment does not itself pass a technical gate.

**Separate protected-state decision:** prior owner approval covers preservation
in persistence and compilation only. New-operation initialization needs its own
explicit owner decision and verified governed source before implementation. No
onboarding, publication or general implementation approval extends that scope.
Record the decision/provenance here when supplied; currently pending.

**One F9 owner, two stages:** identity/migration maintainer owns (a) reviewed
source-hash correspondence and canonical allocation/installation in M2 and (b)
deployed identity resolution, rebind, ambiguity and plane-lag evidence in M4.
Authorization-framework review remains required. Zero direct legacy member-ID
matches does not prove every mapping is unrecoverable or require one manual
review per field/release pair. Group equivalent evidence while retaining every
source-hash binding; never infer authority from a field-name match.

**Label preparation:** Country has 48 candidate locations, including 44 binding
overrides, with 24 distinct text values. Group candidates for review by meaning
and locale context; equal text alone does not imply a shared label identity. The
two “Record ID” overrides require field/surface/visibility inspection against the
no-visible-UUID rule; changing a caption is not a UUID exposure fix. The installed checkpoint below now records 48 Country and 15 State Region allocated labels. These allocations do not prove whole-source mapping completeness.

**Next milestone remains M1 + actual canonical enrollment.** Diagnostic reports
and additional pure fixtures alone cannot complete it. Current implementation
now includes installed, authenticated DEV label writes. Ownership and field-identity commands and complete canonical enrollment remain unfinished. Draft mutation requires current authenticated
authoring authority, not a human review receipt; independent review gates publication. No production/cutover
or host activation is authorized by this status entry. Preserve all history until
the separate F5 retention decision is approved.

### Product-command admission implementation checkpoint

Legacy label/reference product commands now require the existing installed
`NativeAuthoringPolicy.admit` path with the scoped entity, actor and exact batch,
inside the transaction and before mutation or idempotent receipt lookup. Budget
configuration alone cannot enable these product commands. Every retry rechecks
current authority. Existing tenant commands retain their established outer
admission/RLS path; no business permission code, SQL grant or MFA rule was added.
This does not wire an approved host or prove NULL-tenant application-role writes.

Validation: 785 authoring tests pass (six opt-in exclusions), including missing
product admission and current/repeated revoked-admission rejection before DML or
receipt reads. The disposable PostgreSQL scoped-save/replay/rollback suite passes
with explicitly synthetic fixture admission; its superuser execution is not M1
product RLS qualification. Production/test typechecks pass. No DEV schema/data
mutation, publication or activation occurred at this checkpoint.

### Canonical label-enrollment writer checkpoint

`KyselyMetaEntityAuthoringRepository.executeLegacyLabelEnrollment` now connects
source-bound proposals to the existing canonical label writer. It requires an
installed host and normalized command policy, checks scoped source coordinates,
performs host read admission, validates the exact source revision/hash and then
uses the existing product-command write admission, allocation, idempotency and
snapshot protocol. Replay reconstructs the batch from checksum-verified immutable
source history rather than the now-enrolled current graph. Nested savepoints keep
source validation, writes, revisions and history atomic inside the caller's
transaction. No separate provider, endpoint, authority ledger or privileged SQL
writer was introduced.

The expanded disposable PostgreSQL test executes canonical label enrollment,
checks exact replay and loaded labels, rejects a stale source hash without an
extra revision and rolls back the outer transaction. It uses explicitly synthetic
host admission and a superuser database fixture. It is **not** application-role
RLS qualification, actual Country/State Region enrollment or independent approval.
Ordinary tests also reject enrollment when host admission is unconfigured.

DEV's current product boundary remains unchanged: application-role UPDATE policies
require a matching non-NULL tenant, and the revision advance function is invoker
security. These cannot be bypassed by an authoring token or a successful callback.
M1 still needs the governed bootstrap service/CLI composition and qualified scoped
product database authority. No DEV grants, product rows, history, ownership,
protected-state initialization or activation changed in this checkpoint.

### Scoped application-role label-write candidate — 2026-10-07

The shared package now implements `createProductCommandAuthority` and
`createProductLabelEnrollment`. The latter derives actor coordinates from the
verified request context, executes the existing repository in a serializable
application transaction and requires the host's transactional audit callback.
No new route, permission code, MFA behavior or publication approval is added.
The governance resolver is a required installed port, with no default allow.

The SQL installation candidate separates issuer, application and NOLOGIN owner
roles. Private admission tokens are stored only as hashes. Consumption checks the
exact login/request/actor/authority tenant and binds access to a transaction and
backend for at most 60 seconds. Application credentials cannot issue admissions;
issuer or superuser sessions cannot consume them. Fixed table/column policies
limit writes to labels, locale settings, revision advancement, command receipts
and snapshots in the admitted product draft. Existing canonical graph/history
checks remain in force. Service replay obtains fresh governance authorization.
A transaction that already consumes an admission holds its row lock: concurrent
revocation waits for transaction completion rather than cancelling it midway.

Validation: the expanded canonical PostgreSQL rehearsal uses separate non-admin
issuer and application logins. It commits a label enrollment, replays it without
another revision, and rejects revoked governance/admissions, forged actor/session
settings, unadmitted direct writes, admission issuance by the application and
writes to another draft. An unavailable transactional audit callback rejects and rolls back initial
enrollment. A failed subsequent canonical label command rolls back members,
revision, receipt and saved history. The issuer's governance resolver,
actors and role composition remain explicit fixtures; these are database mechanism
proofs, not installed governance or independent human approval evidence.

Ordinary verification: 790 authoring tests pass, with six opt-in exclusions;
the PostgreSQL rehearsal above passes separately. Source and focused test
typechecks, generated foundation checks and whitespace checks pass.

Audit corrections for this candidate:

- Admission is **scope enforcement**, not SQL-effect attestation. The rehearsal deliberately applies a different in-scope label mutation under a valid admission and rolls it back. Exact effects depend on the trusted canonical writer/audit path.
- A rollback undoes token consumption. A simulated process failure proves reuse before expiry when separate revocation did not run; a committed consumption, explicit revocation and expiration each reject reuse. Concurrent revocation waits on an already consuming transaction.
- Cleanup failure now raises `ProductCommandCleanupError` with code `PRODUCT_COMMAND_REVOCATION_FAILED`. Confirmed commits carry `outcome=committed` and the result; failed/unacknowledged transactions carry `outcome=unconfirmed` and the original failure. Raw cleanup errors/tokens are not exposed. The canonical enrollment test commits despite a failed revoke, then recovers the same result through fresh governance and the same idempotency key, without another revision. Unit tests cover execution failure and lost COMMIT acknowledgement as well.
- The fresh-install SQL preflight rejects existing candidate roles/schema before mutation. Re-running the raw candidate fails explicitly; an eventual applied migration replays through the existing hash-pinned ledger. No `IF NOT EXISTS` adoption of unknown role privileges is permitted.
- The fixture no longer grants `SELECT ON ALL TABLES`. Its read grant is the existing `BRANCH_COLUMNS` legacy-reader inventory plus `metadata.entity`; these fixture reads still do not qualify deployed RLS.

The installation privilege inventory to qualify is:

| Consumer                     | Required surface                                                                                                                                       | Qualification boundary                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Isolated governance issuer   | Column-limited INSERT into private admissions; bounded revoke routine                                                                                  | Installed governance binding, current human authority, isolated credentials; never application-role membership           |
| Command application          | Candidate enter/admitted routines; revision advance/current-actor functions, canonical UUID allocation and principal-context functions                 | Explicit function ACL/ownership/search-path inspection; do not rely on fixture PUBLIC defaults                           |
| Canonical graph reader       | `metadata.entity`, legacy `BRANCH_COLUMNS` tables including class profiles and relation targets, plus candidate root/labels/receipts and saved history | Review precise table/column and row-scope policies; qualify referenced entities separately; no blanket schema read grant |
| Canonical label writer       | Root revision/attribution/locale columns; label/translation DML; command-receipt and immutable-history INSERT                                          | Candidate RLS plus canonical guards; no ownership, identity, operation, review or publication writes                     |
| Transactional audit recorder | Existing audit contract and its actual function/table grants                                                                                           | Same application transaction; record failure rolls back the command                                                      |

CI verification for the audit correction used explicit formatting base
`2f1f39d25f68d0d62863a4007703273109c5a486`, covering the previous commit as well
as this candidate. Formatting passes, including the previously stale repository
file. The full `policy:static` CI profile reports **38/51 passed; 13 failed**:
i18n, temporal discipline, server boundaries, server rebuild boundaries,
authorization inventory, frontend spine, foundation phase 1, host capability
registry, ESLint, OpenAPI, DDL coverage, strict theme-token integrity and CI
entrypoints. Examples include an unregistered TypeScript ESLint plugin, existing
HR provisioning cross-package imports, missing DDL manifest enrollment and missing
`--fail-if-no-match` flags in CI. No gate was skipped, baseline expanded or policy
weakened. This is not a green-CI claim. Detailed local logs are under
`~/.athyper/instances/dev/artifacts/static-policy/2026-10-07T15-42-54.288Z-637111/ci/`.

**Remaining M1 work:** wire the actual installed governance binding and trusted
control-plane context; qualify the precise application read/execute privileges
and role separation; enroll the candidate in the existing forward-migration
process; run authenticated positive/negative commands against DEV. The SQL
candidate has not been applied to DEV and no runtime login has received these
roles. Actual Country/State Region enrollment, ownership/identity work and
publication/live-read qualification remain pending. This checkpoint establishes
application-role canonical writes in a disposable database, not M1 completion.

### Consolidated execution tracks — 7 October 2026 review correction

Following review of the eight-track acceleration draft, execution is tracked as
three deliverables rather than eight independently managed tracks. The draft's
weighted percentages are withdrawn from delivery reporting: the weights
double-counted related work (F3/D27, F2/D24, F4/B0), and file counts do not
establish completion. Host composition, governed writes and the D01 order boundary are priorities,
but their share of remaining cost is an unmeasured planning hypothesis.
A standalone published composer host is not yet qualified; shared framework
components already exist and must be reused.

**Corrections accepted from review:**

- Governed authority gates actual product draft writes and enrollment, not only
  activation. Preparation and fixture execution proceed independently; deployment
  writes do not.
- Fixture admission is test-only. Production interfaces are reused, but real
  integration requires authentication, governance resolution, database roles, audit
  and resource qualification. It is not a callback swap.
- Any actual storage access must satisfy its applicable authorization requirements
  when exercised. Synthetic preview may defer live authority; it does not defer
  authorization for real access.
- Parallelism applies to preparation. Integration happens against agreed
  interfaces, because host/bootstrap share resource contracts and conversion and
  constraint replacement share schema and validation dependencies.
- Batched constraint changes retain a per-constraint disposition and fixture. No
  blocker is removed before its replacement validation completes.
- Label review is grouped by meaning and locale context, never by equal text. Every
  binding is preserved; equal text does not establish a shared identity.

| Track                            | Immediate deliverable                                                                                                                  | Completion evidence                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Governed writes and bootstrap | Connect the existing authentication/governance path to the candidate; finalize scoped grants, audit and migration packaging            | An authenticated application-role command commits canonical data; revoked authority, forged scope, audit failure and replay behave correctly |
| 2. Minimal shared host           | Author the change-set Entity definition; deliver read-only inspection plus saved-fixture preview through the shared renderer           | Explicit identity/navigation and resource bindings; missing metadata rejects; no bespoke page or production fixture admission                |
| 3. Conversion and enrollment     | Complete source-bound Country/State Region mappings, group identity evidence, integrate conversion, ordering and constraint rehearsals | Whole-source coverage, preserved history, atomic application, compiler/reader compatibility and explicit unsupported-path diagnostics        |

Track 2 demonstrates user-visible progress independently. Track 3 prepares and
rehearses independently. Actual enrollment joins Track 1 once governed writes
qualify.

**Execution rules:** freeze unrelated expansion while allowing the contracts and
mappings these three deliverables require; start the host with inspection and
synthetic preview rather than wiring every save/import/rename/rebind editor; use
one integrated Country/State Region acceptance scenario across all tracks instead
of accumulating isolated component proofs; keep CI remediation parallel; record a
decision only when it blocks the next concrete action. F5 remains a production
prerequisite, and protected-state initialization still needs its separate approval
where new operations require it.

**Next checkpoint — two results only:** a working governed write path, and a
minimal shared host rendering saved fixture data.

### Historical correspondence and migration registration — 8 October 2026

The six preparation upgrades missing from the Studio migration manifest are now
registered in dependency order. All six already have exact `applied` DEV ledger
entries; no SQL bytes changed and no upgrade was reapplied. Migration-layout
validation now passes. The canonical PostgreSQL native-constraint compatibility
rehearsal passes with its existing explicit test-only cutover; it does not enable
DEV conversion.

The shared lineage implementation now prepares full-declaration correspondences
(excluding only legacy member ID) and validates complete historical coverage.
Every previous field must be explicitly mapped or explicitly rebind-required;
missing/extra releases, duplicate mappings, changed declarations, stale source
hashes and incomplete dispositions reject. The installed-evidence inspector
emits these proposals alongside the existing direct-ID comparison. These are
review candidates, not field-name joins, allocation authority or installed F9.

Actual saved revision-2 sources were checked against all 14 immutable release
snapshots: 292 of 295 historical field occurrences match completely apart from
member ID. Country accounts for 285 matches across 13 releases; State Region
accounts for seven across one release. The remaining differences are:

| Release                                | Current field               | Historical difference requiring explicit disposition                               |
| -------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `5b1f71bd-cbbc-4d99-83e7-399c91d54fcf` | Country `status`            | Previously enum with `shared.ref_status_d`; current string                         |
| `cdf2b92f-b038-4943-add0-5e6b08994292` | State Region `country_code` | Historical `keyReference` to Country; current type configuration lacks it          |
| `cdf2b92f-b038-4943-add0-5e6b08994292` | State Region `parent_code`  | Historical compound `keyReference` to State Region; current configuration lacks it |

The comparison above uses field names only to explain differences for human
review; it does not establish those three identity correspondences. Proposed
negative disposition is rebind-required, preserving original snapshots and
controls. The owner accepted the 292 exact matches and three explicit rebind
dispositions in this conversation, conditional on compatibility classification,
named reviewer attribution, dependent findings and independent security checks.
This acceptance is not an authenticated installation/publication receipt. Full
source-bound proposals and complete plan hashes are in the private DEV workspace
`identity-correspondence-20261008/enrollment-evidence.json`. Reproduce them with
`tooling/scripts/verification/inspect-legacy-enrollment.dev.mts` and the two exact
draft IDs in the installed checkpoint below. The earlier absence of direct member-ID
matches must not be interpreted as 295 incompatible field declarations.

Both current drafts remain revision 2 with verified saved history, allocated
labels, NULL source kind and no stable field identities. The installed label host
still excludes ownership/identity commands. The ownership preparation below now permits a guarded one-time ownership/schema
initialization; application-role enrollment still requires the installed command
bindings and trusted descriptor/review resolution.
The F6/F8 effective-security implementation currently exposes an evidence port;
no production `withLockedEvidence` adapter was found in host composition. These
are unfinished implementations, separate from the accepted correspondence disposition and still-required named reviewer attribution.
Native conversion and deployed F6/F8/F9 are not complete. UI remains deferred.

Compatibility findings classify Country’s enum-to-string change as a breaking
semantic type change and the two State Region differences as breaking reference
binding changes. Findings include release ID, exact source hash and old field ID.
The shared dependent-findings function rejects missing/stale source pins and
unknown fields, and reports rebind-required to matching dependents. Unknown
changes remain unclassified/blocking. These helpers are not yet wired into a
deployed installation/compiler dependency path; that wiring must precede install.
Declaration equality remains separate from access, masking and relation-target
security qualification.

Validation: 811 authoring tests pass (six environment-dependent skips), including
complete-release coverage and explicit rebind disposition rejection tests. The
PostgreSQL constraint rehearsal and migration-layout check pass.

### Installed DEV command authority and label enrollment — 8 October 2026

The optional server-only path is now installed. No shared composer UI or UI wiring
was added. The real Platform Admin browser session authorized enrollment through
the existing `metadata.entity.author` governance adapter, isolated issuer/app
connections, canonical repository transaction and audit append. No publication
review receipt, service-account authorship or direct administrator draft write
substituted for that authorization.

| Actual checkpoint           | Evidence / remaining boundary                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command transport installed | Immutable `20261008_entity_product_command_authority.sql`, SHA `ad99f6d17190f4385d1ace8f97cbdbcc3eefd408f5f4fb87965f8159d92ee657`, recorded in the existing migration ledger                                                                                                                  |
| Audit contracts installed   | Forward `20261008_entity_product_authoring_audit.sql`, SHA `bbdc9ca008bedbbcaa22165bf17d334a11887bf9b289389dcc456302af77f2d6`; exact enrollment/review contracts, no generic audit bypass                                                                                                     |
| Installed app-role checks   | Direct draft reads return no rows without admission, ownership UPDATE and forged admission reject; actual IAM lookup and rollback-only transactional audit pass. The isolated role test uses a synthetic request context and does not itself attest browser authentication                    |
| State Region labels         | Draft `9672c64b-b40f-43ce-8a2f-e0fbebd1154e`, revision 1 → 2, 15 labels, one command receipt; authenticated replay returns the original allocation                                                                                                                                            |
| Country labels              | Draft `28e155d7-9f18-48fd-9f4d-847ff80f7e87`, revision 1 → 2, 48 distinct labels, one command receipt; original index-only replay exposed snapshot-order mismatch, fixed with explicit original member IDs. Corrected authenticated replay passed twice with the same revision and identities |
| Immutable history           | Each draft retains revisions 0, 1 and 2; all six graph hashes were recomputed and verified. Country source revision-1 hash `259eb6b00119e4f685d43fa72806d78c8845422c4df79b34acc20dc262d12cae`; State Region `1056cb869b001425762fb5e979f4de91c0f747e824565010bb3018a4a0ead304`                |
| Still required              | Source ownership initialization, reviewed released-field identity correspondence/allocation, native conversion/application/history, whole-release acceptance and deployed F6/F8/F9. Both drafts still have NULL source kind. No publication/activation or F5 production approval is claimed   |

The reproducible installer is
`server/db/scripts/operations/authorization/prepare-dev-product-command.mjs`.
It supports rollback rehearsal and explicit `--apply=DEV-PRODUCT-COMMAND`, with
hash/ledger validation and strict role preflight. Private outputs go under
`~/.athyper/instances/dev/secrets/product-command`; evidence and the pre-installation
backup are under `~/.athyper/instances/dev/workspace/product-command-20261008`.
No credential belongs in the repository or evidence logs. Configure an explicit
private label policy (`supportedLocales`, `maxCommands`, `maxBatchBytes`) before
using `deploy/compose/instance/compose.product-command.yaml` with the existing
control-api stack. DEV used `en`, 100 commands and 65,536 bytes. The narrow gateway
route includes `enroll-labels`; DEV's disabled file watching requires a gateway
restart to load that change.

Runtime grants are a closed inventory: `shared.current_tenant_id_soft()`,
`shared.current_tenant_id()`, `master.current_principal_id_soft()`, `shared.uuidv7()`,
`metadata.current_actor_id(uuid)`, the existing revision-advance and
revision-preserving-root-patch functions, plus schema usage and the exact existing
17-argument `audit.append_event` signature. There is no broad metadata function
or audit-table write grant. The initial installed command uncovered the missing
principal-context function ACL; the installer now supplies that explicit closure.

Label enrollment preserves every source location. Equal captions did not merge
identities; Country's two existing “Record ID” captions remain source data, not
approval to display UUIDs. Presentation validation and explicit technical-binding
disposition remain mandatory before native compilation. Canonical history sorts
member arrays; the new optional `sourceMemberId` resolves exact original members
for replay and never rewrites snapshots or infers identity from a name.

Validation: 807 authoring tests and 48 control-plane tests pass; six authoring
and two control-plane environment-dependent tests skip in the ordinary run.
The installed-role PostgreSQL test and disposable scoped-save/replay/rollback test pass separately. Real authenticated requests reject forged actor/tenant fields and a stale source hash with HTTP 400; they leave both drafts at revision 2 with one command receipt each. This is bounded label-write
qualification, not full native product-write or live-read qualification.

At the earlier installation checkpoint, migration-layout validation reported six inventory/manifest disagreements for the 20261007 catalogue/native preparation upgrades. The new audit migration matches its inventory and Studio manifest; full repository CI is not claimed green. Applied migration bytes remain unchanged.

### Server-only governance/runtime composition — 8 October 2026

Owner scope now defers the shared composer UI and UI wiring. They are not
prerequisites for the independent control API's bounded enrollment command.
`product-command-governance.ts` binds admission to the existing
`metadata.entity.author` authorizer, reloads IAM permissions on every issuance
and replay, and checks current active human identity, authentication epoch,
authority coordinates and exact editable system-owned product draft. It does
not use publication-review receipts as mutation authority. Existing control-plane
and authorization-framework controls are preserved; no protected-state
initializer or new operation requirement is supplied.

`product-command-runtime.ts` composes separate governance, issuer and application
connections, the canonical enrollment executor, admitted command host and existing
transactional audit sink. Startup rejects non-Studio databases, unsafe or
non-isolated role memberships, issuer/application overlap, missing audit privileges
and invalid locale/command budgets. These preflights do not replace a complete
installed privilege inventory or authenticated deployment tests. The bounded host
admits legacy label commands only; it explicitly rejects native edits, reference
allocation, history mutation and protected-state initialization.

The control entrypoint accepts this optional configuration only as a complete set:
`PLATFORM_CONTROL_COMMAND_ISSUER_DATABASE_URL_FILE`,
`PLATFORM_CONTROL_COMMAND_APPLICATION_DATABASE_URL_FILE`,
`PLATFORM_CONTROL_COMMAND_APPLICATION_LOGIN`, and
`PLATFORM_CONTROL_COMMAND_LABEL_POLICY_FILE`. Secret and policy files use the
existing private-file loader. Absence keeps the command route unavailable;
partial or unsafe configuration fails startup. The application needs usage of
`audit` and execution of the existing exact `audit.append_event` signature;
no audit-table DML is justified. The immutable packaged transport migration has
not been changed to imply that those deployed grants already exist.

Historical pre-installation inspection found no product-command roles. Both drafts then
remain revision 1 with undeclared source kind, locale and native/reference markers:
Country `28e155d7-9f18-48fd-9f4d-847ff80f7e87`; State Region
`9672c64b-b40f-43ce-8a2f-e0fbebd1154e`. The control role has SELECT authority for
the principal/binding and product root checks. This read-only inspection does not
establish an authenticated command, installed issuer/application logins, canonical
source/identity enrollment or deployed F6/F8/F9 acceptance. Ownership initialization
and reviewed historical identity allocation remain engineering work, separate
from label enrollment and publication review. No persistent DEV mutation occurred at that checkpoint; the installation and enrollment checkpoint below supersedes its deployment status.

**Lifecycle audit disposition:** retain the existing
`publication.entity_release_link` relationship between Entity source releases
and shared publication releases. Counts across releases, artifacts, deployments,
events, active heads and projections have different cardinalities; count differences
alone do not prove leaked rows or duplicate authority. Any acceptance/reconciliation
check must follow exact source/release/hash, declared destination and activation
coordinates, distinguish historical superseded or failed attempts from current
requirements, and report missing legacy declarations rather than invent targets.
Do not delete active probe publications, collapse immutable source history or
activate deferred materialization execution on this evidence. Materialization
bindings/mapping authoring remain outside the reference slice. A future shared
status read model must use these relationships and the existing authorization
boundary, rather than become another mutable lifecycle ledger.

Validation: full authoring tests and typechecks pass; the control-plane folder is
now also exercised in the independent Entity Studio CI job. The packaged PostgreSQL
scenario uses the real bounded command host and proves transaction/replay/rollback
under its application role, but retains explicitly synthetic governance admission.
It is not deployed acceptance. The earlier fixture and broad-suite evidence remains
separate; M1/M2 and deployed qualification are still open.

### Atomic product-command migration package — 8 October 2026

Admission and the closed reader/fences are packaged together in the immutable
operational upgrade `20261008_entity_product_command_authority.sql`, SHA-256
`ad99f6d17190f4385d1ace8f97cbdbcc3eefd408f5f4fb87965f8159d92ee657`.
The inventory resolves its retained source under
`server/db/scripts/operations/upgrades/entity-product-command`. It is intentionally
absent from automatic plane manifests. This packages the installation; it does
not supply governance decisions or qualify a deployment.

The disposable PostgreSQL scenario now executes that exact package. It proves a
late reader-preflight failure rolls back the earlier roles/schema/policies, an
explicit successful rehearsal also rolls back, and successful test installation
creates only NOLOGIN, non-superuser, non-bypass roles with no members. Test-only
login provisioning follows installation. The existing HTTP/canonical enrollment,
restricted reads, replay, immutable history and audit rollback checks then run
against the installed package.

Actual DEV rollback rehearsal completed at `2026-10-07T17:29:26.790Z` through
`tooling/scripts/verification/rehearse-product-command-installation.dev.mjs`.
The helper verifies the inventory hash and database identity, sets bounded lock
and statement timeouts, and has no apply/activation option. Before/after hashes
of drafts, snapshots, permission grants and activation heads matched
`50a2aebdaf7a2e21d8c819170a77ae81fbbd9a5f597be788a8ba2d2b2cebfe8d`;
product roles and the private schema remained absent. No DEV ledger entry was
created, and no enrollment/publication occurred.

Validation: 805 authoring tests pass (six opt-in exclusions), the packaged
PostgreSQL scenario passes, and three rollback-helper tests pass. The full
migration-layout check still reports six existing manifest/inventory mismatches
for UI catalogue, native snapshot/core-root guards, constraint compatibility,
typed-row preparation and legacy-nullability preparation; this package adds none.
These existing discrepancies are not waived or treated as green CI.

Installed governance resolution, runtime login/audit bindings, migration-ledger
application, shared composer onboarding and actual Country/State Region combined
acceptance remain open. Bootstrap publication still requires independently
verified human review; a successful rehearsal does not replace it.

### Closed product-command reader qualification — 8 October 2026

The label-enrollment PostgreSQL rehearsal now uses the uninstalled
`product-command-reader.sql` companion instead of fixture-wide SELECT grants.
Its explicit 33-table inventory matches the canonical legacy graph reader;
new reader tables fail an inventory drift test until reviewed. Installation
requires forced RLS on every table and fails before granting privileges if a
required table is unqualified. The script does not enable RLS implicitly or grant
writes to graph members. Existing label mutations retain their separate bounded
write grants and receive restrictive admission/actor fences.

The application role sees no graph rows without an admission. During an admitted
command, unrelated drafts, entity headers and fields remain inaccessible, even
with deliberately broad pre-existing PUBLIC policies. Relation-target headers,
class profiles and child materialization mappings follow admitted graph scope.
The existing HTTP-to-canonical-writer, replay, history and rollback rehearsal
passes with these policies. Governance/authentication are still fixture-owned;
no fixture read grant is promoted into installation defaults.

Read-only DEV inspection found all 33 required reader tables already have forced
RLS and found zero product-command roles installed. No DEV DDL, grants or data
were changed. The admission and reader candidates still need atomic migration
packaging, the current governance binding, isolated login provisioning and
transactional audit/function privilege qualification before deployment. Shared
composer onboarding, actual Country/State Region enrollment and combined deployed
acceptance remain incomplete.

Validation: 804 authoring tests pass (six opt-in exclusions); the disposable
PostgreSQL rehearsal and read-inventory test pass. These are local proofs, not
installed or published authority.

### Authenticated label-enrollment transport — 8 October 2026

Track 1 now has an opt-in control-host transport connected to the canonical
`createProductLabelEnrollment` executor. The host uses its existing IAM middleware
and verified context; actor/tenant overrides, unknown proposal keys, query scope,
unpinned source hashes/revisions and oversized bodies reject. Conflict and revoked
policy responses remain distinct from cleanup failures; a committed transaction
with failed revocation is reported as committed, with recovery through fresh
authorization and the same idempotency key.

The control-plane registration requires explicit command resources. It does not
reuse the review connection or install grants. The deployed entrypoint supplies
no such resources yet, so the route remains absent there. No host definition,
initializer, authority decision, migration, DEV enrollment or activation was
manufactured.

Evidence: all 803 authoring tests pass (six opt-in exclusions), including 13
transport tests; 24 existing control-host tests pass. Authoring production/test
typechecks pass. The disposable PostgreSQL application-role
rehearsal now enters through HTTP, executes the canonical label writer, and proves
exact replay through the service. Existing unauthorized DML, admission, audit
rollback and history assertions remain. Authentication and governance in this
rehearsal are explicitly fixtures. This is transport/application integration, not
M1 completion or the combined Country/State Region acceptance scenario. Track 2's
published shared composer host and Track 3's actual enrollment remain open.

### Entity authoring CI execution correction — 8 October 2026

At the audit baseline, this package has **139 test files**. The former early
workflow filename lists selected **51 unique files**, leaving **88 outside those
lists**, not outside all CI. `quality` also invokes `test:workspace` → `turbo test`;
Turbo selects this package's `vitest run` task, and its `src/**/*.test.ts` discovery
already enrolls every ordinary test automatically. The actual execution gap was
that preceding static policies, code generation, lint and typecheck failures could
prevent the workspace step from running. Enrollment, local results and successful
remote execution remain distinct evidence.

The dedicated **entity-studio-foundation** job now runs the full contract and
implementation package suites with `--fail-if-no-match`, generated-contract
checks, relevant compatibility tests and focused typechecks. It has no dependency
on `quality` or the older Country/Principal `entity-foundation` job. Required checks
continue after sibling failures when installation succeeds, and `ci-success`
requires both foundation jobs. The workspace run is retained for repository-wide
coverage. Colocated tests are not moved or retired based on tests-per-file ratios.

PostgreSQL execution inventory (separate from ordinary suite discovery):

| Suite                                 | Required environment                                                                                    | CI execution                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped canonical writer               | `ATHYPER_SCOPED_GRAPH_POSTGRES=1`                                                                       | Separate disposable PostgreSQL step                                                                                                           |
| Native graph                          | `ATHYPER_NATIVE_GRAPH_POSTGRES=1`                                                                       | Native persistence step                                                                                                                       |
| Native AI reconciliation              | `ATHYPER_NATIVE_AI_RECONCILIATION_POSTGRES=1`                                                           | Native persistence step                                                                                                                       |
| Legacy enrollment                     | `ATHYPER_LEGACY_ENROLLMENT_POSTGRES=1`                                                                  | Native persistence step                                                                                                                       |
| Native constraint compatibility       | `ATHYPER_NATIVE_CONSTRAINT_POSTGRES=1`                                                                  | Native persistence step                                                                                                                       |
| Generated row guards                  | `ATHYPER_NATIVE_ROW_GUARDS_POSTGRES=1`                                                                  | Generated-guards step                                                                                                                         |
| Contract AI / operation / root tables | `ATHYPER_NATIVE_AI_POSTGRES=1`, `ATHYPER_NATIVE_OPERATION_POSTGRES=1`, `ATHYPER_NATIVE_ROOT_POSTGRES=1` | Contract-table rehearsal step                                                                                                                 |
| Tenant learning extension             | `ATHYPER_TENANT_EXTENSION_TEST_DATABASE_URL` with its existing schema/actor prerequisites               | **Not configured in CI; remains an explicit qualification gap.** Do not point CI at DEV or replace its prerequisites with invented authority. |

Local verification for this CI change: 790 authoring tests and 57 contract tests
pass in the ordinary suites (six and four opt-in exclusions respectively). All
five disposable authoring PostgreSQL tests pass; the three contract-table tests
pass; generated row-guard tests pass with PostgreSQL enabled (four tests). The
reader/publication compatibility suites pass (19/47 tests), as do DDL/navigation
checks (six), preparation-runner checks (11) and CI-entrypoint tests (eight).
Generated-contract checks, focused native-test typechecking, formatting and the
CI entrypoint validator pass. This clears the prior missing-`--fail-if-no-match`
workflow finding; it does not clear the other repository-wide policy failures
recorded above.

The workflow regression test checks independent scheduling, full package commands,
required aggregate status and the enrolled PostgreSQL flags. This change improves
execution reachability; it does not attest a successful GitHub run, deployed
product-write authority or live-read qualification. Tracks 1–3 above and the
integrated Country/State Region acceptance checkpoint remain the delivery plan.

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

| Source       | Draft                                  | Actual repository source hash                                      | Saved history                                              |
| ------------ | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Country      | `28e155d7-9f18-48fd-9f4d-847ff80f7e87` | `259eb6b00119e4f685d43fa72806d78c8845422c4df79b34acc20dc262d12cae` | Two snapshots; checksums valid; current revision 1 matches |
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
