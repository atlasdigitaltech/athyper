# DDL-to-Service-Layer Completion Report

**Assessment date:** 2026-08-11  
**Reviewed plan:** [DDL-to-Service-Layer Build Plan](./ddl-service-layer-build-plan-2026-08-11.md)  
**Assessment basis:** Current working tree, including uncommitted and untracked files

## Executive verdict

**Status: Not complete — implementation checkpoint only.**

The checkout contains substantial implementation across every planned wave, and the affected TypeScript packages pass targeted typechecking and unit/contract tests. It does not meet the plan's Wave 0 exit condition, finance exit gate, definition of done, or program acceptance criteria.

The immediate blockers are:

1. The required machine-readable DDL table-to-command coverage matrix does not exist, so the program-level ownership and coverage metrics cannot be calculated.
2. The mandatory live PostgreSQL/RLS/concurrency qualification is not wired into CI and did not execute locally. The qualification command completed with all six tests skipped.
3. Governance/control host composition selects a single database with a Neon/Studio/Mesh fallback instead of binding one repository per exact verified plane.
4. Later-wave repositories and services exist, but several are not composed into routes/jobs/readiness, most notably finance F2-F6, governance compliance, general control administration, and authorization management.
5. No release-commit evidence was found for finance golden examples, reconciliation, failure injection, the 24-hour soak, recovery drills, dashboards/alerts, or approval gates.

No capability in this review should be promoted beyond **code complete** on the evidence currently available.

## Priority review findings

### Critical — Wave 0 gate is open

The plan requires a machine-readable row for every DDL table before later verticals start. Repository search found only the requirement in the plan and no JSON, CSV, YAML, or generated inventory implementing it. Without that artifact, the claims that all runtime-mutable, append-only, balance, projection, and evidence tables are owned and qualified are unprovable.

**Required closure:** generate the inventory, validate it against the current DDL tree, and make omissions fail CI.

### Critical — PostgreSQL qualification has not run

The repository has a useful three-plane harness at [`server/packages/test-utils/src/postgres-service-harness.ts`](../../server/packages/test-utils/src/postgres-service-harness.ts), PostgreSQL suites for authorization epochs, snapshot concurrency, and finance idempotency, and the root `test:service-postgres` command. However:

- `pnpm run test:service-postgres` reported **2 files / 6 tests skipped**.
- The finance package skipped its PostgreSQL idempotency test.
- The records package skipped its PostgreSQL snapshot-concurrency test.
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) does not invoke `test:service-postgres` or set `ATHYPER_SERVICE_DB_TESTS=true`.

This leaves RLS, wrong-plane rejection, real transaction races, DDL epoch behavior, snapshot chain serialization, and durable replay unqualified.

**Required closure:** provision DDL-created Studio/Neon/Mesh databases with application roles in CI, run all PostgreSQL suites as a required check, and retain the results against the release commit.

### Critical — governance violates exact-plane composition

[`register-services.ts`](../../server/apps/platform-host/src/composition/register-services.ts) selects `metadataDatabases.neon ?? metadataDatabases.studio ?? metadataDatabases.mesh`, then constructs consent, moderation, cycle-configuration, and cycle-execution repositories from that one database. This contradicts the plan's rule that common governance state is installed independently and must be selected from `VerifiedRequestContext.planeKey` with no cross-plane fallback.

The transaction-aware consent/moderation writes can receive a plane-local transaction, but non-transactional reads and the cycle repositories retain the selected fallback database. This is not acceptable evidence of exact-plane isolation.

**Required closure:** construct a repository set keyed by plane, select it only from verified context, remove fallback selection, and add Studio/Neon/Mesh plus wrong-plane tests.

### High — finance is implemented but not delivered as a vertical

[`server/packages/services/finance/src/index.ts`](../../server/packages/services/finance/src/index.ts) exports implementations for rounding/period control, budget, planning, GL, cross-book, commitments, inventory, tax, revaluation, elimination, and close readiness. The host, however, composes only rounding, book-period transitions, posting admission, and close-readiness support. [`finance-routes.ts`](../../server/apps/platform-host/src/composition/finance-routes.ts) exposes only those foundation APIs.

There is no planned `server/packages/planes/neon/src/register-finance.ts`, no host construction/routes/jobs for F2-F6, and no evidence for the finance wave exit gate: all 16 tables mapped, every append/reversal and balance rebuild/OCC test, finance-SME golden examples, failure injection, or 24-hour posting/rebuild soak.

**Required closure:** add Neon-owned composition (composition only), bind every qualified slice, keep each mutation disabled until its own gate passes, and attach accounting/reconciliation evidence.

### High — DLQ replay publication is not failure-atomic

[`kysely-integration-repository.ts`](../../server/packages/services/integration/src/kysely-integration-repository.ts) locks/stamps the DLQ row, resets delivery state, and records audit/outbox evidence transactionally. [`integration-routes.ts`](../../server/packages/services/integration/src/integration-routes.ts) enqueues the replay job only after that transaction returns.

If enqueue fails after commit, the delivery is pending and stamped as replayed without a guaranteed job. Writing an outbox event is sufficient only if a registered consumer deterministically creates the missing replay job; no such bridge was found in the reviewed composition.

**Required closure:** publish through a durable outbox-to-job bridge or add a deterministic recovery sweep, then test failure between database commit and job enqueue.

### High — later-wave services are not fully composed

The following implementation exists but is not registered as a complete runtime capability:

- Governance legal hold and report-pack repositories/services/jobs.
- General control services and `registerControlServiceRoutes`; only cycle configuration is composed.
- Authorization management service and plane-local writer selection.
- Finance F2-F6 services.

Repository classes and unit tests do not satisfy item 7 of the plan's definition of done.

### High — operational and promotion evidence is absent

No service-layer-specific release report was found for dashboards, alerts, runbooks, recovery/rebuild procedures, rollout/rollback flags, finance reconciliation, failure injection, security/privacy scans, controlled-tenant observation, or recovery drills. The working tree is also not a release commit, so evidence cannot yet be tied to immutable source.

## Completion by plan area

| Plan area | Assessment | Evidence and remaining work |
|---|---|---|
| P0.1 Coverage matrix | **Not started / not found** | No machine-readable DDL inventory exists. Program percentages cannot be reported. |
| P0.2 Contracts and skeletons | **Partial** | Finance, governance, and control-admin contracts/packages build and test. Finance is Neon-typed, but the prescribed Neon composition module and static boundary checks were not found. |
| P0.3 PostgreSQL harness | **Implemented, unqualified** | Three-plane harness and tests exist. CI integration is absent and all six harness tests skipped in this review. |
| P0.4 Record snapshots | **Code complete candidate** | Expanded contract, advisory-locking Kysely repository, routes, host composition, and a concurrency test exist. Live concurrency/RLS execution is still missing. |
| P0.5 Integration DLQ | **Partial** | Replay stamping, deterministic job ID, audit/outbox, redaction, and no legacy preview write are implemented. Commit-to-enqueue recovery is unresolved; no live replay/failure test evidence. |
| P0.6 Consent/moderation bridge | **Code complete candidate** | Point-in-time hashed consent is used by notification planning; comment flags open moderation in the same collaboration transaction. Exact-plane composition and live RLS tests remain. |
| P0.7 Verified audit items | **Partial** | Numbering regression test exists and passes. Authorization epoch PostgreSQL test exists but was skipped. |
| Wave 1 Finance | **Broad code implementation; not release complete** | F1-F6 service/repository source exists and 48 unit/contract tests pass. Only foundation APIs are composed; live DB, accounting, reconciliation, soak, and rollout evidence are absent. |
| Wave 2 Governance | **Partial** | Cycle config/execution, consent/moderation, legal hold, and report-pack code exists. Compliance is not host-composed and governance database selection violates plane locality. |
| Wave 2 AI A1/A2 | **Code complete candidate** | Durable tool ledger, lifecycle integration, credentials/knowledge/policy/monitoring services, host routes/jobs/readiness, and 14 tests exist. Production-like privacy, RLS, replay, and promotion evidence is absent. |
| Wave 3 TrustIAM | **Code complete candidate** | Organization, projection, scope, and provisioning lifecycle code/tests exist. Live persistence, transport failure/retry, and rollout evidence remain. |
| Wave 3 Onboarding | **Code complete candidate** | Kysely saga repository, lifecycle, routes, maintenance job, host readiness, and 10 tests exist. Live DB/RLS/crash-replay qualification remains. |
| Wave 3 Metadata authoring | **Code complete candidate** | Typed graph branches, Kysely persistence, deterministic hashing, publication adapter, routes, and host composition exist. Only six package tests ran; full-graph round-trip, concurrent release, three-plane activation, and recovery evidence remain. |
| Wave 4 Authorization | **Implementation only** | Semantic management service, rollout selection, permissions, and unit tests exist. It is not composed in the host and the writer-switch/live golden-corpus gates are not demonstrated. |
| Wave 4 Control admin | **Partial** | Ownership classification, cycle config, and general control service code/routes exist. Host composition registers only cycle configuration; publication/catalog and connector qualification is incomplete. |

## Validation performed

Commands executed against the current checkout:

```text
Targeted typecheck: 14 affected packages passed
Targeted unit/contract tests: 228 passed, 2 skipped
PostgreSQL service qualification: 0 passed, 6 skipped
```

The passing set covered finance, governance, control-admin, AI, records, integration, IAM, onboarding, metadata authoring, numbering, and platform-host. It did not replace the plan's required full repository, live PostgreSQL, RLS, concurrency, failure-injection, soak, or end-to-end qualification.

## Recommended completion sequence

1. Generate `P0-COVERAGE` and use it to establish the actual denominator and owners.
2. Fix exact-plane governance/control repository construction.
3. Make PostgreSQL service qualification mandatory in CI and execute it against all three DDL-created databases.
4. Close the DLQ commit/enqueue recovery gap and execute failure-injection tests.
5. Add Neon finance composition for F2-F6, then qualify one slice at a time with golden accounting and reconciliation evidence.
6. Compose governance compliance, control services, and authorization management behind their rollout gates.
7. Complete security/privacy scans, dashboards, alerts, runbooks, recovery drills, and soak evidence against a clean release commit.
8. Regenerate this report from the coverage matrix. Only then assign capability-level **database qualified**, **shadow/read-only**, **controlled mutation**, or **general availability** status.

## Completion declaration

The appropriate declaration for the current checkout is:

> The DDL-to-service-layer program has a substantial, type-safe implementation baseline across all planned waves. Wave 0 and the program-level qualification gates remain open. The work is not release complete and no general-availability claim is approved.
