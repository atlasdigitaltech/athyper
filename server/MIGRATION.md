# Server Migration: Kernel/Bootstrap Extraction

**Status:** Phase 5 complete — all required phases done (Phase 4 deferred)
**Branch:** feature/finance-core
**Date:** 2026-04-14

---

## Scope freeze

This migration is a **structural refactor only**. The following are out of scope
and must not be introduced during Phases 0–3:

| Out of scope | Reason |
|---|---|
| Domain logic changes | Risk without benefit |
| Package boundary changes | `kernel/` stays inside `server/`, not its own workspace package |
| DI framework adoption | No Inversify, no decorators, no reflect-metadata |
| Splitting workspace packages | No new `packages/` entries |
| Changing adapter implementations | Adapter packages are already correct |
| Changing the DB schema or query layer | Kysely layer unchanged |
| Changing any route handler logic | Routes are moved, not rewritten |

The parts already working well that must not regress:

- Zod fail-fast config validation at startup
- LIFO lifecycle shutdown (`Lifecycle` class)
- Three-level health checks (`/healthz` — healthy/degraded/unhealthy)
- Graceful degradation for optional adapters (S3, email)
- BullMQ + transactional outbox (`FOR UPDATE SKIP LOCKED`)
- Adapter isolation (`server/framework/adapters/`)

---

## Execution order

```
Phase 0  Scope freeze (this document)
Phase 1  kernel/bootstrap extraction        ← current
Phase 2A Runtime code split (no deploy change)
Phase 2B Deployment split (MODE=api|worker|scheduler)
Phase 3  Request context (AsyncLocalStorage)
Phase 5  Operational hardening (queue drain on SIGTERM)
Phase 4  Service composition (optional, only if earned)
```

---

## Phase 1 — kernel/bootstrap extraction

**Goal:** split the 672-line `app.ts` into three files with single responsibilities.
Zero behaviour change.

### New layout

```
server/src/
  kernel/
    bootstrap.ts        ← adapter construction + lifecycle wiring (NEW)
    __tests__/
      lifecycle.test.ts ← LIFO shutdown unit tests (NEW)
      bootstrap.test.ts ← deps-bag shape + handler tests (NEW)
  runtimes/
    api.ts              ← Express app + routes + health + startup (NEW)
  app.ts                ← thin: loadConfig → bootstrap → startApi (~20 lines)
  config.ts             ← unchanged
  kernel-config.ts      ← unchanged
  lifecycle.ts          ← unchanged
  logger.ts             ← unchanged
  audit.ts              ← unchanged
  metrics.ts            ← unchanged
```

### Responsibilities

| File | Responsible for |
|---|---|
| `app.ts` | `dotenv/config`, `loadConfig`, `loadKernelConfig`, chain bootstrap → startApi |
| `kernel/bootstrap.ts` | Logger, process error handlers, lifecycle, all adapter construction (db/redis/auth/s3/jobs/audit) |
| `runtimes/api.ts` | Express app, middleware, health checks, all route registrations, outbox worker, startup, signal handlers |

### Exit criteria (required, not aspirational)

1. `pnpm -F @athyper/runtime-server typecheck` passes with zero errors.
2. Lifecycle unit test: `bootstrap(testConfig)` deps bag + LIFO shutdown verified.
3. Bootstrap test: mocked adapter factories confirm `db.close()` and `redis.disconnect()` are called in LIFO order on `lifecycle.shutdown()`.

---

## Phase 2A — runtime code split (preview)

After Phase 1 stabilises, create `runtimes/worker.ts` and `runtimes/scheduler.ts`.
Each calls `bootstrap()` and starts only its own workers — no HTTP server.
`app.ts` gains `MODE=api|worker|scheduler` dispatch.

Do **not** change deployment topology during 2A. Same Docker image, different entrypoint.

---

## Phase 3 — request context (preview)

Introduce `AsyncLocalStorage`-based `requestContext` in `kernel/request-context.ts`.
Wire as Express middleware in `runtimes/api.ts`.
Migrate domain routes one at a time, starting with `svc-iam`.

**Required exit criterion added by design review:**
Job handlers must call a `runWithJobContext(payloadCtx, handler)` helper so BullMQ
workers can use the same context accessor without triggering "outside request scope"
errors. Validate this in Phase 3 acceptance tests before declaring Phase 3 done.

---

## Phase 5 — operational hardening (preview)

Promote queue drain behaviour to top priority:
- On SIGTERM, workers stop accepting new jobs
- In-flight BullMQ jobs complete before shutdown
- `jobs.stop()` is awaited (not fire-and-forget)
- Health/readiness endpoints distinguish api vs worker runtime
- Startup/shutdown logged with structured fields

**Required exit criterion:** controlled shutdown while jobs are running proves no
job is abandoned mid-flight (test with a long-running test job).

---

## Phase 4 — service composition (conditional)

Adopt F1-style custom container **only if**, after Phases 1–3, the bootstrap `deps`
bag grows beyond ~15 entries or sub-service construction nesting becomes genuinely
hard to manage. Decision point after Phase 3 retrospective.

If adopted: port F1's ~110-line factory-based container with `singleton/scoped/transient`
modes. No decorators. No Inversify.
