/**
 * Athyper Runtime — thin entry point.
 *
 * Loads config, runs bootstrap (adapters + lifecycle), then dispatches to
 * the selected runtime. This file must not grow: all substance lives in
 * kernel/bootstrap.ts and runtimes/*.ts.
 *
 * Runtime selection via MODE env var (default: "api"):
 *
 *   MODE=api        HTTP API server + workers (current default — unchanged)
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
import "dotenv/config"; // MUST be first — populates process.env before loadConfig()

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
  .then((deps) => startRuntime(deps))
  .catch((err: unknown) => {
    // Logger may not exist yet if bootstrap itself failed before creating it.
    console.error(
      "[fatal] boot_failed",
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? (err.stack ?? "") : "",
    );
    process.exit(1);
  });
