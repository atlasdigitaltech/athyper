# Athyper meta-entity base framework performance implementation plan

**Status:** proposed implementation plan  
**Prepared:** 2026-07-14  
**Baseline:** Git `c92374fb` plus the current working tree  
**Scope:** authenticated meta-entity descriptor, generic read, and generic mutation paths  
**Related architecture:** [Athyper production performance architecture improvement plan](../architecture/athyper-performance-architecture-improvement-plan.md)

## 1. Outcome

Implement one server-owned, compiled execution descriptor for every effective meta-entity and make the generic query and mutation kernels consume it. A warm request must reuse its verified identity and permission context, perform no metadata SQL, avoid per-row enrichment queries, and execute a predictable number of data queries.

This plan narrows the broader production performance proposal to the Athyper base framework. Attachment transfer, realtime fanout, general Redis workload separation, and unrelated domain routes remain separate initiatives.

The intended steady-state request is:

```text
authenticated request
  -> VerifiedRequestContext (once)
  -> ExecutionDescriptorProvider (L1 -> Redis -> snapshot/compile)
  -> EntityQueryService or EntityMutationService
  -> short PostgreSQL operation/transaction
  -> durable audit + outbox + generation change
```

## 2. Current baseline and decisions

The implementation must extend the framework already present in the working tree rather than introduce parallel infrastructure.

| Area | Current implementation | Remaining gap |
|---|---|---|
| Request identity | `VerifiedRequestContext` is composed by IAM middleware; `RequestContext` uses `AsyncLocalStorage` | Generic handlers still perform local tenant, principal, and header resolution; the two contexts are not one authoritative service boundary |
| Metadata compilation | `EntityCompilerService` writes `snapshot.entity_compiled`; the compiled contract includes fields, relations, runtime plan, and capability manifest | Read and write paths still query or interpret fragments independently |
| Server descriptor cache | The compiled metadata route has Redis pointer/payload keys and tenant/plane/schema scoping | A Redis hit still runs a PostgreSQL fingerprint query; invalidation still scans descriptor keys |
| Neon runtime descriptor | Bounded L1 caches, scoped invalidation, generation events, rollout flags, and tests exist | A cold descriptor performs several metadata calls plus recursive relation calls; no single-flight protection; L2 stores the compiled payload but not the final runtime descriptor |
| Generic lists | Security-scoped page/count cache and generation invalidation exist; labels have batched helpers | `records.route.ts` still builds list/count/facet queries inline, uses offset pagination, and executes an exact count by default |
| Mutations | `DefaultEntityMutationService`, strict field validation, handler registry, aggregate executor, rollout policy, audit/outbox writes, and characterization tests exist | Target resolution still reads compiled metadata per operation; legacy create/PATCH/delete and workspace branches remain authoritative for some entities |
| Performance tests | Descriptor/outbox/security k6 scenarios exist | No framework matrix covering descriptor bootstrap, list/detail, and mutation query budgets with representative tenant sizes |

### Architectural decisions

1. `snapshot.entity_compiled` remains the authoritative compiled metadata snapshot.
2. Add an internal `ExecutionDescriptorV1`; do not replace the public `CompiledEntity` or `MetaEntityRuntimeDescriptor` contracts in one migration.
3. Keep the execution descriptor principal-agnostic. Effective permissions and record-specific workflow operations are overlays evaluated from `VerifiedRequestContext` and record state.
4. The API service owns compilation and shared caching. The Neon BFF becomes a consumer/projection layer, not a second metadata compiler long term.
5. Cache freshness is generation/hash based. A normal cache hit must not query PostgreSQL to prove freshness.
6. Migrate reads and writes entity-by-entity behind existing rollout controls. Never dual-write authoritative business rows.
7. Retain RLS, permission revocation, optimistic concurrency, idempotency, audit, and lifecycle correctness as hard constraints.

## 3. Target contracts

### 3.1 Verified request context

Evolve the existing IAM contract rather than create a second type:

```ts
interface VerifiedRequestContext {
  requestId: string;
  planeKey: PlaneKey;
  realmKey: string;
  tenantId: string;
  principalId: string;
  organizationId?: string;
  companyCodeId?: string;
  legalEntityId?: string;
  permissions: EffectivePermissionContext;
  authEpoch: number;
  profileHash: string;
  idempotencyKey?: string;
  correlationId?: string;
}
```

The authenticated boundary composes this once, stores it in `res.locals`, and exposes the same immutable object through `AsyncLocalStorage`. Application services accept it explicitly. ALS is reserved for telemetry, logging, and legacy adapters during migration.

### 3.2 Execution descriptor

Create an internal, immutable server contract:

```ts
interface ExecutionDescriptorV1 {
  schemaVersion: 1;
  identity: {
    entityCode: string;
    entityVersionId: string;
    versionHash: string;
    compiledHash: string;
    entityClass: string;
  };
  storage: {
    schema: string;
    table: string;
    primaryKey: string;
    tenantColumn: string;
    rowVersionColumn?: string;
    backingType: "table" | "view" | "materialized_view";
  };
  fields: ReadonlyMap<string, CompiledExecutionField>;
  read: CompiledReadPlan;
  write: CompiledWritePlan;
  relations: ReadonlyMap<string, CompiledRelationPlan>;
  lifecycle?: CompiledLifecyclePlan;
  policy: CompiledEntityPolicy;
  handlers: CompiledHandlerReferences;
}
```

The serialized Redis form uses sorted arrays/records, not JavaScript `Map`; hydration produces the immutable in-process form. Its hash must include every execution-relevant field, storage binding, policy, lifecycle, relation, create contract, and handler reference.

### 3.3 Cache keys and layers

```text
generation: execdesc:gen:v1:{plane}:{tenant}:{entity}
payload:    execdesc:v1:{plane}:{tenant}:{entity}:{compiledHash}
L1 key:     {plane}\0{tenant}\0{entity}\0{generation}\0{compiledHash}
```

Principal ID, permission stamp, and record ID are deliberately excluded from the shared execution descriptor. They belong to request-local authorization and operation overlays.

Cache behavior:

- L0: request-local promise memoization;
- L1: bounded process cache with hit/miss/eviction metrics;
- L2: Redis content-addressed payload plus generation pointer;
- L3: `snapshot.entity_compiled` plus the minimum required effective tenant overlay compilation;
- one in-flight loader per key per process;
- bounded distributed fill lock only if baseline load proves cross-instance stampedes material;
- Redis failure falls through to L3 and never bypasses authorization;
- invalidation increments the exact generation key and publishes its scope; no normal `SCAN`/wildcard delete.

## 4. Delivery sequence

Each stage is independently deployable. Indicative durations are engineering estimates, not release commitments.

### P0 — Baseline and contract freeze (3–5 days)

**Purpose:** make improvements provable and prevent contract churn during extraction.

Implementation:

- instrument protected framework requests with controlled-cardinality attributes: route template, entity code, operation, cache state, and rollout cohort;
- count SQL statements and Redis operations per request;
- split DB pool wait, SQL time, transaction time, serialization time, and total time;
- record descriptor compile/hydrate time, payload bytes, L1/L2 hit/miss, and invalidation lag;
- add k6 scenarios for descriptor bootstrap, list, detail, create, PATCH, and aggregate save;
- define small, medium, and skewed tenant datasets;
- capture p50/p95/p99, throughput, event-loop lag, heap, pool wait, SQL count, and transaction duration.

Primary files:

- `server/packages/adapters/telemetry/src/`
- `server/src/runtimes/api.ts`
- `server/packages/services/metadata/routes/compiled-entity.route.ts`
- `server/packages/services/records/routes/records.route.ts`
- `perf/k6/`

Exit gate:

- at least 95% of protected meta-entity requests report phase timings and query counts;
- baselines are repeatable within 10% for three consecutive runs;
- the top framework SQL costs and descriptor payload sizes are recorded;
- no later performance PR is accepted without before/after evidence.

### P1 — One verified request boundary (3–5 days)

**Purpose:** remove repeated control-plane resolution before changing query behavior.

Implementation:

- add `authEpoch` and stable `profileHash` to the existing verified context;
- bridge the verified context into `AsyncLocalStorage` at the permission middleware boundary;
- introduce one `requireVerifiedContext(req, res)` route adapter;
- replace tenant/principal/header parsing in generic list, detail, create, PATCH, delete, aggregate, and transition entry points;
- add request-local memoization for record authorization decisions;
- keep header parsing only at the authenticated gateway and compatibility adapters;
- add a policy test that forbids identity parsing/resolution inside the generic kernel.

Primary files:

- `server/packages/services/iam/permission-context/verified-request-context.ts`
- `server/packages/services/iam/permission-context/middleware.ts`
- `server/src/kernel/request-context.ts`
- `server/packages/services/records/routes/records.route.ts`
- `server/packages/services/records/routes/entity-mutation.route.ts`

Exit gate:

- protected generic handlers cannot run without `VerifiedRequestContext`;
- warm CRUD performs no duplicate tenant or principal lookup;
- mismatch, disabled-principal, revoked-grant, and cross-plane tests retain current behavior;
- auth epoch invalidation remains within the existing security window.

### P2 — Compile `ExecutionDescriptorV1` (5–8 days)

**Purpose:** replace repeated metadata interpretation with one validated execution model.

Implementation:

- add the internal descriptor contract and Zod serialized schema;
- implement a pure compiler from `CompiledEntity`/capability manifest plus effective tenant overlay;
- move target-table, field-map, array/JSON coercion, write rules, default sort, relation bindings, concurrency policy, and registered handler names into the descriptor;
- validate physical identifiers, stable pagination tiebreaker, required system fields, write facade, lifecycle command, child handler, and domain hook references at compile/activation time;
- fail metadata activation for required missing bindings; report optional feature degradation explicitly;
- add deterministic hash and serialization tests;
- shadow-compile representative master, document, child, ledger, view, and tenant-overlay entities.

Proposed package/files:

- `server/packages/services/metadata/src/execution-descriptor/contract.ts`
- `server/packages/services/metadata/src/execution-descriptor/compiler.ts`
- `server/packages/services/metadata/src/execution-descriptor/validation.ts`
- `server/packages/services/metadata/src/execution-descriptor/__tests__/`
- `packages/shared/data-integration/api-contracts/src/schemas/metadata.ts` only for additive public fields that are truly shared

Exit gate:

- descriptor hashes are deterministic across processes;
- all seeded effective entities either compile or produce an owned, actionable activation error;
- shadow output matches current table/field/write/lifecycle resolution for pilot entities;
- no principal-specific permission decision is serialized into the shared descriptor.

### P3 — Production descriptor provider and invalidation (5–8 days)

**Purpose:** reach zero metadata SQL on warm API requests and eliminate scan-based invalidation.

Implementation:

- build `ExecutionDescriptorProvider` with request memoization, bounded L1, Redis L2, L3 load, and single-flight;
- replace the compiled-route per-hit PostgreSQL fingerprint check with generation/hash validation;
- make publication, approval, overlay, entity-field, policy, lifecycle, relation, and handler-binding changes increment exact generation keys;
- preserve `log.descriptor_cache_invalidation` as durable recovery/audit and the PostgreSQL poller as missed-event recovery;
- change the recovery worker to increment generations and publish events, then retire descriptor `SCAN` deletion after a compatibility window;
- expose cache state and descriptor hash through response headers and telemetry, not payload-dependent logic;
- add stale-fill protection: a loader may populate L1/L2 only if its captured generation is still current;
- add invalidation convergence, Redis outage, subscriber reconnect, and concurrent cold-load tests.

Primary files:

- new `server/packages/services/metadata/src/execution-descriptor/provider.ts`
- `server/packages/services/metadata/routes/compiled-entity.route.ts`
- `server/src/services/cache-invalidation/listener.ts`
- `server/src/runtimes/api.ts`
- `server/src/runtimes/worker.ts`
- `apps/neon/lib/server/scoped-runtime-cache.ts`
- `apps/neon/lib/server/meta-entity-runtime-cache-events.ts`

Exit gate:

- a warm execution-descriptor request performs zero metadata SQL;
- 100 concurrent cold requests cause one process-local loader execution;
- publication becomes visible across replicas within 5 seconds p99 under healthy Redis and within 35 seconds through recovery polling;
- no normal metadata invalidation performs Redis `SCAN`;
- Redis loss degrades to PostgreSQL without cross-tenant or over-permitted data.

### P4 — Collapse Neon descriptor bootstrap (5–8 days)

**Purpose:** remove the cold BFF fan-out and make server compilation authoritative.

Implementation:

- add one runtime bootstrap response containing the public compiled entity, entity-level operations, policy, masks, aliases, and declared child projections required for first render;
- keep record-specific workflow/approver operations in a small record-operation overlay endpoint;
- project `MetaEntityRuntimeDescriptor` from the bootstrap response without refetching operations, policy, masks, aliases, or every child descriptor;
- add L2 caching for the principal-agnostic bootstrap payload; retain the existing scoped L1 only for the permission/record-aware projection;
- include child descriptor hashes and fetch deeper children lazily;
- use existing `openDescriptorCacheV2` stages for internal, 5%, 25%, and full rollout;
- compare old and new descriptor hashes/capabilities in shadow mode before serving the new result.

Primary files:

- `apps/neon/lib/server/meta-entity-runtime.ts`
- `apps/neon/lib/server/scoped-runtime-cache.ts`
- `apps/neon/lib/server/document-runtime-feature-flags.ts`
- `server/packages/services/metadata/routes/`
- `packages/shared/runtime-domain/runtime-contracts/src/`

Exit gate:

- warm bootstrap uses no metadata SQL and no more than one Redis round trip at the API layer;
- cold BFF bootstrap uses one API call plus an optional record-operation overlay;
- relation count does not multiply metadata requests;
- old/new descriptor parity is 100% for the rollout cohort, excluding declared timestamp/cache-state fields;
- heap remains within budget with the configured L1 limits.

### P5 — Extract `EntityQueryService` (8–12 days)

**Purpose:** make generic read cost predictable and independently testable.

Implementation:

- create transport-independent list/detail commands that require verified context and execution descriptor;
- compile projections, filters, tenant/scope predicates, stable sorts, and masking from the descriptor;
- implement opaque keyset cursors using sort tuple plus primary-key tiebreaker;
- support count modes `none`, `cached`, `approximate`, and `exact`; default large operational entities to `none`;
- return `has_more` and `next_cursor` independently from total count;
- fetch `limit + 1` rows and select only descriptor-declared columns;
- use set-based reference hydration; prohibit per-row label, lookup, or permission queries;
- retain offset mode only for explicitly bounded administrative entities;
- key list caches by generation, descriptor hash, security hash, filter, sort, search, and cursor—not page number for keyset mode;
- add tenant-leading indexes for each pilot's default/filter sort based on `EXPLAIN (ANALYZE, BUFFERS)` evidence;
- leave facets opt-in and separately budgeted instead of coupling them to every list request.

Proposed package/files:

- `server/packages/services/records/query/entity-query.types.ts`
- `server/packages/services/records/query/entity-query.service.ts`
- `server/packages/services/records/query/keyset-cursor.ts`
- `server/packages/services/records/query/reference-hydrator.ts`
- `server/packages/services/records/cache/list-cache.ts`
- thin adapters in `server/packages/services/records/routes/records.route.ts`
- `apps/neon/lib/server/meta-entity-records.ts`

Pilot order:

1. high-volume simple master with references;
2. operational document list;
3. tenant-overlay entity;
4. view-backed/read-only entity;
5. child collection.

Exit gate:

- warm detail uses 1–2 SQL statements including authorization-dependent data access;
- list without exact count uses one data SQL statement after warm-up;
- navigation latency is approximately stable at shallow and deep positions;
- no N+1 query occurs for 100-row pages;
- cache and uncached results are byte-equivalent after normalization;
- old/new read parity passes before each entity switches.

### P6 — Finish mutation-kernel convergence (10–20 days, incremental)

**Purpose:** make the existing mutation service consume the descriptor and retire duplicated write resolution.

Implementation:

- inject `ExecutionDescriptorProvider` into `DefaultEntityMutationService` and remove direct `snapshot.entity_compiled` target reads;
- complete all non-locking validation, mapping, handler lookup, and idempotency hash preparation before opening the transaction;
- inside the transaction set tenant/principal GUCs, claim idempotency, lock/revalidate, perform set-based writes, write audit/outbox/generation changes, and commit;
- keep state-dependent permission, row version, lifecycle, and business constraints revalidated after locking;
- consolidate durable side effects through one helper and stable event keys;
- ensure search, cache, realtime, notifications, and integrations are outbox categories rather than post-commit best-effort calls;
- migrate generic PATCH first, then create/delete, aggregate workspace, and transitions;
- replace entity-name branches with registered handlers and compiler-validated references;
- use current mutation rollout stages: shadow validation, dual-read comparison, internal tenants, small external cohort, full rollout;
- never execute legacy and new authoritative writes for the same request.

Primary files:

- `server/packages/services/records/mutation/entity-mutation.service.ts`
- `server/packages/services/records/mutation/entity-mutation-handler.registry.ts`
- `server/packages/services/records/mutation/aggregate-collection-executor.ts`
- `server/packages/services/records/mutation/mutation-kernel-rollout.ts`
- `server/packages/services/shared/durable-mutation-transaction.ts`
- `server/packages/services/records/routes/records.route.ts`
- `server/packages/services/records/routes/entity-mutation.route.ts`

Exit gate per migrated operation/entity:

- descriptor resolution performs zero metadata SQL on the warm path;
- simple create/PATCH/delete stays within 5–8 SQL statements, including idempotency, audit, and one outbox event but excluding explicitly budgeted hooks;
- audit and required outbox rows commit atomically with the record;
- idempotent replay is deterministic and causes no duplicate business write;
- rejected fields are explicit in strict mode;
- transaction p95 is below 50 ms for simple PATCH and 100 ms for simple create/delete on the reference dataset;
- the generic kernel adds no new entity-code conditional branch.

### P7 — Governance and legacy retirement (3–5 days plus ongoing checks)

Implementation:

- add CI policy checks for route-level identity parsing, direct metadata resolution from generic kernels, and entity-code branches;
- add performance qualification jobs using a stable environment and stored baseline artifact;
- fail qualification when query budgets are exceeded, p95 regresses by more than 15% without an approved exception, or security/cache parity fails;
- publish dashboards for descriptor cache, query counts, transaction duration, pool wait, invalidation lag, and outbox lag;
- remove old descriptor fan-out, offset/count defaults, direct write paths, and `SCAN` invalidation only after full-rollout telemetry meets the retirement threshold;
- document runbooks for cache flush/generation bump, Redis impairment, metadata rollback, and mutation-kernel rollback.

Exit gate:

- every protected generic route has an owner, SLO, query budget, and rollout state;
- compatibility paths have zero production traffic for one full release window before deletion;
- release qualification covers tenant isolation, permission revocation, descriptor invalidation, and durable mutation behavior.

## 5. Initial budgets

Validate these in P0 and revise only with recorded evidence.

| Operation after warm-up | SQL budget | Starting p95 |
|---|---:|---:|
| Execution descriptor | 0 | 25 ms API-local / 100 ms through BFF |
| Runtime bootstrap | 0 metadata SQL | 100 ms |
| Record detail | 1–2 | 250 ms |
| List, count mode `none` | 1 | 150 ms |
| List, cached count | 1 | 150 ms |
| Simple create | 5–7 | 400 ms total / 100 ms transaction |
| Simple PATCH | 6–8 | 400 ms total / 50 ms transaction |
| Simple delete/archive | 6–8 plus declared reference checks | 400 ms total / 100 ms transaction |
| Aggregate save or transition | 8–15 plus declared collection/hook budget | 800 ms total / 250 ms transaction |

## 6. Test matrix

Every phase must cover:

- platform entity and tenant-overlay entity;
- Neon, Mesh, and Admin plane scoping where the route is shared;
- two tenants requesting the same entity code;
- two principals with different permission profiles;
- auth epoch/profile change while caches are warm;
- metadata publish during an in-flight cold load;
- Redis unavailable, slow, reconnected, and flushed;
- one and multiple API/BFF replicas;
- high relation count and 100-row reference hydration;
- simple master, document aggregate, child entity, ledger/read-only entity, and view-backed entity;
- idempotent mutation replay, version conflict, lock conflict, forbidden field, and failed outbox/audit write.

Required test levels:

1. pure descriptor compiler and cursor property tests;
2. provider/cache/invalidation unit tests with controlled clocks;
3. PostgreSQL/Redis integration tests for RLS, generations, and transaction rollback;
4. route contract/parity tests;
5. k6 warm, cold, stampede, skew, and failure scenarios;
6. soak test long enough to observe L1 eviction, heap behavior, pool saturation, and outbox recovery.

## 7. Rollout and rollback

- Shadow compilation may compare descriptors but must not change returned behavior.
- Read migrations may dual-read and compare, but only one result is returned.
- Mutation migrations may shadow validation and compare post-mutation reads, but only one kernel writes authoritative business data.
- Feature flags are scoped by entity and operation; canaries begin with internal tenants.
- Automatic rollback signals: correctness mismatch, authorization mismatch, cross-tenant result, server-error increase, p95 regression over threshold, pool wait breach, or invalidation SLO breach.
- Descriptor rollback selects the previous compiler schema version and generation namespace; content-addressed payloads remain available through the compatibility window.
- Redis failure disables acceleration, not correctness. PostgreSQL snapshot compilation remains the fallback.
- Metadata publication rollback activates the prior effective version and increments generation; it does not delete arbitrary cache keys.

## 8. Dependencies and exclusions

Dependencies:

- effective metadata publication must emit a durable invalidation record;
- handler registries must expose stable names that the compiler can validate;
- seeded entities must have explicit primary key, tenant column, concurrency policy, and stable default sort metadata;
- the performance environment needs representative PostgreSQL statistics and Redis network characteristics.

Excluded from this plan:

- direct object-storage attachment transfer;
- SSE shared fanout and PostgreSQL catch-up redesign;
- global Redis deployment separation;
- domain-specific query/mutation optimization after the base framework handoff;
- arbitrary mutable-record caching.

## 9. Definition of done

The meta-entity base framework performance initiative is complete when:

1. authenticated generic routes consume one verified context and never rediscover tenant or principal identity;
2. warm descriptor/bootstrap execution performs zero metadata SQL;
3. one compiled execution descriptor drives generic reads and writes;
4. list-without-count uses one set-based query and deep navigation does not degrade with offset depth;
5. reference hydration and aggregate children have no N+1 behavior;
6. all migrated writes atomically persist record, audit, idempotency, outbox, and generation effects;
7. metadata and permission invalidation converge within their declared SLOs without normal Redis scans;
8. Redis impairment degrades safely without authorization leakage or unavailable authoritative CRUD;
9. critical routes pass latency, query, transaction, security, and parity gates in release qualification;
10. legacy descriptor fan-out and duplicated generic CRUD paths are retired after a measured compatibility window.

## 10. Recommended first implementation slice

Start with P0–P3 and one simple master entity. The first reviewable chain should be:

1. telemetry and query-budget harness;
2. additive `ExecutionDescriptorV1` contract and pure compiler;
3. bounded provider with single-flight and deterministic tests;
4. generation-based invalidation without removing the current cache path;
5. shadow comparison on one entity;
6. enable warm descriptor serving for the internal tenant;
7. publish before/after SQL count, Redis operations, p95, heap, and invalidation-lag evidence.

Do not begin the broad list or mutation cutover until this slice proves zero warm metadata SQL, deterministic hashes, safe invalidation, and tenant/permission isolation.
