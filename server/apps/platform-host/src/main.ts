// Athyper Platform Host — process entry point.
//
// Loads env, selects process mode from MODE, dispatches to the matching
// runtime. Nothing else lives here: all substance is in processes/*.
//
// Runtime modes (MODE env var, default: "api"):
//   api        HTTP server — liveness, readiness, API routes
//   worker     BullMQ consumers — no HTTP
//   scheduler  BullMQ repeatable scheduler — no HTTP
//
// Dev:   pnpm dev[:api|worker|scheduler]
// Prod:  node dist/main.js          (MODE=api)
//        cross-env MODE=worker node dist/main.js

import {
  captureFatalError,
  flushErrorCollector,
  initializeErrorCollector,
} from "./monitoring/error-collector.js";

if (process.env["NODE_ENV"] !== "production") {
  const { config } = await import("dotenv");
  config();
}

const MODES = {
  api:       () => import("./processes/api/index.js"),
  worker:    () => import("./processes/worker/index.js"),
  scheduler: () => import("./processes/scheduler/index.js"),
} as const;

type Mode = keyof typeof MODES;

const mode = (process.env["MODE"] ?? "api") as Mode;

initializeErrorCollector();

if (!(mode in MODES)) {
  console.error(
    `[fatal] Unknown MODE="${mode}". Valid values: ${Object.keys(MODES).join(", ")}`,
  );
  process.exit(1);
}

const { start } = await MODES[mode]();

await start().catch((err: unknown) => {
  captureFatalError(err, "boot");
  console.error(
    "[fatal] boot_failed",
    err instanceof Error ? err.message : String(err),
    err instanceof Error ? (err.stack ?? "") : "",
  );
  void flushErrorCollector().finally(() => process.exit(1));
});
