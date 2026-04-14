/**
 * Application-level cache metrics for athyper-api.
 *
 * Exposes tenant-scoped cache operation counters in Prometheus text format via
 * the /metrics HTTP endpoint. No external dependencies — uses a Map-backed
 * in-memory counter that is reset on process restart (counter semantics).
 *
 * Metrics emitted:
 *   athyper_cache_operations_total{tenant, operation="hit|miss|write|invalidated", service="session|bootstrap"}
 *
 * Complement to redis_exporter infrastructure metrics:
 *   redis_exporter   → Redis-server-wide (memory, connections, commands)
 *   /metrics         → Per-tenant cache behaviour (hit ratio, invalidation rate)
 *
 * Prometheus scrape: job_name=athyper_api, target=athyper-api:3000
 */

import type { CacheMetrics } from "../framework/runtime/services/iam/session/session.service.js";
import type { Request, Response } from "express";

// ─── Queue depth state ────────────────────────────────────────────────────────
// Populated by registerJobQueues() after the jobs service starts.
// Duck-typed to avoid importing the full BullMQ Queue class here.
type DepthQueue = { getJobCounts(...states: string[]): Promise<Record<string, number>> };
let jobQueues: Record<string, DepthQueue> | null = null;

/**
 * Register BullMQ queues for depth metrics.
 * Called once from api.ts after the jobs service is wired.
 * Metrics for each queue are emitted as athyper_queue_jobs_total gauges.
 */
export function registerJobQueues(queues: Record<string, DepthQueue>): void {
  jobQueues = queues;
}

// ─── Internal counter store ───────────────────────────────────────────────────

type Operation = "hit" | "miss" | "write" | "invalidated";

interface LabelSet {
  tenant: string;
  operation: Operation;
  service: string;
}

// Sparse map: "tenant\0operation\0service" → count
const counters = new Map<string, number>();
// Track total invalidated keys separately (not just the number of DEL calls)
const invalidatedKeys = new Map<string, number>();

function key(labels: LabelSet): string {
  return `${labels.tenant}\0${labels.operation}\0${labels.service}`;
}

function inc(labels: LabelSet, amount = 1): void {
  const k = key(labels);
  counters.set(k, (counters.get(k) ?? 0) + amount);
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a CacheMetrics recorder for a named service layer.
 * service: "session" | "bootstrap"
 */
export function createCacheMetrics(service: string): CacheMetrics {
  return {
    hit(tenant: string)                         { inc({ tenant, operation: "hit",        service }); },
    miss(tenant: string)                        { inc({ tenant, operation: "miss",       service }); },
    write(tenant: string)                       { inc({ tenant, operation: "write",      service }); },
    invalidated(tenant: string, count: number)  {
      inc({ tenant, operation: "invalidated", service });
      const k = `${tenant}\0${service}`;
      invalidatedKeys.set(k, (invalidatedKeys.get(k) ?? 0) + count);
    },
  };
}

// ─── Prometheus /metrics handler ──────────────────────────────────────────────

const HELP = [
  "# HELP athyper_cache_operations_total Cache operation counts by tenant, operation, and service layer",
  "# TYPE athyper_cache_operations_total counter",
  "",
  "# HELP athyper_cache_invalidated_keys_total Total individual Redis keys deleted by invalidation events",
  "# TYPE athyper_cache_invalidated_keys_total counter",
  "",
  "# HELP athyper_queue_jobs_total Current BullMQ job counts by queue and state (gauge)",
  "# TYPE athyper_queue_jobs_total gauge",
].join("\n");

function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function metricsHandler(_req: Request, res: Response): void {
  void (async () => {
    const lines: string[] = [HELP, ""];

    for (const [k, count] of counters) {
      const parts = k.split("\0");
      const tenant = parts[0] ?? ""; const operation = parts[1] ?? ""; const service = parts[2] ?? "";
      lines.push(
        `athyper_cache_operations_total{tenant="${escape(tenant)}",operation="${escape(operation)}",service="${escape(service)}"} ${count}`,
      );
    }

    lines.push("");

    for (const [k, count] of invalidatedKeys) {
      const parts = k.split("\0");
      const tenant = parts[0] ?? ""; const service = parts[1] ?? "";
      lines.push(
        `athyper_cache_invalidated_keys_total{tenant="${escape(tenant)}",service="${escape(service)}"} ${count}`,
      );
    }

    lines.push("");

    // Queue depth gauges — polled live on each /metrics scrape
    if (jobQueues) {
      for (const [queueName, queue] of Object.entries(jobQueues)) {
        try {
          const counts = await queue.getJobCounts("active", "waiting", "delayed", "failed");
          for (const [state, count] of Object.entries(counts)) {
            lines.push(
              `athyper_queue_jobs_total{queue="${escape(queueName)}",state="${escape(state)}"} ${count}`,
            );
          }
        } catch {
          // Queue unreachable (Redis down, etc.) — emit nothing for this queue
        }
      }
      lines.push("");
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.end(lines.join("\n"));
  })();
}
