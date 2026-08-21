# Phase 9 Jobs Recovery

## Boundary

`@athyper/server-contract-jobs` owns transport-neutral job envelopes, execution
coordinates, retry policy, definitions, scheduling and lifecycle ports.
`@athyper/server-runtime-jobs` owns BullMQ queues and workers, while
`@athyper/server-runtime-scheduling` owns BullMQ repeatable schedules.
`@athyper/server-service-jobs` owns definition governance, durable execution
coordination and schedule reconciliation. Capability packages continue to own
their payload schemas and handlers. Only the platform host composes concrete
databases, Redis and handlers.

## Three-plane and Entity Meta model

Governed jobs carry `planeKey`, scope, principal and, for tenant work,
`tenantId`. The runtime establishes these values in Foundation execution
context before invoking a handler. Schedules receive a physical-plane prefix so
identical schedule codes cannot collide in shared BullMQ Redis.

An entity-related job may carry `entityCode`, `recordId`, `operationCode` and an
Entity Meta contract release. Jobs never interpret `entityCode` as a table path.
Non-entity maintenance work leaves the subject absent.

## Recovered in this increment

- Governed execution, subject, payload schema, backoff and timeout contracts.
- A canonical definition catalog that rejects duplicate codes and handler
  ownership.
- Plane-isolated schedule reconciliation against registered handlers.
- BullMQ propagation of governed metadata without breaking legacy payloads.
- Foundation job context populated with plane, tenant, principal and
  correlation identity.
- Execution lifecycle hooks for queued, started, completed and failed evidence.
- Retry/permanent/timeout/cancellation failure classification.
- Priority and backoff mapping for queues and repeatable schedules.
- Migration inference for existing payloads that already contain verified
  `planeKey`, `tenantId` and `principalId` fields.
- Kysely schedule and execution repositories spanning Athyper, Neon and Mesh
  through explicit tenant/system transaction boundaries.
- DDL-driven notification discovery and hourly/daily/weekly digest schedules;
  the previous code-only registration has been removed.
- Periodic schedule reconciliation with physical-plane-qualified scheduler IDs.
- Durable logical-run updates plus append-only attempt evidence.
- Append-only, actor-attributed retry/replay/cancel command evidence.
- RBAC-protected tenant administration routes and DLQ listing.
- Cronwatch start/success/failure lifecycle pings composed after durable
  execution evidence.
- Worker and scheduler heartbeat-file health probes appropriate for non-HTTP
  processes.

## Retained follow-up

- Apply the revised common DDL to disposable databases and add live Redis plus
  Athyper/Neon/Mesh PostgreSQL integration tests.
- Give plane-global execution writes a dedicated worker database role before
  production activation; system transactions must not reuse an API credential.
- Rebuild the authenticated BullBoard read surface or remove the remaining
  compose claim that it is embedded.
- Move each legacy business worker to its owning capability and record parity or
  retirement; no legacy worker implementation should be copied wholesale into
  the generic Jobs service.
