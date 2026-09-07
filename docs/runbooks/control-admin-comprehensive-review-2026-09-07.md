# Control-admin comprehensive review

**Verdict: all 44 operations exist in source, but the attached plan cannot yet be certified complete as a deployed, integrated feature.** Eight defects were fixed during this review. The four previously absent repository integrations are now implemented and tested; authenticated deployment acceptance remains pending. The original inspection found only the four parameter operations exposed by local development.

The review covers the [attached ten-group API description](/home/chandravel_natarajan/.codex/attachments/369a63a7-0bec-439e-8af6-38b01e6ab37d/pasted-text.txt), registration, service validation/permissions, concrete persistence adapters, related schema/migrations, tests, and host configuration. It preserves the existing runtime-command transaction changes. No live configuration writes, migrations or deployment were performed during this review.

## Fixed findings

| Severity | Finding and consequence | Fix and verification |
| --- | --- | --- |
| P1 | Bank rule regexes executed without a time budget. A valid pattern such as `^(a+)+$` could block the API event loop on bounded input. | Pattern evaluation now runs with a 25 ms VM timeout and returns `CONTROL_ADMIN_BANK_PATTERN_UNAVAILABLE` (503) on failure. Regression uses catastrophic backtracking input. This is resource bounding, not a claim that a VM is a security sandbox. |
| P1 | Cycle repository operations omitted transaction-local tenant context required by RLS. Publication also used `FOR UPDATE` on `control.cycle_type`, although the application grant only permits reading that table. | All reads/publications establish tenant context in a transaction. Publication serializes through a tenant/cycle advisory lock, without granting UPDATE. Real PostgreSQL tests enforce tenant RLS and grant no parent UPDATE privilege; publication, reads, replay and concurrent version checks pass. |
| P1 | Authorization success-audit failure entered the generic rejection handler after the grant had already been written, potentially recording an applied mutation as rejected. | Track completion of the writer; return explicit `AUTHZ_WRITE_APPLIED_AUDIT_UNAVAILABLE` (503) without appending a false rejection. Regression confirms one write and one attempted success audit. This exposes the separate audit boundary honestly; it does not make that sink transactional. |
| P2 | Feature API evaluation read the definition and override in separate transactions. A concurrent catalog change could produce a decision assembled from different snapshots. | The PostgreSQL repository now supplies atomic `readEvaluation`; the service prefers it and does not fall back when that snapshot reports no definition. Unit tests plus all six plane/baseline/migration PostgreSQL runs pass. |
| P2 | Cycle validation checked task cycles and phase self-dependencies but missed a multi-edge cycle within the supplied cross-phase graph. | Added a topological cycle check over submitted phase edges, with a two-phase cycle regression. This does not claim to validate a combined graph across every already-published external template. |
| P2 | Root scope creation treated omitted `parentScopeTargetId` and omitted `id` as equal, rejecting a valid request as a scope cycle. | Self-cycle comparison requires a supplied parent; tests cover valid omitted IDs and actual self-parenting. |
| P2 | Connector configuration accepted Dates, Maps, sparse arrays, symbols and accessor-bearing objects through direct service calls. JSON persistence could silently change these values. | Reject non-JSON containers, holes, symbols and accessors before secret traversal. Tests confirm malformed configuration rejection without executing the accessor. |
| P2 | Lookup metadata accepted sparse arrays, which JSON serialization changes into null values. | Reject holes, symbols and accessors during metadata validation; regression confirms rejection before publication. |

Primary changed code:

- `server/packages/platform/control-admin/src/authorization-management-service.ts`
- `server/packages/platform/control-admin/src/bank-validation.ts`
- `server/packages/platform/control-admin/src/connector-control.ts`
- `server/packages/platform/control-admin/src/lookup-control.ts`
- `server/packages/platform/control-admin/src/feature-control.ts`
- `server/packages/platform/control-admin/src/kysely-feature-flag-repository.ts`
- `server/packages/platform/control-admin/src/cycle/cycle-config-service.ts`
- `server/packages/platform/control-admin/src/cycle/kysely-cycle-template-repository.ts`

## Plan completion matrix

“Implemented” below means source behavior exists and is tested; it does not mean the route is enabled or that every deployment acceptance test passed.

| Group | Operations | Source assessment | Remaining integration/acceptance |
| --- | ---: | --- | --- |
| Authorization | 5 | Separate action permissions, rollout modes, bounded overrides, writer gate and requester/reviewer separation implemented. | Qualified writer-switch evidence remains mandatory. The service now requires a transaction-bound unit of work for effects and success audit. Host-supplied production writers/audit ports must bind to the supplied transaction; those concrete authorization adapters are not present in this repository. Source routes are not enabled on the inspected dev host. |
| Bank validation | 3 | Rules, fixtures, Studio publication, deterministic selection, field checks and checksum validation implemented; regex execution now bounded. | Concrete native-table adapter and Studio fixture publication implemented. Deployment acceptance remains; no bank ownership/existence verification is intended. |
| Connectors | 6 | Draft validation, secret rejection, lifecycle/OCC checks and health-job submission contract implemented. | Concrete native-table adapter, durable health-job worker and scheduler registration implemented. Transaction/lifecycle/audit/outbox tests pass; deployed remote probes remain unverified. |
| Cycle configuration | 6 | Preview/validate, signed desired-state verification, immutable revision adapter, version checks and RLS-safe publication implemented. | Publication now validates external references and the combined latest-revision graph under a tenant-wide lock, including incoming references affected by phase removal. Full-plane signed publication acceptance remains outstanding. |
| Entitlements | 4 | Concrete adapter, plan snapshots, module/limit overrides, safe-integer contract and runtime evaluator implemented. | Group remains gated by host integration; authenticated deployed acceptance remains outstanding. |
| Features | 4 | Concrete adapter, persisted cohort strategies, override lifecycle and experience integration implemented; API reads now atomic. | Definition strategy changes require controlled rollout. Authenticated deployed acceptance remains outstanding. |
| Lookups | 4 | Domain reads, versioned desired state, tenant retirement and reference-use checks implemented at service boundary. | Concrete native-table adapter, revision snapshots, publication receipts and locked reference checks implemented. Document/JSON consumers must register explicit references; authenticated acceptance remains. |
| Parameters | 4 | Concrete adapter, database versions, SQL alignment and next-request density consumer implemented and previously deployed to dev. | Other reload modes have no consumer binding. Sensitive parameters remain intentionally excluded. Authenticated browser/two-host acceptance remains unverified. |
| Rounding | 4 | Typed API, decimal arithmetic, precedence/ambiguity and immutable-active-rule checks implemented. | Concrete native-table adapter, version/context mapping and transactional evidence implemented. PostgreSQL test verifies finance-reader consumption; authenticated acceptance remains. |
| Runtime commands | 4 | Typed routes, preview-bound approval, requester-owned replay and atomic executor/ledger transaction contract implemented. | No production executor is registered. Preview-hash migration and executor rollout are not deployed. Remote effects require a transactionally written outbox and idempotent delivery. |

## Live availability

The 2026-09-07 local rollout now exposes **29 control-admin operations**, up from the
four parameter operations in the original inspection. Bank validation, connectors,
entitlements, features, lookups and rounding are enabled alongside parameters.

API, worker and scheduler are healthy; readiness returns 200, catalog reads reject
unauthenticated requests, and connector-health polling succeeds on all three planes.
The remaining 15 authorization, cycle and runtime-command operations stay disabled
pending their separate prerequisites. OpenAPI presence does not establish authenticated
mutation/browser acceptance. See the [deployment receipt and checks](control-repository-integrations.md#local-deployment-completed-2026-09-07).

## Corrections to the attached description

- Entitlement count/byte limits are **nonnegative safe integers**, not arbitrary nonnegative numbers. Zero means no capacity; plan NULL represents unlimited.
- Feature cohort membership is selected by persisted strategy. Legacy features remain tenant-based; newer principal-based membership is not universal.
- Rounding active rules are immutable. The administrative simulator requires precision or an increment and does not currently resolve SQL currency defaults.
- New runtime commands execute effects and evidence within one transaction. Concurrent duplicates wait/replay; pending responses primarily cover older unresolved records. Approval still does not execute a command. Executors must use the supplied transaction and enqueue remote work through an outbox.
- Parameter integration currently proves only the next-request density binding, not all reload modes.

## Validation evidence

- **754 unit tests passed**, including an explicit inventory test proving all **44 unique operations** register with authentication and permission declarations when their flags are enabled. Opt-in database tests skipped in that unit run are not counted as database evidence.
- **222 PostgreSQL test executions passed**: 37 entitlement/feature/parameter cases for each of Studio, Neon and Mesh, on fresh-install and migration paths. This exercises the new atomic feature read in the concrete repository.
- **2 additional PostgreSQL cycle cases passed** with tenant RLS and no parent-table UPDATE privilege.
- Control-admin source/test and host TypeScript checks passed. Changed-file whitespace checks passed.
- Earlier runtime-command atomicity evidence is documented separately in [runtime command review](runtime-command-administration-review-2026-09-07.md); it was not re-counted as new database execution in this review.

Disposable tests use actual relevant DDL and test roles; they are not a full staging migration rehearsal. Test databases were isolated from running development/QA databases.

## Work required before declaring the full plan complete

1. Deploy and accept the implemented [bank, connector, lookup and rounding integrations](control-repository-integrations.md), including dedicated writer connections and connector worker/scheduler prerequisites.
2. Bind and qualify production authorization writers and audit/outbox ports using the required unit of work; complete full-plane signed cycle publication acceptance. See the governance follow-up below.
3. Register governed runtime executors that use the supplied transaction; apply required migrations in manifest order before enabling those routes.
4. Rehearse against a staging copy, then perform authenticated end-to-end acceptance for every enabled group: permissions and plane denial, competing versions, tenant isolation, rollback, replay, scheduled boundaries and downstream runtime behavior.
5. Update the completion matrix with concrete deployment evidence. Do not enable missing-provider groups merely to make OpenAPI list all 44 routes.

The code review and the eight fixes are complete. **The full attached integration/deployment plan remains incomplete for the specific reasons above.**


## Cycle and authorization governance follow-up

Cycle publication now acquires one advisory transaction lock per tenant and reads all latest revisions after acquiring it at READ COMMITTED isolation. It replaces the candidate's previous revision in the validation graph, verifies all cross-phase and carry-forward references, and rejects combined dependency cycles. Incoming references owned by other templates prevent removal of a still-referenced phase. Replays retain their original receipt and expected-version conflicts still precede insertion. Preview remains advisory; publication performs the authoritative graph check. All publishers must adopt the tenant-wide lock before concurrent publishing resumes; older binaries use a different lock.

Authorization management now requires `AuthorizationManagementUnitOfWork`. Approval reads, effects and success evidence execute through transaction-bound ports. The service has no independently injected mutation writer or post-commit success audit path. A failed success audit rolls back the write, then the separate rejection sink records the failed attempt. `KyselyAuthorizationUnitOfWork` checks the physical database plane, sets tenant/actor context, serializes tenant governance writes and maps PostgreSQL contention to HTTP 409 without retrying. Shadow preview uses a savepoint and rolls it back even on success; a shadow SQL failure cannot poison the authoritative legacy transaction.

The host integration must construct its legacy writer, exact-plane repository provider and audit sink from the transaction supplied to `AuthorizationTransactionBinder`. Approval readers must use `FOR UPDATE`; receipts and outbox writes must use that transaction too. Remote identity-provider calls must be queued transactionally. There are no concrete production authorization mutation writers in this source tree, so this follow-up establishes and tests the required coordination boundary, not a deployed authorization writer. Mutation enablement and writer qualification remain mandatory.

Validation: **754 unit tests passed**, plus **12 PostgreSQL governance tests** against an isolated PostgreSQL 16 database with tenant RLS. The latter cover cycle publication/version races/replay, conflicting cross-cycle publications, incoming-reference removal, authorization success and audit-failure rollback in all three modes, competing approvals, self/foreign approval denial, physical-plane mismatch and a shadow SQL failure. Control-admin source/test and platform-host typechecks pass. The authorization SQL fixtures exercise the coordinator with transaction-bound test ports; they do not qualify absent production mutation adapters or full-plane audit/outbox schemas. No migration, local application deployment or browser acceptance was performed in this follow-up.


## Canonical production writer follow-up

The canonical writer, transaction-bound audit/outbox factory, dedicated writer-role migration and default host composition are now implemented. See [production writer integration](authorization-production-writers-2026-09-07.md) for contracts, migration order and qualification steps. Production SQL acceptance passes against all three full plane schemas and a populated Neon migration rehearsal. The earlier statement that no concrete canonical writer exists is superseded. The legacy authority target is still unidentified, so legacy/shadow writes remain unavailable unless a real legacy transaction binder is supplied.
