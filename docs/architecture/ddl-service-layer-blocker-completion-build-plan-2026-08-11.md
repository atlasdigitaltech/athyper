# DDL-to-Service-Layer Blocker Completion Build Plan

**Status:** Proposed for implementation review  
**Prepared:** 2026-08-11  
**Source assessment:** [DDL-to-Service-Layer Completion Report](./ddl-service-layer-completion-report-2026-08-11.md)  
**Scope:** Close the five release blockers identified by the completion review

## 1. Objective and completion decision

Complete the existing DDL-to-service-layer program by delivering:

1. A generated, machine-readable ownership and coverage matrix for every DDL table.
2. Mandatory live PostgreSQL qualification across Studio, Neon, and Mesh with application roles and RLS context.
3. Exact-plane governance and control composition with no database fallback.
4. Complete host composition for finance F2-F6, governance compliance, control administration, and authorization management.
5. Release evidence for RLS, concurrency, replay, reconciliation, failure recovery, observability, soak, and rollout readiness.

The program is complete only when every gate in section 10 passes against one immutable release commit. Passing unit tests or constructing repository classes is not sufficient.

## 2. Delivery strategy

Use four parallel workstreams after a common inventory gate:

| Stream | Scope | Primary outcome |
|---|---|---|
| A — Coverage and qualification | DDL inventory generator, PostgreSQL environments, CI | A measurable denominator and mandatory live database evidence |
| B — Plane correctness | Governance/control repository selection and host construction | No cross-plane database fallback |
| C — Vertical composition | Finance, governance compliance, control, authorization | All approved services reachable through routes/jobs/readiness behind flags |
| D — Release evidence | Reconciliation, failure injection, telemetry, runbooks, soak | Auditable promotion decision tied to a release commit |

The critical path is:

```text
coverage schema
  -> generated matrix
  -> exact-plane composition + PostgreSQL CI
  -> vertical composition
  -> live qualification and reconciliation
  -> recovery drill and 24-hour soak
  -> controlled mutation approval
```

Vertical composition may be developed in parallel, but no mutation route may be enabled until the coverage row and database qualification for that slice are complete.

## 3. Workstream A — Coverage matrix and qualification infrastructure

### A1. Define the coverage artifact

Create a versioned schema and generated inventory:

```text
tooling/config/ddl-service-coverage.schema.json
tooling/config/ddl-service-ownership.yaml
tools/scripts/generate-ddl-service-coverage.mjs
tools/scripts/verify-ddl-service-coverage.mjs
docs/architecture/generated/ddl-service-coverage.json
```

The generated JSON must contain one row per physical DDL table with these required fields:

| Field | Requirement |
|---|---|
| `tableKey` | Canonical `schema.table` identity |
| `ddlPath` | Source DDL file |
| `installedPlanes` | Exact set of `studio`, `neon`, and/or `mesh` |
| `physicalAuthority` | Common plane-local, Studio authority, Neon authority, or Mesh authority |
| `classification` | Runtime mutable, append-only, projection, evidence, catalog/seed, or read-only |
| `serviceOwner` | Owning package or approved `none` decision |
| `commands` | Supported command codes or explicit `not_exposed` decision |
| `repository` | Repository implementation references |
| `entryPoints` | Route, job, event consumer, or internal port references |
| `auditEvent` / `outboxEvent` | Evidence contracts for mutation paths |
| `unitTests` | Test references |
| `postgresTests` | Live database/RLS/concurrency test references |
| `featureGate` | Rollout configuration key |
| `rolloutStatus` | `code_complete`, `database_qualified`, `shadow`, `controlled_mutation`, or `ga` |

Do not manually duplicate DDL discovery in the ownership YAML. The generator discovers tables from `server/db/ddl`; the YAML supplies reviewed semantics and evidence references.

### A2. Implement deterministic DDL discovery

**Implementation decision:** use each plane's checked-in
`server/db/ddl/planes/<plane>/_manifest.txt` as the authoritative install set and
load order. The generator still parses `CREATE TABLE` declarations from the
manifest-listed files under `common/` and `planes/`, but it does not assume that
every SQL file found by a recursive directory walk is installed. This avoids
inventorying archived/unwired SQL and makes common expansion reflect the actual
Studio, Neon, and Mesh builds. SQL discovery masks comments, quoted string
literals, and dollar-quoted bodies before matching the repository's qualified
`CREATE [UNLOGGED] TABLE [IF NOT EXISTS] schema.table` convention.

The generator must:

- scan `server/db/ddl/common` and `server/db/ddl/planes` for `CREATE TABLE` statements;
- normalize quoted/unquoted schema and table names;
- expand common DDL into its installed plane set without treating rows as shared;
- detect duplicate physical definitions and unclassified tables;
- join discovered tables to the reviewed ownership YAML;
- sort output deterministically by plane, schema, and table;
- fail on missing, stale, or duplicate ownership entries;
- write a summary by classification, owner, plane, and rollout state.

Add fixture tests for multiline DDL, comments, conditional creation, common-plane expansion, duplicate definitions, and deleted tables. If SQL parsing cannot be made reliable with the current DDL conventions, use the repository's DDL manifest/load order as the authoritative source and document that decision.

### A3. Add policy and CI enforcement

Add root commands:

```json
{
  "ddl:coverage:generate": "node tools/scripts/generate-ddl-service-coverage.mjs",
  "ddl:coverage:check": "node tools/scripts/verify-ddl-service-coverage.mjs"
}
```

The CI check must fail when:

- a DDL table has no ownership row;
- a runtime-mutable table has neither a qualified command nor `not_exposed` approval;
- an append-only table lacks replay/immutability/reversal evidence;
- a balance/projection table lacks concurrency and rebuild/reconciliation evidence;
- a composed mutation has no audit/outbox evidence;
- generated output differs from the committed artifact;
- an evidence reference points to a missing file or test.

### A4. Make PostgreSQL qualification executable

Extend the existing harness rather than creating a second one. Required changes:

- provision DDL-created Studio, Neon, and Mesh databases in CI;
- apply the same application roles used in production;
- set and verify `app.database_plane`, tenant, principal, request, and correlation context;
- expose helpers for two-transaction barriers, lock timeouts, worker crash points, and deterministic clocks;
- provide tenant/principal fixtures that are valid under each plane's RLS policies;
- retain audit/outbox queries and add reconciliation/assertion helpers;
- fail immediately in CI if a required database URL or role is missing.

The root `test:service-postgres` command currently reaches only the test-utils package. Replace it with an integration workspace/config that also runs every `*.postgres.test.ts` suite in finance, records, governance, control-admin, AI, IAM, onboarding, metadata authoring, integration, and authorization packages.

Local execution may remain opt-in. CI execution must never silently skip; use a separate explicit local skip path and assert zero skipped integration tests in the required workflow.

### A5. PostgreSQL qualification matrix

Every state-changing slice must include:

- same-tenant happy path with the application role;
- cross-tenant invisibility and mutation rejection;
- wrong-plane rejection;
- same-key/same-fingerprint replay;
- same-key/different-fingerprint conflict;
- stale-version conflict;
- two real concurrent transactions at the aggregate boundary;
- business mutation plus audit/outbox atomicity;
- failure after business write and before commit;
- rebuild or reconciliation where the table is a projection/balance;
- generated-column and append-only protection where applicable.

#### Workstream A exit gate

- Coverage generator reports 100% of discovered tables classified and owned.
- CI fails on an intentionally omitted table and stale generated output.
- The required PostgreSQL job runs all registered suites with zero skips.
- Studio, Neon, and Mesh negative isolation fixtures pass with application roles.

## 4. Workstream B — Exact-plane governance and control composition

### B1. Introduce an exact-plane repository provider

Replace the current `neon ?? studio ?? mesh` selection with an immutable registry keyed by plane:

```ts
type PlaneRepositoryRegistry<T> = Readonly<Partial<Record<PlaneKey, T>>>;

interface ExactPlaneRepositoryProvider<T> {
  require(planeKey: PlaneKey): T;
  health(planeKey: PlaneKey): Promise<HealthResult>;
}
```

Construction rules:

- register a repository only when that exact plane adapter exists;
- never choose a different plane when an adapter is missing;
- return a stable unavailable/wrong-plane error before SQL execution;
- pass `VerifiedRequestContext.planeKey` to every service selection;
- keep all writes inside `PlaneTransactionCoordinator.run(context.planeKey, ...)`;
- ensure non-transactional reads also resolve the exact-plane repository;
- report health independently for `governance.studio`, `governance.neon`, and `governance.mesh`.

### B2. Refactor governance services

Update consent, moderation, cycle configuration, cycle execution, legal hold, and report-pack services to use the exact-plane provider. Do not let repositories retain a default database for context-sensitive reads.

Where a service accepts an existing transaction, require a branded/exact-plane transaction or verify the transaction plane before use. Preserve the same-transaction collaboration-to-moderation bridge.

### B3. Refactor control administration

Apply the same provider to common control repositories. Preserve the ownership split:

- tenant overrides/configuration may use plane-local runtime writers;
- platform catalog writes remain Studio publication/seed owned;
- Neon finance configuration remains in finance;
- authorization repositories remain plane-local and must not reuse a governance fallback.

### B4. Plane-boundary tests

Add host and PostgreSQL tests proving:

- identical tenant IDs can hold different governance data in each plane;
- a Neon request cannot read or mutate Studio/Mesh governance rows;
- absence of a Neon adapter returns unavailable, even if Studio/Mesh is healthy;
- one unhealthy plane does not redirect traffic or fail healthy plane readiness;
- notification consent checks and collaboration moderation use the request plane;
- cycle reads, transitions, report generation, and control updates remain plane-local.

#### Workstream B exit gate

- No nullish-coalescing or default database fallback remains in governance/control composition.
- Static policy tests reject generic fallback construction.
- All three plane-isolation suites pass live.
- Per-plane readiness and error behavior are documented.

## 5. Workstream C — Complete vertical host composition

### C1. Finance F2-F6 composition

Add `server/packages/planes/neon/src/register-finance.ts` as composition-only code. It must construct finance repositories from the Neon adapter and expose no SQL or duplicate state machines.

Split registration and flags by qualified slice:

| Slice | Services to compose | Required entry points |
|---|---|---|
| F2 Budget/planning | Budget, balance/rebuild, planning run/output | Command/query routes, planning worker, readiness |
| F3 GL/cross-book/commitments | GL posting, cross-book execution, commitment fulfillment | Posting routes, replay-safe workers, reconciliation queries |
| F4 Inventory | Movement, valuation layers, balances | Movement routes, valuation worker, rebuild query |
| F5 Tax | Calculation and credit movement | Calculation/reversal routes, point-in-time/rebuild queries |
| F6 Closing | FX, intercompany elimination, asset revaluation, close readiness | Run/status routes, workers, failure recovery, governance readiness port |

Each slice needs:

- an explicit feature flag defaulting to disabled;
- exact permission codes per read/manage/post/reverse/rebuild action;
- Neon startup/readiness checks for all required DDL and adapters;
- deterministic job IDs and durable publication;
- audit/outbox evidence inside the business transaction;
- route contracts and host composition tests;
- a static import test proving Studio/Mesh do not import the finance implementation.

Enable slices in dependency order: F2, F3, F4/F5, then F6. Do not expose F4 LIFO/AVCO until their accounting fixtures are approved.

### C2. Governance compliance composition

Compose legal hold and report packs once per exact plane:

- construct `KyselyLegalHoldRepository` and `KyselyReportPackRepository` through the provider;
- bind the retention adapter and object storage;
- register permission-checked legal-hold and report routes;
- register the deterministic report-generation job and recovery sweep;
- add per-plane readiness for governance DDL, object storage, and retention dependencies;
- verify artifact hashes at download and supersede rather than overwrite.

### C3. Control administration composition

Compose the existing control services and `registerControlServiceRoutes` behind separate flags for:

- feature/parameter/entitlement tenant overrides;
- lookups and rounding configuration;
- connector lifecycle;
- cycle configuration, reusing the existing service;
- local catalog reads.

Do not expose unrestricted generic CRUD. Routes must enforce the approved ownership classification, lifecycle, expected version, audit, outbox/invalidation, and exact-plane repository selection.

Add a startup assertion that catalog-authoring routes cannot be enabled outside Studio and finance-specific control writers cannot be enabled outside Neon.

### C4. Authorization management composition

Compose the existing semantic authorization service with:

- exact-plane repository provider;
- legacy writer adapter;
- authorization-v2 rollout selector;
- writer-switch approval gate and change-capture watermark;
- audit evidence without manual epoch writes;
- separate routes/permissions for read, manage, approve, revoke, and break-glass actions;
- `legacy`, `shadow`, and `enforce` feature modes defaulting to `legacy`/disabled mutation.

The host must refuse `enforce` mode when the golden evaluator corpus, DDL epoch integration test, or writer-switch gate is not qualified.

### C5. Composition completeness checks

Add a machine-readable capability registry connecting:

```text
coverage row -> service -> repository provider -> route/job -> feature flag -> readiness check
```

CI must fail when an enabled runtime-mutable capability lacks any link in that chain. Add host tests for disabled, dependency-missing, healthy, wrong-plane, and partial-plane configurations.

#### Workstream C exit gate

- Every approved finance F2-F6, governance compliance, control, and authorization command is composed or explicitly marked `not_exposed`.
- All mutation paths default disabled and have exact permission, readiness, audit/outbox, and rollback behavior.
- Coverage output and host capability registry agree.
- Targeted typecheck, unit, route-contract, and live PostgreSQL suites pass.

## 6. Workstream D — Release qualification and evidence

### D1. Evidence bundle format

Create one immutable evidence bundle per release candidate:

```text
docs/testing/ddl-service-layer/<release-sha>/
  manifest.json
  coverage-summary.json
  test-results/
  rls/
  concurrency/
  replay-failure-injection/
  reconciliation/
  security-privacy/
  performance-soak/
  recovery-drill/
  approvals.md
```

`manifest.json` must record commit SHA, DDL migration identity, package lock hash, container image digests, test command/version, environment class, start/end time, and artifact hashes. Evidence from a dirty worktree is informational only and cannot approve promotion.

### D2. Domain qualification

#### Finance

- Finance-SME-approved golden examples for budget, GL, commitments, inventory FIFO, tax, FX, elimination, and asset revaluation.
- Source journal to GL balance reconciliation.
- Append log to budget/inventory/tax balance rebuild comparison.
- Period-close proof that every mutation path and worker is blocked consistently.
- Reversal-chain, mid-run crash/retry, and same-coordinate concurrency evidence.
- 100 concurrent posts to one GL coordinate without lost updates.

#### Governance and control

- Cycle DAG fan-in/fan-out and concurrent completion.
- Certification separation and pinned finance readiness.
- Legal hold apply/release recovery and report artifact verification.
- Point-in-time consent and atomic comment-flag moderation across each plane.
- Tenant override invalidation and catalog-authority rejection.

#### Authorization

- Golden evaluator corpus proving deny/hard failure precedence.
- Plane-local role/group/delegation/ACL/override writes.
- DDL-owned epoch increment and invalidation capture.
- Legacy/shadow/enforce parity, writer-switch, rollback, revocation, and expiry.

### D3. Failure injection and recovery

Inject failures at minimum after:

- business row write but before audit/outbox commit;
- commit but before worker receives a durable job;
- worker claim but before external side effect;
- external side effect but before receipt persistence;
- partial cross-book/closing/report execution;
- cache invalidation publication;
- object upload but before report completion.

For each failure, record expected state, retry coordinate, recovery command/job, reconciliation result, and maximum recovery time. Automate the scenarios where practical and retain a manual drill only for infrastructure steps that cannot be safely automated.

### D4. Observability and operations

Implement low-cardinality metrics for:

- command outcome, replay, idempotency conflict, and stale version;
- transaction and state-transition latency;
- job lag, attempt, retry, dead letter, and recovery;
- reconciliation mismatch count/value;
- authorization rollout mode and shadow divergence;
- per-plane readiness without tenant identifiers;
- finance posting/rebuild throughput and lock contention.

Deliver dashboards and alerts for sustained failures, reconciliation drift, job lag/DLQ growth, unavailable plane dependencies, authz shadow divergence, and finance lock/latency thresholds.

Create runbooks for:

- disabling each mutation slice;
- replaying/recovering jobs safely;
- rebuilding every balance/projection;
- restoring report artifacts and legal-hold state;
- rolling authorization from enforce to shadow/legacy;
- diagnosing plane selection and RLS failures;
- rollback and forward-fix decision ownership.

### D5. Soak and promotion

Run a minimum 24-hour production-shaped soak with:

- mixed finance posting/reversal/rebuild load;
- governance cycles and report jobs;
- control changes and invalidation;
- authorization shadow evaluation;
- injected retries, worker restarts, and one plane dependency interruption;
- continuous reconciliation and privacy/log scanning.

Soak acceptance:

- zero tenant or plane isolation violations;
- zero unreconciled financial drift;
- zero duplicate external side effects;
- zero plaintext credentials, confirmation tokens, request/response bodies, AI prompts/results, or unbounded evidence payloads in scans;
- all injected failures recover within the approved objective;
- no unresolved critical/high alerts;
- error budgets and latency/lag thresholds approved by SRE and service owners.

#### Workstream D exit gate

- Evidence bundle is complete and hashes verify.
- Recovery drill and 24-hour soak pass against the release commit.
- Finance SME, database/platform, security/privacy, QA, SRE, and product owners sign approval.
- Controlled mutation is approved for a named tenant/cohort with rollback owner.

## 7. Ticket backlog and dependencies

| Order | Ticket | Deliverable | Depends on |
|---:|---|---|---|
| 1 | `BC-COVERAGE-SCHEMA` | Coverage JSON schema and reviewed ownership YAML contract | None |
| 2 | `BC-COVERAGE-GENERATOR` | Deterministic DDL discovery and generated matrix | 1 |
| 3 | `BC-COVERAGE-CI` | Missing/stale/evidence-reference policy checks | 2 |
| 4 | `BC-DBQ-ENV` | Three DDL-created CI databases and application roles | None |
| 5 | `BC-DBQ-RUNNER` | Cross-package PostgreSQL test runner with zero-skip enforcement | 4 |
| 6 | `BC-GOV-PLANE-PROVIDER` | Exact-plane repository provider and health model | 1 |
| 7 | `BC-GOV-PLANE-MIGRATION` | Governance/control services and host moved off fallback | 6 |
| 8 | `BC-GOV-PLANE-TESTS` | Three-plane RLS/read/write/isolation suites | 5, 7 |
| 9 | `BC-FIN-COMPOSE-F2-F3` | Neon composition, routes/jobs/readiness for budget, planning, GL, cross-book, commitments | 2, 5 |
| 10 | `BC-FIN-COMPOSE-F4-F6` | Inventory, tax, closing composition and recovery | 9 |
| 11 | `BC-GOV-COMPLIANCE-COMPOSE` | Legal-hold/report routes, jobs, storage, readiness | 7 |
| 12 | `BC-CONTROL-COMPOSE` | Plane-local control service routes and invalidation | 7 |
| 13 | `BC-AUTHZ-COMPOSE` | Rollout-gated authorization management APIs | 7, authz writer approval inputs |
| 14 | `BC-CAPABILITY-REGISTRY` | Coverage-to-composition consistency check | 3, 9-13 |
| 15 | `BC-LIVE-QUALIFICATION` | Full RLS/concurrency/replay/reconciliation suite | 8-14 |
| 16 | `BC-OBSERVABILITY` | Metrics, dashboards, alerts, readiness | 9-13 |
| 17 | `BC-RECOVERY-RUNBOOKS` | Rebuild, replay, rollback, and plane-failure runbooks | 15-16 |
| 18 | `BC-RELEASE-EVIDENCE` | Signed release-SHA evidence bundle | 15-17 |
| 19 | `BC-SOAK` | 24-hour soak and recovery drill | 18 |
| 20 | `BC-CONTROLLED-PROMOTION` | Named-cohort approval and rollback ownership | 19 |

## 8. Sprint plan

Assumption: three backend streams, one shared database/platform engineer, one QA automation engineer, and part-time finance SME, security, SRE, and product reviewers.

| Sprint | Stream A | Stream B | Stream C | Shared/release |
|---|---|---|---|---|
| 1 | Coverage schema/generator | Exact-plane provider design | Finance/governance/control/authz composition contracts | CI database environment design |
| 2 | Coverage CI and first approved matrix | Governance/control fallback removal | Finance F2-F3 composition | PostgreSQL runner and base RLS suites |
| 3 | Matrix evidence validation | Three-plane governance tests | Finance F4-F5; governance compliance | Failure-injection framework |
| 4 | Coverage/composition registry | Plane health/readiness | Finance F6; control composition | Reconciliation fixtures and golden examples |
| 5 | PostgreSQL suite expansion | Governance/control qualification | Authorization composition and rollout gates | Metrics, dashboards, alerts |
| 6 | Zero-skip CI stabilization | Cross-plane recovery cases | Vertical route/job/readiness closure | Security/privacy scans and runbooks |
| 7 | Release-candidate matrix | Defect closure | Reconciliation and load defect closure | Recovery drill and evidence bundle |
| 8 | Final matrix verification | Promotion support | 24-hour soak support | Soak, approvals, controlled mutation decision |

Plan for **8 two-week sprints elapsed** with this staffing. With one backend stream, expect approximately **14-18 sprints**. Do not shorten the live qualification, recovery drill, or soak gates to recover schedule.

## 9. Pull request and rollout strategy

Keep changes reviewable and reversible:

1. Merge coverage schema/generator without changing runtime behavior.
2. Merge CI database provisioning and test runner with existing suites required.
3. Merge exact-plane provider and migrate one governance capability at a time.
4. Merge vertical composition with flags disabled and readiness visible.
5. Merge PostgreSQL qualification before enabling any corresponding mutation flag.
6. Promote each capability through `code_complete -> database_qualified -> shadow -> controlled_mutation -> ga` by updating the generated evidence references, not by an undocumented configuration change.

Every runtime PR must include:

- affected coverage rows;
- command/state-transition changes;
- route/job and permission changes;
- live PostgreSQL test changes;
- audit/outbox and recovery behavior;
- feature flag and rollback instructions;
- observability changes.

## 10. Final acceptance gates

### Gate 1 — Inventory

- 100% of discovered tables appear in the generated matrix.
- 100% have physical authority, classification, and service owner or approved `none` decision.
- 100% of runtime-mutable tables have a qualified command or explicit `not_exposed` decision.

### Gate 2 — Plane and database correctness

- No governance, control, authorization, onboarding, or AI path has cross-plane fallback.
- Required PostgreSQL CI executes with zero skipped tests.
- RLS, wrong-plane, concurrency, replay, and atomic evidence suites pass.

### Gate 3 — Composition

- Finance F2-F6, governance compliance, approved control services, and authorization management are composed behind disabled-by-default flags.
- Every exposed command has route/job, exact permission, readiness, audit/outbox, and rollback behavior.
- Coverage and capability registries agree.

### Gate 4 — Domain correctness

- Finance golden examples and all reconciliation/rebuild comparisons pass.
- Governance/control state machines and artifact hashes pass.
- Authorization golden corpus, DDL epoch, rollout, revocation, and rollback pass.

### Gate 5 — Operations and promotion

- Dashboards, alerts, runbooks, recovery procedures, and rollback owners exist.
- Security/privacy scans pass.
- Recovery drill passes.
- 24-hour soak passes against the immutable release commit.
- Required owners approve controlled mutation and the evidence bundle records the decision.

## 11. Definition of blocker closure

The five blockers are closed only when:

1. The coverage matrix is generated, reviewed, complete, and enforced by CI.
2. Live three-plane PostgreSQL qualification is a required, zero-skip check.
3. Governance/control repositories are selected exclusively by verified plane context with no fallback.
4. Finance F2-F6, governance compliance, control administration, and authorization management are fully composed or explicitly approved as `not_exposed`.
5. Reconciliation, RLS, concurrency, replay, failure injection, observability, recovery, and soak evidence is attached to and reproducible from the release commit.

At that point, regenerate the [completion report](./ddl-service-layer-completion-report-2026-08-11.md) from the coverage artifact and make a separate promotion decision for each capability. Program completion does not automatically imply general availability for every mutation path.
