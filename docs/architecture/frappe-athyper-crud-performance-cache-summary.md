# Frappe vs Athyper: CRUD Performance and Cache Architecture Summary

## Purpose

This document consolidates the attached comparison into a decision-oriented technical summary. It covers CRUD execution, expected performance characteristics, cache usage, Athyper drawbacks, and a production-grade improvement sequence.

The comparison is based on source inspection of the local Frappe and Athyper codebases. Performance statements are architectural predictions, not measured benchmark results. A reliable winner requires the same dataset, infrastructure, concurrency, security rules, and test scenarios.

Detailed supporting analysis is available in:

- [Base framework architecture comparison](./frappe-vs-athyper-base-framework-architecture-report.md)
- [Athyper production performance architecture improvement plan](./athyper-performance-architecture-improvement-plan.md)

## Executive conclusion

Frappe has the simpler CRUD hot path. Its unified `Document` abstraction gives it a likely latency advantage for ordinary single-record create, read, update, and delete operations.

Athyper has a more explicit enterprise control model: Keycloak IAM, PostgreSQL row-level security, metadata versions, optimistic concurrency, idempotency, workflow controls, object storage, and asynchronous work queues. Those controls improve correctness and horizontal scalability, but the current implementation can resolve the same metadata, identity, and authorization context more than once and has multiple mutation paths. This creates avoidable CPU, Redis, and database work.

The recommended direction is not to copy Frappe. Athyper should preserve its security and concurrency guarantees while making their runtime cost close to constant: build request context once, compile metadata and policy once per version, use one mutation kernel, keep database transactions short, and move durable side effects to a transactional outbox.

## CRUD architecture comparison

| Concern | Frappe | Athyper | Performance implication |
|---|---|---|---|
| Request path | Web request enters a tightly integrated Python framework | Next.js BFF and Express API boundaries | Athyper can add network, serialization, and duplicated-auth cost |
| Generic entity model | DocType metadata drives a unified `Document` runtime | Versioned metadata drives generic routes plus domain-specific branches | Athyper is more explicit but has a larger execution surface |
| Create/update | Central document lifecycle and hooks | Validation, policy, RLS, idempotency, row version, workflow, audit, and integrations | Frappe likely wins simple-operation latency; Athyper provides stronger controls |
| Read/list | Direct ORM and permission-aware query paths | Generic query construction, RLS, field authorization, enrichment, cache options | Athyper needs strict query and enrichment budgets |
| Concurrency | Conventional document save semantics | ETag/row-version optimistic concurrency | Athyper is safer under concurrent editing |
| Delete/lifecycle | Framework document delete and lifecycle hooks | Generic and entity-specific rules with lifecycle/workflow controls | Athyper is powerful but behavior can fragment across code paths |
| Side effects | Framework hooks and background jobs | Mix of transactional work, post-commit work, events, and queues | Athyper needs one outbox contract for reliable, fast commits |

## Expected performance by workload

| Workload | Expected advantage before Athyper improvements | Reason | Confidence |
|---|---|---|---|
| Single simple create/read/update | Frappe | Shorter integrated path and fewer control-plane lookups | Medium; benchmark required |
| Metadata-heavy cold request | Frappe | Athyper can repeatedly load and compile control information | Medium; benchmark required |
| Warm cached metadata request | Narrower gap | Athyper can amortize metadata and policy compilation | Medium; benchmark required |
| High-contention update | Athyper correctness advantage | Explicit optimistic concurrency prevents silent overwrite | High from architecture; throughput still unmeasured |
| Complex tenant isolation | Athyper control advantage | Database RLS provides an additional enforcement layer | High from architecture; latency cost unmeasured |
| Large list with enrichment/count | Frappe likely initially | Athyper's count, projection, and enrichment can multiply queries | Medium; data-shape dependent |
| Attachment-heavy traffic | Athyper after direct-upload design | S3-compatible storage can scale independently of API workers | Medium; current and target paths differ |
| Horizontally scaled async work | Athyper | Redis/BullMQ and separated workers are natural scale-out components | Medium; operational configuration matters |

No numerical latency or throughput claim should be published until the benchmark gate described below is run.

## Cache architecture comparison

### Frappe

Frappe uses a compact cache model:

- Redis is a shared framework service for cache, sessions, queue coordination, and realtime-related state.
- Keys are site-aware, supporting multi-site isolation.
- Request-local and process-local tracking avoids repeated cache reads inside one execution context.
- Metadata and permission-related values are cached close to the integrated framework runtime.

This model is easy to follow and efficient for a cohesive application, although mixed Redis workloads can interfere with one another unless deployment separates them operationally.

### Athyper

Athyper uses Redis across several distinct responsibilities:

- sessions and authentication-related state;
- metadata and entity-definition caches;
- authorization epochs and invalidation signals;
- entity/list caching;
- idempotency and coordination state;
- BullMQ queues and workers;
- realtime or event fan-out support.

This gives Athyper more scaling options, but the architecture is fragmented. Multiple Redis client patterns, overlapping key conventions, broad invalidation, and scan-based deletion can increase connection count, operational complexity, and tail latency.

### Cache design recommendation

Adopt one logical cache contract with workload isolation:

| Redis workload | Availability behavior | Recommended isolation |
|---|---|---|
| Sessions/security state | Fail closed where correctness depends on it | Dedicated logical/physical service with HA |
| Metadata/policy descriptors | Allow controlled database rebuild with stampede protection | Dedicated cache namespace and memory budget |
| Entity/list acceleration | Bypass cache safely on failure | Separate namespace; optional separate service |
| Queues | Do not share eviction pressure with disposable cache entries | Dedicated Redis service |
| Realtime fan-out | Degrade realtime without blocking CRUD | Separate namespace or service at scale |

Use versioned or generation-based keys instead of wildcard scans. A metadata publication, policy epoch change, or entity mutation should advance a small version token; old entries then expire naturally. Add single-flight locking with bounded wait and jittered TTLs to prevent cache stampedes.

## Principal Athyper drawbacks

### 1. Repeated control-plane work

Tenant, actor, membership, metadata, policy, and field-access information may be resolved in multiple layers. The request pays for conceptually identical decisions more than once.

### 2. Oversized generic CRUD surface

The records route combines framework concerns, query behavior, authorization, lifecycle logic, enrichment, and special cases. It is difficult to maintain a predictable query budget or isolate regressions.

### 3. Multiple mutation paths

Generic routes, command paths, and entity-specific handlers can implement different validation, child-record, audit, idempotency, and event behavior. Correctness fixes and optimizations therefore do not automatically apply everywhere.

### 4. Broad transactions and synchronous side effects

Metadata resolution, policy work, integration preparation, or side effects near the transaction boundary can extend lock duration and reduce throughput. Post-commit work without a durable outbox can also be lost after the database commits.

### 5. Expensive list behavior

Offset pagination, unconditional exact counts, wide projections, per-row enrichment, and unbounded filters can turn a nominal single list request into substantial database work.

### 6. Cache fragmentation

Different Redis clients and invalidation strategies complicate observability and failure behavior. Scan-based invalidation becomes increasingly expensive as the keyspace grows.

### 7. API-mediated attachment transfer

If large file bytes pass through application workers, upload traffic consumes memory, sockets, and CPU that should remain available for CRUD traffic.

## Production-grade recommendation plan

### Phase 0: establish evidence and guardrails

1. Instrument end-to-end CRUD spans across BFF, API, IAM, metadata, Redis, PostgreSQL, RLS, and outbox/queue stages.
2. Record query count, transaction duration, cache hit/miss, pool wait, event-loop delay, payload size, and error/conflict rate.
3. Create representative small, medium, and large tenant datasets.
4. Add performance regression gates to CI or a scheduled production-like environment.

Exit condition: every benchmark result can be attributed to specific application and infrastructure stages.

### Phase 1: remove repeated work from the hot path

1. Build one immutable `VerifiedRequestContext` per request.
2. Compile metadata, field rules, lifecycle rules, policy inputs, and query capabilities into a `CompiledExecutionDescriptor` keyed by tenant, entity, metadata version, and authorization epoch.
3. Keep a bounded in-process L1 cache and Redis L2 cache with versioned invalidation.
4. Standardize Redis clients, key construction, timeout behavior, metrics, and failure classification.

Exit condition: after warm-up, normal CRUD performs no duplicate tenant, membership, metadata, or policy resolution.

### Phase 2: optimize reads and PostgreSQL usage

1. Split the generic records surface into small query, mutation, lifecycle, attachment, and bulk services.
2. Introduce keyset pagination; retain offset pagination only for bounded compatibility cases.
3. Make exact counts explicit or bounded rather than automatic.
4. Select only authorized requested fields and batch all enrichment.
5. Validate tenant-leading composite indexes using production-shaped `EXPLAIN (ANALYZE, BUFFERS)` results.
6. Measure RLS policies directly and tune connection pooling without losing transaction-scoped tenant context.

Exit condition: warm single-record reads and mutations stay within declared query budgets, and list query cost grows with page size rather than total table size.

### Phase 3: converge the write architecture

1. Route create, update, delete, lifecycle, and bulk operations through one `EntityMutationService`.
2. Perform metadata compilation and integration preparation before opening the transaction.
3. Keep only lock, recheck, database mutation, audit, and outbox insertion inside the transaction.
4. Use one transactional outbox for cache invalidation, notifications, webhooks, projections, search, and realtime publication.
5. Preserve idempotency, ETag/row-version checks, RLS, audit, and workflow guarantees.

Exit condition: all mutation entry points have equivalent security, concurrency, audit, child-record, event, and retry semantics.

### Phase 4: scale high-I/O paths independently

1. Use presigned object-storage upload/download, quarantine, asynchronous scanning, and explicit attachment states.
2. Replace per-process database polling for SSE with shared fan-out and bounded replay.
3. Separate web, background worker, queue Redis, cache Redis, and realtime capacity where load justifies it.
4. Add autoscaling signals based on pool wait, queue lag, event-loop delay, and p95/p99 latency rather than CPU alone.

Exit condition: attachment, queue, or realtime spikes do not materially degrade ordinary CRUD SLOs.

## Benchmark decision gate

Run Frappe and Athyper against identical infrastructure and data profiles. At minimum, test:

- cold and warm single-record reads;
- create and update with representative validation and authorization;
- optimistic conflict behavior;
- list pages at early and deep positions, with and without exact count;
- metadata/policy cache cold starts and invalidation storms;
- attachment initiation and completion;
- 1, 10, 50, and 100 or more concurrent users;
- Redis degradation, database pool pressure, and worker backlog.

Report p50, p95, p99, throughput, error rate, conflict rate, queries per request, database time, pool wait, Redis calls, cache hit ratio, application CPU, memory, and event-loop delay. Compare both raw latency and the security/correctness guarantees enabled in each run.

## Final recommendation

Use Frappe's cohesive CRUD execution model as a simplicity benchmark, not as Athyper's target architecture. Athyper's production advantage should be a predictable, compiled, secure execution pipeline:

`request -> verified context -> compiled descriptor -> query or mutation kernel -> short transaction -> outbox -> asynchronous side effects`

The immediate priorities are observability, canonical request context, compiled descriptors, read-path query control, and Redis standardization. The most consequential structural change is convergence on one mutation service plus transactional outbox. Together, these changes reduce latency and tail-risk while retaining the controls that distinguish Athyper from a simpler CRUD framework.
