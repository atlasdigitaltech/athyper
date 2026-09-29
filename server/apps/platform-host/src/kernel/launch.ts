import {
  captureFatalError,
  flushErrorCollector,
  initializeErrorCollector,
} from "../diagnostics/telemetry/error-collector.js";
import type { ProcessRole } from "../config/deployment-profile.js";
import { selectProcessRole } from "../config/validation.js";

const starters = {
  api: async () => (await import("../composition/runtimes/http.js")).startHttpRuntime(),
  worker: async () => (await import("../composition/runtimes/workers.js")).startWorkerRuntime(),
  scheduler: async () => (await import("../composition/runtimes/scheduler.js")).startSchedulerRuntime(),
} satisfies Record<ProcessRole, () => Promise<void>>;

/** Shared launch policy for explicit entrypoints and the MODE compatibility launcher. */
export async function launchHost(expectedRole?: ProcessRole): Promise<void> {
  await launch(async () => {
    const role = selectProcessRole(process.env, expectedRole);
    // Configuration and deployment-profile validation must see the same role.
    process.env["MODE"] = role;
    await starters[role]();
  });
}

/** Shared fatal-error and telemetry policy for the isolated control process. */
export async function launchControlApi(): Promise<void> {
  await launch(async () => {
    await (await import("../entrypoints/control-api.js")).startControlApi();
  });
}

async function launch(start: () => Promise<void>): Promise<void> {
  try {
    if (process.env["NODE_ENV"] !== "production") {
      const { config } = await import("dotenv");
      config();
    }
    initializeErrorCollector();
    await start();
  } catch (error: unknown) {
    captureFatalError(error, "boot");
    console.error("[fatal] boot_failed", error instanceof Error ? error.message : String(error),
      error instanceof Error ? (error.stack ?? "") : "");
    if (error instanceof AggregateError) {
      for (const cause of error.errors)
        console.error("[fatal] initialization_cause", cause instanceof Error ? cause.message : String(cause));
    }
    await flushErrorCollector().finally(() => process.exit(1));
  }
}
