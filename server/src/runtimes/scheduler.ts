// server/src/runtimes/scheduler.ts
//
// Scheduler runtime: registers all BullMQ repeatable job schedulers.
// No HTTP server (API traffic). A minimal readiness probe runs on config.port.
//
// Activated via: MODE=scheduler node dist/src/app.js
//
// Responsibility:
//   Call jobs.start() to upsert all repeatable BullMQ schedulers into Redis.
//   These scheduler entries persist in Redis independently of this process —
//   workers pick up the enqueued jobs regardless of whether this process is
//   running. Keeping this process alive ensures schedulers are refreshed after
//   Redis restarts or BullMQ version upgrades.
//
// Note on Phase 2A workers:
//   createJobsService() in bootstrap() eagerly creates BullMQ Worker objects
//   (they connect to Redis and begin listening immediately). In this runtime
//   they sit idle — no domain jobs are processed here. Phase 2B will introduce
//   a Queue-only scheduler factory so this runtime has zero worker connections.
//
// Shutdown (LIFO):
//   probe → jobs service → redis → db
//
// Note on Phase 5 drain guarantee:
//   Same as worker.ts — no Promise.race against a software timeout.
//   Docker's stop_grace_period is the hard kill.

import { makeAuditEvent } from "../audit.js";
import { startProbeServer } from "./probe.js";
import type { ServerDeps } from "../kernel/bootstrap.js";

export async function startScheduler(deps: ServerDeps): Promise<void> {
  const startedAt = Date.now();
  const { config, logger, lifecycle, jobs, audit } = deps;

  await audit.write(
    makeAuditEvent({
      type: "scheduler.boot.start",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, pid: process.pid, mode: "scheduler" },
    }),
  );

  // ─── Register repeatable schedulers ────────────────────────────────────────
  // start() calls upsertJobScheduler on each queue — these writes persist in
  // Redis. Workers in a separate process (MODE=worker) pick up the scheduled
  // jobs without any coordination with this process.
  await jobs.start();
  lifecycle.onShutdown(async () => {
    await jobs.stop();
  });

  // ─── Readiness probe ──────────────────────────────────────────────────────
  // Registered LAST so it stops FIRST on shutdown.
  const probe = startProbeServer({ port: config.port, mode: "scheduler" });
  lifecycle.onShutdown(
    () => new Promise<void>((resolve) => probe.close(() => resolve())),
  );

  // ─── Signal handlers ───────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown_signal", {
      signal,
      pid: process.pid,
      mode: "scheduler",
      uptimeMs: Date.now() - startedAt,
    });

    await audit.write(
      makeAuditEvent({
        type: "scheduler.shutdown",
        level: "info",
        actor: { kind: "system" },
        meta: { signal, uptimeMs: Date.now() - startedAt },
      }),
    );

    await lifecycle.shutdown(signal);

    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  // ─── Ready ────────────────────────────────────────────────────────────────
  logger.info("scheduler_started", {
    env: config.env,
    pid: process.pid,
    mode: "scheduler",
    port: config.port,
  });

  void audit.write(
    makeAuditEvent({
      type: "scheduler.boot.success",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, pid: process.pid },
    }),
  );
}
