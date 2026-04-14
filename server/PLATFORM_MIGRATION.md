# ATHYPER PLATFORM
## Migration Plan v4.1 — Implementation-Ready
### F1 Architecture → New Architecture

**Version 4.1 — Final Implementation Draft · April 2026**  
**Classification: Internal — Engineering**

---

## Relationship to server/MIGRATION.md

`server/MIGRATION.md` is a separate, active internal structural refactor document
(bootstrap extraction, runtime split, request context, service composition).
It uses "Phase 2A/2B/3/4/5" for its own phases. This document uses numbered
Phases 0–7 for the F1→New capability migration. These are distinct workstreams.

**Critical dependency:** `server/MIGRATION.md` Phase 3 (AsyncLocalStorage request
context) must be complete before Phase 2.2 of THIS plan (Policy Compiler / Facts
Provider) can be implemented. The `requestContext` carrier is how the per-request
Kysely connection reaches the PolicyFactsProvider. Coordinate with the team owner
of `server/MIGRATION.md` Phase 3 before Phase 2.2 begins.

If `server/MIGRATION.md` Phase 3 has not shipped by T+4, Phase 2.2 must use an
explicit connection-passing pattern (pass Kysely tx as a constructor argument to
PolicyFactsProvider) as a temporary substitute. Do not share a singleton connection.

---

## What Changed — v4 → v4.1

All 12 action items and 3 critical findings from v3 remain in force (see v4).
This revision adds 6 new findings (C1–C6) from the pre-implementation code audit.

| # | Finding | Change | Phase Impact |
|---|---------|--------|-------------|
| C1 | F1 cron-scheduler = BullMQ repeatable jobs — not a separate engine | Phase 3.2 rescoped: cron extension (0.5 wk) + DAG orchestration (2 wk) | Redistributed |
| C2 | `@athyper/core/resilience` already has circuit breaker + retry | Phase 1.5 rescoped: wire existing patterns, not port F1 | 1w → 0.5w |
| C3 | Credential encryption needed by Phase 4.1 (audit) and Phase 5.3 (integration) | Phase 1.7 added: shared CredentialEncryptionService (AES-256-GCM) | +0.5w |
| C4 | `ent` schema does not exist in new architecture (not in 001_schemas.sql) | Phase 2.1: conditional prerequisite — ent schema SQL migration if A10=HOLD | Conditional |
| C5 | PolicyFactsProvider must be per-request factory — not singleton | Phase 2.2: hard design constraint added; depends on MIGRATION.md Phase 3 | Constraint |
| C6 | server/MIGRATION.md uses Phase 2A/2B/3/4/5 — naming collision with this plan | Relationship section added; MIGRATION.md Phase 3 identified as prerequisite | Coordination |

**Net schedule impact:** Phase 1 neutral (1.7 added +0.5w; 1.5 reduced −0.5w).
Phase 3 redistributed internally. No window changes.

---

## Cumulative Corrections — All Versions

All corrections from v1→v2 (C1–C6), v2→v3 (R1–R6), v3→v4 (A1–A12, F1–F3),
and v4→v4.1 (C1–C6 new) are now in force. Refer to v4 for the full registry
of v1–v4 corrections. Only v4→v4.1 delta is documented here.

---

## Architectural Principles (Updated)

Principles 1–5 from v3/v4 remain unchanged. Two additions:

**6. DB Functions Are First-Class Services**  
`resolve_business_intent` (16 conditions), `resolve_accounting_profile`, and 50+
trigger functions are production-grade business logic in the database. Application
services wrap them with explanation rendering and user context — they do not
reimplement the logic. The DB is not just storage; it is the engine.

**7. EventBus Is In-Process; Outbox Is Cross-Process — Never Substitute One for the Other**  
`@athyper/core events/eventBus` is synchronous and in-process: use it for
intra-service coordination within a single request lifecycle. `event.outbox` is
written in the same DB transaction as the business operation and drained
asynchronously: use it for reliable cross-service delivery that must survive
process failure. A domain event emitted only to `eventBus` is lost if the process
crashes. An event written to `event.outbox` is guaranteed to be processed.
Rule: any event that must trigger a downstream service (notification, integration,
audit) goes through `event.outbox`. Events that coordinate within the same
request scope (e.g. post-validation side-effects) may use `eventBus`.

---

## Phase 0 — Inventory, Baselines, and Test Infrastructure (2.5 weeks)

All v4 deliverables retained. The following additions and corrections apply.

### Updated Exit Gate Checklist (v4.1)

Previous exit gate items (v3 + v4) retained. Additions:

- [ ] **Test infrastructure shipped**: `test-utils` package deployed with
  Vitest DB harness (transaction rollback fixtures), Keycloak JWT auth mock,
  Redis mock, and tenant context fixture. Consumed by Phase 1+ test suites.
  Without this gate, Phase 1 teams cannot meet the 80% coverage commitment.
- [ ] **Resilience evaluation complete**: `@athyper/core/resilience` audit
  confirms which of circuit breaker, retry, timeout, and bulkhead are already
  implemented. Findings fed into Phase 1.5 scope. This evaluation takes 0.5 days —
  do it in Phase 0, not Phase 1.
- [ ] **Credential encryption pattern decided**: confirm whether Phase 1.7
  (CredentialEncryptionService) uses `ConfigBasedKeyProvider` (PBKDF2 from env
  master key) as default, or a KMS-backed provider. Document the decision. Affects
  Phase 4.1 (audit field encryption) and Phase 5.3 (integration credential storage).
- [ ] **server/MIGRATION.md Phase 3 status confirmed**: Verify whether
  AsyncLocalStorage request context is complete or in-progress. If not complete,
  Phase 2.2 (Policy Facts Provider) gets a temporary explicit-connection-passing
  pattern flagged in the Phase 2.2 spec.
- [x] **ent.* schema decision (A10): DROP** — confirmed. No new schemas.
  All Metadata Studio work maps to existing schemas: shared, control, master,
  document, ledger, log, event, governance, snapshot, aggregate.
  Phase 2.1 diff validator is removed from scope.

### Additional Inventory Items (v4.1)

The following F1 artifacts were not in the v4 inventory scope. Add to the
carry/replace/drop/hold spreadsheet:

| Artifact | Location | Classification |
|----------|----------|----------------|
| Voice channels service | `platform-services/voice-channels/` | **HOLD** — CTI/IVR/WebRTC; revisit after Tier 1. 4 domain services, 4 adapters (CtiAdapter, TwilioCtiAdapter, WebRtcBridge, TwilioSmsAdapter), 4 repos |
| Enterprise connectors | `platform-services/enterprise-connectors/` | **DROP-scaffold** — empty module |
| workbench-admin/partner/user packages | `packages/workbench-*/` | **DROP-scaffold** — each contains only `index.ts` |
| Supply/commercial/operations modules | Multiple under `business/supply/`, `business/commercial/` | **DROP-scaffold** — empty api/domain/persistence directories inflate HOLD count |
| `ent.*` schema itself | (does not exist in new arch) | **DROP** — A10 resolved. No new schemas created. |
| `int` schema (`int.endpoint`, `int.webhook_subscription`) | Was in `002_int_schema.sql` | **DROP** — consolidated into `event.endpoint` + `event.webhook_subscription` |

---

## Already-Built Infrastructure Map (v4.1 corrections)

Corrections to v4 table:

| Error | v4 Value | v4.1 Correct Value |
|-------|----------|-------------------|
| Table name | `control.entity_definition` | `control.entity` |
| Event emission | eventBus = general purpose | eventBus = in-process only; outbox = cross-process (see Principle 7) |
| Resilience | "evaluate before porting" | `@athyper/core/resilience` confirmed to have circuit breaker + retry; evaluate for bulkhead only |
| Cron scheduler | "3.2 is a new scheduler" | F1 cron-scheduler = BullMQ repeatable jobs; extends existing jobs.service.ts |

All other entries from v4 infrastructure map are correct and carry forward.

---

## Phase 1 — Foundation Hardening (T+0 → T+6, rescoped)

### 1.1 Query DSL & Join Planner (3 weeks + 1 week buffer — unchanged)

All v4 spec carries forward. No changes.

### 1.2 Overlay Composition Engine (2 weeks — unchanged)

All v4 spec carries forward. No changes.

### 1.3 Registry Extension (0.5 weeks — rescoped per F1/A1)

**⚠ Rescoped in v4, confirmed in v4.1.** Existing infrastructure verified:
`runtimes/api.ts` `registerXxxRoutes()` pattern, `bootstrap.ts` startup
orchestration, `lifecycle.ts` LIFO hooks, `worker.ts` + `scheduler.ts` as
separate MODE-dispatched processes. See `server/MIGRATION.md` for complete
internal migration history.

**Reuse:** All of the above as-is.

**Build only:**
- Health check aggregation: aggregate individual adapter health contributions
  into `/health/ready` composite response already returned by `runtimes/api.ts`
  health handler. Extend the existing `HealthCheck` array in `api.ts` to include
  contributions from registered services (currently only adapters contribute).
- Verify `onReady` lifecycle hook exists in `@athyper/core lifecycle/`. Add if
  missing — but do not add IoC container, injection tokens, or abstract factory.

**Do NOT build:** service registry from scratch, route registry from scratch,
lifecycle framework from scratch. These exist.

**Effort:** 0.5 weeks.

### 1.4 Field-Level Security Middleware (1.5 weeks — unchanged)

All v4 spec carries forward including middleware chain order constraint:
`auth (Keycloak) → tenant context → field-security → route handler`.

### 1.5 Resilience & Circuit Breaker (0.5 weeks — rescoped per C2)

**⚠ Rescoped from 1 week to 0.5 weeks.**

Pre-implementation audit (Phase 0 exit gate) confirmed:
`@athyper/core/resilience` exports `circuit-breaker.ts` (CLOSED/OPEN/HALF_OPEN
states, failure window, configurable error predicate) and `retry.ts`
(exponential/fixed/linear backoff). These cover the core patterns.

**Reuse:** `@athyper/core/resilience/circuit-breaker` and `retry` as-is.

**Build only:**
- Wire existing circuit breaker + retry to all 5 adapters (db, redis, auth, s3,
  telemetry). Each adapter wraps its external calls in the circuit breaker.
- Add bulkhead isolation per adapter IF `@athyper/core/resilience` does not
  export it (check during Phase 0 evaluation). If missing, add a simple token
  bucket limiter per adapter.
- Add health degradation signaling: when circuit OPENS, the adapter's health
  contribution changes from `healthy` to `degraded`. Wire to Phase 1.3 health
  aggregation.
- Do NOT port F1's `adapter-protection.ts` — the primitives already exist.

**Effort:** 0.5 weeks.

### 1.6 Feature Flag Service (1 week — from v4/A3)

No changes from v4 spec. Carries forward as-is.

### 1.7 Credential Encryption Service (0.5 weeks — NEW per C3)

**⚠ New workstream. Shared encryption infrastructure required by Phase 4.1
(audit field encryption) and Phase 5.3 (integration credential storage).
Must exist before Phase 4.1 implementation begins.**

**Why this must be Phase 1:** If Phase 4.1 and Phase 5.3 independently implement
encryption, they will produce incompatible schemes. Centralising in Phase 1
ensures a single AES-256-GCM pattern with shared key management.

**Reuse:**
- F1's `column-encryption.service.ts` — AES-256-GCM implementation, already
  ported here as the reference. Uses `TenantKeyProvider` interface.
- `ConfigBasedKeyProvider` from F1 — derives tenant KEKs via PBKDF2
  (masterKey + "audit:" + tenantId + ":" + version, 100k iterations, sha512).
  Requires `AUDIT_MASTER_KEY` env var (≥32 chars). Suitable for single-process
  deployments. Production multi-worker deployments should use a KMS-backed
  provider (AWS KMS, Azure Key Vault) — Phase 0 decision gate determines which.

**Build:**
- `server/src/foundation/crypto/credential-encryption.service.ts`
  - `encrypt(tenantId: string, plaintext: string): Promise<EncryptedPayload>`
  - `decrypt(tenantId: string, payload: EncryptedPayload): Promise<string>`
  - `encryptJsonField(tenantId: string, obj: Record<string, unknown>, fields: string[]): Promise<Record<string, unknown>>`
  - `decryptJsonField(tenantId: string, obj: Record<string, unknown>, fields: string[]): Promise<Record<string, unknown>>`
- `TenantKeyProvider` interface (from F1) — allows `ConfigBasedKeyProvider`
  as default with KMS-backed swap for production.
- `auditKeyRotation.worker.ts` reference: note that key rotation worker is Phase 4
  — Phase 1.7 creates the encryption service; Phase 4 creates the rotation worker.

**Consumed by:**
- Phase 4.1: `column-encryption.service.ts` wraps Phase 1.7 for audit log fields
- Phase 5.3: `event.endpoint.config.auth` JSONB encrypted via `encryptJsonField`
  before storage; decrypted on read in `HttpConnectorClient`

**Wire to:** `AUDIT_MASTER_KEY` env var (already in `.env.example`).

**Effort:** 0.5 weeks.

---

## Phase 2 — Metadata & Policy Runtime (T+4 → T+10)

### 2.1 Entity Compiler & Cache (2.5 weeks — updated per C4)

All v4 spec carries forward. The following conditional applies:

**ent.* schema: A10 = DROP (resolved):**
- No new schemas. All Metadata Studio data lives in the 10 canonical schemas.
- Compiler reads `control.entity`, `control.entity_field`, `control.entity_class_profile`,
  `snapshot.entity_compiled` — no diff validator, no `ent.*` DDL.
- The `int` schema is also removed: `int.endpoint` → `event.endpoint`,
  `int.webhook_subscription` → `event.webhook_subscription` (see §5/§6 in
  `04_tables/007_event.sql`).

**Table name correction (I5):** Phase 2.1 target tables are:
`control.entity` (not `control.entity_definition`), `control.entity_field`,
`control.entity_class_profile`, `snapshot.entity_compiled`. Verify all table
names against `server/db/sql/04_tables/002_control.sql` before implementation.

### 2.2 Policy Compiler & Simulator (2.5 weeks — updated per C5/C6)

All v4 spec carries forward. The following hard design constraints apply:

**Hard constraint — PolicyFactsProvider must be per-request factory (C5):**  
`PolicyFactsProvider` injects runtime facts (current user, entity state, org
context) into policy evaluation. Entity state is resolved via Kysely queries
under RLS. **The facts provider MUST NOT be a singleton.** It must be instantiated
per-request with the active Kysely connection passed at construction time.

```typescript
// CORRECT — per-request factory pattern
app.post('/policy/evaluate', async (req, res) => {
  await db.transaction().execute(async (tx) => {
    const factsProvider = new PolicyFactsProvider({ db: tx, session: req.session });
    const result = await policyEngine.evaluate(policyId, factsProvider);
    res.json(result);
  });
});

// WRONG — singleton using shared connection bypasses RLS
const factsProvider = new PolicyFactsProvider({ db: globalDb }); // Never do this
```

**Dependency on server/MIGRATION.md Phase 3 (C6):**  
If `server/MIGRATION.md` Phase 3 (AsyncLocalStorage request context) is complete,
the `requestContext` accessor provides the active connection to `PolicyFactsProvider`
without explicit threading. If Phase 3 is not complete, use the explicit
constructor-injection pattern shown above as a temporary bridge.
Do NOT block Phase 2.2 on MIGRATION.md Phase 3 — implement the bridge pattern
and migrate to requestContext after Phase 3 ships.

### 2.3 Decision Grid Engine (2 weeks — unchanged)

All v4 spec carries forward. No changes.

### 2.4 Intent Resolution Service (2.5 weeks — unchanged from v4)

All v4 spec carries forward including the explanation renderer complexity
acknowledgement. No further changes.

### 2.5 Metadata Approval Bridge — skeleton only (unchanged from v4/F2)

All v4 spec carries forward. Phase 2 delivers skeleton + unit tests only.
Integration wiring moves to Phase 3.4 per F2 resolution. No changes.

---

## Phase 3 — Workflow & Jobs Substrate (T+7 → T+12, updated)

### 3.1 Workflow Version Control & Recovery (2.5 weeks — updated per M2)

All v4 spec carries forward. The following default is now specified:

**In-flight instance strategy — default is pinned version (M2):**  
`document.workflow_request` records the workflow definition state at creation.
`document.workflow_stage` records progression against that snapshot. Instances
run to completion on their pinned version without migration. This requires no
schema change — the data model already supports it. Version N+1 applies only to
new instances created after publication. The exit gate must test: create an
instance on version N, publish version N+1, verify instance continues on version N
to completion without errors.

### 3.2 Cron Scheduler & Orchestration Engine (2.5 weeks total — rescoped per C1)

**⚠ Rescoped. F1's `cron-scheduler.ts` is BullMQ repeatable jobs, not a separate
scheduling engine. The new architecture's `startScheduler()` runtime and
`jobs.service.ts` already manage BullMQ repeatable job registration.**

**Verified from F1 source:** `cron-scheduler.ts` calls
`queue.add(jobName, payload, { repeat: { pattern: schedule.cron } })` with
`jobId: 'schedule:${name}'`. This is exactly what BullMQ's built-in repeatable
job feature does. `startScheduler()` in the new architecture already calls
`jobs.start()` to upsert repeatable jobs.

**Reuse:** Existing `jobs.service.ts` queue infrastructure, existing `startScheduler()`
runtime, existing `SCHEDULER_ID` + `DEFAULT_INTERVALS` repeatable job registration.

**Build only (cron extension — 0.5 weeks):**
- Extend `jobs.service.ts` to accept cron expression strings (not just fixed
  intervals) for repeatable job registration. Map `{ cron: '0 2 * * *' }` to
  BullMQ `{ repeat: { pattern: '0 2 * * *' } }`.
- Add a cron schedule registry (analogous to F1's `jobs.registry.listSchedules()`)
  so modules can contribute schedules at startup.
- Wire audit archive, report generation, and API sync schedules through this
  registry in their respective phases.

**Build only (DAG orchestration engine — 2 weeks):**  
This is the real Phase 3.2 work — port F1's `orchestration-engine.service.ts`
and `orchestration.worker.ts`.

- Port `OrchestrationRuntime` — executes multi-step job DAGs.
- **DAG execution model (I1):** steps wait for the previous BullMQ job to complete
  via `Job.waitUntilFinished()`. Each DAG step is a BullMQ job that, on completion,
  enqueues the next step. The orchestration worker polls for completion events.
  Do NOT use polling loops — use BullMQ's event-driven `waitUntilFinished()`.
- Port `orchestration.worker.ts` — processes DAG step completion and enqueues
  next steps.
- Wire to existing `event.outbox` for DAG trigger events.
- Add checkpoint/resume: persist DAG state to DB so in-flight DAGs survive
  process restart. Use `event.work_item` table for step state.

**Boundary with `event.lifecycle_timer_schedule` (unchanged from v4):**  
`event.lifecycle_timer_schedule` + `lifecycle-timer.worker.ts` owns timer-driven
entity state transitions. The cron extension owns externally-scheduled recurring
platform jobs. Different queues, different tables. No contention.

**Total effort:** 0.5 weeks (cron) + 2 weeks (DAG) = 2.5 weeks.

### 3.3 Worker Registration Framework (1.5 weeks — updated per F1)

All v4 spec carries forward with the following confirmation:

**⚠ The v4.1 code audit confirms `server/MIGRATION.md` Phase 5 (operational
hardening) already delivered:**
- Workers stop accepting new jobs on SIGTERM
- In-flight BullMQ jobs complete before shutdown
- `jobs.stop()` is awaited (not fire-and-forget)
- Startup/shutdown logged with structured fields

Phase 3.3 builds on these guarantees. The standard `init/process/health/shutdown`
interface wraps the existing BullMQ Worker pattern from `domain-outbox.worker.ts`
and `notification.worker.ts` — it does not reimplement SIGTERM handling.

**DLQ middleware (from v4):** Port the DLQ pattern as a reusable wrapper.
Define a common `DlqRecord` interface:
```typescript
interface DlqRecord {
  id: uuid;
  tenant_id: uuid;
  queue_name: string;
  job_name: string;
  payload: unknown;
  error_message: string;
  retry_count: number;
  last_attempted_at: timestamp;
  created_at: timestamp;
}
```
Each subsystem (audit, notification, render) has its own DLQ table
(`log.audit_dlq`, `log.notification_dlq`, `log.render_dlq`) conforming to this
interface. The middleware `insertDlq(tableName, record)` handles the insert
against the appropriate table.

### 3.4 Metadata Approval Bridge Integration (1 week — from F2/A5)

All v4 spec carries forward. End-to-end test requires Phase 3.1 workflow engine
to be at exit gate. No changes.

---

## Phase 4 — Audit & Compliance Hardening (T+11 → T+16)

### 4.1 Hash-Chain Integrity & Encryption (2 weeks — updated per C3)

All v4 spec carries forward. The following update applies:

**Encryption via Phase 1.7 CredentialEncryptionService (C3):**  
`column-encryption.service.ts` uses the `TenantKeyProvider` interface and
AES-256-GCM already defined in Phase 1.7. Do NOT reimplement encryption here —
import and use `CredentialEncryptionService` from Phase 1.7. This guarantees
a single encryption pattern across audit and integration.

**Key rotation worker** (`auditKeyRotation.worker.ts`): implemented here using
the Phase 3.3 worker framework. Rotates `TenantKeyProvider` KEK versions.
Re-encrypts only the current hot partition (full historical re-encryption is
impractical on high-volume partitions — document this as a known limitation).

**Hash chain partition boundary (unchanged from v4):**  
`log.hash_anchor` table (confirmed in `server/db/sql/04_tables/006_log.sql`)
records chain state at each partition boundary. Must write to `log.hash_anchor`
at every partition transition.

### 4.2, 4.3, 4.4 — Unchanged from v4

All v4 spec carries forward for these workstreams. Phase 4.4 HTML stub delivery
contract (A12): S3 presigned URL via `/api/governance/report-packs/[id]/download`,
rendered as download button in governance cycle UI. Upgrading to PDF after Phase 5.1.

---

## Phase 5 — Document, Notification & Integration (T+14 → T+21)

### 5.1 PDF/HTML Rendering Pipeline (3 weeks — updated per A7/I3)

All v4 spec carries forward. The following additions apply:

**Renderer HTTP contract (I3):**
The `athyper-renderer` container exposes two endpoints:

```
POST /render
  Body: { html: string, options: PdfRenderOptions }
  Response: application/pdf binary (synchronous)
  Use for: template rendering, report packs, documents < 5MB HTML
  Timeout: 30s (configurable)

POST /render-jobs
  Body: { html: string, options: PdfRenderOptions, jobId: string }
  Response: 202 Accepted { jobId }
  GET /render-jobs/:jobId → { status, downloadUrl? }
  Use for: large documents, batch rendering
  Backed by: document.render_job / document.render_output tables
```

**Internal authentication:** `X-Renderer-Token` shared secret header
(env var `RENDERER_INTERNAL_TOKEN`). Not a tenant JWT — this is a platform
service call, not a tenant request. Token validated in renderer middleware before
processing any request.

**Mesh container (A7):** New `athyper-renderer` service in `mesh/compose/`:
- Own Dockerfile: base `node:20-slim` + `puppeteer-core` + Chromium
- Health probe: `GET /health` (liveness + browser pool status)
- CPU/memory limits: start conservative (1 CPU, 512MB); adjust from load tests
- API server calls renderer via HTTP; renderer does not connect to DB or Redis

**PdfRenderer.ts** already implements a `Semaphore` for concurrent page limiting
and browser reconnection. Port this behaviour from F1.

### 5.2 Notification Expansion (5 weeks — unchanged from v4)

All v4 spec carries forward. Buffered schedule confirmed: weeks 1–2 (orchestrator,
channel registry, preference evaluator, recipient resolver), week 3 (dedup +
digest), week 4 (5 workers + 3rd channel), week 5 (integration testing).

### 5.3 HTTP Connector & Integration Runtime (3 weeks — updated per A6/I2/C3)

All v4 spec carries forward. The following additions apply:

**Credential encryption (C3/I2):**  
`event.endpoint.config.auth` JSONB contains OAuth2 client secrets, API keys, and
HMAC secrets. These must be encrypted before storage and decrypted on read.
Use `CredentialEncryptionService.encryptJsonField(tenantId, config, ['auth'])`
before `INSERT`/`UPDATE` on `event.endpoint`. Decrypt in `HttpConnectorClient`
before constructing the auth strategy. This uses the Phase 1.7 service — no
parallel encryption implementation.

**Webhook signing secret (I2):**  
`event.webhook_subscription.signing_secret` must also be encrypted at rest via
`CredentialEncryptionService.encrypt(tenantId, secret)` before storage. Decrypted
in the webhook delivery worker before HMAC-SHA256 signing. Same Phase 1.7 service.

**API sync worker (A6):**  
Port `automation-jobs/workers/api-sync.worker.ts`. This is the inbound complement
to outbound webhook delivery — pulls data from registered `event.endpoint` targets
on a cron schedule.
- Wire to `event.endpoint` for endpoint config (filter by `service` type)
- Schedule via Phase 3.2 cron extension (cron expression in endpoint config)
- Transform inbound payloads via `MappingEngine.ts` (same engine used for outbound)
- Write results to `event.outbox` for downstream processing
- Add to Phase 3.3 worker framework

**OAuth2 token caching:**  
Access tokens from OAuth2 client credentials flows should be cached in Redis
(key: `oauth2:token:{tenantId}:{endpointId}`, TTL = token expires_in − 60s).
Do not fetch a new token on every outbound request.

### 5.4 Content Services Backend (2 weeks — updated for preview library)

All v4 spec carries forward. The following must be resolved in Phase 0:

**Preview generation library (from v4/Phase 0 spike):**  
Acceptable formats and libraries must be decided in Phase 0 before any Phase 5.4
implementation begins. Recommendation based on common enterprise requirements:
- PDF thumbnails: Chromium (reuse `athyper-renderer` container via `/render` endpoint)
- Images (PNG, JPEG): Sharp (lightweight, no external process)
- Office documents (DOCX, XLSX): LibreOffice headless (requires separate container
  or accept no preview for office formats in v1)

If preview generation requires LibreOffice, add a third container to mesh.
If Chromium reuse is sufficient, no new container needed — call the renderer.
Specify this decision in Phase 0. Generate-previews worker must not run in the
main API container for any format requiring a child process.

---

## Phase 6 — Advanced IAM & Collaboration (T+18 → T+23)

### 6.1 TOTP MFA (1.5 weeks — unchanged)

All v4 spec carries forward. No changes.

### 6.2 Persona Registry (1.5 weeks — unchanged)

All v4 spec carries forward. No changes.

### 6.3 Company-Code Scope Resolution (1.5 weeks — updated per feedback)

All v4 spec carries forward. The following precondition is now explicit:

**Seed data precondition for exit gate:**  
The exit gate requires testing with Athyper Group's 16-subsidiary multi-company
tenant. Before this test can run, `master.company_code` and
`master.company_code_access` must be populated with the 16 subsidiaries in the
test environment. Add a test fixture (seed script or Vitest setup file) that
creates this hierarchy. Without it, the exit gate criterion is untestable.

### 6.4 Advanced Collaboration Services (2.5 weeks — updated per M1)

All v4 spec carries forward. The following exit gate dependency is now explicit:

**Phase 5.2 notification dependency for mention-notification worker:**  
The mention-notification worker (part of this workstream) dispatches mention
alerts via the notification orchestrator. It cannot function without Phase 5.2's
notification orchestration infrastructure. The Phase 6 exit gate must state:
"mention-notification worker wired to Phase 5.2 notification orchestrator —
mention events deliver via at least one operational channel before this gate
passes."

If Phase 5.2 is delayed, the mention-notification worker must be held until
Phase 5.2 reaches its own exit gate. Do not ship a worker that silently drops
events because the orchestrator does not exist.

### 6.5 In-App Messaging — WebSocket Decision Gate (unchanged from v4/A9)

All v4 spec carries forward. Decision options remain: (a) polling-first
(recommended), (b) WebSocket from day 1. If (b) is chosen, add WebSocket
infrastructure as a separate pre-workstream in Phase 6 before 6.5 begins.

---

## Phase 7 — Optional Differentiators (T+21 → T+27)

### 7.1 Atlas AI Engine (updated per M3)

**⚠ "Define model hosting strategy" moved from implementation phase to business
case gate.**

The business case for Atlas AI must specify model hosting strategy before the
4-week implementation budget is approved. ML infrastructure decisions (GPU
provisioning, inference API selection, latency SLA, cost envelope) take longer
to scope and procure than 4 weeks. The business case gate must answer:
- Self-hosted inference vs managed API (e.g. Claude API, OpenAI, Bedrock)?
- GPU container strategy (if self-hosted)?
- Target inference latency for recommendation and anomaly detection calls?
- Data residency requirements for training/inference data?

Only after the business case answers these questions does the 4-week implementation
clock start.

### 7.2, 7.3, 7.4, 7.5 — Unchanged from v4

All v4 spec carries forward for these workstreams.

---

## Performance Criteria (R5 + v4.1 addition)

All v3 R5 layered criteria carry forward. One addition:

| Metric | Target | Measurement Point | Notes |
|--------|--------|-------------------|-------|
| Query DSL: parse + plan | <2ms p99 | Before DB round-trip | AST → join plan → SQL generation |
| Descriptor resolution | <3ms p99 | Redis cache lookup | Cache-miss path measured separately |
| Overlay composition | <5ms p99 | After cache lookup | Base + tenant + user merge |
| Policy compilation | <10ms p99 | Compile-time only | Cached after first compile |
| Policy evaluation | <5ms p99 | Facts injection + rule evaluation | Excludes DB fact retrieval |
| **Feature flag lookup** | **<1ms p99 (cache hit)** | **Redis cache lookup** | **Cache-miss (DB) <5ms p99. Runs on every request — must be cache-first** |
| DB round-trip: simple entity | p50 <10ms, p95 <25ms, p99 <50ms | With RLS | Single entity, no joins, <100 rows |
| DB round-trip: joined query | p50 <25ms, p95 <75ms, p99 <150ms | With RLS | 2–3 joins, <500 rows |
| Audit write (single) | <10ms p99 | Hash chain + insert | Includes chain link computation |
| Audit write (batch 100) | <50ms p99 | Hash chain + batch insert | Batch chain computation |
| Workflow transition | <15ms p99 | JSONLogic eval + state update | Excludes notification dispatch |

---

## Revised Phase Schedule (v4.1)

Windows unchanged from v4. Internal scope redistributed in Phase 1 and Phase 3.

| Phase | Name | Window | Effort Δ vs v4 | Key v4.1 Changes |
|-------|------|--------|----------------|-----------------|
| 0 | Inventory + Baselines + Test Infra | Pre-T+0 (2.5 wk) | +0 | Exit gate additions; resilience eval; credential encryption decision; MIGRATION.md Phase 3 status check |
| 1 | Foundation Hardening | T+0 → T+6 | +0 net | 1.5: 1w→0.5w (core/resilience reuse); 1.7: +0.5w (CredentialEncryptionService) |
| 2 | Metadata & Policy Runtime | T+4 → T+10 | +0 | ent.* conditional for 2.1; PolicyFactsProvider per-request constraint for 2.2; table name fix |
| 3 | Workflow & Jobs Substrate | T+7 → T+12 | +0 | 3.1: pinned-version default; 3.2: cron=0.5w + DAG=2w; 3.3: DLQ interface defined |
| 4 | Audit & Compliance | T+11 → T+16 | +0 | Encryption via Phase 1.7; key rotation worker pattern |
| 5 | Doc, Notification, Integration | T+14 → T+21 | +0 | 5.1: renderer HTTP contract; 5.3: credential encryption + OAuth2 token caching |
| 6 | Advanced IAM & Collaboration | T+18 → T+23 | +0 | Seed data precondition; 6.4 notification dependency in exit gate |
| 7 | Optional Differentiators | T+21 → T+27 | +0 | Atlas AI hosting strategy to business case gate |

---

## Risk Register (v4.1 additions)

All v3/v4 risks carry forward. Additions:

| Risk | Impact | Mitigation | Owner |
|------|--------|-----------|-------|
| server/MIGRATION.md Phase 3 (request context) not complete at T+4 | High — PolicyFactsProvider has no clean connection carrier | Use explicit constructor injection as bridge pattern; migrate to requestContext after Phase 3 ships | Platform Lead (coordinate both plans) |
| Phase 1.7 CredentialEncryptionService uses wrong key derivation | Critical — audit fields and integration credentials encrypted with incompatible scheme | Adopt F1's ConfigBasedKeyProvider (PBKDF2 + AES-256-GCM) as canonical pattern; single implementation, two consumers | Security Lead |
| Atlas AI business case approved without hosting strategy | High — 4-week implementation discovers GPU/inference gap mid-sprint | Business case gate must include hosting decision before approval | Product Owner |
| Mention-notification worker ships before Phase 5.2 notification orchestrator | Medium — worker silently drops events | Hard exit gate dependency: 6.4 blocked until 5.2 passes its exit gate | Workflow Lead |
| ~~ent.* schema decision~~ | ~~Medium~~ | **Resolved: A10 = DROP.** No new schemas. Phase 2.1 compiler uses existing control/snapshot tables only. | ~~Metadata Lead~~ |

---

## Non-Negotiable Advantages (unchanged from v3/v4)

Any workstream that regresses the following is blocked and redesigned:
- DB-level enforcement via triggers (period gate, posting controls, dimension
  validation, workflow gate, budget enforcement)
- Static SQL migrations (427 files) — no runtime DDL execution
- Transactional outbox pattern (`event.outbox`)
- Row-Level Security across all schemas
- Company-code organisational model (operating_unit explicitly dropped)
- Next.js 16 + React 19 App Router with full BFF pattern
- 13-schema layered DB design
- Blueprint registry with industry pack selection
- Explicit adapter composition — no DI container
- Comprehensive seed data pipeline with UNSPSC crosswalk

---

## Immediate Next Steps (v4.1)

1. **Phase 0 Kickoff:** Begin carry/replace/drop/hold inventory. Include all
   v4.1 additions (voice channels HOLD, drop-scaffold modules).
2. **server/MIGRATION.md coordination:** Establish who owns Phase 3 (request
   context) of the internal migration and confirm its timeline relative to T+4.
3. **Resilience evaluation (Phase 0, 0.5 days):** Audit `@athyper/core/resilience`
   for bulkhead isolation. Document which patterns are already built.
4. **Credential encryption decision (Phase 0):** Decide ConfigBasedKeyProvider
   vs KMS-backed for Phase 1.7. Document in Phase 0 decision log.
5. **ent.* schema decision (A10): RESOLVED — DROP.** No new schemas. No action
   needed in Phase 0. `int` schema also resolved: tables consolidated into `event`.
6. **Preview library spike (Phase 0):** Determine acceptable formats, libraries,
   and whether LibreOffice container is needed for Phase 5.4.
7. **Named owners per phase (all phases):** Assign owner with exit gate sign-off
   authority. Coordinate Phase 1–2 owners with server/MIGRATION.md Phase 3 owner.
8. **Performance baselines (Phase 0, 1–2 days):** Measure current descriptor
   lookup (Redis hit + miss), audit write, workflow transition, feature flag
   evaluation (if service exists). Baselines before Phase 1 begins.
9. **Test infrastructure (Phase 0 / Phase 1 pre-condition):** Ship `test-utils`
   package before any Phase 1 service ships with test coverage requirements.
10. **Tier 1 scope freeze:** Lock Tier 1 as defined. Additions require change
    request approved by engineering leads.
