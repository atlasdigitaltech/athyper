# READ-ONLY review — publication compilation & platform-host publication composition

- Scope: `server/packages/services/publication/src/**` and
  `server/apps/platform-host/src/composition/shared/publication/**` (every `.ts`/`.tsx`, including tests).
- Working tree: current uncommitted refactor (`git status --porcelain`), not `HEAD`.
- Date: 2026-09-29. Reviewer: delegated subagent (read-only; no source file was modified, no build/server was run).
- Contract/consumer context also inspected (not counted in coverage):
  `server/packages/contracts/publication/**`, `server/packages/contracts/metadata` exports used by the loader,
  `server/apps/platform-host/src/composition/shared/entity-runtime/**`,
  `server/db/ddl/planes/studio/publication/02_domains.sql`, `03_tables.sql`, `07_functions.sql`,
  `server/db/ddl/common/runtime_meta/07_functions.sql`, `server/db/ddl/common/authz/07_functions.sql`.

## Coverage

`find … \( -name '*.ts' -o -name '*.tsx' \)` → **120 files, 18 808 lines**. 63 non-test files (11 197 lines),
57 test/support files (7 611 lines).

Legend: **clean** = read in full, no defect found; **findings N** = N real defects recorded below;
**partial** = read in full except the region named; **skim** = only structural/selected regions read (stated).

### Service package (`server/packages/services/publication/src`)

| file | lines | verdict |
| --- | --- | --- |
| entity-foundation-definition.ts | 1099 | clean |
| kysely-publication-authority-work.ts | 951 | findings 5 |
| kysely-local-projection-repository.ts | 561 | findings 2 |
| entity-definition-service.ts | 516 | findings 2 |
| publication-artifact-loader.ts | 430 | findings 1 |
| entity-case-contract-service.ts | 421 | findings 2 |
| local-definition-preview.ts | 402 | findings 2 |
| entity-definition-routes.ts | 396 | findings 1 |
| entity-authorization-compiler.ts | 378 | findings 1 |
| entity-case-contract-routes.ts | 366 | findings 1 |
| release-promotion.ts | 356 | findings 2 |
| publication-jobs.ts | 337 | findings 2 |
| entity-definition-consumer.ts | 336 | findings 1 |
| publication-orchestrator.ts | 326 | findings 1 |
| kysely-authority-repository.ts | 270 | clean |
| local-definition-preview-policy.ts | 249 | clean |
| shared/collections/compiler.ts | 244 | clean |
| entity-operation-binding-compiler.ts | 207 | clean |
| compiled-entity-artifact-compiler.ts | 179 | findings 1 |
| publication-routes.ts | 168 | findings 1 |
| publication-artifact-store.ts | 142 | findings 1 |
| shared/policy/classify-change.ts | 138 | clean |
| compilation/compiled-runtime.ts | 128 | findings 1 |
| authenticated-entity-release-review.ts | 104 | clean |
| entity-initial-case-schema.ts | 102 | clean |
| shared/authorization/operation-projection.ts | 100 | findings 1 |
| coordinated-entity-adoption.ts | 92 | findings 1 |
| publication-operations.ts | 78 | findings 1 |
| entity-adoption-plan.ts | 70 | clean |
| compilation-recovery-authority.ts (platform-host, listed here for convenience) | — | — |
| kysely-publication-operations-repository.ts | 58 | clean |
| index.ts | 57 | clean |
| notification-configuration-source.ts | 55 | clean |
| entity-definition-compiler.ts | 53 | clean |
| compilation/native-runtime.ts | 52 | clean |
| file-entity-release-review-store.ts | 41 | clean |
| collection-configuration-source.ts | 41 | findings 1 |
| entity-authorization-publication-review.ts | 37 | clean |
| canonical-read-catalog.ts | 33 | clean |
| runtime-version.ts | 29 | clean |
| shared/case-contract/model.ts | 17 | clean |
| shared/preview/environment.ts | 13 | clean |
| entity-definition-source.ts | 7 | clean |
| compiled-entity-collection-compiler.ts | 3 | clean |

### Platform-host composition (`server/apps/platform-host/src/composition/shared/publication`)

| file | lines | verdict |
| --- | --- | --- |
| relationship-qualification.ts | 211 | clean |
| capability-qualification.ts | 188 | clean |
| target-qualification.ts | 175 | clean |
| policy-enrollment.ts | 162 | clean |
| compiled-runtime.ts | 142 | clean |
| machine-policy.ts | 88 | findings 1 |
| workload-routes.ts | 85 | findings 1 |
| compilation-recovery-authority.ts | 60 | clean |
| provenance-recovery.ts | 57 | findings 1 |
| compiler-build.ts | 57 | findings 1 |
| targets.ts | 51 | clean |
| compilation-recovery-execution.ts | 49 | clean |
| tenant-orchestrator.ts | 48 | clean |
| policy-enrollment-routes.ts | 40 | clean |
| workload-configuration.ts | 39 | clean |
| compilation-recovery-source.ts | 25 | clean |
| plane.ts | 23 | clean |
| successor-targets.ts | 20 | clean |
| enrollment-contract.ts | 19 | clean |
| runtime-qualification.ts | 16 | clean |

### Tests / support (57 files)

Read in full (no defect found): activity-publication, authenticated-entity-release-review, authority-api,
authorization-activation-hold, baseline-artifact, bp2-source-admission, canonical-read-catalog,
capability-profile-compilation, collection-artifact, compiled-entity-artifact-compiler,
compiled-entity-collection-compiler, compiled-publication-scope, compiled-runtime-publication (svc),
entity-authorization-compiler, entity-authorization-publication-review, entity-case-contract,
entity-case-contract-routes, entity-definition (svc), entity-definition-routes, entity-operation-binding-compiler,
file-entity-release-review-store, local-definition-preview, notification-artifact, operation-projection (test),
publication-jobs, publication-orchestrator, publication-runtime-review, release-promotion (test),
shared-publication-boundaries, studio-authority-ddl, target-projection-ddl, activity-qualification,
capability-qualification, compilation-recovery-execution, compilation-recovery-source,
machine-publication-policy, publication-plane, publication-policy-enrollment, publication-successor-boundaries,
publication-workload-configuration, publication-workload-routes, runtime-qualification (ph),
provenance-recovery.test.ts, targets.test.ts (ph).

Partially read (region stated, no defect found in read region): `compiled-runtime-worker.test.ts` (151 lines;
skipped the final ~15 lines), `publication-artifact-store.test.ts` (110 lines; skipped final ~12 lines),
`publication-operations.test.ts` (43 lines; first ~20 lines not shown), `table-entity-publication.test.ts`
(244 lines; first ~60 lines not shown), `compiled-runtime-publication.test.ts` (ph, 154 lines; skipped ~50),
`publication-policy-enrollment-routes.test.ts` (44 lines; skipped ~15),
`characterization/publication-characterization.test.ts` (154 lines; read first ~30).

**Not read (honest disclosure):** `__tests__/coordinated-entity-adoption.test.ts`,
`__tests__/dev-publication-boundaries.test.ts`, `__tests__/dev-publication-classifier.test.ts`,
`__tests__/entity-adoption-plan.test.ts`, `__tests__/characterization/temporary-interfaces.ts`,
`__tests__/integration/entity-case-contract-publication.ts` (316 lines).
`server/apps/platform-host/src/development/publication-workload.test.ts` is outside the declared scope and
was not reviewed.

## Findings

### [critical] Cross-tenant rollback: the publication key on the rollback route is never tenant-scoped

**Location:** `server/packages/services/publication/src/publication-routes.ts:121-133` (key extraction at 128),
`server/apps/platform-host/src/composition/shared/publication/` not implicated;
sink: `server/packages/services/publication/src/kysely-local-projection-repository.ts:307-319`.

**What is wrong.** `requirePermission` checks a bare permission code with no resource, and the path parameter
is handed to the durable rollback job unchanged. No code in the two scoped trees verifies that the
publication key belongs to the caller's tenant, and the SQL sink has no tenant predicate either.

**Evidence.**

```ts
// publication-routes.ts:123-129
const context = await requirePermission(options, response, "publication.release.rollback");
...
const publicationKey=String(request.params["key"]),reason=requiredString(request.body,"reason");
const jobId=await options.jobs.enqueue(PUBLICATION_APPLY_QUEUE,ROLLBACK_PUBLICATION_RELEASE_JOB,
  {publicationKey,targetAppliedReleaseId,targetPlane:plane,reason,actorId:context.principalId}, ...);
```

```ts
// kysely-local-projection-repository.ts:312
await sql`SELECT runtime_meta.fn_rollback_release(${input.publicationKey},${input.targetAppliedReleaseId}::uuid, ...)`
```

```sql
-- server/db/ddl/common/runtime_meta/07_functions.sql:439-455
CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release(
    p_publication_key text, p_target_applied_release_id uuid, ...
    SELECT * INTO v_head FROM runtime_meta.release_activation_head
     WHERE publication_key=p_publication_key FOR UPDATE;
```

Compare the read path, which does scope by tenant: `tenantRelease`/`tenantDeployment`
(`publication-routes.ts:160-168`) and `publication-runtime-review.test.ts` prove foreign-tenant read/publish
return 404 — there is no equivalent guard, or test, for rollback.

**Impact scenario.** Principal P holds `publication.release.rollback` in tenant A (permission is seeded
tenant-scoped/exact, `db/ddl/planes/studio/authz/14_permission_reference_seed.sql`). P calls
`POST /api/publication/publication-keys/metadata.compiled_entity.business_partner.tenant.<tenantB>/rollback`
with a `targetAppliedReleaseId` that is `superseded`/`verified` on that key. `fn_rollback_release` moves the
shared plane's activation head for tenant B's entity metadata to the older revision. Tenant A cannot read
tenant B's records, but it has silently downgraded B's published compiled entity runtime.

**Suggested fix.** Resolve the publication key to its owning release/deployment and require
`release.tenantId === context.tenantId` before enqueueing (mirroring `tenantRelease`); thread the tenant into
`LocalProjectionRepository.rollback` and add a `AND r.tenant_id = p_tenant_id` predicate to
`fn_rollback_release`. Add a route test asserting a foreign publication key yields 404/403 and enqueues nothing.

### [high] Permanent target-validation errors are classified `transient` → infinite retry, no `failed` state, empty DLQ

**Location:** `server/packages/services/publication/src/shared/authorization/operation-projection.ts:4-6`,
`server/packages/services/publication/src/kysely-local-projection-repository.ts:146,173-175,317`,
`server/packages/services/publication/src/publication-orchestrator.ts:221-243,304-311`,
`server/packages/services/publication/src/publication-jobs.ts:87-101`.

**What is wrong.** Repository-level validation throws plain `Error` objects that carry only a message, never a
`code` and never `retryable:false`. The orchestrator's classifier can therefore only fall back to
`PUBLICATION_DEPENDENCY_UNAVAILABLE` / `transient`.

**Evidence.**

```ts
// operation-projection.ts:4-6
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(`PUBLICATION_OPERATION_${message}`);
}
```
```ts
// kysely-local-projection-repository.ts:146 / 156 / 317
for (const artifact of artifacts) if (artifact.artifactType === "runtime_contract") assertOperationProjection(artifact.content.descriptor);
...
throw new Error("LOCAL_ACTIVATION_HEAD_MISMATCH");
...
throw new Error("LOCAL_ROLLBACK_HEAD_MISMATCH");
```
```ts
// publication-orchestrator.ts:304-311
function errorCode(error: unknown): string {
  const candidate = Reflect.get(asObject(error), "code");
  if (typeof candidate === "string" && candidate.length > 0) return safeCode(candidate);
  return error instanceof TypeError ? "INVALID_PUBLICATION_INPUT" : "PUBLICATION_DEPENDENCY_UNAVAILABLE";
}
```
```ts
// publication-orchestrator.ts:197-203 — only "permanent" is ever marked failed
if (failure.category === "permanent" && authorityStatus !== "activated") {
  await this.authority.transitionDeployment({ deploymentId, status: "failed", evidence: { ...failure.evidence() } });
}
```

The same gap applies to Postgres error codes surfaced by Kysely for these paths (`object_not_in_prerequisite_state`
from `fn_transition_artifact`/`fn_verify_release`, `check_violation` from
`authz.fn_stage_entity_operation_projection`): they are not in `PERMANENT_CODES`
(`publication-orchestrator.ts:24-39`) and are not remapped.

**Impact scenario.** A signed compiled release whose `operation_scope_bindings` are semantically invalid
(e.g. a permission id that does not exist in the target catalog, `check_violation` from
`fn_stage_entity_operation_projection`) fails `stage` on every one of the 5 apply attempts, then
`recover-stalled` re-enqueues it on every maintenance tick (`publication-jobs.ts:206-238`). The deployment
stays `dispatched`, never appears in `listDeadLetters` (`WHERE d.status='failed'`,
`kysely-publication-operations-repository.ts:55`), never reaches destination-health failure counters, and no
operator can see why. `PUBLICATION_OPERATION_*` validation failures likewise never dead-letter.

**Suggested fix.** Give every repository/validator error a stable `code` (extend `PublicationContractError` or
attach `{code, retryable:false}`) and treat any code outside a transient allow-list as permanent; map known
SQLSTATEs (`check_violation`, `object_not_in_prerequisite_state`, `unique_violation`,
`no_data_found`) to permanent/conflict. Add an orchestrator test that an invalid binding payload ends with
`deploymentStatus === 'failed'` and one dead letter.

### [high] Compiled operation bindings are staged outside the projection transaction and are never repaired on retry, so a release can activate without them

**Location:** `server/packages/services/publication/src/kysely-local-projection-repository.ts:110-121,162-192`
and `server/packages/services/publication/src/publication-orchestrator.ts:118-151`.

**What is wrong.** `stage()` performs two independent statements with no surrounding transaction: the
`fn_stage_release_projection` call (which creates the applied-release row) and, only for
`compiled_entity_runtime`, `stageCompiledOperationBindings`. The orchestrator only calls `stage` when
`findByDeployment` returns nothing, so the second statement is never replayed on a retry. `activate()`
re-checks the *shape* of the stored payload but never that authorization rows exist.

**Evidence.**

```ts
// kysely-local-projection-repository.ts:110-120
const result = await sql<Row>`SELECT * FROM runtime_meta.fn_stage_release_projection(...)`.execute(this.database);
const applied = mapApplied(required(result.rows[0], "APPLIED_RELEASE_NOT_FOUND"));
if (envelope.artifactKind === "compiled_entity_runtime")
  await this.stageCompiledOperationBindings(applied.id, envelope.payload);
return applied;
```
```ts
// publication-orchestrator.ts:122-131 — stage is skipped once a row exists
if (!localRelease) {
  currentStep = "load";
  loaded = await this.loader.load(deployment);
  await advance("received", { artifactLoaded: true });
  currentStep = "stage";
  localRelease = await this.local.stage({ deployment, artifact: loaded.document });
}
```
```ts
// kysely-local-projection-repository.ts:141-147 — activate re-validates shape only
const stored = await sql<Row>`SELECT payload_json FROM runtime_meta.applied_release_payload
  WHERE applied_release_id=${input.appliedReleaseId}::uuid AND artifact_kind='compiled_entity_runtime'`...
for (const artifact of artifacts) if (artifact.artifactType === "runtime_contract") assertOperationProjection(artifact.content.descriptor);
```

**Impact scenario.** `fn_stage_release_projection` commits; `authz.fn_stage_entity_operation_projection`
throws (catalog row missing, permission code not canonical, transient connection loss) or the process dies
between the statements. The apply job retries; `findByDeployment` now returns the staged row, so stage is
skipped, verify succeeds, and `fn_activate_release` + `fn_activate_entity_operation_projection` run. The
release is `active` while `authz.entity_operation_projection` has no rows for it, so operation-scope
admission for the newly published entity falls back to whatever projection was previously active — a
published revision whose declared authorization bindings are not in force.

**Suggested fix.** Stage the projection and the bindings in one Kysely transaction (or one SQL function), or
make `activate()` idempotently re-invoke `stageCompiledOperationBindings` and assert the row count for
`authz.entity_operation_projection` matches the payload before calling `fn_activate_release`.

### [high] Dispatch-time authorization gate fails open when the compilation join yields no rows

**Location:** `server/packages/services/publication/src/kysely-publication-authority-work.ts:665-694`.

**What is wrong.** `assertActivationApproved` only demands `authorizeEntityActivation` when its second query
returns rows. If the `publication.artifact_compilation` join matches nothing (artifact created out-of-band,
`artifact_kind` disagreement between `publication.artifact` and the compilation row, or a compilation row that
was never written), the method returns normally and dispatch proceeds.

**Evidence.**

```ts
// kysely-publication-authority-work.ts:679-693
const rows = (await sql<Row>`SELECT a.publication_release_id FROM publication.deployment d
  JOIN publication.artifact a ON a.id=d.artifact_id
  JOIN publication.artifact_compilation c ON c.publication_release_id=a.publication_release_id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind
  WHERE d.id=${deploymentId}::uuid AND c.unsigned_document #> '{envelope,payload,entityDescriptor,descriptor,authorizationRuntime}' IS NOT NULL`...).rows;
if (rows.length) {
  if (!this.options.authorizeEntityActivation) throw permanent("ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED");
  await this.options.authorizeEntityActivation(string(rows[0]!, "publication_release_id"));
}
```

**Impact scenario.** Any deployment whose artifact has no matching compilation row — including one created by
a future/enrolment path or a partially-written compilation — is dispatched without the independent activation
approval that the same code path requires one line later. The check is "fail open on absence of evidence"
rather than "deny unless evidence proves no authorization runtime".

**Suggested fix.** Require exactly one compilation row per deployment and deny otherwise; decide
"authorization runtime required" from the signed artifact kind (entity_runtime/compiled_entity_runtime) rather
than from an inner JSON path that may be absent, and keep
`ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED` as the default when the row cannot be resolved.

### [high] `recoverStalled` aborts the whole sweep on one unexpected error and never looks past 200 rows

**Location:** `server/packages/services/publication/src/kysely-publication-authority-work.ts:699-719`,
`server/packages/services/publication/src/publication-jobs.ts:206-238`.

**What is wrong.** Inside the per-deployment loop only the exact string
`ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED` is tolerated; any other error is rethrown, which aborts
recovery for every remaining deployment. The candidate list is also a single unpaginated
`listRecoverableDeployments(200)`.

**Evidence.**

```ts
// kysely-publication-authority-work.ts:701-717
for (const item of await this.options.authority.listRecoverableDeployments(200)) {
  try {
    await this.assertActivationApproved(item.deploymentId);
    eligible.push({ deploymentId: item.deploymentId, targetPlane: item.targetPlane });
  } catch (error) {
    if ((error as Error).message !== "ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED") throw error;
  }
}
```
```ts
// publication-jobs.ts:221-227
const deployments = await authority.listRecoverableDeployments(200);
for (const deployment of deployments) { await enqueueApply(jobs, {...}); }
```

**Impact scenario.** One stalled deployment with a permanent condition (e.g.
`COMPILED_PUBLICATION_ADAPTER_REQUIRED`, `PUBLICATION_COMPILATION_HASH_MISMATCH`) that is ordered before real
work by `ORDER BY d.created_at,d.id` blocks recovery permanently — every maintenance run throws at the same
row and later stalled deployments are never re-enqueued; and even in the best case only the oldest 200 stalled
deployments are ever considered.

**Suggested fix.** Classify per item; skip (and record) ineligible items instead of aborting the batch, and
page through recoverable deployments with a keyset cursor until drained. Emit the skip reason as a metric.

### [medium] Promotion converts every destination error into an evidence-free `failed` entry

**Location:** `server/packages/services/publication/src/release-promotion.ts:299-341` (catch at 336-340).

**What is wrong.** All errors — transient transport, authorization revocation, coordinate mismatch thrown by
`requirePolicy`, or a genuine DB failure — are swallowed and reported identically, with no error code, no
deployment id, no retryable flag; the receipt then says `status:"incomplete"` and the function resolves
successfully.

**Evidence.**

```ts
} catch {
  // Transport errors can contain credentials; detailed errors belong in the
  // dispatcher's protected logs, not a public promotion receipt.
  results.push({ ...target, status: "failed" as const });
}
...
status: results.every((r) => r.status === "activated") ? "activated" : "incomplete",
```

**Impact scenario.** A revoked publisher authority or an expired human approval mid-loop
(`evaluatePromotion` inside the loop, lines 270-271) is reported as `failed` next to a transport timeout; the
durable `publication.promotion.result` audit record cannot distinguish "retry me" from "your authority was
revoked", so operators either retry indefinitely or stop retrying a transient outage. `PROMOTION_SOURCE_CHANGED`
(a `requirePolicy` throw) is also silently downgraded.

**Suggested fix.** Classify the caught error (reuse `classifyPublicationFailure`) and persist only the
sanitized `{category, code, retryable}` plus the `deploymentId` when one was created; keep the raw message out
of the receipt exactly as the comment intends.

### [medium] Replay enqueues the apply job before the replay event and audit record are durable

**Location:** `server/packages/services/publication/src/publication-operations.ts:27-41`.

**What is wrong.** `createReplayDeployment` commits, then the apply job is enqueued, and only afterwards are
`recordReplayRequested` and the audit event written. If either write fails, already-running work is unaudited.

**Evidence.**

```ts
// publication-operations.ts:35-39
const replay = await this.options.repository.createReplayDeployment({...});
const replayKey = `publication:${replay.deploymentId}:replay:${input.requestId}`;
const replayJobId = await this.options.jobs.enqueue(PUBLICATION_APPLY_QUEUE, APPLY_PUBLICATION_RELEASE_JOB, {...});
await this.options.repository.recordReplayRequested({...});
await this.options.audit.record({ eventCode: "publication.delivery.replay_requested", ... });
```

Contrast the recovery path, which deliberately audits inside the transaction and refuses to queue unaudited work:
`compilation-recovery-execution.ts:31-46` ("Commit authorization evidence before queueing. … audit failure
cannot launch unaudited work.").

**Impact scenario.** A DLQ replay that re-activates a published revision runs even though the operator's
reason/audit row was never persisted (audit sink outage); the delivery's history shows no replay request.

**Suggested fix.** Write the replay event (and audit) in the same transaction as `createReplayDeployment`,
commit, then enqueue; on enqueue failure leave the deployment `pending` so the maintenance sweeper retries it.

### [medium] Publish endpoints report a withdrawn release as queued and enqueue compilation for it

**Location:** `server/packages/services/publication/src/entity-definition-service.ts:278-291`,
`server/packages/services/publication/src/entity-case-contract-service.ts:288-291`,
`server/packages/services/publication/src/entity-definition-routes.ts:252-280`,
`server/packages/services/publication/src/entity-case-contract-routes.ts:232-260`.

**What is wrong.** Both publish services return whatever release row exists whenever it is not `preparing`,
including `withdrawn`; the routes then enqueue `COMPILE_PUBLICATION_ARTIFACT_JOB` and answer `202`.
The only legal statuses are `preparing|approved|published|withdrawn`
(`db/ddl/planes/studio/publication/02_domains.sql:4-5`), so "not preparing" is not "compilable".

**Evidence.**

```ts
// entity-definition-service.ts:281-291
return release.status === "preparing"
  ? this.options.authority.transitionRelease({ releaseId: release.id, status: "approved", actorId: input.actorId, evidence: {...} })
  : release;
```
```ts
// entity-case-contract-service.ts:288-291
if (replay[0]) return authority.getRelease(String(replay[0]["publication_release_id"]));
```
```ts
// entity-definition-routes.ts:253-280 — enqueued unconditionally after publish()
const jobId = await options.jobs.enqueue(PUBLICATION_AUTHORITY_QUEUE, COMPILE_PUBLICATION_ARTIFACT_JOB, { releaseId: release.id }, {...});
response.status(202).json({ release, jobId });
```

**Impact scenario.** An operator publishes, the release is later withdrawn, and a retry with the same
idempotency key returns `202 {release:{status:'withdrawn'}}` plus a job. `compileScoped` filters
`pr.status IN ('approved','published')` (`kysely-publication-authority-work.ts:130,143,280`) and so fails
permanently with `PUBLICATION_COMPILATION_SOURCE_NOT_FOUND`; the caller believes publication is in flight.
(The same route-level "approve then enqueue" split is not atomic: if `jobs.enqueue` throws after
`transitionRelease` committed, the response is 500 while the release is `approved` with no compile job —
recoverable only because the enqueue key is deterministic.)

**Suggested fix.** In both services, refuse (or surface) any post-transition status other than
`approved`/`published`; in the routes, only enqueue when the returned status is `preparing→approved` or
`approved`, otherwise return `409` with the actual status.

### [medium] Signing never re-reads release status and will sign/re-publish a withdrawn release

**Location:** `server/packages/services/publication/src/kysely-publication-authority-work.ts:516-540,578-647`.

**What is wrong.** The sign step loads `c.*` plus release coordinates but not `r.status`, and proceeds to
write the immutable artifact and create a deployment regardless.

**Evidence.**

```ts
// kysely-publication-authority-work.ts:519-522
const result = await sql<Row>`SELECT c.*,r.release_key,r.release_no,r.created_by,r.tenant_id
  FROM publication.artifact_compilation c JOIN publication.release r ON r.id=c.publication_release_id
  WHERE c.id=${compilationId}::uuid`...;
```
```ts
// kysely-publication-authority-work.ts:602-646
await this.options.store.putImmutable({ key, bytes, contentType: ..., sha256: contentHash, metadata: {...} });
const artifact = await this.options.authority.createArtifact({...});
...
const deployment = await this.options.authority.createDeployment({ commandId, artifactId, ... });
```

**Impact scenario.** A release is withdrawn between compile and sign (or a withdrawn release's compilation is
re-signed). The signature is produced, bytes are permanently written to object storage under an immutable
key, and a deployment command exists; `fn_create_deployment` only requires `artifact.status='signed'`. A later
`dispatch` still needs the activation approval, so activation is prevented — but an immutable signed artifact
for a withdrawn release is now published and cannot be recalled, and the artifact key is unreclaimable.

**Suggested fix.** Select and require `r.status IN ('approved','published')` in `signScoped`, and reject
`artifact.status='withdrawn'` explicitly with a coded permanent error.

### [low] Locale-sensitive ordering feeds artifact/release/coordinate hashes

**Location:** `server/packages/services/publication/src/compiled-entity-artifact-compiler.ts:119`,
`server/packages/services/publication/src/entity-authorization-compiler.ts:247-251`,
`server/apps/platform-host/src/composition/shared/publication/compiler-build.ts:17,48`,
`server/packages/services/publication/src/release-promotion.ts:83-88`.

**What is wrong.** Canonical output order is established with `String.prototype.localeCompare` (no pinned
locale/collator), which is ICU-dependent, while the same packages assert deterministic output
(`compiled-entity-artifact-compiler.ts:145 deterministic: true`;
`compiled-entity-artifact-compiler.test.ts` equality checks).

**Evidence.**

```ts
// compiled-entity-artifact-compiler.ts:119
.sort((left, right) => left.artifactKey.localeCompare(right.artifactKey));
```
```ts
// entity-authorization-compiler.ts:247-251
.sort((a, b) => a.operationKey.localeCompare(b.operationKey) || a.scopeKind.localeCompare(b.scopeKind));
```

I verified against the real key sets that a code-point sort and `localeCompare` agree today on this host
(ICU 78.3, en-US), so this is not an active mismatch — but the divergence is observable:
`"a_b/c".localeCompare("a-b/c") === -1` while code-point order is the opposite, and entity codes/operation
keys are `[a-z0-9_.-]`/author-supplied strings.

**Impact scenario.** An artifact compiled on a host with different ICU collation orders
`operation_scope_bindings` differently, producing a different `compiled_hash`/`releaseHash` for identical
content; successor/recovery pins (`descriptorHash`, `contractHash`) then fail across environments with
`ENTITY_SUCCESSOR_*_CHANGED` / `COMPILED_PUBLICATION_SOURCE_PIN_MISMATCH` even though nothing changed.

**Suggested fix.** Replace `localeCompare` with a code-point comparator (or a single pinned
`new Intl.Collator("en-US", {usage:"sort"})` created once) everywhere canonical order is hashed.

### [low] UTC date slicing decides policy effectiveness / effective dates

**Location:** `server/apps/platform-host/src/composition/shared/publication/machine-policy.ts:37`,
`server/apps/platform-host/src/composition/shared/publication/workload-routes.ts:57`,
`server/apps/platform-host/src/composition/shared/publication/policy-enrollment.ts:100`.

**What is wrong.** `new Date().toISOString().slice(0,10)` yields the UTC calendar date, used as a policy
`effectiveOn`/`effectiveFrom` filter.

**Evidence.**

```ts
// machine-policy.ts:37
effectiveOn: new Date().toISOString().slice(0, 10), revision: config.pin }, tx);
```

**Impact scenario.** On a host at UTC+13/UTC-11, for up to 13 hours around local midnight the enrolled policy
is looked up with the wrong effective date, so `findExact` returns nothing and an otherwise authorized
publication is denied with `MACHINE_PUBLICATION_POLICY_UNAVAILABLE` / `PUBLICATION_WORKLOAD_POLICY_DENIED`.
DEV-only today, but the same helper pattern is easy to copy.

**Suggested fix.** Derive the date from an explicit clock/timezone port (or the policy store's configured
timezone) and test the boundary.

### [low] Preview writes leak `.tmp` files when the atomic rename path fails

**Location:** `server/packages/services/publication/src/local-definition-preview.ts:92-96`.

**What is wrong.** `atomic()` creates a temp file and renames it with no cleanup on failure.

**Evidence.**

```ts
function atomic(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}
```

**Impact scenario.** A failed write (ENOSPC, EACCES, concurrent rename on Windows-style semantics) or a crash
between the calls leaves uniquely-named `.tmp` files in the preview root with no reaper; the root is scanned
by `previewStatus`/`overlayLocalDefinitionPreview` only for `*.status.json`/`*.active.json`, so garbage
accumulates indefinitely.

**Suggested fix.** `try { … } catch (error) { rmSync(temp, {force:true}); throw error; }`.

### [low] Unguarded `JSON.parse` on persisted evidence becomes an uncoded (transient) failure

**Location:** `server/apps/platform-host/src/composition/shared/publication/provenance-recovery.ts:39`,
`server/packages/services/publication/src/compilation/compiled-runtime.ts:108`.

**Evidence.**

```ts
// provenance-recovery.ts:39
const q = JSON.parse(p.historicalQualification), source = p.provenance;
```
```ts
// compilation/compiled-runtime.ts:107-108
const expectedPredecessor = successorPin(e.releaseNo, e.targetPlane, e.publicationKey,
  rawPredecessor === undefined ? undefined : JSON.parse(rawPredecessor));
```

**Impact scenario.** Corrupt or tampered stored evidence produces a bare `SyntaxError` instead of a coded
`PUBLICATION_RECOVERY_*`/`COMPILED_PUBLICATION_*` denial. In the orchestrator/loader that means
"transient → retry forever" (see the high finding above); in recovery qualification it escapes the recovery
decision and surfaces as an unclassified 500. The goal is exactly the opposite: a tampered archive must be a
recorded, permanent denial.

**Suggested fix.** Parse inside a try and map failures to the existing coded denial.

### [low] Two loader branches discard the specific `PublicationContractError` they just caught

**Location:** `server/packages/services/publication/src/publication-artifact-loader.ts:165-193,195-207`.

**Evidence.**

```ts
// publication-artifact-loader.ts:191-192 and 206
} catch {
  throw failure("ARTIFACT_PAYLOAD_INVALID");
}
```

The neighboring branches do it correctly (`if (error instanceof PublicationContractError) throw error;`
at lines 154, 308, 364), so the collection/notification branches are inconsistent: a precise inner failure
(e.g. `PROJECTION_SCHEMA_VERSION_MISMATCH` raised by a nested parser) is replaced by the generic code, and
that generic code is what lands in `publication.deployment.failure_code` / deployment evidence.

**Suggested fix.** Rethrow `PublicationContractError` in these two branches as the others do.

### [low] Read-path allowlist rejects any collection key the publication compiler accepts

**Location:** `server/packages/services/publication/src/collection-configuration-source.ts:13-14`.

**Evidence.**

```ts
if (!["activity.notifications", "activity.inbox"].includes(collectionKey))
  throw new TypeError("Unknown collection");
```

The compiler/loader validate a `collection_configuration` descriptor generically
(`publication-artifact-loader.ts:160-194`) and accept any reviewed
`collectionPublicationKey(tenantId, descriptor.configuration.collectionKey)`.

**Impact scenario.** Onboarding a new collection (the shared-framework extension path in `AGENTS.md`)
publishes successfully and then has no reader — the runtime throws `Unknown collection` for a
successfully activated release.

**Suggested fix.** Validate the requested key against the resolved descriptor
(`descriptor.configuration.collectionKey`) instead of a hardcoded pair, or move the supported set into the
publication contract so compiler and reader cannot disagree.

### [low] `adoptEntityPair` requires signed manifest evidence that no in-scope compiler emits

**Location:** `server/packages/services/publication/src/coordinated-entity-adoption.ts:39-43` vs
`server/packages/services/publication/src/kysely-publication-authority-work.ts:779-790` and
`server/packages/services/publication/src/compilation/compiled-runtime.ts:71-72`.

**Evidence.**

```ts
// coordinated-entity-adoption.ts:41-43
const evidence=loaded.document.manifest.evidence;
requireAdoption(evidence?.['baselineReleaseId']===plan.baselineReleaseId
  && evidence?.['baselineHash']===plan.baselineHash, 'ADOPTION_SIGNED_BASELINE_REQUIRED');
```

`buildUnsigned` emits only `importedBaseline`/`nativeDescriptorHash` (+documentCollectionCompiler) and
`compileRuntimePublication` emits only `sourceRevisionId/sourceEntityId/sourceReleaseHash/sourceContractHash/
sourceDescriptorHash/expectedPredecessor/qualificationReceiptSha256`. A repo-wide grep shows the only writer of
`baselineReleaseId`/`baselineHash` in manifest evidence is
`tooling/scripts/local-dev/deploy-bp-adoption-worker.mts:350-370`.

**Impact scenario.** Any coordinator that wires `adoptEntityPair` to artifacts produced by the in-scope
publication pipeline always fails with `ADOPTION_SIGNED_BASELINE_REQUIRED`; the only working producer is a
local-dev script. The API looks wired but cannot be used end-to-end.

**Suggested fix.** Either emit the baseline pin from the compile path (derived from the approved source
coordinates) or state in the contract that adoption requires a separate artifact producer and assert that at
composition time.

### [low] Request/journey vocabulary in the definition consumer is not covered by the compiler's completeness matrix

**Location:** `server/packages/services/publication/src/entity-definition-consumer.ts:195-245` vs
`server/packages/services/publication/src/entity-definition-compiler.ts:9,42-44`.

**Evidence.**

```ts
// entity-definition-consumer.ts:206-218
case "activate_supplier": return "supplier.activate";
case "amend_partner": return "partner.amend";
...
case "archive": return "partner.archive";
```
```ts
// entity-definition-compiler.ts:9
export const BUSINESS_PARTNER_DEFINITION_REQUEST_KEYS=Object.freeze(["supplier.new","supplier.add","supplier.qualify","supplier.company","supplier.bank","customer.new","customer.add","customer.credit","customer.company"] as const);
```
`journeyFor` can also return `"governance"`, which the completeness check does not require.

**Impact scenario.** The shipped foundation bundle happens to define `supplier.activate`, `partner.*` and a
`governance` journey (`entity-foundation-definition.ts:274-339,629-643`), so today it works; but a bundle that
satisfies the enforced matrix can still fail at runtime with
`BUSINESS_PARTNER_DEFINITION_REQUEST_SCHEMA_MISSING` / `..._WORKFLOW_MISSING`, and `customer.credit` is
required yet unreachable through `requestKey`.

**Suggested fix.** Declare the kind→key/journey mapping once and extend the completeness check (or the
consumer's switch) so compiler-accepted input is always runtime-resolvable.

### [low] Recovery metric attributes every recovered plane to `studio`

**Location:** `server/packages/services/publication/src/publication-jobs.ts:228-234`.

**Evidence.**

```ts
metrics?.counter("publication_operations_total").incrementBy(deployments.length, {
  operation: "recover", plane: "studio", outcome: "reenqueued",
});
```

**Impact scenario.** Recovery of neon/mesh deployments is counted under `plane="studio"`, so per-plane
recovery dashboards/alerts are wrong (silent under-reporting for neon/mesh).

**Suggested fix.** Group by `deployment.targetPlane` and increment per plane.

## Checked and clean

Explicitly verified and found correct (not reported above):

- **Error-code contract:** every `failure(...)` code in `publication-artifact-loader.ts` exists in
  `PublicationErrorCode` (`contracts/publication/src/errors.ts`) — checked by script, zero missing.
- **SemVer gate:** `runtime-version.ts` implements SemVer 2.0.0 precedence correctly, including
  prerelease-vs-stable, numeric identifiers, longer-prerelease and leading-zero rejection; matches the
  11-case table in `compiled-runtime-publication.test.ts`.
- **Artifact immutability/URI:** `publication-artifact-store.ts` verifies the supplied checksum before
  `putIfAbsent`, re-reads and compares on conflict, rejects foreign buckets, and constrains path segments;
  no partial-write or overwrite path found.
- **Release numbering is not a cross-tenant leak:** `entity-definition-service.ts:256` computes
  `max(release_no)+1` without a tenant filter, which is *required* by
  `publication_release_coordinate_uq UNIQUE (release_key, release_no)`
  (`db/ddl/planes/studio/publication/03_tables.sql:24`); the tenant-scoped variant in
  `entity-case-contract-service.ts:334` targets a different key shape.
- **Case-contract integrity:** `validateCaseContractUpdate`/`validateInitialCaseContract` reject narrowing
  published fields, unknown extensions, weakened constraints, coordinate substitution and payload expansion;
  `nextCompanyInitialReleaseNo` only supersedes terminal never-activated attempts.
- **Authorization compile path:** `entity-authorization-compiler.ts` pins operation ids to authored
  identities, resolves permission ids from the target catalog (no source-id transplant), enforces reviewed
  scopes, re-parses the final descriptor, and snapshots catalog/operationIds before awaiting review
  (mutation-during-await test passes).
- **Operation projection admission:** `shared/authorization/operation-projection.ts` enforces source pins,
  scope-kind vocabulary, coordinate-source/resolver consistency, uniqueness of binding/scope ids, and
  "every bound operation must have a binding".
- **Promotion policy:** host-owned environment, single-artifact-per-plane requirement, distinct workload
  publisher for DEV auto-approval, human/independent/expiry/coordinate-hash-bound approval, and
  predecessor-environment qualification for stg/prod; revocation is re-read before each destination.
- **Authenticated release review:** two independent reviewer domains, elevated assurance, ≤1 receipt per
  row/reviewer, `packetRevision`/`nominationSha256` binding, evidence and reviewer authority re-validated
  after I/O, expired/future receipts rejected.
- **File review store:** absolute root, per-release manifest pin required, `O_NOFOLLOW`, file mode/size and
  SHA-256 checks, `lstat` on the directory, symlink and group/world-writable rejection.
- **Machine policy / enrollment:** separate `studio.metadata.contract.publish_automated` permission, exact
  persisted definition hash + active-head function, pinned negative/positive test cases re-verified at
  activation, maker≠checker and distinct enrolled workloads, DEV-only mounting; enrollment can never reach
  the human publish permission.
- **Compilation recovery:** ≤1 h window, exact failed release id/hash and original compiler build pin, empty
  artifact precondition, `pg_try_advisory_xact_lock` guard, authorization and successor heads re-checked
  after the slow qualification probes, audit committed in-transaction before enqueueing.
- **Workload routes:** timing-safe comparison of both mounted credentials, exact pinned policy, body/query
  shape rejection, no body-supplied tenant/source/target authority, DEV-preset mount guard, and
  `x-plane: studio` required.
- **Capability / target / relationship qualification:** fail-closed on missing providers, handlers,
  permissions, RLS, policies, triggers, privileges, unique indexes and foreign keys; read-only
  `repeatable read` probes with `statement_timeout`; no entity-name-based provider selection.
- **Orchestrator resumability:** every crash boundary in `publication-orchestrator.test.ts` resumes without
  duplicate mutation; failure evidence is sanitized (no signature/bucket leakage); `authorizeActivation` is
  re-checked immediately before activate even for previously verified releases; conflicts do not mark a
  deployment failed.
- **Tenant orchestration:** `TenantPublicationOrchestrator.deploy` stamps both the authority and target
  databases with the verified tenant/principal inside nested transactions before applying.
- **Runtime read path / no stale-revision cache:** no cache or memoization of the active revision exists in
  either scoped tree. Reads go through `runtime_meta.release_activation_head` via
  `fn_active_release`/`fn_active_entity_descriptor` and, for split artifacts, through
  `applied_release_payload` (`entity-runtime/route-admission.ts`); `projectionJson` writes exactly the
  `applied_release_payload` row that path reads, so `compiled_entity_runtime` and
  `entity_runtime`/`entity_notifications`/`collection_configuration` producers and consumers agree.
  `findActiveEntity` hardcodes `'entity_runtime'`, which is correct: its only callers are verification
  tooling and `PublicationOrchestrator.activeEntity`, not the request read path.
- **Rollback eligibility:** `fn_rollback_release` requires the target to be `superseded`/`verified` with an
  existing projection and writes the activation event, so non-adjacent or unverified rollback targets are
  rejected server-side (only tenant scoping is missing — finding 1).

## Highest-risk 5

1. **Cross-tenant rollback** — `publication-routes.ts:128` + `fn_rollback_release`: any tenant holding
   `publication.release.rollback` can downgrade another tenant's active published entity metadata.
2. **Permanent target failures classified as transient** — `operation-projection.ts:5` +
   `publication-orchestrator.ts:304-311`: invalid signed metadata retries forever, never becomes `failed` and
   never dead-letters, so the DLQ/health surfaces are blind.
3. **Non-atomic compiled-binding stage with retry that skips repair** —
   `kysely-local-projection-repository.ts:118-119` + `publication-orchestrator.ts:122`: a release can reach
   `active` with its `operation_scope_bindings` missing from `authz.entity_operation_projection`.
4. **Dispatch activation gate fails open when the compilation row is absent** —
   `kysely-publication-authority-work.ts:679-693`: the independent activation approval is skipped whenever the
   join cannot resolve the compilation.
5. **`recoverStalled` poison pill / 200-row truncation** — `kysely-publication-authority-work.ts:699-719` +
   `publication-jobs.ts:221`: one unusual error blocks all recovery, and the oldest 200 rows bound the sweep.
