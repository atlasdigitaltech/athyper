# Server Platform Host Rebuild Plan

Status: proposed execution runbook  
Scope: rebuild the backend under `server/` from the preserved implementation in `server-backup/`  
Package namespace rule: every workspace package physically under `server/` starts with `@athyper/server-`

## 1. Outcome

Rebuild the server as a layered workspace with a small executable host, explicit package ownership, one-way dependencies, and capability-by-capability parity with the legacy server.

This is a reconstruction, not a bulk move. Code enters the new tree only after its owner, public API, dependencies, tests, and composition wiring are understood.

Recommended canonical host identity:

- Folder: `server/apps/platform-host`
- Package: `@athyper/server-platform-host`
- Role: composition root and executable processes only

The source notes also use `apps/backend` and `@athyper/server-backend`. Do not use both conventions. Unless the team explicitly chooses the alternative before Phase 1, this runbook uses `platform-host` because it describes the package's responsibility more precisely.

## 2. Current-state warning

At the time this plan was prepared:

- `server/` is empty in the working tree and its former contents appear as deletions.
- `server-backup/` contains the legacy database, scripts, root configuration, application source, and packages, but is untracked.
- `pnpm-workspace.yaml` still targets the former `server` root and package paths; it does not yet target `server/apps/platform-host` or contract packages under `server/packages/contracts`.
- The worktree contains many unrelated changes. Migration commits must be path-scoped and must not absorb or revert those changes.
- The legacy root package is `@athyper/runtime-server`; most legacy child packages do not yet follow the required `@athyper/server-*` naming rule.

Therefore, preservation and baseline capture are mandatory before any cleanup. Do not delete `server-backup/` until the final retirement gate passes.

## 3. Target structure

```text
server/
├─ apps/
│  └─ platform-host/
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ config/
│     │  ├─ composition/
│     │  │  ├─ create-container.ts
│     │  │  ├─ register-adapters.ts
│     │  │  ├─ register-platform.ts
│     │  │  └─ register-services.ts
│     │  └─ processes/
│     │     ├─ api/
│     │     ├─ worker/
│     │     ├─ scheduler/
│     │     └─ shared/
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  ├─ foundation/
│  ├─ contracts/
│  ├─ adapters/
│  ├─ runtime/
│  ├─ platform/
│  ├─ services/
│  ├─ planes/
│  └─ test-utils/
├─ db/
├─ scripts/
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ Dockerfile.dev
├─ Dockerfile.prod
├─ .env.example
├─ staging.env.example
└─ production.env.example
```

## 4. Architecture rules

The allowed dependency flow is:

```text
apps/platform-host
        ↓
planes / services / platform
        ↓
runtime / adapters / contracts
        ↓
foundation
```

Enforce these rules from the first slice:

1. `foundation` imports no other server package and contains capability-neutral primitives only.
2. `contracts` contains types, schemas, events, and ports; it contains no infrastructure implementation.
3. `adapters` implement contracts and do not import the host.
4. `runtime` provides reusable HTTP, jobs, and scheduling mechanisms; it does not own process startup.
5. `platform`, `services`, and `planes` do not import application composition.
6. Only `apps/platform-host` constructs concrete implementations and owns environment/process concerns.
7. Cross-package imports use declared package exports. Filesystem-relative cross-package imports and undeclared deep imports are forbidden.
8. Public `index.ts` files remain deliberately small. Internal files are not exported by default.
9. No package or import named `kernel` is introduced.
10. Every package under `server/` uses an `@athyper/server-*` name.

## 5. Canonical naming

Use `@athyper/server-<layer>-<capability>`, with Foundation retained as one package exposing purposeful subpaths.

| Target folder | Package name |
| --- | --- |
| `apps/platform-host` | `@athyper/server-platform-host` |
| `packages/foundation` | `@athyper/server-foundation` |
| `packages/contracts/auth` | `@athyper/server-contract-auth` |
| `packages/contracts/events` | `@athyper/server-contract-events` |
| `packages/contracts/jobs` | `@athyper/server-contract-jobs` |
| `packages/contracts/records` | `@athyper/server-contract-records` |
| `packages/contracts/telemetry` | `@athyper/server-contract-telemetry` |
| `packages/adapters/auth-keycloak` | `@athyper/server-adapter-auth-keycloak` |
| `packages/adapters/cache-redis` | `@athyper/server-adapter-cache-redis` |
| `packages/adapters/database/core` | `@athyper/server-adapter-db-core` |
| `packages/adapters/database/neon-postgres` | `@athyper/server-adapter-db-neon` |
| `packages/adapters/database/athyper-postgres` | `@athyper/server-adapter-db-athyper` |
| `packages/adapters/database/mesh-postgres` | `@athyper/server-adapter-db-mesh` |
| `packages/runtime/http` | `@athyper/server-runtime-http` |
| `packages/runtime/jobs` | `@athyper/server-runtime-jobs` |
| `packages/runtime/scheduling` | `@athyper/server-runtime-scheduling` |
| `packages/platform/iam` | `@athyper/server-platform-iam` |
| `packages/platform/audit` | `@athyper/server-platform-audit` |
| `packages/services/records` | `@athyper/server-service-records` |
| `packages/planes/neon` | `@athyper/server-plane-neon` |
| `packages/test-utils` | `@athyper/server-test-utils` |

Examples of valid Foundation imports:

```ts
import { getRequestContext } from "@athyper/server-foundation/context";
import { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { retry } from "@athyper/server-foundation/resilience";
```

## 6. Kernel disposition

Move behavior according to responsibility, not its legacy directory:

| Legacy concept | Canonical owner |
| --- | --- |
| Request context | `foundation/context` |
| Lifecycle and shutdown primitives | `foundation/lifecycle` |
| Retry and circuit breaker | `foundation/resilience` |
| Transaction context | `foundation/transaction` |
| Tenant context | `foundation/tenancy` |
| Auth flag validation | `platform/iam/config` |
| Application bootstrap | `apps/platform-host/src/composition` |
| Runtime configuration | `apps/platform-host/src/config` |
| Lifecycle audit writer | `platform/audit` |
| Records mutation selection | `services/records/mutation` |

Rename `mutation-kernel-rollout.ts` to a responsibility-based name such as `mutation-rollout-policy.ts`; confirm its actual behavior before choosing the final name.

## 7. Execution phases

### Phase 0 — Preserve the source and record the baseline

1. Stop migration edits long enough to establish a reproducible baseline.
2. Confirm that `server-backup/` is the intended complete source and that it was not produced by a partial copy.
3. Record `git status --short` and separate unrelated work from server-migration commits.
4. Make `server-backup/` recoverable using an approved repository branch, commit, or external archive. Do not rely on its current untracked state.
5. Inventory legacy packages, package names, exports, scripts, environment variables, process entry points, routes, jobs, schedules, database commands, Docker entry points, and tests.
6. Run the legacy baseline from the preserved source and record pass/fail results rather than requiring a perfect baseline.

Suggested baseline commands, adjusted if workspace wiring requires a temporary preservation branch:

```powershell
pnpm.cmd --dir server-backup run typecheck
pnpm.cmd --dir server-backup run test -- --run
pnpm.cmd --dir server-backup run build
```

Deliverables:

- Recoverable legacy source
- Package/import rename matrix
- Route, worker, scheduler, database, and environment inventory
- Baseline results with known failures identified

Exit gate: the legacy implementation can be recovered and its current behavior is measurable.

### Phase 1 — Create workspace and host shells

1. Create the target directories without copying application logic.
2. Recreate `server/package.json`, `server/tsconfig.json`, and `server/vitest.config.ts`; do not copy the dependency-heavy legacy manifests unchanged.
3. Create `server/apps/platform-host/package.json` as `@athyper/server-platform-host`.
4. Add only executable-runtime dependencies to the host. Package-specific dependencies belong to the owning package.
5. Update `pnpm-workspace.yaml` to include explicit new patterns:
   - `server/apps/*`
   - `server/packages/foundation`
   - `server/packages/contracts/*`
   - required adapter/runtime/platform/service/plane patterns
6. Remove the obsolete `server` root-as-package entry once no command depends on it.
7. Add a minimal `main.ts` and API process that can start, expose liveness/readiness, and shut down cleanly without business capabilities.
8. Add scripts for `build`, `typecheck`, `test`, and each process mode using cross-platform environment handling; do not retain POSIX-only `MODE=value` scripts on Windows.

Exit gate:

- Workspace discovery shows the host and initial packages exactly once.
- Minimal host build, typecheck, tests, startup, health check, and graceful shutdown pass.
- No legacy package implementation has been bulk-copied.

### Phase 2 — Restore database assets and operational scripts

1. Copy `db/`, `scripts/`, example environment files, and Dockerfiles selectively from `server-backup/`.
2. Exclude `.env`, `node_modules/`, `dist/`, `.turbo/`, `.local-evidence/`, logs, and `package-lock.json`.
3. Classify every script as retained, renamed, replaced, or retired.
4. Update script imports only after their target packages exist; keep temporarily blocked scripts documented.
5. Validate database package discovery, schema tooling, migrations, seed commands, and Docker build contexts.

Exit gate: database validation and non-destructive script checks pass, and no secret or generated artifact has entered `server/`.

### Phase 3 — Build Foundation

1. Create `@athyper/server-foundation` with explicit exports for `context`, `errors`, `lifecycle`, `observability`, `resilience`, `tenancy`, `transaction`, and `validation`.
2. Move only capability-neutral primitives and their tests.
3. Split legacy `foundation/kernel` by the disposition table above.
4. Remove all `@athyper/server-foundation/kernel` paths and all `kernel` exports.
5. Check Foundation source imports to prove it has no dependency on higher layers.

Exit gate: Foundation typecheck/tests pass, its dependency list is minimal, and a repository search finds no active kernel import.

Execution record (2026-08-09): complete.

- Added the eight explicit package exports and a small root discovery barrel.
- Migrated neutral async context, lifecycle, retry/circuit-breaker, tenancy, transaction, health, logging, metrics, and tracing primitives.
- Kept concrete Pino/OpenTelemetry implementations, outbound fetch propagation, database metrics, cache/storage adapters, crypto implementations, and IAM binding outside Foundation.
- Replaced the platform host's duplicate lifecycle helper with `@athyper/server-foundation/lifecycle` in API, worker, scheduler, and host tests.
- Added 12 Foundation tests across context, lifecycle, resilience, tenancy, and observability.
- Verified Foundation has no runtime dependencies and imports only Node built-ins or same-package relative modules.
- Verified active `server/`, `apps/`, and `packages/` source has zero `server-foundation/kernel`, `foundation-kernel`, or package-level `/kernel` imports. Historical references remain only in the preserved `server-backup/` source.
- Passed Foundation typecheck/test/build and aggregate server typecheck/test/build gates.

### Phase 4 — Establish Contracts

1. Create contract packages only where an independently owned boundary exists: auth, events, jobs, records, and telemetry initially.
2. Extract ports and shared wire types before moving their implementations.
3. Choose one canonical owner for every duplicated interface and schema.
4. Publish narrow root exports; add subpath exports only when they represent stable public boundaries.
5. Add compile-time/API tests for contract compatibility.

Exit gate: contract packages contain no concrete database, network, process, or framework implementation and have no circular dependencies.

Execution record (2026-08-09): complete.

- Established canonical Auth, Events, Jobs, Records, and Telemetry contract packages with root-only public exports.
- Assigned verified identity and authorization snapshots to Auth; domain events and outbox envelopes to Events; generic queue/scheduler protocols to Jobs; external record commands/results to Records; and exportable telemetry records to Telemetry.
- Kept Foundation as the owner of `PlaneKey` and in-process logger/metrics/tracer ports. Telemetry owns only the cross-boundary export protocol.
- Kept Keycloak/Jose, Express, BullMQ, Kysely, Redis, Pino, OpenTelemetry, Sentry, HTTP clients, SQL plans, and process orchestration outside contract packages.
- Added five TypeScript-checked public API suites containing six tests.
- Verified zero contract dependency cycles, zero forbidden implementation imports, zero duplicate exported symbols, and zero active duplicate canonical types outside the contract packages.
- Passed all contract typecheck/test/build gates and aggregate server typecheck/test/build gates.

### Phase 5 — Build the first database adapter

1. Rebuild `packages/adapters/database/core` as `@athyper/server-adapter-db-core`.
2. Define its ports in Contracts or Foundation only when truly capability-neutral.
3. Move connection/transaction primitives and focused tests.
4. Rebuild one concrete Postgres adapter needed by the first vertical slice; defer the other planes.
5. Register the concrete adapter only in the host composition root.

Exit gate: adapter package tests pass against their intended test boundary, transaction/tenancy behavior is characterized, and consumers use public exports only.

Execution record (2026-08-09): complete for database core and all three concrete adapters.

- Treated `server-backup/packages/adapters/database` as read-only reference and rebuilt both packages from empty Phase 5 shells.
- Rebuilt `@athyper/server-adapter-db-core` around explicit pool lifecycle/health, PostgreSQL dialect creation, a Kysely implementation of Foundation's `TransactionRunner`, bound transaction-local actor stamping, and database-specific retry classification.
- Removed the duplicate durable-transaction wrapper and did not recover the legacy query-helper barrel, filesystem migration registry, performance wrapper, or any capability repository into database core.
- Rebuilt `@athyper/server-adapter-db-neon` as the first concrete plane adapter. It provides explicit tenant and system transaction boundaries, validates tenant context before opening tenant work, isolates actor providers per adapter instance, and closes its Kysely-owned pool idempotently.
- Rebuilt `@athyper/server-adapter-db-athyper` as an explicit cross-tenant administrative adapter with a branded system transaction boundary, health/statistics reporting, and idempotent Kysely-owned shutdown. It deliberately does not apply Neon tenant stamping.
- Rebuilt `@athyper/server-adapter-db-mesh` with the same lifecycle guarantees and an explicit Mesh system transaction boundary. Mesh network/account scoping remains owned by Mesh capabilities rather than being misrepresented as Neon UUID tenancy.
- Deferred Prisma/code-generation tooling, generated multi-plane schemas, plane repositories, implicit per-query tenant transactions, and performance wrappers until consuming vertical slices establish their exact requirements.
- Registered Neon, Athyper, and Mesh only in `apps/platform-host/src/composition/register-adapters.ts`; each adapter is independently optional and constructed only when its plane-specific connection URL is configured. Lifecycle owns LIFO shutdown across all configured pools.
- Added 15 database-core tests, 7 Neon tests, 4 Athyper tests, 4 Mesh tests, and 3 composition-root tests. All package typecheck, test, and build gates pass.
- Verified there are no active old `@athyper/adapter-db-*` imports, Foundation kernel imports, adapter deep imports, or concrete plane adapter construction outside its adapter package and the host composition root.

Follow-on adapter execution (2026-08-09): Keycloak authentication complete.

- Treated `server-backup/packages/adapters/auth` as read-only behavioral reference and rebuilt `@athyper/server-adapter-auth-keycloak` from its empty shell.
- Implemented the canonical `@athyper/server-contract-auth` `TokenVerifier` directly and normalized verified JWTs into `VerifiedToken`, failing closed for missing issuer, subject, audience, empty tokens, and unknown realms.
- Restricted verification to explicitly configured algorithms (RS256 by default), issuer, audience, and clock tolerance; retained independent fail-closed realm selection.
- Replaced the legacy Redis JWKS warm-start, which did not feed keys into `jose`, with `jose`'s remote JWKS cache plus honest endpoint warm-up health and structured logging hooks.
- Registered Keycloak only in `apps/platform-host/src/composition/register-adapters.ts`. It is enabled only by complete issuer/audience configuration, and JWKS warm-up runs from the host readiness lifecycle.
- Preserved both documented environment chains: `IAM_ISSUER_URL`/`IAM_CLIENT_ID` for local profiles and `KEYCLOAK_ISSUER_URL` or `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` with `KEYCLOAK_CLIENT_ID` for deployed profiles.
- Added 8 focused adapter/JWKS tests and 1 composition-root test; adapter and host typecheck, test, and build gates pass.

Follow-on adapter execution (2026-08-09): Redis cache complete.

- Treated `server-backup/packages/adapters/memory-cache` as read-only behavioral reference and rebuilt `@athyper/server-adapter-cache-redis` from its empty shell.
- Replaced the legacy raw-client-only surface with explicit connect, string get/set/delete, positive TTL, NX write, PING health, and idempotent shutdown boundaries while retaining a documented raw client for infrastructure integrations such as BullMQ.
- Added strict Redis URL and numeric configuration validation, lazy connection, ready checks, bounded request retries, optional key prefixes, and throttled structured transport logging.
- Replaced the removed Foundation kernel retry import with Redis-specific transient classification layered on the public Foundation resilience primitive.
- Did not invent cache, lock, or pub-sub contracts in Foundation. Distributed locking and pub/sub remain deferred until an independently owned consumer boundary establishes their semantics.
- Registered Redis only in `apps/platform-host/src/composition/register-adapters.ts`; it is optional through `REDIS_URL`, connects on readiness, and closes through the host lifecycle after database adapters.
- Added 14 focused adapter tests and 1 composition-root lifecycle test; adapter and host typecheck, test, and build gates pass.

Follow-on adapter execution (2026-08-09): S3 object storage complete.

- Treated `server-backup/packages/adapters/object-storage` as read-only behavioral reference and rebuilt `@athyper/server-adapter-object-storage-s3` from its empty shell.
- Preserved explicit object put/get/stream/delete, existence, metadata, copy, listing, multipart upload, batch deletion, presigned URL, health, and startup-access validation behavior behind narrow root exports.
- Added managed AWS S3 support through an optional endpoint and optional static credentials, while retaining path-style defaults for MinIO/S3-compatible endpoints.
- Improved the legacy behavior with upload-size enforcement, multipart constraints, 1000-key delete batching with per-object error detection, complete paginated listing, encoded copy sources, bounded presigned expiry, deterministic metadata defaults, and idempotent SDK shutdown.
- Bucket validation now proves head, write, and delete access and fails when sentinel cleanup is denied rather than silently accepting incomplete permissions.
- Did not recreate the removed Foundation storage interfaces. The adapter owns its concrete surface until Documents or another independently owned capability establishes a canonical storage contract.
- Registered S3 only in `apps/platform-host/src/composition/register-adapters.ts`; it is optional through `S3_BUCKET`, validates access on readiness, and closes through host lifecycle.
- Added 13 focused adapter tests and 1 composition-root lifecycle test; adapter and host typecheck, test, and build gates pass.

Follow-on adapter execution (2026-08-09): OpenTelemetry complete.

- Treated `server-backup/packages/adapters/telemetry` as read-only behavioral reference and rebuilt `@athyper/server-adapter-telemetry-otel` from its empty shell.
- Implemented Foundation's canonical in-process `Tracer` port using the OpenTelemetry API, including standalone spans, active-span context, attributes, exception recording, deterministic OK/ERROR status, and guaranteed span completion.
- Rebuilt NodeSDK lifecycle with explicit OTLP endpoint, service identity, deployment environment, process mode, resource attributes, and idempotent start/shutdown behavior. Failed starts can be retried; stopped SDKs cannot be restarted accidentally.
- Kept OpenTelemetry SDK lifecycle separate from the Telemetry contract's exportable record protocol. The adapter does not claim to implement the unrelated `TelemetryExporter` wire boundary.
- Did not recover Sentry, Cronwatch, framework performance counters, or the legacy platform-core log-envelope dependency into this package.
- Registered OpenTelemetry only in `apps/platform-host/src/composition/register-adapters.ts`; it is optional through `OTEL_EXPORTER_OTLP_ENDPOINT`, starts on readiness, and its shutdown hook is registered last so LIFO lifecycle flushes telemetry before infrastructure closes.
- Kept Node auto-instrumentation explicitly disabled by default because composition-time startup cannot guarantee import-hook coverage; enabling it requires `OTEL_AUTO_INSTRUMENTATIONS_ENABLED=true` and a future preload/bootstrap qualification.
- Added 8 focused adapter/tracer tests and 1 composition-root ordering test; adapter and host typecheck, test, and build gates pass.

Follow-on adapter execution (2026-08-09): Communications complete for email and SMS.

- Audited the active notification shell and the preserved Communications, Notifications, and Jobs sources before assigning ownership. Added `@athyper/server-contract-notifications` as the canonical provider-neutral boundary instead of making an adapter depend upward on Platform Notifications.
- Rebuilt `@athyper/server-adapter-communications` from the legacy behavior with lazy SMTP transport creation, rendered HTML/text delivery, Twilio REST delivery, E.164 validation, bounded requests, provider health, explicit retryability classification, and idempotent SMTP shutdown.
- Retained temporary support for legacy `rendered_html` and `rendered_text` payload keys while making `renderedHtml` and `renderedText` canonical. Secrets and recipient addresses are not written to adapter logs.
- Did not recover database-backed push delivery: subscription resolution, invalid-subscription persistence, FCM, and Web Push were coupled in one legacy adapter and require a notification-owned subscription repository boundary before reconstruction.
- Did not recover the legacy arbitrary webhook handler: governed webhook delivery, signature/key ownership, destination allowlisting, and SSRF controls belong with the existing Jobs webhook-delivery boundary rather than an unscoped Communications transport.
- Registered configured email and SMS handlers only in `apps/platform-host/src/composition/register-adapters.ts`, exposed them through the host's notification-channel registry, rejected partial SMTP/Twilio configuration, and placed SMTP cleanup under lifecycle ownership.
- Added one notification-contract API test, nine Communications adapter tests, two host config tests, and one composition-root lifecycle test. Contract, adapter, and host typecheck/test/build gates pass.

Follow-on notification execution (2026-08-09): channel foundation, Meta WhatsApp, push, and governed webhooks complete.

- Expanded the canonical notification contract to the six channels enforced by the event schema: `in_app`, `email`, `sms`, `whatsapp`, `push`, and `webhook`.
- Added provider-neutral recipient/address, WhatsApp consent, delivery-ledger, in-app repository/event-stream, push-subscription/transport, and webhook-delivery boundaries. Contracts still contain no SDK, network, database, framework, or process implementation.
- Rebuilt Platform Notifications as a capability layer with multi-channel orchestration, consent-aware recipient resolution, repository-backed in-app delivery, tenant/principal-scoped event publication, SSE framing/stream lifecycle, and push fan-out with expired-subscription deactivation.
- Split push transport implementations into FCM HTTP v1 for Android/iOS and encrypted VAPID Web Push. Service-account token caching and invalid-device/subscription outcomes are explicit; subscription persistence remains behind the platform-owned repository boundary.
- Added Meta Cloud API WhatsApp template delivery with explicit Graph API version configuration, E.164 validation, bounded requests, health reporting, provider error classification, and no token logging. WhatsApp addresses are exposed only by the resolver when an active opt-in exists.
- Recovered webhook delivery under `@athyper/server-platform-jobs` as a runtime-neutral canonical `JobHandler`, with HMAC-SHA256 signing, one-megabyte payload limits, HTTPS enforcement, credential/redirect rejection, DNS/private-address SSRF controls, retry-after handling, and durable outcome reporting through a repository port.
- Kept SMTP as the sole outbound email implementation. Resend, SendGrid, Postmark, and SES remain inbound bounce-envelope compatibility only; API-native outbound adapters are deferred unless SMTP operation proves insufficient.
- Registered Meta WhatsApp and the separate FCM/Web Push transports only in the host composition root. Push channel activation still requires a concrete plane-owned subscription repository at the consuming vertical-slice composition boundary.

Follow-on adapter execution (2026-08-09): Gotenberg rendering complete.

- Audited server-side PDF conversion separately from unrelated UI metadata renderers. Added `@athyper/server-contract-rendering` as the canonical engine-neutral HTML-to-PDF boundary with typed page options, rendered bytes, provider identity, duration, and health.
- Rebuilt `@athyper/server-adapter-rendering` as a focused Gotenberg adapter using the current multipart HTML conversion contract. It validates URLs, input/options, request timeouts, HTML/PDF size limits, PDF signatures, redirects, health, and retryable versus permanent provider outcomes.
- Uploads `index.html` plus optional `header.html` and `footer.html` files, uses JSON HTTP failure ranges, and fails conversion on resource loading failures. Gotenberg deployment must retain its outbound URL filtering and network isolation.
- Rebuilt `@athyper/server-platform-rendering` only as the capability facade. Template resolution, durable render-output state, plane workflows, and object-storage persistence remain with Documents/Publication and plane-owned vertical slices.
- Did not recover `@athyper/adapter-rendering-legacy`, its proprietary token protocol, asynchronous job API, download URLs, or browser-pool response shapes. Gotenberg is the sole concrete renderer; missing configuration fails explicitly instead of selecting an implicit fallback.
- Registered Gotenberg only in the platform-host composition root through `DOCRENDER_BASE_URL`; configured renderers must pass readiness health. Added bounded timeout/input/output environment settings.
- Added one contract API test, two platform tests, four adapter tests, one host composition test, and one host configuration test. All affected typecheck/test/build gates pass.

### Phase 6 — Build reusable HTTP runtime

1. Create `@athyper/server-runtime-http` for server conventions, middleware contracts, health interfaces, error translation, and reusable HTTP lifecycle behavior.
2. Keep Express startup, process signals, environment loading, and concrete capability registration in the host.
3. Wire the minimal API process to the runtime package.
4. Add tests proving `runtime/http` has no import from `apps/platform-host`.

Exit gate: a minimal API boots through the composition root and shuts down cleanly with no capability packages present.

#### Phase 6 execution record (completed 2026-08-09)

- Kept the canonical packages under `server/packages/runtime/{http,jobs,scheduling}`. They are execution mechanisms, not outbound adapters.
- Rebuilt HTTP around request context, bounded JSON parsing, liveness/readiness aliases, Foundation health contributions, controlled error translation, safe 404/500 responses, and narrow root exports. The platform host now creates this application instead of duplicating Express middleware.
- Rebuilt Jobs as the BullMQ implementation of the canonical Jobs contract. It owns queue publishing, pre-start handler registration, canonical envelope dispatch, progress reporting, bounded names/options, job context, concurrency, and idempotent worker-first shutdown.
- Rebuilt Scheduling as the BullMQ implementation of the canonical scheduler contract. It maps cron/interval definitions, enforces schedule ownership, reconciles service-owned definitions at scheduler startup, and closes its queue clients cleanly.
- Preserved the backup's two-client Redis rule: BullMQ always uses `maxRetriesPerRequest: null`. `REDIS_BULLMQ_URL` is required for worker/scheduler modes outside local development unless `ALLOW_SHARED_BULLMQ_REDIS=true` is explicitly set; `JOB_WORKER_CONCURRENCY` is independently bounded.
- Did not recover framework/business metrics, Bull Board/admin routes, database repositories, capability workers, rendering handlers, business schedules, or process signal handling into runtime packages. Those remain with observability, platform/services, and the host composition root respectively.
- Package tests use injected BullMQ queue/worker boundaries, so they characterize dispatch, scheduling, progress, shutdown, and option mapping without a live Redis dependency.

### Phase 7 — Recover the first vertical capability

Use IAM plus Audit as the first production slice because they establish identity and observability boundaries.

1. Characterize the existing IAM/Audit cycle with import and runtime tests.
2. Move shared types/ports into contract packages.
3. Make IAM emit or call an audit port; inject the Audit implementation from the host.
4. Move auth flag configuration out of the legacy kernel and into IAM configuration.
5. Register IAM and Audit in `register-platform.ts`.
6. Restore only their routes and tests, then validate an authenticated request end to end.

Exit gate: IAM and Audit have no circular dependency, package tests pass, and the vertical request works through the new host.

#### Phase 7 execution record (completed 2026-08-09)

- Characterized the preserved cycle: legacy IAM imported Audit directly while legacy Audit imported IAM, and both packages mixed contracts, Express routes, Kysely repositories, rollout machinery, governance reports, and infrastructure concerns.
- Added `@athyper/server-contract-audit` as the canonical owner of audit events, the `AuditRecorder` capability port, and the `AuditEventSink` outbound port. Extended `@athyper/server-contract-auth` with the framework-neutral authentication request/result and `Authenticator` port.
- Rebuilt `@athyper/server-platform-audit` around validated, size-bounded, immutable events and an injected sink. The host currently injects a structured append-only log sink; durable database querying remains deferred until its governed repository/schema slice is restored.
- Rebuilt `@athyper/server-platform-iam` around the existing Keycloak `TokenVerifier`, canonical claim/context checks, plane authorization, required-action enforcement, permission snapshot construction, and required audit emission. Successful authentication fails closed with `503` if Audit cannot record; denied requests never leak bearer tokens into audit metadata.
- Moved `AUTH_CLAIM_FIRST_CONTEXT`, `AUTH_REQUIRE_AUTHORIZED_ROLE`, `AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS`, and `AUTH_REQUIRED_ACTIONS_MATRIX` into explicit IAM configuration. Production defaults claim/context checking to `on`; local and staging default to `shadow` unless configured.
- Registered Audit first and injected its contract into IAM only in `register-platform.ts`. IAM has no import from the Audit implementation, and Audit has no import from IAM.
- Restored only `GET /api/iam/me` and authenticated `GET /api/audit/status`. Legacy role/permission catalogs, company-code queries, audit event searches, timelines, hash-chain reports, legal holds, moderation, PII inventory, report packs, support sessions, JIT, MFA, and authorization rollout routes remain deferred to their owned slices.
- Added contract, service, configuration, composition, and HTTP tests. The host vertical test sends a bearer-authenticated request through the shared HTTP runtime, verifies canonical identity output, calls the authenticated Audit route, and observes both audit events through the injected sink.

### Phase 8 — Recover Metadata and Records

1. Characterize route, query, mutation, lifecycle, caching, and transaction behavior before moving files.
2. Rebuild Metadata and expose only its stable service API/contracts.
3. Rebuild Records in query, mutation, lifecycle, repository, and route segments.
4. Rename kernel terminology according to actual responsibility.
5. Inject metadata, authorization, audit, transaction, and event dependencies through explicit ports.
6. Move tests with each segment, including characterization and integration tests.

Exit gate: representative read/write/lifecycle flows pass, no duplicated contracts remain, and neither package imports host composition.

### Phase 9 — Recover remaining capabilities incrementally

For each remaining platform package, service, adapter, and plane:

1. Select one bounded capability.
2. Inventory its incoming/outgoing imports, routes, jobs, tables, configuration, and tests.
3. Assign contracts and implementations to canonical owners.
4. Create/rename its package using the `@athyper/server-*` convention.
5. Copy the minimum implementation and tests.
6. Replace legacy imports and declare workspace dependencies.
7. Register concrete implementations in the host.
8. Pass the per-package and vertical-slice gates before selecting the next capability.

Recommended order after Records: notifications, policy/rules, workflow, documents/rendering/object storage, search, jobs, finance/business/master/content/publication/integration/numbering, remaining plane-specific packages.

Exit gate: every retained legacy capability is classified and either passes parity or has an approved retirement record.

### Phase 10 — Compose worker and scheduler processes

1. Create reusable job and scheduling packages before executable process code.
2. Add worker and scheduler entry points under `apps/platform-host/src/processes`.
3. Share configuration, observability, lifecycle, and adapter registration without importing one executable entry point from another.
4. Test startup failure, signal handling, graceful drain, idempotency, retry, and readiness behavior.
5. Update Docker/compose commands to use the new host package and entry points.

Exit gate: API, worker, and scheduler independently build, start, report health where applicable, and shut down safely.

### Phase 11 — Enforce architecture and naming

Add automated checks that fail on:

- A package under `server/` whose name does not start with `@athyper/server-`
- A `kernel` directory, package, or import
- Relative imports crossing package boundaries
- Imports from packages into `apps/platform-host`
- Foundation imports from another server layer
- Undeclared workspace dependencies
- Unexported deep imports
- Duplicate package names or contracts
- Active imports from `server-backup`

Run repository-wide workspace resolution, typecheck, tests, build, Docker build, and representative database/integration checks.

Exit gate: all automated boundary checks and CI gates pass from a clean checkout.

### Phase 12 — Cut over and retire the backup

1. Compare the final inventory with the Phase 0 inventory.
2. Prove route, process, configuration, database, and operational-command parity or record approved retirements.
3. Deploy to a non-production environment and run smoke, migration, rollback, and observability checks.
4. Cut over using the normal deployment rollback mechanism; do not combine cutover with backup deletion.
5. Observe the agreed stabilization window.
6. Remove `server-backup/` only in a separate, reviewable change after the source is recoverable from version control and the parity sign-off is recorded.

Exit gate: production acceptance is complete, rollback evidence exists, and no workspace/configuration reference points to the backup.

## 8. Standard gate for every package or capability

Every migration unit must satisfy all of the following before merge:

```powershell
pnpm.cmd --filter <package-name> run typecheck
pnpm.cmd --filter <package-name> run test -- --run
pnpm.cmd --filter <package-name> run build
```

Also verify:

- Package name and folder follow the canonical convention.
- Manifest declares every external and workspace dependency it imports.
- Public exports are intentional and minimal.
- No deep, relative cross-package, kernel, host, or backup import exists.
- Characterization tests were moved or replaced with equivalent coverage.
- The affected vertical process passes a smoke test.
- Documentation and the rename matrix are updated.

## 9. Commit and rollback strategy

Use small, path-scoped commits aligned to the phases. A useful sequence is:

1. Preservation/inventory only
2. Workspace and empty host shell
3. Database assets and scripts
4. Foundation
5. Contracts
6. Database core plus first concrete adapter
7. HTTP runtime plus minimal API
8. One commit series per vertical capability
9. Worker/scheduler composition
10. Enforcement and CI
11. Cutover configuration
12. Backup retirement

Each pre-cutover rollback is a revert of the current migration unit. Cutover rollback restores the previous deployment artifact/configuration; it must not depend on the presence of an untracked local backup directory.

## 10. Definition of done

The rebuild is complete only when:

- `server/apps/platform-host` is the sole backend composition root.
- All packages under `server/` use `@athyper/server-*` names.
- The dependency direction is mechanically enforced.
- No active `kernel` concept or `server-backup` dependency remains.
- API, worker, scheduler, database, scripts, and Docker workflows pass from a clean checkout.
- Required legacy behavior has parity evidence; removed behavior has explicit approval.
- Secrets and generated artifacts are absent from version control.
- `server-backup/` is removed only after cutover, stabilization, and recoverability sign-off.
