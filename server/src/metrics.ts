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

import type { CacheMetrics } from "../packages/services/iam/session/session.service.js";
import type { AiLogKind, AiLogMetrics } from "@athyper/svc-ai";
import type { Request, Response } from "express";

// ─── Queue depth state ────────────────────────────────────────────────────────
// Populated by registerJobQueues() after the jobs service starts.
// Duck-typed to avoid importing the full BullMQ Queue class here.
type DepthQueue = { getJobCounts(...states: string[]): Promise<Record<string, number>> };
export type MetricCollector = () => Promise<string[]>;
export interface NamedMetricCollector {
  name: string;
  collect: MetricCollector;
}

interface RegisteredMetricCollector {
  name: string;
  collect: MetricCollector;
}

interface MetricCollectorStats {
  up: 0 | 1;
  runs: number;
  failures: number;
  lastDurationSeconds: number;
  lastSuccessTimestampSeconds: number;
  lastFailureTimestampSeconds: number;
}

let jobQueues: Record<string, DepthQueue> | null = null;
let metricCollectors: RegisteredMetricCollector[] = [];
const metricCollectorStats = new Map<string, MetricCollectorStats>();

const HTTP_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Register BullMQ queues for depth metrics.
 * Called once from api.ts after the jobs service is wired.
 * Metrics for each queue are emitted as athyper_queue_jobs gauges.
 */
export function registerJobQueues(queues: Record<string, DepthQueue>): void {
  jobQueues = queues;
}

/**
 * Register live metric collectors that need application dependencies such as DB
 * access. Collectors return Prometheus text-format lines and are polled on each
 * /metrics scrape.
 */
export function registerMetricCollectors(collectors: Array<MetricCollector | NamedMetricCollector>): void {
  metricCollectors = collectors.map((collector, index) => {
    if (typeof collector === "function") {
      return { name: `collector_${index}`, collect: collector };
    }
    return collector;
  });

  for (const collector of metricCollectors) {
    if (!metricCollectorStats.has(collector.name)) {
      metricCollectorStats.set(collector.name, {
        up: 0,
        runs: 0,
        failures: 0,
        lastDurationSeconds: 0,
        lastSuccessTimestampSeconds: 0,
        lastFailureTimestampSeconds: 0,
      });
    }
  }
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
const aiLogWriteFailures = new Map<AiLogKind, number>();
const authContextMismatches = new Map<string, number>();
const tenantStampSkipped = new Map<string, number>();
const requiredActionBlocked = new Map<string, number>();
const authFlagPostureWarnings = new Map<string, number>();
const authContextMismatchSuppressed = new Map<string, number>();
const tokenClaimsInvalid = new Map<string, number>();

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
  tenantId?: string;
}): void {
  const method = input.method.toUpperCase();
  const route = normalizePath(input.path);
  const status = String(input.statusCode);
  const tenantId = input.tenantId?.trim() || "unknown";
  const labels = `${method}\0${route}\0${status}\0${tenantId}`;
  const durationSeconds = input.durationMs / 1000;

  incMap(httpRequests, labels);
  incMap(httpDurationSum, `${method}\0${route}\0${tenantId}`, durationSeconds);
  incMap(httpDurationCount, `${method}\0${route}\0${tenantId}`);

  for (const bucket of HTTP_DURATION_BUCKETS_SECONDS) {
    if (durationSeconds <= bucket) {
      incMap(httpDurationBuckets, `${method}\0${route}\0${tenantId}\0${bucket}`);
    }
  }
  incMap(httpDurationBuckets, `${method}\0${route}\0${tenantId}\0+Inf`);
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

/**
 * Record a claim-vs-context mismatch detected by the API entry guard.
 * `check` is one of `realm | plane | tenant | azp` and labels the specific
 * cross-check that failed; `mode` is `shadow | enforced` so dashboards can
 * separate observation-only drift from real rejections.
 */
export function recordAuthContextMismatch(
  check: "realm" | "plane" | "tenant" | "azp",
  mode: "shadow" | "enforced",
): void {
  const k = `${check}\0${mode}`;
  authContextMismatches.set(k, (authContextMismatches.get(k) ?? 0) + 1);
}

/**
 * Record a tenant-stamp skip event from TenantStampDriver.
 * `reason` is `no-tenant` (request context absent) or `invalid-uuid`
 * (provider returned a malformed value — programming error).
 */
export function recordTenantStampSkipped(
  reason: "no-tenant" | "invalid-uuid",
): void {
  tenantStampSkipped.set(reason, (tenantStampSkipped.get(reason) ?? 0) + 1);
}

/**
 * Record a required-action block applied by the platform-context middleware.
 * `action` is the KC required-action code (e.g. `UPDATE_PASSWORD`).
 */
export function recordRequiredActionBlocked(action: string): void {
  requiredActionBlocked.set(action, (requiredActionBlocked.get(action) ?? 0) + 1);
}

/**
 * Record an auth-flag posture violation detected at bootstrap. `rule` is the
 * stable rule id (e.g. `R1_GATE_REQUIRES_CROSSCHECK`); `severity` is `warning`
 * or `error`. Errors are still emitted as a counter increment before the
 * bootstrap throw so dashboards can spot the failed deploy.
 */
export function recordAuthFlagPostureWarning(
  rule: string,
  severity: "warning" | "error",
): void {
  const k = `${rule}\0${severity}`;
  authFlagPostureWarnings.set(k, (authFlagPostureWarnings.get(k) ?? 0) + 1);
}

/**
 * Increment the count of auth_context_mismatch log lines suppressed by the
 * Phase F log sampler. The matching `auth_context_mismatch_total` counter
 * stays UNSAMPLED — dashboards show suppressed / total to gauge log spam
 * pressure without losing the underlying event count.
 */
export function recordAuthContextMismatchSuppressed(
  check: "realm" | "plane" | "tenant" | "azp",
  amount = 1,
): void {
  if (amount <= 0) return;
  authContextMismatchSuppressed.set(
    check,
    (authContextMismatchSuppressed.get(check) ?? 0) + amount,
  );
}

/**
 * Phase H/F5 — record a token-claim schema parse failure. `fieldPath` is the
 * first failing field (e.g. `tenant_id`, `iss`) so dashboards show which
 * mapper / shape is non-conformant; `mode` is `shadow` (observation only) or
 * `enforced` (caller rejected the token).
 */
export function recordTokenClaimsInvalid(
  fieldPath: string,
  mode: "shadow" | "enforced",
): void {
  const k = `${fieldPath}\0${mode}`;
  tokenClaimsInvalid.set(k, (tokenClaimsInvalid.get(k) ?? 0) + 1);
}

export function createAiLogMetrics(): AiLogMetrics {
  return {
    writeFailed(kind: AiLogKind) {
      aiLogWriteFailures.set(kind, (aiLogWriteFailures.get(kind) ?? 0) + 1);
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
  "# HELP athyper_queue_jobs Current BullMQ job counts by queue and state (gauge)",
  "# TYPE athyper_queue_jobs gauge",
  "",
  "# HELP gov_archive_job_backlog Current partition archive queue backlog",
  "# TYPE gov_archive_job_backlog gauge",
  "",
  "# HELP athyper_http_requests_total HTTP requests by method, normalized route, status, and tenant",
  "# TYPE athyper_http_requests_total counter",
  "",
  "# HELP athyper_http_request_duration_seconds HTTP request duration by method, normalized route, and tenant",
  "# TYPE athyper_http_request_duration_seconds histogram",
  "",
  "# HELP athyper_ai_log_write_failures_total AI log database write failures by log kind",
  "# TYPE athyper_ai_log_write_failures_total counter",
  "",
  "# HELP athyper_metric_collector_up Whether a live metric collector succeeded on its latest scrape",
  "# TYPE athyper_metric_collector_up gauge",
  "# HELP athyper_metric_collector_runs_total Live metric collector scrape attempts",
  "# TYPE athyper_metric_collector_runs_total counter",
  "# HELP athyper_metric_collector_failures_total Live metric collector scrape failures",
  "# TYPE athyper_metric_collector_failures_total counter",
  "# HELP athyper_metric_collector_last_duration_seconds Latest live metric collector scrape duration",
  "# TYPE athyper_metric_collector_last_duration_seconds gauge",
  "# HELP athyper_metric_collector_last_success_timestamp_seconds Unix timestamp of latest successful live metric collector scrape",
  "# TYPE athyper_metric_collector_last_success_timestamp_seconds gauge",
  "# HELP athyper_metric_collector_last_failure_timestamp_seconds Unix timestamp of latest failed live metric collector scrape",
  "# TYPE athyper_metric_collector_last_failure_timestamp_seconds gauge",
  "",
  "# HELP auth_context_mismatch_total Claim-vs-header context mismatches detected at the API entry guard",
  "# TYPE auth_context_mismatch_total counter",
  "",
  "# HELP db_tenant_stamp_skipped_total Tenant-stamp driver skips (no request context or invalid tenant id)",
  "# TYPE db_tenant_stamp_skipped_total counter",
  "",
  "# HELP auth_required_action_blocked_total Sensitive route blocked because Keycloak required action is pending",
  "# TYPE auth_required_action_blocked_total counter",
  "",
  "# HELP auth_flag_posture_warning_total Auth flag posture violations detected at bootstrap",
  "# TYPE auth_flag_posture_warning_total counter",
  "",
  "# HELP auth_context_mismatch_suppressed_total Mismatch log lines suppressed by the Phase F log sampler (counter for the original event remains unsampled)",
  "# TYPE auth_context_mismatch_suppressed_total counter",
  "",
  "# HELP token_claims_invalid_total Token-claim schema parse failures by field path and enforcement mode",
  "# TYPE token_claims_invalid_total counter",
].join("\n");

function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function recordMetricCollectorResult(name: string, ok: boolean, durationSeconds: number): void {
  const nowSeconds = Date.now() / 1000;
  const current: MetricCollectorStats = metricCollectorStats.get(name) ?? {
    up: 0,
    runs: 0,
    failures: 0,
    lastDurationSeconds: 0,
    lastSuccessTimestampSeconds: 0,
    lastFailureTimestampSeconds: 0,
  };

  current.up = ok ? 1 : 0;
  current.runs += 1;
  current.lastDurationSeconds = durationSeconds;
  if (ok) {
    current.lastSuccessTimestampSeconds = nowSeconds;
  } else {
    current.failures += 1;
    current.lastFailureTimestampSeconds = nowSeconds;
  }

  metricCollectorStats.set(name, current);
}

function renderMetricCollectorStats(): string[] {
  const lines: string[] = [];
  for (const [name, stats] of metricCollectorStats) {
    const label = `name="${escape(name)}"`;
    lines.push(`athyper_metric_collector_up{${label}} ${stats.up}`);
    lines.push(`athyper_metric_collector_runs_total{${label}} ${stats.runs}`);
    lines.push(`athyper_metric_collector_failures_total{${label}} ${stats.failures}`);
    lines.push(`athyper_metric_collector_last_duration_seconds{${label}} ${stats.lastDurationSeconds}`);
    lines.push(`athyper_metric_collector_last_success_timestamp_seconds{${label}} ${stats.lastSuccessTimestampSeconds}`);
    lines.push(`athyper_metric_collector_last_failure_timestamp_seconds{${label}} ${stats.lastFailureTimestampSeconds}`);
  }
  return lines;
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
              `athyper_queue_jobs{queue="${escape(queueName)}",state="${escape(state)}"} ${count}`,
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
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const status = parts[2] ?? ""; const tenantId = parts[3] ?? "unknown";
      lines.push(
        `athyper_http_requests_total{method="${escape(method)}",route="${escape(route)}",status="${escape(status)}",tenant_id="${escape(tenantId)}"} ${count}`,
      );
    }

    lines.push("");

    for (const [k, count] of httpDurationBuckets) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const tenantId = parts[2] ?? "unknown"; const le = parts[3] ?? "";
      lines.push(
        `athyper_http_request_duration_seconds_bucket{method="${escape(method)}",route="${escape(route)}",tenant_id="${escape(tenantId)}",le="${escape(le)}"} ${count}`,
      );
    }
    for (const [k, sum] of httpDurationSum) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const tenantId = parts[2] ?? "unknown";
      lines.push(
        `athyper_http_request_duration_seconds_sum{method="${escape(method)}",route="${escape(route)}",tenant_id="${escape(tenantId)}"} ${sum}`,
      );
    }
    for (const [k, count] of httpDurationCount) {
      const parts = k.split("\0");
      const method = parts[0] ?? ""; const route = parts[1] ?? ""; const tenantId = parts[2] ?? "unknown";
      lines.push(
        `athyper_http_request_duration_seconds_count{method="${escape(method)}",route="${escape(route)}",tenant_id="${escape(tenantId)}"} ${count}`,
      );
    }
    lines.push("");

    for (const [kind, count] of aiLogWriteFailures) {
      lines.push(
        `athyper_ai_log_write_failures_total{kind="${escape(kind)}"} ${count}`,
      );
    }
    lines.push("");

    for (const [k, count] of authContextMismatches) {
      const parts = k.split("\0");
      const check = parts[0] ?? ""; const mode = parts[1] ?? "";
      lines.push(
        `auth_context_mismatch_total{check="${escape(check)}",mode="${escape(mode)}"} ${count}`,
      );
    }
    if (authContextMismatches.size > 0) lines.push("");

    for (const [reason, count] of tenantStampSkipped) {
      lines.push(`db_tenant_stamp_skipped_total{reason="${escape(reason)}"} ${count}`);
    }
    if (tenantStampSkipped.size > 0) lines.push("");

    for (const [action, count] of requiredActionBlocked) {
      lines.push(`auth_required_action_blocked_total{action="${escape(action)}"} ${count}`);
    }
    if (requiredActionBlocked.size > 0) lines.push("");

    for (const [k, count] of authFlagPostureWarnings) {
      const parts = k.split("\0");
      const rule = parts[0] ?? ""; const severity = parts[1] ?? "";
      lines.push(
        `auth_flag_posture_warning_total{rule="${escape(rule)}",severity="${escape(severity)}"} ${count}`,
      );
    }
    if (authFlagPostureWarnings.size > 0) lines.push("");

    for (const [check, count] of authContextMismatchSuppressed) {
      lines.push(
        `auth_context_mismatch_suppressed_total{check="${escape(check)}"} ${count}`,
      );
    }
    if (authContextMismatchSuppressed.size > 0) lines.push("");

    for (const [k, count] of tokenClaimsInvalid) {
      const parts = k.split("\0");
      const fieldPath = parts[0] ?? ""; const mode = parts[1] ?? "";
      lines.push(
        `token_claims_invalid_total{field_path="${escape(fieldPath)}",mode="${escape(mode)}"} ${count}`,
      );
    }
    if (tokenClaimsInvalid.size > 0) lines.push("");

    for (const collector of metricCollectors) {
      const collectStartedAt = process.hrtime.bigint();
      try {
        const collectorLines = await collector.collect();
        recordMetricCollectorResult(
          collector.name,
          true,
          Number(process.hrtime.bigint() - collectStartedAt) / 1_000_000_000,
        );
        if (collectorLines.length > 0) {
          lines.push(...collectorLines, "");
        }
      } catch {
        recordMetricCollectorResult(
          collector.name,
          false,
          Number(process.hrtime.bigint() - collectStartedAt) / 1_000_000_000,
        );
      }
    }

    const collectorStatsLines = renderMetricCollectorStats();
    if (collectorStatsLines.length > 0) lines.push(...collectorStatsLines, "");

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.end(lines.join("\n"));
  })();
}
