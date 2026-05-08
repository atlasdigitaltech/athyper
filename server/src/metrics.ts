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
export type MetricCollector = () => Promise<string[]>;

let jobQueues: Record<string, DepthQueue> | null = null;
let metricCollectors: MetricCollector[] = [];

const HTTP_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Register BullMQ queues for depth metrics.
 * Called once from api.ts after the jobs service is wired.
 * Metrics for each queue are emitted as athyper_queue_jobs_total gauges.
 */
export function registerJobQueues(queues: Record<string, DepthQueue>): void {
  jobQueues = queues;
}

/**
 * Register live metric collectors that need application dependencies such as DB
 * access. Collectors return Prometheus text-format lines and are polled on each
 * /metrics scrape.
 */
export function registerMetricCollectors(collectors: MetricCollector[]): void {
  metricCollectors = collectors;
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
const httpRequests = new Map<string, number>();
const httpDurationBuckets = new Map<string, number>();
const httpDurationSum = new Map<string, number>();
const httpDurationCount = new Map<string, number>();

function key(labels: LabelSet): string {
  return `${labels.tenant}\0${labels.operation}\0${labels.service}`;
}

function inc(labels: LabelSet, amount = 1): void {
  const k = key(labels);
  counters.set(k, (counters.get(k) ?? 0) + amount);
}

function incMap(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function normalizePath(path: string): string {
  const clean = path.split("?")[0] || "/";
  return clean
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, "/:id")
    .replace(/\/[^/]*[0-9][^/]{20,}(?=\/|$)/g, "/:id");
}

export function observeHttpRequest(input: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}): void {
  const method = input.method.toUpperCase();
  const route = normalizePath(input.path);
  const status = String(input.statusCode);
  const labels = `${method}\0${route}\0${status}`;
  const durationSeconds = input.durationMs / 1000;

  incMap(httpRequests, labels);
  incMap(httpDurationSum, `${method}\0${route}`, durationSeconds);
  incMap(httpDurationCount, `${method}\0${route}`);

  for (const bucket of HTTP_DURATION_BUCKETS_SECONDS) {
    if (durationSeconds <= bucket) {
      incMap(httpDurationBuckets, `${method}\0${route}\0${bucket}`);
    }
  }
  incMap(httpDurationBuckets, `${method}\0${route}\0+Inf`);
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
  "",
  "# HELP gov_archive_job_backlog Current partition archive queue backlog",
  "# TYPE gov_archive_job_backlog gauge",
  "",
  "# HELP athyper_http_requests_total HTTP requests by method, normalized route, and status",
  "# TYPE athyper_http_requests_total counter",
  "",
  "# HELP athyper_http_request_duration_seconds HTTP request duration by method and normalized route",
  "# TYPE athyper_http_request_duration_seconds histogram",
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
          if (queueName === "partitionArchive" || queueName === "jobs-partition-archive") {
            const backlog =
              (counts.active  ?? 0) +
              (counts.waiting ?? 0) +
              (counts.delayed ?? 0);
            lines.push(`gov_archive_job_backlog{tenant="system"} ${backlog}`);
          }
        } catch {
          // Queue unreachable (Redis down, etc.) — emit nothing for this queue
        }
      }
      lines.push("");
    }

    for (const [k, count] of httpRequests) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const status = parts[2] ?? "";
      lines.push(
        `athyper_http_requests_total{method="${escape(method)}",route="${escape(route)}",status="${escape(status)}"} ${count}`,
      );
    }

    lines.push("");

    for (const [k, count] of httpDurationBuckets) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const le = parts[2] ?? "";
      lines.push(
        `athyper_http_request_duration_seconds_bucket{method="${escape(method)}",route="${escape(route)}",le="${escape(le)}"} ${count}`,
      );
    }
    for (const [k, sum] of httpDurationSum) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? "";
      lines.push(
        `athyper_http_request_duration_seconds_sum{method="${escape(method)}",route="${escape(route)}"} ${sum}`,
      );
    }
    for (const [k, count] of httpDurationCount) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? "";
      lines.push(
        `athyper_http_request_duration_seconds_count{method="${escape(method)}",route="${escape(route)}"} ${count}`,
      );
    }
    lines.push("");

    for (const collect of metricCollectors) {
      try {
        const collectorLines = await collect();
        if (collectorLines.length > 0) {
          lines.push(...collectorLines, "");
        }
      } catch {
        // Collector failures are scrape-local; keep core runtime metrics alive.
      }
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.end(lines.join("\n"));
  })();
}
