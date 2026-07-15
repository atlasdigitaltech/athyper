# Athyper Production Performance Architecture Improvement Plan

**Status:** Recommended implementation roadmap  
**Prepared:** 2026-07-14  
**Scope:** API, CRUD, metadata, IAM, PostgreSQL, Redis, events, attachments, realtime, and production performance governance  
**Repository baseline:** Git `c92374fb` plus the current working-tree implementation

## 1. Executive recommendation

Athyper already has strong production primitives: tenant-aware PostgreSQL schemas and RLS, Keycloak authentication, permission scopes, versioned metadata, optimistic concurrency, idempotency, lifecycle transactions, object storage, Redis, BullMQ, and durable runtime events.

The primary performance problem is architectural duplication, not a lack of infrastructure. A single request can repeat tenant, principal, metadata, policy, field, permission, and relation resolution across several execution paths. CRUD behavior is also distributed across generic routes, document workspace mutations, write facades, lifecycle commands, domain operations, and child-record registries.

The recommended direction is:

> Build one compiled execution model for reads and one authoritative mutation kernel for writes, supported by short PostgreSQL transactions, a transactional outbox, generation-based caches, and measurable query/latency budgets.

The highest-value sequence is:

1. measure request/query/transaction costs;
2. eliminate repeated request-context and metadata resolution;
3. remove exact-count and offset-pagination bottlenecks;
4. converge write paths on one mutation kernel and transactional outbox;
5. standardize Redis and descriptor invalidation;
6. move attachment bytes and realtime fanout away from synchronous API/database hot paths;
7. enforce performance budgets in release qualification.

## 2. Current architectural pressure points

### 2.1 Repeated control-plane resolution

CRUD paths can independently resolve:

- bearer-token claims;
- realm and plane;
- tenant from `X-Org`;
- application principal;
- effective permission context;
- effective entity version;
- field mappings and write rules;
- entity policy and operation;
- lifecycle and child bindings.

These are individually reasonable, but repeated resolution produces unnecessary SQL and Redis operations. The request-context and permission middleware already provide the foundation for consolidation ([`request-context.ts`](../../server/src/kernel/request-context.ts), [`permission-context/middleware.ts`](../../server/packages/services/iam/permission-context/middleware.ts)).

### 2.2 Oversized generic records execution surface

[`records.route.ts`](../../server/packages/services/records/routes/records.route.ts) combines generic CRUD, lists, metadata mapping, domain defaults, document workspace changes, child collections, locks, drafts, SSE, idempotency, operations, cache invalidation, audit, and search side effects.

This affects performance work in three ways:

1. the same information is resolved by multiple handlers;
2. query behavior is difficult to budget and optimize independently;
3. domain-specific branches prevent stable generic-path performance.

### 2.3 Strong but distributed cache architecture

Athyper has well-designed individual caches, including security-scoped list keys and authentication epochs. However, browser sessions, effective IAM sessions, list caches, descriptors, jobs, and runtime invalidation use different clients and invalidation patterns. Descriptor invalidation sometimes relies on Redis scans, while list invalidation already uses the more scalable generation model ([`list-cache.ts`](../../server/packages/services/records/cache/list-cache.ts), [`cache-invalidation/listener.ts`](../../server/src/services/cache-invalidation/listener.ts)).

### 2.4 Long or overly broad mutation paths

Some writes combine preparation, locking, parent/child changes, enrichment, idempotency, events, and domain behavior. The lifecycle orchestrator demonstrates the correct transaction-owner pattern, but not every CRUD path follows it ([`execute-lifecycle-transition.ts`](../../server/packages/services/records/lifecycle/execute-lifecycle-transition.ts)).

### 2.5 Synchronous or post-commit side effects

Search, cache, audit, notification, and realtime side effects are not uniformly represented as durable outbox work committed with the authoritative record change. Post-commit best-effort event creation can create both latency and consistency risks.

### 2.6 Large-list cost

List endpoints may perform:

- metadata and field resolution;
- permission/scope resolution;
- a result query;
- an exact count query;
- label enrichment;
- offset pagination;
- list-cache access.

On large tenant tables, exact counts and deep offsets can dominate request time even when the primary result query is indexed.

### 2.7 Attachment data path

Athyper has a strong streaming/object-storage attachment service, but a JSON/base64 path still exists. Base64 expands data, duplicates buffers, and moves bytes through BFF and API processes. Production large-file traffic should use direct object-storage transfer with server-authorized completion ([`attachment.service.ts`](../../server/packages/services/documents/services/attachment.service.ts), [`attachments.route.ts`](../../server/packages/services/documents/routes/attachments.route.ts)).

### 2.8 Realtime database polling

Record SSE uses durable PostgreSQL events correctly for recovery, but periodic per-connection database drains will become costly at high connection counts. PostgreSQL should provide durable catch-up, not continuous polling per connected browser.

## 3. Objectives and non-goals

### Objectives

- reduce warm-path control-plane SQL to zero or one query;
- make CRUD query counts predictable and observable;
- keep write transactions short and deterministic;
- make all durable side effects transactionally consistent;
- support large tenant tables without deep-offset or mandatory-count degradation;
- preserve immediate permission revocation and tenant isolation;
- scale API and realtime traffic horizontally;
- degrade safely when Redis, search, workers, or object storage are impaired;
- block significant performance regressions before production.

### Non-goals

- weakening IAM, RLS, audit, idempotency, lifecycle, or attachment security for benchmark numbers;
- caching arbitrary mutable records without an explicit consistency model;
- introducing microservices solely to improve performance;
- replacing PostgreSQL as the authoritative transactional store;
- optimizing every domain flow before measuring its production importance.

## 4. Target architecture

```text
Client
  |
Next.js plane/BFF
  |  browser session lookup + token refresh only
  v
Express request gateway
  |  verifies token/context once
  |  builds VerifiedRequestContext once
  v
+-------------------------- Application runtime --------------------------+
|                                                                          |
|  CompiledExecutionDescriptor cache      EffectivePermissionContext       |
|       L1 memory -> Redis -> DB           request-local / auth-epoch       |
|                    |                                  |                  |
|                    +---------------+------------------+                  |
|                                    v                                     |
|                         QueryService / MutationKernel                    |
|                                    |                                     |
+------------------------------------+-------------------------------------+
                                     |
                      short PostgreSQL transaction
                                     |
        +----------------------------+----------------------------+
        | authoritative record | audit | outbox | generations     |
        +----------------------------+----------------------------+
                                     |
                              outbox workers
              +----------------------+----------------------+
              |                      |                      |
           search                 Redis fanout          notifications/
         projection            and cache signals        integrations

Attachment bytes: Client <-> S3/MinIO using authorized presigned transfer
Realtime: outbox -> shared fanout -> SSE; PostgreSQL used for cursor catch-up
```

## 5. Production performance objectives

The following are starting objectives. They must be adjusted after the baseline phase, but they provide an explicit design target.

### 5.1 HTTP service-level objectives

| Operation | Starting p95 | Starting p99 | Availability/error objective |
|---|---:|---:|---:|
| Cached metadata/bootstrap | 100 ms | 250 ms | <0.1% server errors |
| Cached list or detail read | 150 ms | 350 ms | <0.1% server errors |
| Cold single-record read | 250 ms | 500 ms | <0.2% server errors |
| Simple create/PATCH | 400 ms | 800 ms | <0.2% server errors |
| Aggregate document save | 800 ms | 1.5 s | <0.5% server errors |
| Lifecycle/domain transition | 800 ms | 1.5 s | <0.5% server errors |
| Attachment authorization/complete | 250 ms | 500 ms | <0.2% server errors |

Expected business conflicts such as `409`, `412`, and validation `422` responses are measured separately from server errors.

### 5.2 Database transaction objectives

| Transaction | Starting p95 duration |
|---|---:|
| Simple PATCH | 50 ms |
| Simple create | 100 ms |
| Delete/archive | 100 ms |
| Aggregate save | 250 ms |
| Lifecycle transition | 250 ms |

### 5.3 Query budgets after warm-up

| Request | Target SQL budget |
|---|---:|
| Cached entity descriptor | 0 |
| Get record | 1–2 |
| List without exact count | 1 |
| List with cached count | 1 |
| Simple create | 2–4 |
| Simple PATCH | 2–4 |
| Delete/archive | 2–4 |
| Lifecycle transition | 4–8 |

Domain hooks may receive an explicit additional budget. Every exception must be visible in telemetry and owned by a domain team.

## 6. Architectural principles

1. **Measure before optimizing.** Every workstream must demonstrate query, latency, CPU, memory, or capacity improvement.
2. **PostgreSQL remains authoritative.** Redis and search are disposable accelerators except for explicitly classified session and queue state.
3. **Resolve stable context once.** Tenant, principal, entity version, and effective permission context must not be rediscovered by each handler.
4. **Compile rather than repeatedly interpret.** Effective metadata should become an immutable execution descriptor.
5. **Keep transactions narrow.** Network I/O, broad metadata reads, and response enrichment stay outside locked transactions.
6. **Use outbox-driven side effects.** A successful record commit must durably imply eventual search, notification, audit, integration, and realtime processing.
7. **Prefer generations over key deletion.** Invalidation should be constant-time and safe at large key counts.
8. **Reject N+1 designs.** Child changes, references, and labels are handled with set-based operations.
9. **Security correctness is a performance constraint.** No optimization may serve cross-tenant or over-permitted data.
10. **Performance is release behavior.** Budgets and SLO regressions are tested, not documented only.

## 7. Workstream A — observability and baseline

### Deliverables

- request spans for authentication, request-context construction, descriptor resolution, permission resolution, DB acquisition, SQL execution, transaction, serialization, and downstream publication;
- SQL query count per request;
- Redis operation count, latency, hit/miss, and error state;
- transaction duration separate from total request duration;
- response size and serialization time;
- connection-pool acquisition latency;
- outbox creation-to-delivery lag;
- entity code and route as controlled-cardinality attributes;
- production-like k6 scenarios under `perf/`.

### Required dashboards

1. API latency and error rate by route/entity;
2. top SQL by total time, mean time, calls, rows, and temporary bytes;
3. query count by route;
4. PostgreSQL connection/pool saturation;
5. Redis latency/hit ratio/errors by cache domain;
6. outbox depth and delivery lag;
7. worker lag and retry rate;
8. SSE connections and fanout/database activity;
9. Node event-loop lag, heap, and garbage collection;
10. cache invalidation lag.

### Acceptance gate

- at least 95% of protected CRUD requests expose all core timings;
- query count can be attributed to route and entity;
- the top 20 database costs are known for representative workloads;
- a repeatable baseline produces p50/p95/p99, throughput, CPU, memory, and DB metrics.

## 8. Workstream B — verified request context

### Target contract

```ts
export interface VerifiedRequestContext {
  requestId: string;
  planeKey: "neon" | "mesh" | "admin";
  realmKey: string;
  tenantId: string;
  principalId: string;
  orgKey: string;
  companyCodeIds: readonly string[];
  permissionContext: EffectivePermissionContext;
  authEpoch: number;
}
```

### Changes

1. construct this context once at the authenticated request boundary;
2. store it in AsyncLocalStorage and pass it explicitly into application services;
3. remove route-level tenant, realm, `sub`, and principal resolution;
4. memoize record-specific authorization decisions for the duration of a request;
5. preserve the `auth_epoch` check for security-critical invalidation;
6. add conformance tests for every protected router.

### Acceptance gate

- no generic CRUD handler parses authentication or organization headers;
- warm CRUD performs no duplicate tenant/principal lookup;
- all protected routes produce identical mismatch/disabled/revoked behavior;
- permission revocation remains effective within the defined security window.

## 9. Workstream C — compiled execution descriptors

### Target contract

```ts
export interface CompiledExecutionDescriptor {
  identity: {
    entityCode: string;
    entityVersionId: string;
    versionHash: string;
    classKey: string;
  };
  storage: {
    schema: string;
    table: string;
    backingType: "table" | "view" | "materialized_view";
    primaryKey: string;
    tenantColumn: string;
    rowVersionColumn?: string;
  };
  readProjection: readonly CompiledReadField[];
  fieldMap: ReadonlyMap<string, CompiledFieldRule>;
  operations: ReadonlyMap<string, CompiledOperation>;
  lifecycle?: CompiledLifecycle;
  policy: CompiledEntityPolicy;
  childCollections: ReadonlyMap<string, CompiledChildCollection>;
  handlers: CompiledHandlerReferences;
}
```

### Cache hierarchy

```text
L1: bounded process cache keyed by plane/tenant/entity/version/generation
L2: Redis serialized descriptor keyed identically
L3: PostgreSQL effective metadata compilation
```

### Requirements

- L1 must be size-bounded and observable;
- L2 values must be schema-versioned;
- version hash must cover all execution-relevant metadata;
- missing write facade, lifecycle command, child handler, or domain hook must fail compilation/deployment;
- security-specific material must either be outside the principal-agnostic descriptor or explicitly included in the cache key;
- invalidation uses generation increments, not wildcard scans.

### Acceptance gate

- zero metadata SQL on a warm generic CRUD request;
- one loader execution under concurrent cold requests through stampede protection;
- deterministic descriptor hashes across instances;
- metadata activation becomes visible within the invalidation SLO;
- revoked permission data cannot be served from descriptor caching.

## 10. Workstream D — read-path architecture

### 10.1 Query service split

Create a transport-independent `EntityQueryService` responsible for:

- descriptor-driven projections;
- tenant and permission scope predicates;
- filters and sorting;
- keyset cursors;
- optional counts;
- batched reference labels;
- response masking and projection;
- list-cache participation.

HTTP routes should only validate transport input and serialize the service result.

### 10.2 Keyset pagination

Use stable ordered tuples:

```sql
WHERE tenant_id = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT $4 + 1;
```

Metadata must compile a stable tiebreaker. Offset pagination may remain for bounded administrative datasets, but not for large operational entities.

### 10.3 Count policy

Support explicit count modes:

```text
none        — default for large lists
cached      — use generation-bound count cache
approximate — projection/statistical estimate where appropriate
exact       — opt-in authoritative count
```

The standard response should expose `has_more` and `next_cursor` independently of exact total.

### 10.4 Projection and enrichment

- list queries select descriptor-declared columns only;
- reference labels are resolved by a bounded batch query or declared joins;
- no per-row label or permission query;
- large JSON and attachment fields are excluded from lists;
- response field masking is applied without fetching unused sensitive columns where practical.

### Acceptance gate

- list-without-count uses one SQL query after warm-up;
- query duration remains approximately stable at shallow and deep navigation;
- no N+1 label/reference queries;
- all default list sorts have matching tenant-leading indexes;
- cold and cached list behavior meet their respective SLOs.

## 11. Workstream E — unified mutation kernel

### Target interface

```ts
export interface EntityMutationService {
  create(command: CreateEntityCommand): Promise<MutationResult>;
  patch(command: PatchEntityCommand): Promise<MutationResult>;
  delete(command: DeleteEntityCommand): Promise<MutationResult>;
  transition(command: TransitionEntityCommand): Promise<MutationResult>;
  mutateAggregate(command: AggregateMutationCommand): Promise<MutationResult>;
}
```

### Preparation phase outside transaction

- load compiled descriptor;
- validate command schema;
- authorize entity operation;
- check general field writability;
- map logical fields to physical fields;
- resolve registered domain handler;
- prepare idempotency identity and request hash;
- batch-load non-locking reference data where safe.

### Critical phase inside transaction

1. set tenant/principal transaction GUCs;
2. claim or replay idempotency;
3. lock the aggregate root or insert allocation record;
4. revalidate row version, state, and security-critical business constraints;
5. execute set-based parent/child writes;
6. update lifecycle instance when applicable;
7. insert audit data;
8. insert outbox events;
9. record generation changes;
10. complete idempotency result;
11. commit.

### Domain extension model

Domain-specific behavior must use registered hooks rather than entity-name branches:

```ts
export interface EntityMutationHandler {
  prepare?(ctx: MutationPreparationContext): Promise<PreparedMutation>;
  validateLocked?(ctx: LockedMutationContext): Promise<void>;
  beforeWrite?(ctx: TransactionMutationContext): Promise<void>;
  afterWrite?(ctx: TransactionMutationContext): Promise<void>;
  projectResult?(ctx: MutationResultContext): Promise<Record<string, unknown>>;
}
```

Required transactional hooks fail the transaction. Noncritical external effects are outbox consumers.

### Field rejection policy

Unknown, unmapped, read-only, computed, system-managed, write-once, and status-locked fields must produce structured `422` errors. Silent dropping is allowed only through an explicitly named compatibility mode with telemetry.

### Acceptance gate

- POST, PUT, PATCH, workspace submit, imports, lifecycle commands, and registered operations reuse the kernel contracts;
- simple writes stay within query and transaction budgets;
- every committed mutation has corresponding audit/outbox state;
- retries produce deterministic replay rather than duplicate business effects;
- entity-specific branches are absent from the generic kernel.

## 12. Workstream F — transactional outbox and projections

### Required outbox categories

- search indexing/removal;
- notifications;
- external integrations/webhooks;
- cache/runtime invalidation;
- realtime fanout;
- noncritical document rendering or enrichment;
- attachment processing requests.

### Delivery contract

- inserted in the authoritative mutation transaction;
- stable event ID and aggregate sequence;
- idempotent consumer key;
- retry with exponential backoff and jitter;
- dead-letter handling and operator replay;
- per-tenant ordering where business-required;
- delivery lag SLO and alerting;
- payload schema versioning.

### Acceptance gate

- no committed delete can omit its durable search-removal event;
- API success does not depend on search/notification availability;
- consumers tolerate duplicate delivery;
- outbox lag and failures are visible and recoverable;
- replay does not duplicate domain effects.

## 13. Workstream G — PostgreSQL, RLS, and connection architecture

### 13.1 Index design

Indexes for tenant entities should normally begin with `tenant_id` and match actual filter/sort shapes.

Examples:

```sql
CREATE INDEX ... ON document.purchase_order
  (tenant_id, status, created_at DESC, id DESC);

CREATE INDEX ... ON document.purchase_order
  (tenant_id, company_code_id, status, document_date DESC, id DESC);

CREATE INDEX ... ON document.purchase_order_line
  (tenant_id, purchase_order_id, line_no, id);
```

Use partial indexes for active/common operational subsets where selectivity and write cost justify them.

### 13.2 RLS requirements

- policies use index-compatible tenant predicates;
- tenant GUC functions are stable and inexpensive;
- every transaction sets tenant/principal context before protected SQL;
- query plans are tested with representative tenant-size skew;
- privileged/bypass roles are restricted and audited.

### 13.3 Connection management

- PgBouncer transaction mode for API and workers;
- dedicated direct connections only for `LISTEN/NOTIFY` and other session-dependent behavior;
- pool size derived from total replica count and PostgreSQL capacity;
- connection-acquisition latency included in SLOs;
- statement, lock, and idle-in-transaction timeouts;
- no network calls inside open database transactions.

### 13.4 Operational tuning

- enable and retain `pg_stat_statements` data;
- slow-query log with controlled sampling;
- autovacuum tuning for high-update/event/idempotency tables;
- index and table bloat monitoring;
- temporary-file and sort spill alerts;
- partition lifecycle for append-heavy logs/events where justified;
- regular `EXPLAIN (ANALYZE, BUFFERS)` review for critical templates.

### Acceptance gate

- no critical list query performs an unexpected sequential scan at target scale;
- connection pool wait remains within its budget under peak load;
- no idle-in-transaction accumulation;
- RLS correctness tests pass for large and small tenants;
- autovacuum and bloat remain within defined operational thresholds.

## 14. Workstream H — Redis and cache architecture

### Workload isolation

Separate at least by credentials, ACL, namespace, eviction policy, and monitoring:

```text
Session Redis — BFF sessions, PKCE, refresh/SID/logout indexes
Cache Redis   — descriptors, lists, effective sessions, reference data
Queue Redis   — BullMQ job state and scheduling
```

Separate deployments are recommended when queue or cache pressure could evict/authenticate session state or when independent scaling/recovery is required.

### Client standardization

Provide one Athyper Redis platform package that defines:

- supported client implementation per runtime;
- connection singleton/pool ownership;
- connect and command timeout;
- bounded retry and circuit-breaking behavior;
- serialization and schema versions;
- key construction and validation;
- metrics and tracing;
- failure policy by cache domain.

### Generation invalidation

Extend the list generation pattern to descriptors and other fanout-heavy caches:

```text
descgen:{plane}:{tenant}:{entity} = 42
desc:{plane}:{tenant}:{entity}:g42:{variant}
```

Old keys expire naturally. Do not place Redis `SCAN` in the normal invalidation path.

### Stampede control

- single-flight within a process;
- bounded distributed loader lock across processes;
- randomized TTL jitter;
- negative caching only where invalidation is guaranteed;
- bounded stale-while-revalidate for nonsecurity data;
- never serve stale permission data following revocation.

### Failure classification

| Domain | Failure behavior |
|---|---|
| Browser session/PKCE | Fail closed; return controlled auth-unavailable response |
| Effective permission cache | Recompute from PostgreSQL; fail closed if recomputation fails |
| Descriptor cache | Recompile from PostgreSQL with stampede control |
| List/count cache | Query PostgreSQL |
| Reference cache | Query PostgreSQL or return explicit degraded projection |
| BullMQ | Do not acknowledge durable job acceptance unless enqueued/outboxed |

### Acceptance gate

- no normal invalidation requires full keyspace scan;
- session keys cannot be evicted by list/descriptor pressure;
- cold-cache load does not overload PostgreSQL;
- cache loss preserves correctness and has tested degraded behavior;
- all key namespaces have owner, TTL, value schema, source of truth, and metrics.

## 15. Workstream I — attachment data path

### Target upload flow

```text
Client -> authorize upload with Athyper
       <- attachment ID, storage key policy, presigned URL
Client -> stream bytes directly to S3/MinIO
Client -> complete upload with size/hash/ETag
API    -> verify object and commit quarantined attachment/link
Outbox -> scan/extract worker
Worker -> active or failed/quarantined result
```

### Requirements

- JSON/base64 path restricted to small compatibility payloads;
- multipart API remains streaming and bounded;
- presigned key is server-generated and tenant/entity scoped;
- completion verifies object metadata and optionally checksum;
- abandoned upload sweep;
- scan/extraction fully asynchronous;
- downloads use authorized short-lived presigned URLs where audit policy permits, otherwise streaming proxy;
- object-store calls are outside database transactions;
- DB failure has observable compensation/orphan cleanup.

### Acceptance gate

- large uploads do not materially increase BFF/API heap;
- API bandwidth is not proportional to direct-upload file size;
- quarantine and download-blocking behavior remains intact;
- abandoned and orphaned objects are measurable and recoverable;
- load testing covers concurrent large uploads and downloads.

## 16. Workstream J — realtime and SSE scaling

### Target model

```text
Mutation transaction -> durable outbox/runtime event
Worker               -> Redis Streams/NATS-compatible fanout
API instance          -> local subscription multiplexer
SSE connections       -> in-process fanout

Reconnect/gap only    -> PostgreSQL durable cursor catch-up
```

### Requirements

- no continuous PostgreSQL polling per connection;
- one upstream subscription can serve many local SSE connections;
- bounded per-connection buffer and slow-client disconnect policy;
- cursor-based reconnect and retention-expired reset;
- tenant/entity authorization checked at subscription;
- connection, fanout, dropped-client, and catch-up metrics;
- heartbeat does not query PostgreSQL.

### Acceptance gate

- database query rate is not proportional to connected idle SSE clients;
- 10,000 idle connections can be tested without database-poll amplification;
- reconnect recovers committed events within retention;
- slow clients cannot exhaust process memory.

## 17. Workstream K — deployment and runtime capacity

### Runtime separation

Operate API, worker, scheduler, and realtime responsibilities with independent concurrency and scaling controls. Avoid running CPU-heavy extraction/render work in API processes.

### Node runtime requirements

- monitor event-loop lag and heap;
- set explicit request/body/stream limits;
- bounded JSON serialization and compression policy;
- graceful shutdown drains HTTP and stops new transactions;
- readiness reflects critical dependencies without causing restart loops for optional accelerators;
- CPU and memory requests/limits based on load tests;
- horizontal scaling uses pool-aware database capacity calculations.

### Capacity model

Maintain a production calculation covering:

```text
peak requests per second
peak concurrent writes
API replicas and per-replica DB pool
worker replicas and per-replica DB pool
direct listener connections
Redis connections by domain
SSE concurrent connections
outbox production and consumption rate
attachment throughput
```

### Acceptance gate

- a replica loss does not violate correctness;
- scale-out does not exceed PostgreSQL/Redis connection capacity;
- graceful deployment does not interrupt committed mutations or lose outbox work;
- capacity headroom is documented for expected peak and failure mode.

## 18. Performance test architecture

### Dataset profiles

| Profile | Tenants | Master rows | Document rows | Children/document |
|---|---:|---:|---:|---:|
| Functional scale | 10 | 10,000 | 50,000 | 5 |
| Production representative | 100 | 100,000 | 1,000,000 | 5–20 |
| Tenant-skew stress | 100 | 1,000,000 in one tenant | 5,000,000 in one tenant | 20 |

### Required scenarios

1. warm and cold entity descriptor;
2. detail GET;
3. first-page and deep-navigation list;
4. filtered/sorted list with no, cached, and exact counts;
5. simple master create and PATCH;
6. document create with 10 and 100 children;
7. aggregate update with create/update/delete child mixture;
8. concurrent edits to the same record;
9. idempotent replay and key mismatch;
10. lifecycle transition with required hooks;
11. delete/archive and search projection removal;
12. Redis cold start and outage;
13. search unavailable while writes continue;
14. 10,000 SSE idle connections plus active event fanout;
15. concurrent direct and proxied attachment transfer.

### Release regression gates

- p95 regression no more than 15% without approved explanation;
- query count does not exceed the declared route budget;
- server error rate below scenario threshold;
- database pool acquisition p95 below 25 ms under target load;
- event-loop lag and heap remain within runtime thresholds;
- outbox backlog returns to steady state after burst;
- no cross-tenant or permission-scope cache leakage;
- no lost or duplicate authoritative business mutation.

## 19. Phased delivery roadmap

### Phase 0 — baseline and guardrails

**Indicative duration:** 2–3 weeks  
**Goal:** know where time and queries are spent before structural changes.

Deliverables:

- request/query/transaction/Redis instrumentation;
- baseline datasets and k6 scenarios;
- initial route SLOs and query budgets;
- PostgreSQL top-query and pool dashboards;
- cache namespace ownership inventory;
- top 20 optimization backlog ranked by total production cost.

Exit criteria:

- baseline is repeatable;
- critical routes have attributable latency breakdowns;
- no optimization project proceeds without a measurable hypothesis.

### Phase 1 — low-risk read-path improvements

**Indicative duration:** 3–5 weeks  
**Goal:** remove repeated warm-path work and large-list bottlenecks.

Deliverables:

- verified request context reused by CRUD;
- compiled execution descriptor L1/L2 cache;
- request-local memoization;
- optional count modes;
- keyset pagination for the highest-volume entities;
- batched label enrichment;
- indexes for the top list query templates;
- stampede protection.

Exit criteria:

- warm metadata SQL reaches zero;
- major list routes meet query budgets;
- p95 read latency and DB calls improve against baseline;
- security and invalidation conformance suites pass.

### Phase 2 — write-path convergence

**Indicative duration:** 6–10 weeks, delivered incrementally  
**Goal:** make mutations predictable, short, idempotent, and transactionally complete.

Deliverables:

- `EntityMutationService` contracts;
- transactional outbox for search/cache/realtime/notification events;
- strict rejected-field errors;
- set-based child mutations;
- domain handler registry and compile-time validation;
- migration of generic PATCH, then create/delete, then workspace and lifecycle paths;
- query/transaction budgets enforced per mutation.

Exit criteria:

- every migrated write produces durable audit/outbox in the same transaction;
- retries are deterministic;
- generic kernel contains no entity-name branches;
- write SLOs and transaction budgets pass at production scale.

### Phase 3 — infrastructure and high-scale I/O

**Indicative duration:** 4–8 weeks  
**Goal:** remove high-volume bytes, polling, and invalidation scans from hot paths.

Deliverables:

- standardized Redis platform and workload isolation;
- descriptor generation invalidation;
- direct presigned attachment transfers;
- shared realtime fanout with cursor catch-up;
- PgBouncer/pool capacity validation;
- worker/outbox autoscaling and lag alerts;
- failure-mode load tests.

Exit criteria:

- no normal descriptor `SCAN` invalidation;
- large attachments do not traverse BFF/API memory;
- idle SSE connections do not produce periodic PostgreSQL queries;
- Redis/search/worker impairment tests preserve authoritative CRUD behavior.

### Phase 4 — continuous performance governance

**Ongoing**

- performance qualification in release pipelines;
- monthly top-query and capacity review;
- quarterly tenant-skew and failure-mode test;
- explicit performance review for metadata/runtime contract changes;
- SLO error-budget review;
- cleanup of compatibility paths once migration telemetry reaches threshold.

## 20. Ownership model

| Workstream | Primary owner | Required partners |
|---|---|---|
| Observability/baseline | Platform/SRE | API, database, domain teams |
| Verified request context | IAM/platform | All route owners |
| Execution descriptors | Metadata/platform | UI runtime, IAM, records |
| Query service/lists | Records/platform | Database, frontend |
| Mutation kernel/outbox | Records/platform | Domain, audit, workflow, search |
| PostgreSQL/RLS | Database/platform | IAM, records, SRE |
| Redis/cache | Platform/SRE | IAM, jobs, metadata |
| Attachments | Documents/platform | Security, storage, frontend |
| Realtime | Collaboration/platform | Database, SRE, frontend |
| Performance gates | SRE/quality | All service owners |

Every SLO and query-budget exception must have a named owner and expiry/review date.

## 21. Rollout and rollback strategy

### Required rollout controls

- feature flags per entity and operation;
- shadow descriptor compilation with hash/result comparison;
- dual-read comparison for list/query migrations without returning shadow output;
- shadow authorization decision logging;
- mutation kernel introduced entity-by-entity;
- outbox consumers idempotent before dual publication;
- canary tenants and canary API replicas;
- automatic rollback on latency, error, conflict, or correctness thresholds.

### Rollback rules

- retain old read path until result parity and performance gates pass;
- do not dual-write authoritative records through two kernels;
- mutation routing can return to the previous single authoritative path through a feature flag;
- outbox schema remains backward-compatible during consumer rollback;
- metadata descriptor generation can fall back to PostgreSQL compilation;
- cache failures must never require data rollback.

## 22. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Cached descriptor omits security-relevant material | Version/hash coverage tests; principal-specific material kept outside shared descriptor |
| Request-context caching delays revocation | Preserve auth epoch and explicit revocation invalidation |
| Mutation-kernel migration changes domain behavior | Per-entity canary, golden fixtures, result/audit comparison |
| Outbox creates duplicate external events | Stable event IDs and idempotent consumers |
| Keyset pagination changes UX/navigation | Opaque cursors plus bounded compatibility mode |
| Count removal affects UI | Explicit count modes and asynchronous/cached totals |
| Redis split increases operational cost | Start with ACL/namespace isolation; separate deployments based on measured contention |
| L1 caches increase process memory | Size bounds, eviction metrics, heap/load tests |
| Short transactions move validation outside lock | Revalidate all state-dependent constraints after acquiring the lock |
| Direct attachment upload bypasses API byte inspection | Server-generated key, checksum verification, quarantine, mandatory asynchronous scan |

## 23. Definition of production-grade completion

The performance architecture program is complete when:

1. warm CRUD no longer repeatedly resolves tenant, principal, metadata, fields, and operations;
2. critical routes meet published latency, query, transaction, and error budgets;
3. all authoritative writes have transactionally durable audit/outbox state;
4. large lists use stable keyset navigation and do not require exact counts by default;
5. domain-specific mutations extend one kernel through registered contracts;
6. Redis cache loss degrades predictably without data or authorization leakage;
7. browser sessions and queues cannot be evicted by general cache pressure;
8. large attachment bytes bypass BFF/API memory;
9. idle realtime connections do not poll PostgreSQL continuously;
10. production-like performance and failure tests gate releases;
11. capacity models cover normal peak, replica loss, Redis impairment, and worker backlog;
12. SLOs, dashboards, runbooks, and owners are maintained operationally.

## 24. Final prioritization

If Athyper can fund only five initiatives initially, implement these in order:

1. **Per-request query and transaction instrumentation.**
2. **Verified request context reused by all CRUD services.**
3. **Compiled execution descriptors with L1/L2 generation caching.**
4. **Keyset pagination, optional counts, and tenant-leading index optimization.**
5. **Unified mutation kernel with transactional audit and outbox.**

These changes provide the largest combined improvement in latency, throughput, database capacity, consistency, and maintainability. Redis separation, direct attachments, and realtime fanout then remove the next scale ceilings without weakening Athyper's security and governance model.

## Related analysis

- [Frappe vs Athyper base framework architecture comparison](./frappe-vs-athyper-base-framework-architecture-report.md)
- [Athyper schema map](../../server/db/ddl/SCHEMA_MAP.md)
- [Meta-entity overview](../meta-entity/overview.md)
- [Document CRUD lifecycle](../framework/document-crud-lifecycle.md)
