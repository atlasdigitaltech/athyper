# System health API review — 2026-09-06

Reviewed the four HTTP handlers, middleware ordering, generated OpenAPI contracts, health registry, API startup/shutdown, deployed probe wiring, and the two failing development health contributions. Application changes are local. The follow-up MESH database repair described below was applied to development; no application deployment was performed. Existing unrelated workspace edits were preserved.

## Endpoint semantics

| Endpoint | Meaning | HTTP behavior after these changes |
| --- | --- | --- |
| `GET /livez` | Process can answer HTTP; no dependency queries | 200 with `status: alive`, including while starting/draining if the listener is still reachable |
| `GET /readyz` | Startup completed and registered dependencies can serve | 200 for healthy/degraded; 503 while starting/draining or when any check fails/times out |
| `GET /healthz` | Compatibility alias of `/readyz` | Identical handler, checks, payload and HTTP status rules |
| `GET /health` | Compatibility alias of `/readyz` | Identical handler, checks, payload and HTTP status rules |

There is no special meaning attached to the `z` suffix in this implementation. Prefer `/livez` for process liveness and `/readyz` when a consumer needs dependency readiness. The API ingress configuration currently deliberately probes `/livez`; this review does not change ingress policy. An empty registry remains healthy after startup, preserving the standalone runtime's existing behavior.

## Fixed findings

1. **P1 — Unbounded dependency waits and overlapping work.** `Promise.all` waited indefinitely for a hung health contribution. The general HTTP deadline only aborted a request signal that these checks did not consume. Every probe also started another dependency operation. Added a configurable 2-second per-check timeout and shared in-flight work across all aliases. Timeout returns an unhealthy contribution; a stuck operation remains shared until it settles, preventing repeated probes from accumulating operations. Settled checks can run again and recover.
2. **P1 — Premature readiness during initialization.** The listener started before Redis connection, IAM warmup, database qualification and other lifecycle hooks finished. Added an explicit host startup gate. The lifecycle manager also swallowed initialization errors; the API now requests strict error propagation so failed startup never opens the readiness gate. Other lifecycle callers retain their existing best-effort behavior.
3. **P2 — Liveness incorrectly failed during graceful drain.** Admission middleware rejected `/livez` with 503. Probe requests now reach their handlers during draining: liveness remains 200, all readiness aliases return 503 without querying dependencies. Readiness also rechecks the gate after in-flight checks settle, closing a drain race. Ordinary requests retain the existing draining rejection.
4. **P2 — Probe responses allowed caching.** All four probe paths now return `Cache-Control: no-store`, including startup/drain failures, to prevent stale probe success.
5. **P2 — Invalid contribution status could report healthy.** Unknown/missing status values previously fell through the status reduction as healthy (or caused a 500). Invalid contributions now fail closed as unhealthy. Thrown/rejected checks retain sanitized error messages.
6. **P3 — OpenAPI hid endpoint semantics and response shape.** Replaced operation-ID-only summaries with meaningful descriptions, documented alias equivalence and degraded behavior, and added response schemas. Liveness no longer advertises a dependency-related 503 response.

## Development observations and unresolved findings

Read-only requests to `api.dev.athyper.test` returned `/livez` 200 and all three readiness aliases 503. Each readiness response contained the same 42 checks and these same two failures. The development certificate is self-signed; the inspection used a credential-free TLS-verification-disabled client. These responses describe the deployed version at the time of the initial review, not the local edits.

- **Resolved locally — `business-partner-case-age.neon` was a faulty tenantless collector.** Removed it from readiness and moved both queries into a lifecycle-managed background collector. Each operator-authorized tenant/service-account pair runs through `withTenantTransaction`, with account validation and explicit tenant filters. Complete sweeps publish maximum ages and summed dead letters under the existing metric names; failures are reported through separate metrics/alerts and operational logs. See [collector setup and verification](business-partner-metrics-collector.md). Deployment and target configuration are still required.
- **Resolved in development — MESH exchange schema/seed drift.** Catalog inspection confirmed that the relationship command and its runtime execution grant existed, while the registration command, its G3 supporting tables, and all three exchange permissions were absent. Applied the rehearsed `20260906_mesh_exchange_readiness.sql` migration to development and recorded its checksum. All five requirements now pass as `athyper_runtime`, and the deployed MESH health contribution is healthy. Local application changes replace prefix/count matching with explicit per-requirement diagnostics and execution checks. See [repair evidence and verification](mesh-exchange-readiness-repair.md).
- **P2 — Public dependency diagnostics expose implementation details.** These unauthenticated endpoints return registered check names and messages, including errors caught and returned by individual contributors. The shared wrapper sanitizes thrown errors, but cannot distinguish a safe message from a raw SQL error already converted to a contribution. A follow-up should define a public summary and an authenticated diagnostic surface before changing the existing payload contract. This remains unchanged.

Consequently, the local endpoint fixes alone should not be expected to turn the deployed readiness response green.

## Verification

- HTTP runtime suite: **26 tests passed**, covering all three aliases and all dependency statuses, liveness, timeout, sharing/recovery, thrown and malformed contributions, startup/draining, the in-flight drain race, cache headers, response validation, OpenAPI schemas and invalid timeout settings.
- Foundation suite: **30 tests passed**, including strict startup failure propagation and default lifecycle compatibility.
- HTTP runtime and foundation TypeScript checks passed.
- Platform-host typecheck is blocked by two existing module-resolution errors in `server/packages/services/master-data/src/business-partner-360-route-contracts.ts` and `business-partner-360-routes.ts`: cannot resolve `@athyper/server-runtime-http`.
- `git diff --check` passed.

Timeouts bound the HTTP wait; the current HealthCheck contract has no cancellation signal, so underlying operations must settle or enforce their own driver timeout. A permanently stuck check remains unhealthy and is not duplicated. The timeout cannot preempt synchronous code that blocks the Node.js event loop.
