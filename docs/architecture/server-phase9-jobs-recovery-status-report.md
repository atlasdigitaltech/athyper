# Phase 9 Jobs Recovery status report

Date: 2026-08-10  
Plan reviewed: **Phase 9 Jobs Recovery**

## Decision

**Recovered implementation: complete and locally qualified.**  
**Production activation: not yet complete.**

The planned contracts, runtime split, governance service, DDL-backed schedule discovery, durable lifecycle evidence, administration routes, and host composition are present. The remaining items named in the plan require disposable/live infrastructure evidence or an explicit operational decision; they should remain open before production activation.

## Confirmed implementation

- `@athyper/server-contract-jobs` owns transport-neutral envelopes, execution coordinates, payload-schema, retry/backoff, lifecycle, administration, and scheduling ports.
- `@athyper/server-runtime-jobs` owns BullMQ queue/worker behavior; `@athyper/server-runtime-scheduling` owns BullMQ repeatable scheduler behavior; `@athyper/server-service-jobs` owns definition governance, Kysely stores, schedule reconciliation, and administration coordination.
- Governed envelopes carry plane, scope, principal, optional tenant/correlation identity, payload-schema, and optional Entity Meta subject. Legacy pending payloads can infer verified `planeKey`, `tenantId`, and `principalId`; the one-window `athyper` → `studio` payload normalization remains at runtime ingress.
- Runtime workers establish Foundation job context before invoking handlers. Timeout, cancellation, retryable, and permanent failures are classified; priority, backoff, retention, and timeout map to BullMQ options.
- The definition catalog rejects duplicate definitions/handler ownership. The reconciler validates a schedule against the registered catalog, rejects cross-plane records, and physically prefixes scheduler IDs with `studio:`, `neon:`, or `mesh:`.
- DDL-backed `control.cron_schedule` discovery seeds notification discovery plus hourly/daily/weekly digest work. Periodic scheduler reconciliation is composed in the host.
- Kysely repositories write durable logical executions, append-only attempts, and actor-attributed retry/replay/cancel command evidence through explicit tenant or system transaction boundaries. The common DDL has forced RLS on execution, attempt, and command tables.
- RBAC-protected routes expose tenant-scoped dead-letter listing plus cancel/retry/replay. Worker and scheduler processes have heartbeat-file probes. Cronwatch lifecycle pings are composed after durable lifecycle writes.

## Fresh verification

Executed on 2026-08-10:

| Package | Result |
| --- | --- |
| `@athyper/server-contract-jobs` | 1 test passed |
| `@athyper/server-runtime-jobs` | 5 tests passed |
| `@athyper/server-runtime-scheduling` | 2 tests passed |
| `@athyper/server-service-jobs` | 4 tests passed |
| `@athyper/server-platform-host` | 53 tests passed |

Total: **65 tests passed**. The host test run emitted pre-existing root TypeScript-base-config lookup warnings, but completed successfully.

## Plan status by area

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Contracts and package boundary | Passed | All four intended package surfaces exist and are independently tested. |
| Governed BullMQ envelope/context migration | Passed locally | Runtime preserves legacy payloads and normalizes legacy plane input; a live pending-job migration/drain check remains advisable. |
| Definition catalog and schedule reconciliation | Passed locally | Catalog and plane-qualified reconciliation are implemented and host-tested. |
| Durable execution/attempt/command evidence | Passed locally | Kysely repositories and common `ops` DDL are present; no disposable three-plane database execution evidence was supplied. |
| DDL notification/digest schedules | Implemented | Current common seed is DDL-driven; actual schedules must still be applied and reconciled against all target databases. |
| RBAC administration and DLQ | Implemented and unit-qualified | REST routes enforce `jobs.board.view` and `jobs.queue.manage`; authenticated live authorization must still be exercised. |
| Cronwatch and heartbeat probes | Implemented | Composition/source verified; live pings and probe behavior have not been captured. |
| Dedicated worker database role | Pending | Separate worker database URLs are supported, but system transactions fall back to the normal plane adapter when no worker URL is configured. This is not sufficient proof of a dedicated production role. |
| BullBoard surface | Pending decision | The supported runtime surface is the RBAC REST administration API. Rebuild authenticated BullBoard or remove any compose claim that it is embedded. |
| Legacy business workers | Pending inventory | Capability-owned handlers are being registered, but a complete legacy-worker parity/retirement inventory has not been evidenced. |

## Required production-activation evidence

1. Apply the revised common DDL to disposable Athyper/Studio, Neon, and Mesh databases, then run lifecycle, RLS, schedule-reconciliation, and administration integration tests against each plane.
2. Run live Redis/BullMQ tests for governed metadata propagation, retries/backoff, timeout/cancellation, dead-letter behavior, replay, and physical-plane schedule isolation.
3. Provision distinct least-privilege worker database credentials for plane-global/system execution writes; remove reliance on the normal API adapter fallback before activation.
4. Exercise the authenticated admin/DLQ routes with allowed and denied tenant users, and choose whether to rebuild BullBoard or remove its compose/documentation claim.
5. Inventory every legacy business worker, move it to its owning capability where needed, and retain a parity or retirement record for each.
6. Capture Cronwatch and worker/scheduler heartbeat evidence in the target observability environment.

## Completion recommendation

Record this work as **“Jobs Recovery build complete; infrastructure qualification and production hardening pending.”** It should not be marked production-complete until the six evidence items above are closed.
