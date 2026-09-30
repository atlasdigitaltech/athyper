# Adversarial verification — area: Publication and compilation pipeline

Finding under review (F2 in `publication.md`): **"Deterministic SQL rejections are classified
transient: the authority deployment is never marked failed, so the publication dead-letter list
and replay route never see them and raw SQLSTATEs become the failure code."**
(claimed severity: high)

## Verdict: CONFIRMED (severity high stands)

Every cited line exists at the cited location, the SQLSTATE → `transient` classification was
reproduced by executing the real `classifyPublicationFailure` and the real
`PublicationOrchestrator.deploy` (bundled from source with esbuild, evaluated in memory), and no
guard, translation layer, transaction, constraint or backstop elsewhere in the tree prevents the
consequence. Minor corrections are listed at the end; none change the verdict.

## 1. Cited code is present and line numbers are correct

- `server/packages/services/publication/src/publication-orchestrator.ts:221-243` —
  `classifyPublicationFailure`: `:226` `const code = errorCode(error);`, `:227` conflict check,
  `:228-233` permanent check, `:234-242` unconditional `transient` fall-through. Exact match.
- `publication-orchestrator.ts:304-311` — `errorCode()` reads **only** `Reflect.get(asObject(error), "code")`.
  No `message`, `detail`, `constraint` or `sqlState` inspection. Exact match.
- `publication-orchestrator.ts:196-203` — the only failure transition in the orchestrator:
  `if (failure.category === "permanent" && authorityStatus !== "activated")` → `transitionDeployment({status:"failed"})`.
  Exact match.
- `publication-orchestrator.ts:24-39` / `:41-47` — `PERMANENT_CODES` / `CONFLICT_CODES`. Exact match.
- `server/packages/services/publication/src/kysely-publication-operations-repository.ts:55` —
  `deadLetterSelect(...)` selects `... WHERE d.status='failed' AND r.tenant_id=...` and is the sole
  source of `listDeadLetters` (`:15-20`) and `getDeadLetter` (`:10-13`). Exact match.
- `server/packages/services/publication/src/entity-definition-routes.ts:371-374` — the
  `error["code"] === "23505" && error["constraint"] === "business_partner_definition_revision_version_uq"`
  handler. A repo-wide grep of `server/packages/services/publication/src` for `constraint` /
  `.code ===` confirms this is the **only** SQLSTATE handling in the publication service.

## 2. Reproduction (executed, not read)

Bundled the real module to stdout (`esbuild publication-orchestrator.ts --bundle --format=esm
--platform=node`, no file written) and evaluated it with `node --input-type=module`, feeding errors
shaped exactly like `pg` errors (`{code, message, severity}`):

```
SQLSTATE 23514 (ENTITY_PROJECTION_COORDINATE_MISMATCH) -> category=transient code=23514 retryable=true
SQLSTATE 55000 (RELEASE_SEQUENCE_NOT_FORWARD)          -> category=transient code=55000 retryable=true
SQLSTATE 23505 (RELEASE_STAGE_IDEMPOTENCY_CONFLICT)    -> category=transient code=23505 retryable=true
SQLSTATE 23514 (APPLIED_RELEASE_PAYLOAD_COORDINATE_MISMATCH) -> category=transient code=23514 retryable=true
token-named  LOCAL_ACTIVATION_HEAD_MISMATCH            -> category=conflict
```

Then drove the real `deploy()` with an authority stub recording every `transitionDeployment` and a
local repository whose `stage()` throws the pg-shaped `23514 ENTITY_PROJECTION_COORDINATE_MISMATCH`:

```
deploy threw: category=transient code=23514 retryable=true
authority transitions recorded: ["dispatched","received"]
```

No `failed` transition is ever issued, so `publication.deployment.status` remains non-terminal and
`failure_code` is never populated.

## 3. The SQLSTATE is really what `errorCode()` sees (driver chain verified)

- `server/db/ddl/common/runtime_meta/07_functions.sql` raises with explicit `ERRCODE`s:
  `:81` `RELEASE_STAGE_IDEMPOTENCY_CONFLICT` / `unique_violation`; `:200-201`
  `ENTITY_PROJECTION_IDEMPOTENCY_CONFLICT` / `unique_violation`; `:207` `ENTITY_PROJECTION_PLANE_INVALID`,
  `:211` `ENTITY_PROJECTION_PLANE_MISMATCH`, `:217` `ENTITY_PROJECTION_COORDINATE_MISMATCH`,
  `:289` `APPLIED_RELEASE_PAYLOAD_INVALID`, `:302` `BUSINESS_PARTNER_DEFINITION_PROJECTION_INVALID`,
  `:306` `APPLIED_RELEASE_PAYLOAD_PLANE_MISMATCH`, `:312` `APPLIED_RELEASE_PAYLOAD_COORDINATE_MISMATCH`
  all `check_violation`; `:242` `ENTITY_CONTRACT_IDEMPOTENCY_CONFLICT`, `:266`
  `ENTITY_DESCRIPTOR_IDEMPOTENCY_CONFLICT`, `:330` `APPLIED_RELEASE_PAYLOAD_IDEMPOTENCY_CONFLICT`
  `unique_violation`; `:404` `RELEASE_PREDECESSOR_CHANGED`, `:408` `RELEASE_SEQUENCE_NOT_FORWARD`
  `object_not_in_prerequisite_state`.
- Those functions are the ones the orchestrator actually calls:
  `kysely-local-projection-repository.ts:110-114` (`stage` → `fn_stage_release_projection`),
  `:128-131` (`verify` → `fn_verify_release`), `:148-150` (`activate` → `fn_activate_release`).
  For Country (a metadata entity compiled to `compiled_entity_runtime`, cf.
  `kysely-publication-authority-work.ts:505-509`) `projectionJson` emits `applied_release_payload`
  (`kysely-local-projection-repository.ts:388-415`), so the reachable raises are exactly the
  `APPLIED_RELEASE_PAYLOAD_*` / `RELEASE_SEQUENCE_NOT_FORWARD` family above.
- `pg-protocol` sets the SQLSTATE on the thrown error: `parser.js:307` `message.code = fields.C;`.
- Kysely does not wrap it: `postgres-driver.js:105`
  `throw extendStackTrace(err, new Error())`, and `stack-trace-utils.js` returns the **same** error
  object with an extended `stack`. There is no `KyselyPlugin` in the production composition
  (`targets.ts:38` constructs `KyselyLocalProjectionRepository` directly; `register-services.ts:4590-4598`
  registers `createPublicationApplyHandler(orchestrators, metrics)` with no decorator).
- Therefore `errorCode()` returns `"23514"` / `"55000"` / `"23505"`.

## 4. Nothing else marks the deployment failed

- `server/db/ddl/planes/studio/publication/07_functions.sql:137-146` — `fn_transition_deployment`
  sets `failure_code = NULLIF(p_evidence->>'code','')` only when `p_to_status='failed'`, and
  `:132-135` allows `failed` from `pending|dispatched|received|staged|verified`. So the sole
  blocker is the category guard at `publication-orchestrator.ts:197`, not a DB constraint.
- Only writers of `publication.deployment.status='failed'` in the tree are
  `publication-orchestrator.ts:198` (via `transitionDeployment`) and nothing else: a grep for
  `UPDATE publication.deployment` / `status='failed'` finds only the DDL function above, the DLQ
  SELECTs, and the `publication.deployment_event` trigger.
- The job runtime has no dead-letter hook that touches publication state:
  `bullmq-job-runtime.ts:512-535` classifies the wrapped error (which `publication-jobs.ts:94-100`
  stamps with `code='23514'`, `retryable=true`) and `:531` retries while `attempt < maxAttempts`.
  `publication-jobs.ts:251-252` / `register-services.ts:4624` set `maxAttempts: 5`, so the
  deterministic rejection burns all 5 attempts and then dead-letters **only in the jobs store**
  (`ops.job_execution`, the join used by `publication/18_compilation_recovery.sql:30`).
- The recovery maintenance job cannot fix it either: `kysely-authority-repository.ts:147-156`
  re-lists `pending|dispatched|received|staged|verified` deployments, and `publication-jobs.ts:240-263`
  re-enqueues with the deterministic key `publication:${deploymentId}:apply:${plane}:1`
  (`:279-286`), which BullMQ de-duplicates against the retained failed job
  (`removeOnFail: 5000`), so the stuck deployment is simply re-selected and/or deduped.
- Conflict class is identical: `publication-orchestrator.ts:61` makes conflicts `retryable === false`
  (`this.retryable = category === "transient"`), so `bullmq-job-runtime.ts:529-531` dead-letters them
  immediately, yet `:197` still skips the `failed` transition.
- The one TS-side token in `CONFLICT_CODES` that looks like it should catch a SQL rejection,
  `RELEASE_SEQUENCE_NOT_FORWARD` (`publication-orchestrator.ts:43`), occurs in TypeScript **nowhere
  else** (grep of `server`, `packages`, `apps`), so as the finding says it can never match — the SQL
  emits SQLSTATE `55000` (`07_functions.sql:408`).

## 5. Consequence on the operator surfaces (confirmed)

- `kysely-publication-operations-repository.ts:35` — `createReplayDeployment` requires
  `d.status='failed'`; `:45` `recordReplayRequested` requires `d.status='failed'`; and
  `publication-operations.ts:30-33` rejects any delivery that is not in the DLQ. So neither
  `/api/publication/operations/dead-letters` (`publication-routes.ts:23,35-40`) nor
  `/api/publication/operations/deliveries/:deliveryId/replay` (`publication-routes.ts:44-49`) can see
  or replay a deployment stuck at `dispatched|received|staged|verified`.
- `fn_activate_release` raises `RELEASE_PREDECESSOR_CHANGED`/`RELEASE_SEQUENCE_NOT_FORWARD`
  (`07_functions.sql:403-405,408`) **before** the head update at `:419-425`, so the activation head
  keeps serving the previous descriptor, and no `publication.deployment_event` row is written with a
  reason (events are emitted only by `fn_transition_deployment`, which is never reached).

## 6. Corrections / refinements (none refuting)

1. **Citation shorthand.** The SQL path is `server/db/ddl/common/runtime_meta/07_functions.sql`
   (the finding writes `runtime_meta/07_functions.sql`). Line ranges are otherwise accurate.
2. **"Raw SQLSTATEs become the failure code"** is true of the *job* record
   (`publication-jobs.ts:98` copies the classified code into the rethrown error; the jobs admin
   surface `/api/jobs/admin/dead-letters` then shows `23514`), not of
   `publication.deployment.failure_code`, which is never written because the deployment is never
   marked failed. Also `executionRetentionDays: 90` keeps those job rows visible, so the failure is
   not 100% invisible to an operator who knows to look at the jobs store.
3. **"Vanishes"** is a fair description of the publication DLQ, but the deployment can be retried
   again after the failed job ages out of retention (recovery re-enqueues it), so it is more precisely
   a silent, reason-less retry loop than a permanent disappearance.
4. **`DEPLOYMENT_TERMINAL`** is thrown by `assertDeployable` at `publication-orchestrator.ts:97`,
   outside the `try` (so it never reaches `:196`). That is harmless because it is only raised when the
   deployment is already `failed`/`rolled_back`; the finding's grouping of it with
   `LOCAL_ACTIVATION_HEAD_MISMATCH` is loose but not wrong about the missing recording.
   Note also that a `rolled_back` deployment is deliberately not a DLQ entry.
5. **Blanket "record conflicts as failed" needs care.** `LOCAL_ACTIVATION_HEAD_MISMATCH`
   (`:182`) is raised *after* `local.activate()` already committed the activation
   (`kysely-local-projection-repository.ts:148-157`), so blindly writing `failed` could mislabel an
   activation that actually happened. The robust fix is the SQLSTATE+RAISE-token translation for
   `stage`/`verify`/`activate` rejections (which are genuinely deterministic and pre-commit), plus an
   explicit reconcile-or-fail policy for post-commit conflicts.
6. **Scope.** This is shared-framework behaviour (all entities, all planes, studio apply included),
   not Country-specific configuration, so a fix is in scope for `AGENTS.md`.

## Verdict

**CONFIRMED.** Severity **high** — deterministic publication rejections are classified `transient`,
the authority deployment is never transitioned to `failed`, the publication dead-letter list and its
replay route can never surface them, the activation head silently keeps the previous descriptor, and
the only recorded code is a raw SQLSTATE on the jobs surface. The cited evidence and line numbers are
accurate.

---

# Adversarial verification — finding F1: "Stalled-publication recovery is inert"

Finding under review (`publication.md`, F1, claimed severity **high**):
> listRecoverableDeployments joins `publication.release` (FORCE RLS, only policy
> `USING (tenant_id = shared.current_tenant_id_soft())`) but is invoked from the scheduled
> `RECOVER_STALLED_PUBLICATIONS_JOB` whose execution is `{planeKey:'studio', scope:'plane',
> principalId: SYSTEM_PRINCIPAL_ID}` with no `tenantId` … the join returns 0 rows on every plane …
> the job reports success with `recovered: 0`.

## Verdict: CONFIRMED (severity **high** stands)

The mechanism reproduces in the current source **and in the live DEV database**: 5,173 scheduled
recovery runs reported `{"recovered": 0}` with a NULL tenant, while two real deployments sat in the
recoverable `dispatched` state for 8.5 minutes after their apply jobs exhausted all 5 attempts.

## 1. Cited code and line numbers

- `server/packages/services/publication/src/kysely-authority-repository.ts:146-156` —
  `listRecoverableDeployments`; the `JOIN publication.release r ON r.id=a.publication_release_id`
  is at `:152` and the status filter at `:153`. The cite `:150` is the `const result =` line of the
  same statement (SQL starts `:151`) — accurate to the statement.
- `kysely-authority-repository.ts:186-194` — `deploymentQuery` used by `getDeployment`
  (`:140-145`) also joins `publication.release` at `:191`. Confirmed as stated.
- `server/packages/services/publication/src/publication-jobs.ts:214-238` —
  `createPublicationRecoveryHandler`; `:221` `listRecoverableDeployments(200)`, `:223-227`
  `enqueueApply(jobs, {deploymentId,targetPlane})` **without** an execution coordinate, and
  `:235` `return { status: "completed", output: { recovered: deployments.length } }`. Exact match to
  the quoted evidence (the claim's `:220-236` window covers it).
- `server/apps/platform-host/src/composition/register-services.ts:4607-4615` — this handler is the
  one registered for `PUBLICATION_MAINTENANCE_QUEUE` / `RECOVER_STALLED_PUBLICATIONS_JOB` (not the
  `createPublicationAuthorityHandlers` `recoverStalled` variant at `publication-jobs.ts:206-210`,
  which is never registered — `register-services.ts:4749-4758` registers only compile/sign/dispatch).
- `register-services.ts:4650-4670` — the scheduler definition: `execution: { planeKey:"studio",
  scope:"plane", principalId: SYSTEM_PRINCIPAL_ID }`, no `tenantId`. Exact match.
- `server/packages/runtime/jobs/src/bullmq-job-runtime.ts:318-327` — `runWithJobContext` copies
  `tenantId` only when `envelope.execution?.tenantId` exists; nothing else stamps a DB session
  tenant. `:492-501` `validateExecution` *forbids* `tenantId` on a `scope:"plane"` execution, so the
  recovery job can never carry one by construction.
- `server/db/ddl/planes/studio/publication/10_rls.sql:1-10` — `ENABLE` + `FORCE ROW LEVEL SECURITY`
  and the `tenant_access` policy. **Correction:** the claim says "only policy"; there is a second
  policy `admin_access FOR ALL TO athyperadmin USING (true)` (`:9-10`). It does not rescue the job:
  the worker connects as `athyper_worker` (`deploy/compose/instance/scripts/start-runtime.sh:33`,
  `server/apps/platform-host/src/composition/infrastructure/databases.ts:126-137`), which is
  `rolbypassrls = f` and **not** a member of `athyperadmin` (verified live, see §3).
- `server/db/ddl/common/shared/07_functions.sql:431-438` — `current_tenant_id_soft()` returns
  `nullif(current_setting('app.current_tenant_id', true),'')::uuid`; its own comment says it is
  "Used in RLS USING clauses where unauthenticated access should return zero rows".
- `server/packages/adapters/database/core/src/transaction.ts:20-23` — the only writer of the GUC uses
  `set_config(..., true)` (transaction-local) and that writer runs only inside
  `withTenantTransaction`/`KyselyTransactionRunner.run`, which the raw-Kysely repository call in
  `listRecoverableDeployments` never enters. No session-level (`false`) stamping exists anywhere in
  the tree.

## 2. Second layer: even a listed deployment would fail (confirmed)

- `register-services.ts:4714-4716` — the dispatch path itself asserts
  `PUBLICATION_APPLIER_TENANT_REQUIRED` when `execution.tenantId` is absent, but that
  `resolveApplyExecution` callback is only wired into `createPublicationAuthorityHandlers`
  (`:4711-4748`); `createPublicationRecoveryHandler` never receives it and calls the 2-argument
  `enqueueApply` (`publication-jobs.ts:208`), which defaults the apply execution to
  `{scope:"plane", principalId:"publication-worker"}` (`:254-260`).
- `server/apps/platform-host/src/composition/shared/publication/tenant-orchestrator.ts:28-30` —
  `if (!context?.tenantId) return super.deploy(deploymentId);` (un-stamped fallback). The claim's
  `:30` is exact.
- `server/packages/services/publication/src/publication-orchestrator.ts:208-218` — `loadDeployment`
  → `authority.getDeployment` → RLS-hidden → `permanent("DEPLOYMENT_NOT_AVAILABLE")`. So the
  re-enqueued apply job fails rather than recovers.

## 3. Live reproduction (read-only queries against the running DEV database)

Executed with `docker exec athyper-dev-db-1 psql -U postgres -d athyper_studio` (SELECT / SET ROLE
only; no writes):

1. **RLS is the cause, and the worker role is subject to it.**
   ```
   as postgres (superuser):                count(*) from publication.release = 44
   SET ROLE athyper_worker, no GUC:        current_tenant_id_soft() IS NULL = t, count(*) = 0
   SET ROLE athyper_worker, tenant GUC set: current_tenant_id_soft() = 44444444-…-4444,
                                            count(*) from publication.release = 23
   ```
   `athyper_worker` has `rolbypassrls=f` and zero memberships in `athyperadmin`.
2. **The job really ran and really reported success with zero recovered, with no tenant.**
   `ops.job_execution`: `job_code='publication.recover-stalled'`, 5,173 rows `status='succeeded'`,
   `tenant_id IS NULL` for all, `result_payload='{"recovered": 0}'` for all
   (2026-09-24 16:16 → 2026-09-29 16:35 UTC). By contrast every `publication.apply-release`
   execution carries the tenant `11111111-1111-4111-8111-111111111111`.
3. **A genuinely stalled publication was missed while the sweep reported 0.**
   Deployments `01a0ebc6-b10a-7dc0-85ed-e3b4298d878b` and `01a0ebc6-b156-7ad1-b43e-4a294bbe68c5`
   (`publication.deployment_event`): `pending`→`dispatched` at 2026-09-29 06:07:42; their
   `publication.apply-release` jobs burned attempts 1–5 and dead-lettered at 06:08:18/06:08:20
   (SQLSTATE 23514); the deployments then stayed `dispatched` until 06:16:05 (≈8.5 min), which is
   inside the `('pending','dispatched','received','staged','verified')` candidate set. The recovery
   job ran at 06:08, 06:09, …, 06:16 and returned `{"recovered": 0}` every minute. Only external
   re-drive at 06:16:05 moved them to `activated`. This is the finding's impact, observed.
4. **DEV really has the sweep enabled.** `athyper-dev-source-worker` /
   `athyper-dev-source-scheduler` were configured with `PUBLICATION_RECOVERY_ENABLED=true`
   (`~/.athyper/instances/dev/workspace/source.compose.json` worker/scheduler services), so the
   in-repo default `false` (`publication-jobs.ts` gate at `register-services.ts:4650`;
   `config/environment.ts:831-834`; `start-runtime.sh:107`) is overridden in the affected instance.

## 4. Refutation attempts that failed

- *Some guard makes `listRecoverableDeployments` tenant-free.* No SECURITY DEFINER function, no
  `admin_access` applicability, no `BYPASSRLS` role, no connection-string `options`, and no
  session-level GUC exists; the only GUC writer is transaction-local.
- *The recovery job is not registered, so this is unreachable.* The handler is registered whenever
  `PUBLICATION_APPLY_ENABLED=true` (`register-services.ts:4590-4615`) and the scheduler whenever
  `PUBLICATION_RECOVERY_ENABLED=true`; the live DEV instance sets both true and the historical
  executions prove the path runs.
- *The apply retry/backoff already recovers stalls.* BullMQ retries 5×
  (`publication-jobs.ts:250-253`); §3.3 shows the retries exhausted and dead-lettered, leaving the
  deployment loose for the maintenance sweep that then saw nothing.
- *A DB constraint prevents the stall.* Irrelevant — the stall existed; the defect is that the
  sweep could not see it.

## 5. Corrections (none refuting)

1. `publication.release` does not have "only" the tenant policy — `admin_access TO athyperadmin`
   also exists (`10_rls.sql:9-10`). It does not apply to the job's `athyper_worker` connection, so
   the conclusion is unchanged.
2. The claim is not *only* reachable through the scheduled executor: the jobs admin
   retry/`replayDeadLetter` surface can re-drive a dead-lettered apply manually (that is what likely
   happened at 06:16:05), so "only the operator-only script can recover" should read "no automatic
   path recovers; only operator/job-admin intervention does".
3. Cite `kysely-authority-repository.ts:150` is the statement head; the join itself is `:151-152`.

## Verdict

**CONFIRMED, severity high.** `publication.release` FORCE RLS plus a plane-scoped, tenant-less
recovery job make `listRecoverableDeployments` return zero rows, the handler publishes
`status:"completed", recovered:0`, and the re-enqueued apply jobs would themselves fail on the same
RLS-hidden `getDeployment`. Reproduced both by reading the code paths end-to-end and by querying the
live DEV database, where 5,173 "successful" recovery runs recovered nothing while two real stalled
deployments waited for manual intervention. The finding is shared-framework scope (all entities, all
planes), not Country-specific configuration.
