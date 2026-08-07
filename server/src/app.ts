/**
 * Athyper Runtime — thin entry point.
 *
 * Loads config, runs bootstrap (adapters + lifecycle), then dispatches to
 * the selected runtime. This file must not grow: all substance lives in
 * kernel/bootstrap.ts and runtimes/*.ts.
 *
 * Runtime selection via MODE env var (default: "api"):
 *
 *   MODE=api        HTTP API server, no job consumers
 *   MODE=worker     BullMQ workers + IAM outbox, no HTTP
 *   MODE=scheduler  BullMQ repeatable scheduler registration, no HTTP
 *
 * Start in dev:   tsx watch src/app.ts
 * Start in prod:  node dist/src/app.js              (MODE=api)
 *                 MODE=worker    node dist/src/app.js
 *                 MODE=scheduler node dist/src/app.js
 *
 * Required env vars → see server/.env.example
 * Architecture      → see server/MIGRATION.md
 */
// Load .env in local dev (tsx watch). In Docker, env vars are injected by Compose
// so dotenv is a no-op and the package may not be present after pnpm prune --prod.
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

// OTel must init BEFORE any codebase imports so auto-instrumentations can
// patch express / pg / ioredis / http / undici at require time. No-op when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset.
import { initOtel, getOtelShutdown } from "@athyper/adapter-telemetry/otel";
initOtel({ mode: process.env.MODE ?? "api" });

// Sentry must init BEFORE any codebase imports so it can instrument them
// and capture boot-time errors (including a malformed config file).
// No-op when GLITCHTIP_DSN is unset.
import { initSentry } from "@athyper/adapter-telemetry/sentry";
initSentry({ mode: process.env.MODE ?? "api" });

import { loadConfig } from "./config.js";
import { loadKernelConfig } from "./kernel-config.js";
import { bootstrap } from "./kernel/bootstrap.js";
import { startApi } from "./runtimes/api.js";
import { startWorker } from "./runtimes/worker.js";
import { startScheduler } from "./runtimes/scheduler.js";

const config = loadConfig();
const kernelConfig = loadKernelConfig();

// ─── Runtime dispatch ─────────────────────────────────────────────────────────
// All modes share the same bootstrap (adapters + lifecycle).
// Each runtime starts only what it owns.

const RUNTIMES = {
  api:       startApi,
  worker:    startWorker,
  scheduler: startScheduler,
} as const;

type RuntimeMode = keyof typeof RUNTIMES;

const mode = (process.env.MODE ?? "api") as RuntimeMode;

if (!(mode in RUNTIMES)) {
  console.error(
    `[fatal] Unknown MODE="${mode}". Valid values: ${Object.keys(RUNTIMES).join(", ")}`,
  );
  process.exit(1);
}

const startRuntime = RUNTIMES[mode];

void bootstrap(config, kernelConfig)
  .then((deps) => {
    // Register OTel shutdown LAST so LIFO fires it FIRST on SIGTERM — pending
    // spans flush before DB / Redis clients disconnect. No-op when disabled.
    deps.lifecycle.onShutdown(getOtelShutdown());
    return startRuntime(deps);
  })
  .catch((err: unknown) => {
    // Report to Sentry before exiting — logger may not exist yet if bootstrap
    // failed before creating it. Sentry.captureException is a silent no-op
    // when GLITCHTIP_DSN is unset.
    void import("@athyper/adapter-telemetry/sentry").then(({ Sentry }) => {
      Sentry.captureException(err, { tags: { phase: "boot" } });
      return Sentry.flush(2000);
    }).catch(() => { /* swallow — we're exiting anyway */ });

    console.error(
      "[fatal] boot_failed",
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? (err.stack ?? "") : "",
    );
    process.exit(1);
  });
