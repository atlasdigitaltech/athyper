// server/src/runtimes/worker.ts
//
// Worker runtime: IAM outbox + all four BullMQ job workers.
// No HTTP server (API traffic). A minimal readiness probe runs on config.port.
//
// Activated via: MODE=worker node dist/src/app.js
//
// Starts:
//   1. IAM outbox worker — polls event.outbox for iam-topic events and
//      invalidates Redis session caches (user_sessions:*, principal_sessions:*)
//   2. BullMQ jobs service — registers all repeatable schedulers and runs
//      the lifecycle-timers, notifications, domain-outbox, and sla-check workers
//   3. Readiness probe — lightweight HTTP endpoint on config.port for
//      Docker Compose health checks (/readyz → 200)
//
// Shutdown (LIFO):
//   probe → outbox worker → jobs service → redis → db   (connections last)
//
// Note on Phase 5 drain guarantee:
//   The signal handler does NOT use Promise.race against a software timeout.
//   Docker's stop_grace_period (30 s) is the hard kill — awaiting
//   lifecycle.shutdown() fully ensures all BullMQ in-flight jobs drain
//   cleanly before process.exit(0) is called. See Phase 5 exit criterion test.

import { createIamOutboxWorker } from "@athyper/svc-iam";
import { makeAuditEvent } from "../audit.js";
import { startProbeServer } from "./probe.js";
import type { ServerDeps } from "../kernel/bootstrap.js";

async function checkBullmqQueue(queues: unknown): Promise<void> {
  const queue = (queues as { lifecycleTimers?: { getJobCounts?: (...states: string[]) => Promise<unknown> } })
    .lifecycleTimers;
  if (typeof queue?.getJobCounts !== "function") return;
  await queue.getJobCounts("wait", "delayed", "active", "paused");
}

function resolveSessionNamespaces(defaultRealm: string): string[] {
  const configured = process.env.SESSION_NAMESPACES ?? process.env.AUTH_SESSION_NAMESPACES;
  const namespaces = configured
    ? configured.split(",").map((namespace) => namespace.trim()).filter(Boolean)
    : [defaultRealm];
  return [...new Set([...namespaces, "platform"])];
}

export async function startWorker(deps: ServerDeps): Promise<void> {
  const startedAt = Date.now();
  const { config, logger, lifecycle, db, redis, jobs, audit } = deps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db = db.kysely as unknown as import("kysely").Kysely<Record<string, any>>;

  // ─── IAM cache client ──────────────────────────────────────────────────────
  // Required by createIamOutboxWorker for session cache invalidation.
  // Constructed here (same shape as api.ts) — iamCache is a thin wrapper with
  // no independent state, so duplication is intentional and safe.
  const iamCache = {
    get: (k: string) => redis.get(k),
    set: (k: string, v: string, _ex: "EX", ttl: number) =>
      redis.set(k, v, "EX", ttl),
    del: (k: string | string[]) =>
      Array.isArray(k) ? (k.length > 0 ? redis.del(...k) : Promise.resolve(0)) : redis.del(k),
    scan: (
      cursor: string,
      matchFlag: "MATCH",
      pattern: string,
      countFlag: "COUNT",
      count: number,
    ) =>
      (
        redis as unknown as {
          scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
        }
      ).scan(cursor, matchFlag, pattern, countFlag, count),
    sadd: (k: string, member: string) => redis.sadd(k, member),
    srem: (k: string, member: string) => redis.srem(k, member),
    smembers: (k: string) => redis.smembers(k),
    expire: (k: string, ttl: number) => redis.expire(k, ttl),
    eval: (script: string, numKeys: number, ...args: Array<string | number>) =>
      redis.eval(script, numKeys, ...args),
    incr: (k: string) => redis.incr(k),
  };

  await audit.write(
    makeAuditEvent({
      type: "worker.boot.start",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, pid: process.pid, mode: "worker" },
    }),
  );

  // ─── IAM outbox worker ─────────────────────────────────────────────────────
  // Session cache invalidation via transactional outbox.
  // Realm keys must match resolveRealmConfig() in the web BFF.
  const outboxWorker = createIamOutboxWorker({
    db: _db,
    cache: iamCache as unknown as import("@athyper/svc-iam").OutboxWorkerCache,
    sessionNamespaces: resolveSessionNamespaces(config.iam.realm),
    logger,
    pollIntervalMs: config.outbox.pollIntervalMs,
  });

  outboxWorker.start();
  // Outbox stops first (LIFO), then jobs, then bootstrap adapters.
  lifecycle.onShutdown(() => {
    outboxWorker.stop();
  });

  // ─── BullMQ jobs ──────────────────────────────────────────────────────────
  // start() registers all repeatable schedulers. Worker consumers are created
  // during bootstrap only for MODE=worker.
  await jobs.start();
  lifecycle.onShutdown(async () => {
    await jobs.stop();
  });

  // ─── Readiness probe ──────────────────────────────────────────────────────
  // Minimal HTTP server — Docker Compose health check polls this.
  // Registered LAST so it stops FIRST on shutdown, signalling to the
  // load balancer / orchestrator that this container is no longer ready
  // before the actual drain begins.
  const probe = startProbeServer({
    port: config.port,
    mode: "worker",
    checks: {
      redis: () => redis.ping(),
      bullmq: () => checkBullmqQueue(jobs.queues),
    },
  });
  lifecycle.onShutdown(
    () => new Promise<void>((resolve) => probe.close(() => resolve())),
  );

  // ─── Signal handlers ───────────────────────────────────────────────────────
  // No Promise.race against a software timeout — Docker's stop_grace_period
  // acts as the hard kill. Awaiting lifecycle.shutdown() fully ensures all
  // in-flight BullMQ jobs drain before process.exit(0) is reached.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown_signal", {
      signal,
      pid: process.pid,
      mode: "worker",
      uptimeMs: Date.now() - startedAt,
    });

    await audit.write(
      makeAuditEvent({
        type: "worker.shutdown",
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
  logger.info("worker_started", {
    env: config.env,
    realm: config.iam.realm,
    outboxPollMs: config.outbox.pollIntervalMs,
    pid: process.pid,
    mode: "worker",
    port: config.port,
  });

  void audit.write(
    makeAuditEvent({
      type: "worker.boot.success",
      level: "info",
      actor: { kind: "system" },
      meta: { env: config.env, pid: process.pid },
    }),
  );

  // Fire bootstrap onReady hooks once queues and the probe server are live.
  void lifecycle.signalReady();
}
