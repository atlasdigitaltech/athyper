# Frappe vs Athyper: Post-Improvement Technical Architecture Comparison

**Assessment date:** 2026-07-15  
**Athyper source:** Git `6ca7aac9f2ff150400dec8b739af3e96e96eb4e1` plus eight uncommitted environment/compose changes  
**Frappe source:** local extracted source declaring `frappe.__version__ = 17.0.0-dev`  
**Focus:** CRUD, login/session/IAM, metadata execution, cache, lifecycle, attachments, realtime, and production performance

## 1. Executive verdict

Athyper's framework architecture has improved materially since the first comparison. It now has the core components of a production-grade compiled execution platform:

- one frozen `VerifiedRequestContext` contract at the records boundary;
- an immutable `ExecutionDescriptorV1`;
- request-local, process-local, Redis, and PostgreSQL descriptor layers;
- exact generation-based invalidation and single-flight cold loads;
- a keyset-based `EntityQueryService` with descriptor-aware count/page caching;
- a transport-independent `EntityMutationService`;
- optimistic concurrency, idempotency, audit, and outbox writes in one transaction;
- a lifecycle transaction owner with row locking and durable hooks;
- presigned attachment uploads, quarantine, scanning, and object storage;
- shared-process Redis SSE fan-out with durable cursor replay;
- performance budgets, CI policies, rollout controls, and retirement governance.

However, this is currently an **implemented convergence architecture**, not yet a fully converged or performance-qualified production runtime:

- only the descriptor route is recorded as full rollout;
- list and detail are controlled pilots;
- create, patch, delete, and aggregate remain in shadow validation;
- production/staging examples leave query pilots empty, Neon query mode off, and the mutation kernel in shadow validation;
- the checked-in qualification directory contains an example report but not measured evidence;
- the blocking release-gate command fails because the required artifacts are absent;
- important compatibility and identity-resolution paths remain active.

Frappe therefore retains the current advantage in **uniformity and likely simple-CRUD baseline latency**. Athyper now has the stronger target architecture for multi-tenant security, concurrency, metadata governance, asynchronous processing, and high-I/O workloads, but it must close the promotion blockers and complete rollout before that advantage exists on the default request path.

No benchmark winner is declared. The repository contains targets, synthetic/example values, and test scenarios, but no identical Frappe-versus-Athyper measurement or complete Athyper qualification result.

## 2. Change assessment since the first report

| Earlier Athyper concern | Implemented change | Current state | Assessment |
|---|---|---|---|
| Repeated identity/context work | Canonical frozen request-context contract and records-router boundary | Canonical generic handlers use it; 173 legacy identity-boundary matches remain | Strong foundation, incomplete convergence |
| Repeated metadata interpretation | Compiled execution descriptor with deterministic hash and activation validation | Provider is live and descriptor route is marked full rollout | Major improvement |
| Metadata cache SQL on warm hit | L0/L1/L2/L3 provider with generation vector and local invalidation subscription | Warm descriptor can avoid metadata SQL | Major improvement, Redis ACL must be corrected |
| Offset pagination and exact count | Keyset service, signed descriptor-bound cursor, count modes, cached count/page | Pilot-only and explicitly requested with `query_v1`; complex queries use legacy path | Good design, limited coverage |
| Fragmented mutations | `EntityMutationService`, handler registries, durable transaction, rollout policy | Two default pilot entities; default stage is shadow validation | Strong kernel, not authoritative yet |
| Non-durable side effects | Transactional audit/outbox in mutation kernel | Governance inventory still lists remaining post-commit effects | Improved, migration incomplete |
| Lifecycle fragmentation | Single lifecycle transaction owner and command registry | Metadata-controlled rollout; legacy branches remain | Correctness improved, transaction remains broad |
| Redis workload interference | Dedicated BullMQ URL and topology policy | Compose fallback can silently reuse main Redis; cache/session/realtime still share the primary plane | Partial isolation |
| Attachment API-worker pressure | Presigned initiate/complete flow plus quarantine | Legacy JSON/multipart paths remain; hardening flags default false | Good additive path, incomplete retirement |
| SSE database polling | One Redis subscriber per process and durable cursor drain | No periodic durable drain is scheduled after Redis degradation | Better normal path, degraded-mode gap |
| No performance governance | Telemetry, route budgets, k6 scenarios, blocking policies | Real qualification artifacts are missing | Governance exists; evidence does not |

## 3. Updated architectural shapes

### 3.1 Frappe

```text
request
  -> site + session/auth context
  -> DocType Meta and permission resolution
  -> Document or database-query kernel
  -> one application database
  -> Redis/request-local cache
  -> hooks, RQ jobs, realtime, File document
```

Frappe remains a cohesive metadata-driven application kernel. `DocType`, `Meta`, `Document`, permissions, child tables, workflow, and `File` are parts of one runtime. Generic creation and editing flow through [`frappe/model/document.py`](../../../frappe-develop/frappe-develop/frappe/model/document.py); list queries flow through [`frappe/model/db_query.py`](../../../frappe-develop/frappe-develop/frappe/model/db_query.py); metadata is cached by [`frappe/model/meta.py`](../../../frappe-develop/frappe-develop/frappe/model/meta.py).

### 3.2 Athyper target path now present in code

```text
Next.js plane / API client
  -> Keycloak token and BFF session
  -> Express authenticated boundary
  -> VerifiedRequestContext
  -> ExecutionDescriptorProvider
       L0 request memo
       L1 bounded process cache
       L2 Redis content-addressed descriptor
       L3 snapshot.entity_compiled
  -> EntityQueryService or EntityMutationService
  -> PostgreSQL + RLS + short transaction
  -> audit + idempotency + outbox
  -> workers / cache generation / SSE / integrations
```

The contracts exist in [`verified-request-context.ts`](../../server/packages/services/iam/permission-context/verified-request-context.ts), [`contract.ts`](../../server/packages/services/metadata/src/execution-descriptor/contract.ts), [`provider.ts`](../../server/packages/services/metadata/src/execution-descriptor/provider.ts), [`entity-query.service.ts`](../../server/packages/services/records/query/entity-query.service.ts), and [`entity-mutation.service.ts`](../../server/packages/services/records/mutation/entity-mutation.service.ts).

### 3.3 Athyper effective default path

```text
authenticated boundary
  -> records-level verified context
  -> descriptor provider: active
  -> read service: only enabled pilot + query_v1-compatible request
       otherwise legacy records route
  -> mutation service: only configured pilot
       shadow stage validates new path, then legacy path writes
  -> lifecycle: metadata rollout selects orchestrator or legacy behavior
```

This distinction between target and effective path is essential when interpreting performance.

## 4. Login, session, and IAM

### Frappe

Frappe's built-in login, user model, session, permissions, and application runtime are colocated. An opaque session ID is stored in Redis and SQL; session resume checks Redis first and falls back to SQL ([`frappe/sessions.py`](../../../frappe-develop/frappe-develop/frappe/sessions.py)). This minimizes service boundaries and makes ordinary session-backed requests comparatively direct.

The permission system combines roles, DocType permissions, permission levels, ownership, user permissions, sharing, and controller hooks. Document and list paths call the same framework permission model.

### Athyper after the changes

Athyper remains stronger for enterprise IAM:

- Keycloak OIDC and plane/realm separation;
- token issuer/client/tenant cross-checks;
- principal binding and active-principal checks;
- `auth_epoch` and permission `profileHash`;
- effective permissions, company/legal-entity scope, and PostgreSQL RLS;
- immutable request context passed into new query and mutation services.

The records router now verifies the token once where possible, resolves binding and `auth_epoch` in one joined principal query, composes the effective permission context, freezes the canonical object, stores it in `res.locals`, and binds it to `AsyncLocalStorage` ([`routes/index.ts`](../../server/packages/services/records/routes/index.ts), [`route-helpers.ts`](../../server/packages/services/shared/route-helpers.ts), [`request-context.ts`](../../server/src/kernel/request-context.ts)).

### Remaining IAM/context cost

The convergence is not repository-wide. The governance baseline still permits 173 tracked occurrences across records route files: 58 bearer verifications, 56 tenant resolutions, 28 direct organization-header reads, and 31 principal-resolution calls ([`records-identity-boundary.json`](../../config/governance/records-identity-boundary.json)). The policy is a no-regression ratchet, not a zero-legacy guarantee.

Examples still rebuilding identity include the reference-label route, record SSE route, line-source route, and attachment routes. Attachments use the shared verified resolver, but they verify the bearer token and resolve the context again inside their own route surface ([`attachments.route.ts`](../../server/packages/services/documents/routes/attachments.route.ts)).

**Comparison:** Frappe is still cheaper and more uniform for built-in login/session CRUD. Athyper has substantially stronger enterprise identity and tenant guarantees, but must finish context propagation to stop paying for them repeatedly.

## 5. Metadata-driven execution

### Frappe Meta

`frappe.get_meta()` builds a runtime `Meta` document from DocType, fields, custom fields, property setters, permissions, links, and actions, then caches it. Metadata and controller conventions directly drive storage, forms, permissions, and lifecycle.

### Athyper execution descriptor

Athyper now compiles an immutable internal descriptor containing:

- entity/version/compiled identity hashes;
- physical schema, table, primary key, tenant column, and row-version column;
- field storage/coercion/read/write rules;
- projection, filtering, search, default sort, and stable tie breaker;
- create, mutation, concurrency, and deletion plans;
- relations and owned child handlers;
- lifecycle states and editability;
- policy and handler references.

The compiler produces a deterministic hash and validates physical identifiers and registered execution references before activation ([`compiler.ts`](../../server/packages/services/metadata/src/execution-descriptor/compiler.ts), [`validation.ts`](../../server/packages/services/metadata/src/execution-descriptor/validation.ts)).

The provider adds:

- request-local promise memoization;
- bounded L1 cache with TTL and LRU-like touch behavior;
- content-addressed Redis L2 entries;
- PostgreSQL L3 loading;
- exact generation vectors;
- 100-request process-local single-flight behavior;
- stale-fill checks before admitting L1/L2 data;
- Redis-degraded L3 fallback.

This is the largest architectural improvement over the original Athyper snapshot. It converts metadata from repeatedly interpreted control data into a reusable execution plan.

### Remaining descriptor considerations

- The API uses a one-second local generation cache. A miss reads five Redis generation keys; the provider currently performs separate `GET` calls rather than `MGET`/pipeline.
- The public compiled-entity compatibility route remains 1,229 lines and still owns a substantial cold-build surface, although warm validation now uses the execution provider rather than a PostgreSQL fingerprint query.
- The new Redis key and channel permissions are not present in the deployed `app` ACL, discussed in section 11.

**Comparison:** Athyper now exceeds Frappe in metadata governance, deterministic versioning, activation validation, and cross-process cache correctness. Frappe remains simpler because its live `Meta` and `Document` are one native runtime rather than a compiled control plane feeding several services.

## 6. Read and list CRUD architecture

### 6.1 Frappe

Frappe's generic list API delegates to the permission-aware database-query layer. It supports field selection, filters, order, offset, and page length. Its standard pagination is offset-based (`LIMIT ... OFFSET ...`) ([`frappe/client.py`](../../../frappe-develop/frappe-develop/frappe/client.py), [`frappe/model/db_query.py`](../../../frappe-develop/frappe-develop/frappe/model/db_query.py)).

Strengths:

- mature permission integration;
- low abstraction distance from request to query;
- uniform behavior across DocTypes;
- metadata and permission caches are close to the query runtime.

Weaknesses:

- deep offset pages become increasingly expensive;
- advanced enrichment can still add work;
- shared runtime conventions are less explicit than Athyper's compiled plan.

### 6.2 Athyper keyset query service

The new query service provides:

- signed cursors bound to entity, descriptor hash, sort, and values;
- tenant and verified organization/company/legal-entity predicates;
- descriptor-approved projection, filters, search, and sorting;
- stable primary-key tie breaking;
- `none`, `cached`, `approximate`, and `exact` count modes;
- 120-second count cache and 45-second result cache;
- cache keys containing tenant, generation, scope, security hash, descriptor hash, filters, sort, search, cursor, and page size;
- batched reference hydration.

The first pilot is `company_code`, supported by `(tenant_id, code, id)` index order ([`phase-2-company-code-read-pilot.md`](./phase-2-company-code-read-pilot.md), [`04_indexes.sql`](../../server/db/ddl/master/04_indexes.sql)).

### 6.3 Current coverage and fallback

The new path runs only when all of the following are true:

- an entity is included in `ENTITY_QUERY_V1_PILOTS`;
- a cursor secret is configured;
- the caller sends `query_v1=true`;
- facets, grouping, parent, and through-entity modes are absent;
- unsupported legacy filter operators are absent.

All other requests enter the 10,169-line legacy records route. Production and staging examples currently leave the pilot list empty and Neon mode off; local defaults enable only the company-code shadow comparison through the BFF environment changes.

### 6.4 Read-authorization promotion blocker

The new list/detail branch obtains a complete `VerifiedRequestContext`, but the `EntityQueryService` only asserts that tenant, principal, and profile hash are present. It applies tenant/scope predicates and descriptor `dataPolicy` masking, but it does not visibly require an entity read operation permission from `context.permissions.allowed` before executing. The descriptor read plan also has no compiled read permission binding.

The branch occurs before the legacy route's permission work, and the query-service unit fixture succeeds with an empty permission object ([`entity-query.service.test.ts`](../../server/packages/services/records/query/__tests__/entity-query.service.test.ts)). RLS protects tenant rows, but it is not a substitute for application operation or field-level authorization.

Treat this as a **promotion blocker unless an upstream enforcement point can be demonstrated with a deny-path integration test**. Add a principal-specific read overlay containing allowed operation, row scope, and field mask, and require it in the query command.

### 6.5 Performance implication

After authorization is fixed and the pilot is promoted, Athyper should outperform offset pagination on deep, indexed pages and can avoid database work on warm page-cache hits. Until then, Frappe retains the safer and more universally applied generic-read architecture.

## 7. Create, update, and delete architecture

### 7.1 Frappe Document kernel

Frappe uses one `Document` lifecycle for nearly every DocType:

```text
insert/save/delete
  -> permissions
  -> defaults/naming
  -> validation and controller hooks
  -> child persistence
  -> versioning and notifications
  -> commit managed by request/job boundary
```

Applications customize hooks without normally replacing the transaction skeleton. This uniformity remains Frappe's strongest CRUD property.

### 7.2 Athyper mutation kernel

The new service is independent of Express and implements typed create, patch, delete, transition, and aggregate commands. Generic create/patch/delete now have a consistent pipeline:

```text
VerifiedRequestContext
  -> descriptor and capability manifest
  -> surface/permission/field validation
  -> idempotency and concurrency inputs
  -> transaction + RLS actor
  -> idempotency claim
  -> row lock and version/lease recheck
  -> handler hooks and persistence
  -> audit + outbox
  -> idempotency completion
  -> commit
  -> optional reference enrichment
```

The mutation permission gate explicitly checks the compiled operation permission against the immutable allowed-permission set. Strict input mode rejects non-writable fields instead of silently accepting them. Document entities fail closed from simple generic mutation and must use aggregate/lifecycle commands.

The durable transaction helper sets tenant/principal database context and ensures the record, audit, idempotency, and outbox writes roll back together ([`durable-mutation-transaction.ts`](../../server/packages/services/shared/durable-mutation-transaction.ts), [`outbox.ts`](../../server/packages/services/shared/outbox.ts)).

### 7.3 Current rollout behavior

The code defaults the canonical-entity set to `company_code,cost_center` when `ENTITY_MUTATION_SERVICE_PILOTS` is absent. It then resolves a stage:

- `shadow_validation`;
- `dual_read_comparison`;
- `internal_tenants`;
- `small_external_cohort`;
- `full_rollout`.

In shadow validation, the new service validates but the legacy route remains the authoritative writer. This can be slower than the original path because descriptor resolution and validation are added before the legacy mutation. The production/staging examples explicitly set the stage to shadow and leave rollout cohorts empty.

The governance inventory records create/patch/delete as shadow validation and aggregate as shadow validation ([`meta-entity-routes.json`](../../config/governance/meta-entity-routes.json)). No compatibility route has retirement evidence yet ([`meta-entity-retirement-evidence.json`](../../config/governance/meta-entity-retirement-evidence.json)).

### 7.4 Remaining mutation fragmentation

The new service is 1,282 lines, while the legacy records route is still 10,169 lines and the action dispatcher 1,382 lines. Entity-specific defaults, document workspace behavior, line/child registries, copy flows, and special domain operations remain distributed.

The explicit side-effect inventory still lists post-commit classification/search work, best-effort idempotency, collaboration activity publication, attachment access audit, and object/preview cleanup awaiting migration ([`post-commit-durable-side-effects.json`](../../config/governance/post-commit-durable-side-effects.json)).

**Comparison:** Athyper's new mutation kernel is stronger than Frappe on explicit idempotency, version conflict handling, leases, RLS, and outbox durability. Frappe is still stronger on universal adoption and extension simplicity.

## 8. Lifecycle architecture

### Frappe

Every document has the universal `docstatus` base invariant: draft, submitted, or cancelled. Optional workflows add named states and transition rules while mapping back to that invariant. Submit and cancel reuse the same Document save kernel.

### Athyper after the changes

The new lifecycle orchestrator:

- locks the row;
- rechecks current state and optional row version;
- resolves the active transition;
- validates reason/action rules and permission;
- executes required before hooks;
- applies the state mutation and increments version;
- executes after hooks;
- synchronizes lifecycle instance state;
- writes durable transition information in the same transaction.

This is richer than Frappe's base state model and better suited to finance/procurement lifecycles. The single transaction owner prevents required hook failure from leaving the state partially changed ([`execute-lifecycle-transition.ts`](../../server/packages/services/records/lifecycle/execute-lifecycle-transition.ts)).

Remaining concerns:

- rollout is metadata-controlled and legacy transitions still exist;
- entity table and transition metadata are queried after the transaction opens;
- some preparation and permission work also occurs while holding the row transaction;
- action dispatch still contains parallel entity-specific transition logic.

Move descriptor, transition plan, permission overlay, and non-locking preparation before the transaction. Inside the transaction, retain row lock, recheck, durable business writes, lifecycle log, audit, and outbox.

## 9. Attachments

### Frappe

Frappe attachments are `File` documents linked to a parent doctype/name/field. The controller handles permissions, public/private paths, content hashing, duplicate reuse, and file lifecycle. Local site storage is the default, with hooks for alternatives ([`file.py`](../../../frappe-develop/frappe-develop/frappe/core/doctype/file/file.py)).

### Athyper after the changes

Athyper has the stronger governed-content architecture:

- S3/MinIO object bytes and PostgreSQL metadata/linkage;
- presigned direct-upload initiate/complete endpoints;
- size and ETag validation, optional SHA-256 verification;
- quarantined creation and download blocking until active;
- asynchronous extraction/scanning and promotion;
- streaming multipart fallback;
- status machine for quarantined, active, failed, orphaned, deleted, and archived;
- entity and attachment operation authorization.

This removes application workers from the primary data path when clients use presigned transfer.

Remaining concerns:

- `ATTACHMENT_AUTH_STRICT` and `ATTACHMENT_MULTIPART_CLEANUP_STRICT` default to false in the current uncommitted environment changes;
- legacy JSON and application-streamed multipart upload paths remain active;
- optional checksum verification downloads the whole object into a `Buffer`, reintroducing API memory/bandwidth cost for checksum-enabled completion;
- the presigned initiate call creates no durable intent row, so an uploaded object that is never completed is not visible to the database orphan-cleanup worker; an object-store lifecycle rule or durable intent registry is required;
- attachment routes rebuild verified identity instead of consuming the canonical context;
- five attachment-route tests currently fail under the targeted test command, while the presigned contract test passes.

**Comparison:** Athyper is architecturally stronger for large, governed, scanned content. Frappe remains simpler and more cohesive for ordinary local attachments.

## 10. Cache and memory architecture

### 10.1 Frappe

Frappe exposes one site-prefixed Redis wrapper with request-local caching. A client cache can retain hot values in worker memory and consume Redis tracking invalidations, with Redis-only fallback ([`redis_wrapper.py`](../../../frappe-develop/frappe-develop/frappe/utils/redis_wrapper.py)). Sessions, boot data, metadata, user settings, and other values share framework conventions.

Advantages:

- simple mental model;
- site-aware namespacing;
- low code distance between cached data and consumer;
- request-local reuse is built into the common wrapper.

Risks:

- cache/session/queue workload isolation depends on deployment configuration;
- broad shared conventions can be less explicit about failure classes.

### 10.2 Athyper

Athyper now has a more disciplined logical hierarchy:

| Cache/domain | Current mechanism | Invalidation/failure behavior |
|---|---|---|
| Browser/API session and IAM | Redis records, indexes, locks, epochs | Security-sensitive; some paths fail closed |
| Execution descriptor | Request L0, bounded L1, Redis L2, snapshot L3 | Exact generation plus pub/sub and durable recovery |
| Runtime bootstrap | Redis provider | Versioned bootstrap loading |
| Entity list/count | Security- and descriptor-scoped Redis keys | Generation/versioned keys, short TTL |
| Jobs | BullMQ Redis | Dedicated URL supported and intended outside local |
| SSE | Redis pub/sub wake-up plus PostgreSQL durable events | Keepalive-only degradation |
| Feature/reference/integration caches | Primary Redis client | Consumer-specific TTL/invalidation |

The move from scan-based descriptor invalidation to exact generations is a major improvement. Descriptor content-addressing, security-hashed page keys, stampede control, and bounded L1 memory are all production-grade patterns.

### 10.3 Redis production blockers

The `app` user ACL currently permits legacy key patterns such as `desc:v4:*` and only the `activity:*` pub/sub channel. It does **not** permit:

- `execdesc:gen:v1:*`;
- `execdesc:head:v1:*`;
- `execdesc:v1:*`;
- `entityquery-count:v1:*`;
- `listpage:v2:*` and current list-generation keys;
- `execdesc:invalidate:v1` channel;
- `record:*` channels.

The standard examples connect as Redis user `app`. Under that deployment, new descriptor/list operations and descriptor/record subscriptions will receive ACL denials or fall back to degraded paths. The Redis ACL contract test also checks only the older patterns, so it does not detect this mismatch ([`redis-acl.conf.tpl`](../../stack/config/memorycache/redis-acl.conf.tpl), [`redis-acl-contract.test.ts`](../../server/src/__tests__/redis-acl-contract.test.ts)).

This must be fixed and integration-tested against a real ACL-enabled Redis before enabling the new paths.

The BullMQ isolation guard is also weakened by compose interpolation: `REDIS_BULLMQ_URL` defaults to `REDIS_URL` before the application starts, so the runtime sees a non-empty BullMQ URL even when it points to the same Redis. Production can therefore appear compliant without actual isolation ([`athyper-apps.yml`](../../stack/compose/apps/athyper-apps.yml), [`bootstrap.ts`](../../server/src/kernel/bootstrap.ts)). Compare normalized endpoints or require a separately supplied deployment marker/secret rather than testing only presence.

## 11. PostgreSQL, RLS, and physical request cost

Athyper's RLS posture remains a major correctness advantage. The repository includes a blocking verifier that requires tenant-scoped tables to enable and force RLS, apply fail-closed tenant predicates, and use `WITH CHECK` for writes ([`verify-rls.ts`](../../server/scripts/verify-rls.ts)). The company-code keyset index aligns with the pilot query.

However, the current tenant-stamp driver wraps every standalone tenant query in:

```text
BEGIN
SELECT set_config('app.current_tenant_id', ...)
application query
COMMIT
```

The driver explicitly documents four round trips per standalone query ([`tenant-stamp-driver.ts`](../../server/packages/adapters/db/src/kysely/tenant-stamp-driver.ts)). The performance observer counts this as one logical Kysely query, not four physical database round trips ([`performance-dialect.ts`](../../server/packages/adapters/db/src/kysely/performance-dialect.ts)).

Consequences:

- a reported one-query list is not necessarily a one-round-trip list;
- repeated metadata, IAM, or enrichment queries multiply protocol overhead;
- logical SQL budgets can pass while physical latency remains high;
- `pg_stat_statements` capture currently filters mainly for framework tables and may omit `BEGIN`, `COMMIT`, and tenant-stamp cost;
- the durable mutation helper opens a transaction that the driver already tenant-stamps, then explicitly sets tenant/principal context again, adding a duplicate tenant `set_config` operation.

For read requests, group related tenant-scoped queries in one short explicit read-only transaction after identity is verified, or implement a safe one-round-trip stamped execution primitive. Record both logical queries and physical protocol statements/round trips. For writes, set principal alongside the driver's tenant stamp without re-setting tenant.

This overhead is one reason Frappe is still likely faster for simple CRUD even after Athyper's descriptor improvements.

## 12. Realtime/SSE

Athyper improved from per-connection polling to one Redis subscriber per API process. PostgreSQL durable document-runtime events remain the source of truth, and reconnects use `Last-Event-ID` with cursor retention checks ([`record-sse-fanout.ts`](../../server/packages/services/records/routes/record-sse-fanout.ts)). Slow clients are disconnected.

The current degraded-mode comment says periodic draining closes the pub/sub wake-up loss window, but the route schedules only a keepalive interval. Durable draining occurs on connection and on Redis wake-up; when Redis is unavailable after connection, no periodic database drain is scheduled. Clients receive keepalives but can miss new events until reconnect.

Add a bounded, jittered fallback drain interval only while pub/sub is degraded, or use a durable Redis stream/consumer model. The SSE route should also consume the canonical request context rather than re-verifying token and tenant.

## 13. Expected CRUD performance comparison

The following is an architectural prediction, not a measured result.

| Operation | Frappe current expectation | Athyper current effective path | Athyper converged potential |
|---|---|---|---|
| Login/session request | Lower internal boundary cost | Keycloak/BFF/session/tenant/principal/effective-permission work | Higher security, but unlikely to beat Frappe latency |
| Warm descriptor | Cached Meta | Full-rollout L0/L1/L2 provider | Comparable or faster metadata reuse once ACL is fixed |
| Simple detail | Uniform permission-aware document/query path | Mostly legacy; pilot requires `query_v1` | One indexed query plus cached descriptor, but physical stamp overhead remains |
| First list page | Mature offset query | Mostly legacy; company-code pilot only | Competitive with page cache and narrow projection |
| Deep list page | Offset cost grows with depth | Keyset pilot avoids deep offset | Athyper should win when indexed and promoted |
| Create | Unified Document insert/hook path | Shadow validation may add work before legacy write | Strong correctness; five-to-seven logical-query budget is unlikely to beat simple Frappe latency |
| Patch | Unified save path | Shadow/new path plus legacy depending cohort | Strong concurrency and idempotency; predictable after convergence |
| Delete | Unified delete lifecycle | Shadow/new path plus legacy; compiled deletion modes | Safer policy semantics, but more control work |
| Lifecycle transition | Cohesive docstatus/workflow | Rich orchestrator or legacy route | Athyper stronger for complex, auditable state transitions |
| Cached repeated list | Framework/application cache dependent | Security-scoped Redis page cache on pilot | Athyper can win when hit ratio is high and ACL works |
| Large attachment upload | Usually app/local-file path | Presigned target exists; legacy upload remains | Athyper should scale better with direct object transfer |
| High contention update | Modified/version checks | Row lock, row version, lease, idempotency | Athyper correctness advantage; throughput needs measurement |

## 14. Findings by priority

### P0: promotion blockers

1. **Prove and enforce read authorization on `EntityQueryService`.** Add required read-operation permission, principal-specific row scope, and field mask to the command. Add explicit allowed/denied/revoked/cross-tenant integration tests.
2. **Update and test Redis ACLs.** Add exact key patterns and channel patterns for execution descriptors, list/count caches, invalidation, and record SSE. Extend the ACL contract test and run a real Redis integration test as user `app`.
3. **Generate real qualification evidence.** The release gate currently fails for every required artifact: performance, qualification result, read/mutation pilots, RLS, outbox, Redis degradation, quarantine, SSE catch-up, tenant-size load, and compatibility traffic.
4. **Resolve the attachment test regression.** In the targeted run, nine files passed but all five multipart lifecycle tests in `attachments.route.test.ts` failed. Determine whether the new async authorization flow invalidated the test timing/mocks or whether handlers no longer complete.

### P1: required before performance claims

1. **Measure physical database round trips.** Do not use logical Kysely query count as the only database budget.
2. **Remove duplicate tenant stamping.** Group route work in short explicit transactions where appropriate and eliminate the extra tenant `set_config` in durable mutations.
3. **Promote controlled paths with evidence.** Move company-code reads from shadow to serve, then add representative master, document, child, and ledger entities. Move mutation cohorts only after parity and rollback evidence.
4. **Finish canonical-context propagation.** Drive the identity-boundary ratchet toward zero in records, attachments, SSE, lifecycle helpers, and label/reference routes.
5. **Fix BullMQ isolation validation.** Ensure the dedicated URL is genuinely distinct in staging/production and use a separate ACL credential.
6. **Add degraded SSE draining.** Redis loss must not turn a connected feed into silent keepalive-only staleness.

### P2: convergence and tail-latency improvements

1. Move lifecycle metadata/policy preparation outside the row-locking transaction.
2. Retire legacy exact-count/offset paths entity by entity; keep explicit bounded-admin compatibility only.
3. Use `MGET`/pipeline or a compact generation token for descriptor vectors after correctness is demonstrated.
4. Add a durable presigned-upload intent or enforced S3 lifecycle cleanup for uncompleted objects.
5. Verify checksum with object-store metadata or a streaming worker instead of buffering the full object in API memory.
6. Complete the post-commit side-effect inventory migrations.
7. Continue extracting the records hotspot into query, mutation, lifecycle, relation, workspace, and compatibility modules.

## 15. Verification performed for this report

### Passed

- Performance phase history and legacy-retirement boundary policy.
- Meta-entity governance policy for nine protected route contracts.
- Qualification-policy unit tests: 3 passed.
- Retirement-policy unit tests: 2 passed.
- Selected execution-descriptor compiler/provider/activation tests: 25 passed.
- Across the combined targeted architecture run, 9 test files and 73 tests passed.
- Frappe local source was rechecked and still declares version `17.0.0-dev`.

### Failed or incomplete

- Qualification-artifact policy failed because all real release evidence files are missing.
- Release-gate verification failed for the same missing evidence.
- The targeted combined run had 5 failing multipart attachment-route tests; 73 other selected tests passed.
- No live PostgreSQL/RLS, Redis ACL, MinIO, k6, or identical Frappe/Athyper benchmark was executed in this source-only audit.

## 16. Required benchmark before declaring a winner

Run both frameworks on equivalent CPU, memory, network, database durability, Redis topology, worker count, and dataset. Athyper tests must keep RLS, Keycloak/effective permissions, row-version checks, audit, and outbox enabled; Frappe tests must keep its normal permissions and hooks enabled.

At minimum measure:

- cold/warm metadata bootstrap;
- uncached/cached detail;
- early and deep list pages;
- count none/cached/exact;
- create, patch, conflict, delete, and lifecycle transition;
- attachment initiate/transfer/complete;
- 1, 10, 50, 100, and sustained concurrent users;
- Redis outage/invalidation storm;
- database pool pressure and lock contention;
- worker/outbox backlog.

Capture:

- p50, p95, p99, throughput, and errors;
- logical application queries and physical database round trips;
- database execution, pool wait, and transaction duration;
- Redis calls, hit ratio, command latency, denied commands, and reconnects;
- CPU, memory, event-loop delay, and payload size;
- conflict, idempotency replay, permission denial, and stale-cache rates;
- outbox lag, SSE replay lag, and attachment quarantine time.

## 17. Final recommendation

The implementation should be retained and completed. The direction is sound: Athyper should not imitate Frappe's monolith, but it should reach Frappe-like execution unity through compiled, shared kernels.

The next production sequence should be:

```text
read authorization overlay
  -> Redis ACL/topology correction
  -> physical-round-trip telemetry
  -> attachment/SSE regression fixes
  -> real qualification evidence
  -> controlled read promotion
  -> controlled mutation promotion
  -> compatibility retirement
```

After those gates, the architectural comparison changes meaningfully: Frappe remains the simpler framework and likely wins ordinary low-control CRUD latency, while Athyper becomes the stronger platform for secure multi-tenancy, concurrency, governed metadata, complex lifecycles, scalable attachments, and reliable asynchronous integration.

## Related reports

- [Original base framework comparison](./frappe-vs-athyper-base-framework-architecture-report.md)
- [CRUD performance and cache summary](./frappe-athyper-crud-performance-cache-summary.md)
- [Athyper performance architecture plan](./athyper-performance-architecture-improvement-plan.md)
- [Meta-entity performance implementation plan](../framework/meta-entity-performance-implementation-plan.md)
- [Legacy retirement gate](../framework/meta-entity-legacy-retirement.md)
