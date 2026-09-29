# Fresh review — Publication and compilation pipeline

Area: `server/packages/services/publication/src/**`, `server/packages/contracts/publication/src/**`,
`server/apps/platform-host/src/composition/shared/publication/**`, `server/db/ddl/common/runtime_meta/**`
(plus the SQL that feeds the pipeline: `server/db/ddl/planes/studio/publication/**`,
`server/db/ddl/planes/studio/metadata/**`, `server/db/ddl/common/authz/**`).

Question: how does entity metadata become the signed published descriptor the runtime reads, and where do
those guarantees break? Every finding below was derived from source read in this session. Country is used as
the concrete consumer: its definition is metadata-only (`metadata/products/shared/entities/country/definition.json`),
it is a `reference`/`system` entity, so its publication key is global (`metadata.reference.country`,
`server/packages/planes/studio/meta-entity-authoring/src/publication/prepare-release.ts:62`) and its release is
published as a `compiled_entity_runtime` split artifact
(`prepare-release.ts:84`, `compileSplitSources` in `kysely-publication-authority-work.ts:482-514`).

## Findings

### F1 — HIGH — Stalled-publication recovery is inert and reports success

`server/packages/services/publication/src/kysely-authority-repository.ts:150-154`

```ts
    const result =
      await sql<Row>`SELECT d.*,a.artifact_uri,a.content_hash,a.signature_algorithm,a.signing_key_id,a.signature,r.release_key,r.id AS source_release_id,r.release_no
      FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id
      WHERE d.status IN ('pending','dispatched','received','staged','verified')
      ORDER BY d.created_at,d.id LIMIT ${safeLimit}`.execute(this.database);
```

`server/apps/platform-host/src/composition/register-services.ts:4664-4668`

```ts
        execution: {
          planeKey: "studio",
          scope: "plane",
          principalId: SYSTEM_PRINCIPAL_ID,
        },
```

`server/db/ddl/planes/studio/publication/10_rls.sql:1-7`

```sql
ALTER TABLE publication.release ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication.release FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON publication.release
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
```

`server/db/ddl/common/shared/07_functions.sql:433-437`

```sql
CREATE OR REPLACE FUNCTION shared.current_tenant_id_soft()
...
    SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
```

Why it is wrong: `listRecoverableDeployments` joins `publication.release`, which carries FORCE RLS and only a
tenant policy. The caller is the scheduled `RECOVER_STALLED_PUBLICATIONS_JOB`, declared `scope: "plane"` with no
`tenantId`; the job runtime only sets `tenantId` from the execution coordinate
(`server/packages/runtime/jobs/src/bullmq-job-runtime.ts:318-326`), and nothing else stamps a session tenant
(`createPostgresPool` in `server/packages/adapters/database/core/src/pool.ts:45-53` sets no `options`).
With the GUC unset, `current_tenant_id_soft()` is NULL and `tenant_id = NULL` is never true, so the join returns
zero rows for every plane. The handler then reports success
(`publication-jobs.ts:220-236`: `return { status: "completed", output: { recovered: deployments.length } }`) and the
metric `publication_operations_total{outcome="reenqueued"}` counts 0. The same blind read is used by
`KyselyPublicationAuthorityWork.recoverStalled` (`kysely-publication-authority-work.ts:699-719`). A second layer is
broken too: even if a deployment were listed, the apply job would run with no tenant context
(`tenant-orchestrator.ts:30`: `if (!context?.tenantId) return super.deploy(deploymentId);`), and `getDeployment`
also joins `publication.release` (`kysely-authority-repository.ts:191`), so it returns null and the orchestrator
throws `DEPLOYMENT_NOT_AVAILABLE`.

Consequence on the Country route: if a Country apply dies between dispatch and activation (worker restart, DB
blip after the 5 apply attempts are exhausted), nothing re-drives it. `metadata.reference.country`'s
`release_activation_head` stays on the previous release for ever, the three `.dev.athyper.test` apps keep serving
the old descriptor, and the only surface that says "0 recovered" is a success counter. The only working recovery
is the operator-only script `server/apps/platform-host/src/scripts/recover-dev-publication.ts`, which does set a
tenant context (line 33) and validates the plane (line 40).

Fix: give the recovery job a durable tenant coordinate — either enumerate the authority tenants and enqueue one
apply job per `(tenantId, deploymentId)` with `scope: "tenant"` (so `TenantPublicationOrchestrator` opens the
stamped transaction), or replace `listRecoverableDeployments` with a SECURITY DEFINER function that returns the
deployments plus their `publication.release.tenant_id` and is the only read path. Do not simply widen RLS.
Make the handler fail when the candidate count is 0 while heads exist for the same publication keys, so a no-op
recovery is visible instead of reported as success.

Confidence: verified (RLS policy text, the missing coordinate, the job registration, and both joins read).

### F2 — HIGH — Permanent SQL rejections are classified transient, so the publication DLQ never sees them

`server/packages/services/publication/src/publication-orchestrator.ts:221-243`

```ts
export function classifyPublicationFailure(
  error: unknown,
  step: PublicationOrchestrationStep,
): PublicationOrchestrationError {
  if (error instanceof PublicationOrchestrationError) return error;
  const code = errorCode(error);
  if (CONFLICT_CODES.has(code)) return conflict(code, step, error);
  if (
    PERMANENT_CODES.has(code) ||
    Reflect.get(asObject(error), "retryable") === false
  ) {
    return permanent(code, step, error);
  }
  return new PublicationOrchestrationError(
    "transient",
    ...
```

`server/packages/services/publication/src/publication-orchestrator.ts:304-311`

```ts
function errorCode(error: unknown): string {
  const candidate = Reflect.get(asObject(error), "code");
  if (typeof candidate === "string" && candidate.length > 0)
    return safeCode(candidate);
```

`server/packages/services/publication/src/publication-orchestrator.ts:196-203`

```ts
    } catch (error) {
      const failure = classifyPublicationFailure(error, currentStep);
      if (failure.category === "permanent" && authorityStatus !== "activated") {
        await this.authority.transitionDeployment({
          deploymentId,
          status: "failed",
```

`server/packages/services/publication/src/kysely-publication-operations-repository.ts:55`

```ts
function deadLetterSelect(...){return sql<Row>`SELECT ... FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE d.status='failed' AND r.tenant_id=${tenantId}::uuid ...
```

Why it is wrong: every rejection raised by the SQL projection/activation layer is raised with a PostgreSQL
SQLSTATE (`server/db/ddl/common/runtime_meta/07_functions.sql:206-217` `ENTITY_PROJECTION_PLANE_INVALID`/`..._MISMATCH`,
`:217` `ENTITY_PROJECTION_COORDINATE_MISMATCH` with `ERRCODE='check_violation'`, `:306` `APPLIED_RELEASE_PAYLOAD_PLANE_MISMATCH`,
`:404` `RELEASE_PREDECESSOR_CHANGED` and `:408` `RELEASE_SEQUENCE_NOT_FORWARD` with
`ERRCODE='object_not_in_prerequisite_state'`, `:200-201`/`:242`/`:266` idempotency conflicts with
`ERRCODE='unique_violation'`). Nothing translates SQLSTATE into the publication vocabulary: the only
constraint-code handling in the whole publication service is
`entity-definition-routes.ts:371-374` (`error["code"] === "23505"`). `errorCode()` therefore reads `"23514"` /
`"55000"` / `"23505"`, which is in neither `PERMANENT_CODES` (`publication-orchestrator.ts:24-39`) nor
`CONFLICT_CODES` (`:41-47`), so `classifyPublicationFailure` falls through to `"transient"`. Two consequences
follow from lines 196-203: (a) `authority.transitionDeployment({status:'failed'})` is never called, so
`publication.deployment.status` stays `dispatched`/`staged`/`verified` and the DLQ query
(`WHERE d.status='failed'`) and the replay route never see the failure; (b) the apply job is retried the full 5
attempts (`publication-jobs.ts:246-263`) for a deterministic rejection. The same hole covers the `conflict`
category: line 197 only acts on `permanent`, and conflicts are `retryable === false`
(`:61`: `this.retryable = category === "transient"`), so the job dead-letters immediately while the deployment row
stays untouched and invisible to the DLQ. Note `CONFLICT_CODES` contains `RELEASE_SEQUENCE_NOT_FORWARD`, but that
code only ever exists as a SQL `RAISE` (SQLSTATE `55000`), so the TypeScript set can never match it.

Consequence on the Country route: a Country release that is rejected for a deterministic reason (for example a
`metadata.reference.country` payload whose plane/coordinates disagree, or an activation that arrives with the
wrong successor pin) is retried five times and then disappears: the job dead-letters with
`error_code='23514'`/`'55000'`, and the operator-facing publication DLQ
(`/api/publication/operations/dead-letters`) and its replay route show nothing. The head stays wherever it was,
so the route keeps serving the previous Country descriptor with no recorded reason.

Fix: map SQLSTATE + the `RAISE` message (or a dedicated `failure_code` column) back to the publication error
vocabulary before classification — the SQL already puts stable codes in the message and in
`applied_release.failure_code`; a `23514`/`55000`/`23505` mapping that parses the leading code token, plus adding
`ENTITY_PROJECTION_*`, `APPLIED_RELEASE_PAYLOAD_*`, `*_IDEMPOTENCY_CONFLICT`, `RELEASE_PREDECESSOR_*` to
`PERMANENT_CODES`, is the minimal change. Also transition conflicts to `failed` (or record them) so the DLQ is the
single operator surface.

Confidence: verified for the classification path and the DLQ source; the pg/no-translation mechanism is read from
source, not executed against a database in this session.

### F3 — MEDIUM — Rollback has no resource or tenant scope at any layer, and its target is a global head

`server/packages/services/publication/src/publication-routes.ts:121-133`

```ts
  registerContractRoute(application, contracts.rollback, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.rollback");
      if (!context) return;
      const plane = requiredPlane(request.body);
      const targetAppliedReleaseId = uuid(requiredString(request.body, "targetAppliedReleaseId"));
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const publicationKey=String(request.params["key"]),reason=requiredString(request.body,"reason");
```

`server/packages/services/publication/src/publication-jobs.ts:106-133`

```ts
export function createPublicationRollbackHandler(
  repositories: ...,
): JobHandler<...> {
  return {
    async handle(job) {
      const payload = rollbackPayload(job.data);
      const repository = repositories[payload.targetPlane];
      if (!repository) throw permanent("PUBLICATION_TARGET_DISABLED");
      const active = await repository.rollback({
        publicationKey: payload.publicationKey,
        targetAppliedReleaseId: payload.targetAppliedReleaseId,
```

`server/db/ddl/common/runtime_meta/07_functions.sql:451-456`

```sql
    SELECT * INTO v_head FROM runtime_meta.release_activation_head
     WHERE publication_key=p_publication_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_RELEASE_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
    SELECT * INTO v_target FROM runtime_meta.applied_release
     WHERE id=p_target_applied_release_id AND publication_key=p_publication_key FOR UPDATE;
```

This extends the already-known fact (rollback route takes `publicationKey` from the path with a bare permission
code). Two things are additional and verified here:

1. The durable boundary is the job, not the route. `ROLLBACK_PUBLICATION_RELEASE_JOB` is declared `scope: "plane"`
   (`register-services.ts:4638-4648`) and `PublicationRollbackPayload` carries no `tenantId`
   (`publication-jobs.ts:34-40`), so even if the route were fixed to check tenant ownership, the queued job — the
   thing that actually executes `fn_rollback_release` — would still run without any tenant coordinate. The route
   authorizes with no resource either (`requirePermission(options, response, permission)` at `:138` passes no
   `resource`), unlike the Business Partner publish route which passes `{ revisionId }`
   (`entity-definition-routes.ts:239`), so a resource-scoped SoD policy cannot constrain the decision.
2. For Country the affected resource has no tenant coordinate at all: `metadata.reference.country` is a single
   global key (`prepare-release.ts:62`) with one `release_activation_head` row
   (`runtime_meta/03_tables.sql:188-197`, `publication_key` as the primary key), and `fn_rollback_release` matches
   only `publication_key` + `id`. Moving that head changes the descriptor served to every tenant on the plane;
   `fn_active_entity_descriptor` is not tenant-filtered (`runtime_meta/07_functions.sql:502-521`) and the
   compiled-payload reader accepts `payload.tenant_id IS NULL OR payload.tenant_id = <caller>`
   (`runtime-descriptor-repository.ts:85`).

Mitigating controls I found one layer away (this is why the severity is medium, not critical):
`publication.release.rollback` is seeded `system_action/critical` with `requires_mfa = true` and
`requires_sod = true` (`server/db/ddl/planes/studio/authz/14_permission_reference_seed.sql:42`), and the IAM
authorizer enforces both from the catalog (`server/packages/platform/iam/src/permission-authorizer.ts:287-308`:
`mfa_required`, `sod_evidence_required`, `hard_policy_evidence_required`), so the caller must be a highly
privileged, recently-elevated platform principal with passing SoD evidence. The route is still the only
publication route without an ownership check (`tenantRelease`/`tenantDeployment` at
`publication-routes.ts:160-167` are used by every other route).

Fix: pass the rollback target as authorization resource coordinates
(`{ publicationKey, targetAppliedReleaseId, plane }`), carry `tenantId` in `PublicationRollbackPayload`, declare
the rollback job `scope: "tenant"` and execute it through the stamped transaction path, and add an explicit
publication-key/tenant assertion in `KyselyLocalProjectionRepository.rollback` before calling the SQL. Keep the
SQL free of new privileges.

Confidence: verified.

### F4 — MEDIUM — Rolling back any release that carries operation bindings always fails, with an opaque error

`server/db/ddl/common/runtime_meta/07_functions.sql:466-474`

```sql
    v_previous := v_head.applied_release_id;
    PERFORM authz.fn_retire_entity_operation_projection(v_previous,v_activated_at);
    ...
    PERFORM authz.fn_restore_entity_operation_projection(v_target.id,v_activated_at);
```

`server/db/ddl/common/authz/07_functions.sql:1852-1862`

```sql
CREATE OR REPLACE FUNCTION authz.fn_restore_entity_operation_projection(p_applied_release_id uuid,p_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS $$
BEGIN
  -- Historical rows do not record whether retirement came from publication,
  -- revocation or expiry. Never infer permission to republish from that state.
  -- Recover through a reviewed successor compiled against the current head.
  IF EXISTS (SELECT 1 FROM authz.entity_operation_binding
             WHERE applied_release_id=p_applied_release_id) THEN
    RAISE EXCEPTION 'BINDING_RECOVERY_SUCCESSOR_REQUIRED' USING ERRCODE='check_violation';
  END IF;
  RETURN 0;
END; $$;
```

Why it is wrong: `fn_rollback_release` unconditionally calls the restore function, and the restore function raises
whenever the target applied release has binding rows. Country's compiled runtime contract always carries
`operation_scope_bindings`: `lowerNativeRuntimePublication` merges `compileOperationProjection(...)` into the
runtime descriptor (`compilation/native-runtime.ts:46-48`), and the reference profile requires exactly one
permission + tenant scope binding per operation (`contracts/metadata/src/common-reference-permission.ts:31-40`).
Those rows are staged for the applied release by `stageCompiledOperationBindings`
(`kysely-local-projection-repository.ts:162-192`), so the target release always has bindings and
`fn_rollback_release` always raises `BINDING_RECOVERY_SUCCESSOR_REQUIRED` (SQLSTATE `23514`) — the whole rollback
transaction aborts, including the retirement of the previous head. The failure is not classified: the rollback
handler has no `classifyPublicationFailure` wrapping (`publication-jobs.ts:106-149`), so the route returns 500 and
the job burns its 3 attempts and dead-letters; because `publication.deployment.status` is never set to `failed` by
this path, no DLQ row appears.

Design note: the guard's message and the governance check
(`server/db/scripts/checks/ddl/three-plane-model.ts:287` asserts that `fn_rollback_release` calls
`authz.fn_restore_entity_operation_projection`) show this refusal is intended — an entity release is expected to
be recovered by publishing a reviewed successor, not by moving the head backwards. The defect is that the
intended refusal is wired to an operator route that still advertises `202 Accepted` and surfaces the outcome as an
unclassified SQLSTATE instead of the designed code.

Consequence on the Country route: there is no working rollback for a Country descriptor. An operator who needs to
revert Country's published descriptor gets an opaque failure and no publication DLQ record; the only path is a new
successor release. `rehearse-publication-canary.ts` only exercises rollback for Business Partner definition
releases, so it does not catch this.

Fix: either make `fn_rollback_release` skip the restore call and refuse explicitly with
`ROLLBACK_ENTITY_RELEASE_REQUIRES_SUCCESSOR` before touching the head, or keep the SQL guard but (a) pre-check in
`KyselyLocalProjectionRepository.rollback` and return a typed, documented error, and (b) map
`BINDING_RECOVERY_SUCCESSOR_REQUIRED` to a 409 in the route contract and record the attempt so the DLQ/audit is
complete.

Confidence: verified (the call site, the guard, the binding staging path and the reference binding requirement).

### F5 — MEDIUM — The authority-side recovery/acknowledge path is unregistered and swallows a denial

`server/packages/services/publication/src/kysely-publication-authority-work.ts:699-719`

```ts
  async recoverStalled(): Promise<readonly PublicationCoordinatePayload[]> {
    const eligible: PublicationCoordinatePayload[] = [];
    for (const item of await this.options.authority.listRecoverableDeployments(
      200,
    )) {
      try {
        await this.assertActivationApproved(item.deploymentId);
        eligible.push({ ... });
      } catch (error) {
        if (
          (error as Error).message !==
          "ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED"
        )
          throw error;
      }
    }
    return eligible;
  }
```

Why it is wrong: an activation approval denial is caught and treated as "not eligible", so a release whose
authorization approval was refused (or revoked) is silently dropped from recovery and the handler still returns a
successful, empty result (`publication-jobs.ts:206-210`). A denial is a security decision; it must surface. The
method is currently unreachable — `register-services.ts:4749-4758` registers only `COMPILE_PUBLICATION_ARTIFACT_JOB`,
`SIGN_PUBLICATION_ARTIFACT_JOB` and `DISPATCH_PUBLICATION_JOB` from `createPublicationAuthorityHandlers` (created at
`:4711`), and `RECOVER_STALLED_PUBLICATIONS_JOB` is served by `createPublicationRecoveryHandler`
(`register-services.ts:4607-4614`) — so the impact is latent today, and `acknowledge()` at
`kysely-publication-authority-work.ts:696-698` is an empty stub. Combined with F1 this is the second recovery
implementation that reports success while doing nothing.

Consequence on the Country route: none today (unregistered), but if this handler is wired as intended the
revocation of a Country release's approval would look identical to "no work to do".

Fix: delete the unused handler registration path or register it explicitly, and rethrow
`ENTITY_AUTHORIZATION_ACTIVATION_APPROVAL_REQUIRED` as a denial that fails the job (metrics + audit), not as an
empty success.

Confidence: verified for the swallow and the unregistered handlers.

### F6 — LOW — Failure-code vocabularies duplicated across TypeScript and SQL, and already drifted

`server/packages/services/publication/src/publication-orchestrator.ts:24-47` restates the SQL failure vocabulary in
two sets (`PERMANENT_CODES`, `CONFLICT_CODES`). The SQL source of truth is
`server/db/ddl/common/runtime_meta/07_functions.sql:106-145` and `:206-217`, `:295-313`, and it uses different
mechanisms (rejection `failure_code` written to a row vs `RAISE`). The drift is concrete: `CONFLICT_CODES`
contains `RELEASE_SEQUENCE_NOT_FORWARD` and `PERMANENT_CODES` contains `ENTITY_PROJECTION_REQUIRED`, but only
`ENTITY_PROJECTION_REQUIRED` is ever returned to TypeScript through `failure_code`
(`kysely-local-projection-repository.ts:508-524`); `RELEASE_SEQUENCE_NOT_FORWARD` only exists as a SQL `RAISE`
and can never match the set (see F2). This is a duplication/naming defect, not a separate bug: any future SQL code
must be added in three places to be classified correctly.

Fix: define the code list once in `@athyper/server-contract-publication` (next to `PublicationErrorCode`) and
derive both the SQL `failure_code` writes and the classifier sets from it; classify by `(code, source)` instead of
maintaining a second vocabulary.

Confidence: verified.

### F7 — LOW — Dead or unmounted publication surfaces (dead code, not bugs)

Verified by grepping the whole repository for importers outside the package's own tests:

- `registerBusinessPartnerDefinitionRoutes` (`entity-definition-routes.ts:111`) and
  `registerBusinessPartnerCaseContractRoutes` (`entity-case-contract-routes.ts:95`) have no production caller, so
  `BusinessPartnerDefinitionService`, `BusinessPartnerCaseContractService`, their publish/self-publish checks and
  their HTTP surface are unreachable.
- `LocalBusinessPartnerDefinitionConsumer` / `LocalMeshBusinessPartnerDefinitionConsumer`
  (`entity-definition-consumer.ts:13,150`) are only referenced by tests, so
  `findActiveBusinessPartnerDefinition` (`kysely-local-projection-repository.ts:254-305`) and its
  `ATHYPER_LOCAL_PREVIEW_ROOT` baseline fallback are not on any runtime path.
- `adoptEntityPair` / `entityAdoptionTransaction` (`coordinated-entity-adoption.ts:48,84`) are only used by their
  own test, so `entity-adoption-plan.ts` is unwired.
- `ReleasePromotionService` / `evaluatePromotion` (`release-promotion.ts:103-355`) have no production importer.
- `createPublicationRuntimeQualification` (`runtime-qualification.ts:8`) is only used by its own test;
  the live wiring uses `createEntityAuthorizationRuntimeRegistry` with `localGraphRuntimeQualifiers`.
- `KyselyPublicationAuthorityWork.recoverStalled` / `acknowledge` (see F5) are unregistered.

Impact: unreachable code is still maintained and reviewed as if it were live, and (as with the `USING(true)`
rollback path and the preview fallback) it hides real design questions. Fix: delete or explicitly mount; if the
Business Partner definition pipeline is a planned dev feature, mount it behind the same `PUBLICATION_WORKLOAD_DEV_ONLY`
gate as the rest of the pipeline so the dead path becomes testable end to end.

Confidence: verified (grep for importers).

## Verified healthy (do not churn)

- **Authors cannot inject security fields into the compiled descriptor.** For `compiled_entity_runtime`, the
  descriptor is not author input: `lower()` recomputes it from the persisted approved graph
  (`composition/shared/publication/compiled-runtime.ts:102-122`, `compiled-runtime.ts:51-76`), and
  `qualifyRuntimePublication` re-derives the whole projection at compile, sign and dispatch and requires hash
  equality with the persisted approval plus a phase receipt (`compilation/compiled-runtime.ts:78-119`, especially
  `:117` `COMPILED_PUBLICATION_QUALIFICATION_CHANGED`). `authorizationMode` is hard-coded to `bound_operation` by
  the trusted compiler (`platform/metadata/src/native-runtime-projection.ts:202`), so `permission_only`
  (which skips binding checks at runtime) cannot be authored.
- **Legacy `entity_runtime` authorization cannot be overridden either.** The signed profile and runtime must
  hash-equal the authoring contract's (`entity-authorization-compiler.ts:140-149`), permission codes are resolved
  against the live target catalog and rejected when unresolved or scope-incompatible (`:184-245`), operation
  coverage is exact (`:150-183`), and `parseEntityAuthorizationProfile` rejects unknown properties, non-boolean
  `requiresPreflight` and incomplete field coverage (`contracts/metadata/src/entity-authorization.ts:74-89`,
  `:141-168`, `:319-341`). The loader repeats the authored↔descriptor equality and re-verifies the contract
  signature (`publication-artifact-loader.ts:312-369`).
- **Operation bindings are written in the same transaction as the activation head on the live path.**
  `TenantPublicationOrchestrator.deploy` opens one transaction per database and constructs the repositories over
  the transaction handles (`tenant-orchestrator.ts:35-46`), so `fn_stage_release_projection`,
  `stageCompiledOperationBindings`, `fn_verify_release`, `fn_activate_release` and
  `authz.fn_activate_entity_operation_projection` either all commit or all roll back.
- **Cross-plane projection writes are blocked.** `fn_stage_entity_projection` and
  `fn_stage_applied_release_payload` compare `current_setting('app.database_plane')` with the projection plane
  (`runtime_meta/07_functions.sql:209-212`, `:304-307`), `fn_verify_release` compares it with the descriptor plane
  (`:126-129`), and the loader/staging compare the artifact plane with the deployment plane
  (`publication-artifact-loader.ts:51-52`, `kysely-local-projection-repository.ts:361-368`).
- **Every publication HTTP route except rollback is ownership-scoped**: `tenantRelease`/`tenantDeployment`
  (`publication-routes.ts:160-167`) for release/deployment/publish/retry, and explicit `r.tenant_id=${tenantId}`
  in the operations SQL (`kysely-publication-operations-repository.ts:23,35,45,49,55`).
- **Compile sources are tenant-gated in SQL** with `pr.tenant_id=shared.current_tenant_id()`:
  `publication/14_compiled_entity_runtime.sql:19`, `metadata/12_baseline_import.sql:280`,
  `metadata/13_authorization_successor.sql:104`, `metadata/14_runtime_restoration.sql:79`; the v1 function is
  also the maker/checker + approved-snapshot gate.
- **Runtime descriptor reads are tenant-predicated and never fall back to native rows on compiled-only planes**:
  `runtime-descriptor-repository.ts:44,85,112,136`, and `entity-runtime/metadata.ts:43-51` selects the compiled
  reader without a catch-all fallback.
- **Immutability and ordering are enforced in the database**: contract/descriptor content immutability and status
  transitions (`runtime_meta/08_triggers.sql:24-92`), append-only activation events (`:20-22`), immutable applied
  release payloads (`:94-101`), the signed baseline precondition on the head (`12_baseline_precondition.sql:2-46`),
  and the successor compare-and-swap inside `fn_activate_release` under an advisory lock plus `FOR UPDATE`
  (`07_functions.sql:370-406`).
- **Dev-only gates hold**: the compiled publication adapter requires `environment === "local"`,
  `ATHYPER_ENV=local`, `ATHYPER_DEV_PRESET=devfull`, `dev.athyper.test`
  (`workload-configuration.ts:11-12`, `compiled-runtime.ts:39-40`), the workload route compares both credentials in
  constant time over sha256 (`workload-routes.ts:34-38`), and the local preview root additionally requires
  `ATHYPER_LOCAL_WORKSPACE=1` (`shared/preview/environment.ts:4-13`).
- **The authenticated entity release review re-validates authority after evidence I/O**
  (`authenticated-entity-release-review.ts:97-99`) and refuses packets that claim activation authority or carry
  grant changes (`:37-38`, `entity-authorization-publication-review.ts:23`).

## Checked but not a defect

- Apply/rollback jobs trust `payload.targetPlane` to choose the target database, and `deploy` never compares it
  with the authoritative `deployment.targetPlane` (`publication-jobs.ts:65,123`;
  `publication-orchestrator.ts:95-132`). The write is nonetheless blocked: the artifact plane must equal the
  deployment plane (`kysely-local-projection-repository.ts:361-368`) and the SQL refuses a mismatch with the
  database's own `app.database_plane` (see healthy section). The operator recovery script additionally asserts
  `deployment.targetPlane === "neon"` (`scripts/recover-dev-publication.ts:40`).
- `fn_verify_release`'s projection requirement is keyed on `publication_key LIKE 'metadata.entity.%'`
  (`runtime_meta/07_functions.sql:106-113`), so for `metadata.reference.*` (Country), `metadata.notifications.*`
  and `metadata.collection.*` legacy `entity_runtime` releases the descriptor is not required, and
  `fn_activate_release` skips contract/descriptor work when no descriptor row exists (`:376-382`). Not reportable
  today: the only production staging caller always passes a non-null projection built by `projectionJson`
  (`kysely-local-projection-repository.ts:113`, `:388-475`) and it is inserted in the same function call as the
  applied release (`07_functions.sql:344-353`), so a projection-less release cannot be produced by the pipeline.
  Worth hardening, because `fn_stage_release_projection`'s `p_projection` still defaults to NULL and the function is
  granted to the applier (`11_grants.sql:104`).
- `fn_activate_release`'s predecessor assertion hardcodes `'environment'='local' AND 'instance'='dev'`
  (`07_functions.sql:402`), so compiled successors cannot activate outside dev. Consistent with the dev-only gate
  on the compiled adapter; not a bug for the `.dev.athyper.test` route.
- `ReleasePromotionService.promote` swallows per-target errors (`release-promotion.ts:336-340`), but the
  authority/revocation re-check happens before the `try` (`:269-271`), and the receipt is still `incomplete`
  rather than `activated`.
- The `USING(true)` seed-owner policies on `runtime_meta` tables (known fact) do give the function owner
  unrestricted reads, but the compensating explicit predicates exist where it matters:
  `register-services.ts:4391-4402` compares the returned `tenant_id` with the entity release tenant before
  accepting an active descriptor, and the runtime readers filter on `payload.tenant_id`/`c.tenant_id`.
- `fn_activate_release` takes its advisory lock on the candidate's publication key
  (`07_functions.sql:370`); staging for the compiled path does not take that lock. Serialization is still
  guaranteed at activation (same key) and by `applied_release` unique keys plus the `FOR UPDATE` head lock.
- `kysely-local-projection-repository.activate` re-reads the stored payload and re-runs
  `assertOperationProjection` before activating (`:141-153`), which is the required re-admission on retry; payloads
  cannot change because the table is immutable by trigger.

## Confirmed known facts (not re-reported as new findings)

- `runtime_meta.release_activation_head` and `runtime_meta.applied_release` have no `tenant_id`; both are FORCE
  RLS with only `USING(true)` policies for `CURRENT_USER` and `athyper_projection_applier`
  (`runtime_meta/03_tables.sql:163-197`, `10_rls.sql:44-65`). Confirmed. For Country this means the head is a
  single global row, since the publication key itself carries no tenant (`prepare-release.ts:62`).
- `fn_rollback_release` matches only `publication_key` + `id` with no tenant predicate
  (`runtime_meta/07_functions.sql:451-456`). Confirmed.
- The HTTP rollback route takes `publicationKey` from the URL path with a bare permission code and no resource
  scoping (`publication-routes.ts:121-129`). Confirmed, and extended in F3 (the durable job is also unscoped) and
  narrowed in impact (MFA + SoD + critical-risk policy are enforced by
  `platform/iam/src/permission-authorizer.ts:287-308`).

## Coverage limits

- No database was executed against in this session; all SQL conclusions are from DDL text plus documented
  PostgreSQL/node-postgres semantics (SQLSTATE surfacing on `error.code`, RLS `NULL` predicate semantics,
  `FORCE ROW LEVEL SECURITY` applying to the owner).
- `server/packages/services/publication/src/__tests__/**` and the SQL check scripts were read only as evidence of
  intent; no test was run.
- Business Partner definition/case-contract compilation was traced only far enough to establish that its routes
  are unmounted in the production composition (F7); its internal logic was not audited in depth.
