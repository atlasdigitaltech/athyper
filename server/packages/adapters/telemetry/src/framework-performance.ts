import { AsyncLocalStorage } from "node:async_hooks";

export type FrameworkOperation =
  | "descriptor_bootstrap"
  | "list"
  | "detail"
  | "create"
  | "patch"
  | "delete"
  | "aggregate_save"
  | "transition"
  | "other";

export type FrameworkCacheState =
  | "none"
  | "l1_hit"
  | "l2_hit"
  | "miss"
  | "bypass"
  | "error";

export type FrameworkRolloutCohort =
  | "control"
  | "internal"
  | "canary"
  | "full"
  | "unassigned";

export type FrameworkPhase =
  | "authentication"
  | "request_context"
  | "descriptor_compile"
  | "descriptor_hydrate"
  | "authorization"
  | "query"
  | "mutation"
  | "serialization";

export interface FrameworkRequestIdentity {
  route: string;
  entityCode: string;
  operation: FrameworkOperation;
  rolloutCohort: FrameworkRolloutCohort;
  tenantClass: string;
}

export interface FrameworkPerformanceSnapshot extends FrameworkRequestIdentity {
  cacheState: FrameworkCacheState;
  totalDurationMs: number;
  sqlCount: number;
  sqlDurationMs: number;
  redisCount: number;
  redisDurationMs: number;
  poolAcquireCount: number;
  poolWaitMs: number;
  transactionCount: number;
  transactionDurationMs: number;
  responseBytes: number;
  phases: Readonly<Partial<Record<FrameworkPhase, number>>>;
}

interface FrameworkPerformanceState extends FrameworkRequestIdentity {
  readonly startedAtNs: bigint;
  cacheState: FrameworkCacheState;
  sqlCount: number;
  sqlDurationMs: number;
  redisCount: number;
  redisDurationMs: number;
  poolAcquireCount: number;
  poolWaitMs: number;
  transactionCount: number;
  transactionDurationMs: number;
  responseBytes: number;
  readonly phases: Partial<Record<FrameworkPhase, number>>;
}

const storage = new AsyncLocalStorage<FrameworkPerformanceState>();
const instrumentedRedisClients = new WeakSet<object>();
const infrastructureCounters = new Map<string, number>();
const infrastructureGauges = new Map<string, number>();
const infrastructureHistograms = new Map<string, { sum: number; count: number; max: number }>();

export type FrameworkInfrastructureMetric =
  | "descriptor_generation_lag_ms"
  | "cache_fallback"
  | "redis_degradation"
  | "lock_contention"
  | "queue_latency_ms"
  | "outbox_age_ms"
  | "sse_reconnect"
  | "sse_slow_client_disconnect";

export function runWithFrameworkPerformance<T>(
  identity: FrameworkRequestIdentity,
  fn: () => T,
): T {
  return storage.run({
    ...identity,
    startedAtNs: process.hrtime.bigint(),
    cacheState: "none",
    sqlCount: 0,
    sqlDurationMs: 0,
    redisCount: 0,
    redisDurationMs: 0,
    poolAcquireCount: 0,
    poolWaitMs: 0,
    transactionCount: 0,
    transactionDurationMs: 0,
    responseBytes: 0,
    phases: {},
  }, fn);
}

/** Record infrastructure outcomes using the same request/process metrics surface. */
export function observeFrameworkInfrastructure(
  metric: FrameworkInfrastructureMetric,
  value = 1,
  labels: Record<string, string> = {},
): void {
  const key = metricKey(metric, labels);
  if (metric === "descriptor_generation_lag_ms" || metric === "queue_latency_ms" || metric === "outbox_age_ms") {
    const current = infrastructureHistograms.get(key) ?? { sum: 0, count: 0, max: 0 };
    const safe = nonNegative(value);
    current.sum += safe;
    current.count += 1;
    current.max = Math.max(current.max, safe);
    infrastructureHistograms.set(key, current);
    return;
  }
  increment(infrastructureCounters, key, value);
}

export function setFrameworkInfrastructureGauge(
  metric: "outbox_backlog",
  value: number,
  labels: Record<string, string> = {},
): void {
  infrastructureGauges.set(metricKey(metric, labels), Math.max(0, Number.isFinite(value) ? value : 0));
}

export function collectFrameworkInfrastructureMetrics(): string[] {
  const lines: string[] = [];
  const counterNames: Record<string, string> = {
    cache_fallback: "athyper_framework_cache_fallback_total",
    redis_degradation: "athyper_framework_redis_degradation_total",
    lock_contention: "athyper_framework_lock_contention_total",
    sse_reconnect: "athyper_framework_sse_reconnects_total",
    sse_slow_client_disconnect: "athyper_framework_sse_slow_client_disconnects_total",
  };
  for (const [key, value] of infrastructureCounters) {
    const [metric = "unknown", labelKey = ""] = key.split("\0", 2);
    const name = counterNames[metric] ?? `athyper_framework_${metric}_total`;
    lines.push(`${name}{${renderMetricLabels(labelKey ?? "")}} ${value}`);
  }
  const histogramNames: Record<string, string> = {
    descriptor_generation_lag_ms: "athyper_framework_descriptor_generation_lag_ms",
    queue_latency_ms: "athyper_framework_queue_latency_ms",
    outbox_age_ms: "athyper_framework_outbox_age_ms",
  };
  for (const [key, value] of infrastructureHistograms) {
    const [metric = "unknown", labelKey = ""] = key.split("\0", 2);
    const name = histogramNames[metric] ?? `athyper_framework_${metric}`;
    const labels = renderMetricLabels(labelKey ?? "");
    lines.push(`${name}_sum{${labels}} ${value.sum}`);
    lines.push(`${name}_count{${labels}} ${value.count}`);
    lines.push(`${name}_max{${labels}} ${value.max}`);
  }
  for (const [key, value] of infrastructureGauges) {
    const [metric = "unknown", labelKey = ""] = key.split("\0", 2);
    lines.push(`athyper_framework_${metric}{${renderMetricLabels(labelKey ?? "")}} ${value}`);
  }
  return lines;
}

export function setFrameworkCacheState(cacheState: FrameworkCacheState): void {
  const state = storage.getStore();
  if (state) state.cacheState = cacheState;
}

export function setFrameworkTenantClass(value: string): void {
  const state = storage.getStore();
  if (state && /^[a-z0-9_-]{1,32}$/i.test(value.trim())) state.tenantClass = value.trim().toLowerCase();
}

export function setFrameworkResponseBytes(bytes: number): void {
  const state = storage.getStore();
  if (state && Number.isFinite(bytes) && bytes >= 0) state.responseBytes = bytes;
}

export function observeFrameworkSql(durationMs: number): void {
  const state = storage.getStore();
  if (!state) return;
  state.sqlCount += 1;
  state.sqlDurationMs += nonNegative(durationMs);
}

export function observeFrameworkRedis(durationMs: number): void {
  const state = storage.getStore();
  if (!state) return;
  state.redisCount += 1;
  state.redisDurationMs += nonNegative(durationMs);
}

export function observeFrameworkPoolWait(durationMs: number): void {
  const state = storage.getStore();
  if (!state) return;
  state.poolAcquireCount += 1;
  state.poolWaitMs += nonNegative(durationMs);
}

export function observeFrameworkTransaction(durationMs: number): void {
  const state = storage.getStore();
  if (!state) return;
  state.transactionCount += 1;
  state.transactionDurationMs += nonNegative(durationMs);
}

export function observeFrameworkPhase(phase: FrameworkPhase, durationMs: number): void {
  const state = storage.getStore();
  if (!state) return;
  state.phases[phase] = (state.phases[phase] ?? 0) + nonNegative(durationMs);
}

export function startFrameworkPhase(phase: FrameworkPhase): () => void {
  const startedAtNs = process.hrtime.bigint();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    observeFrameworkPhase(phase, elapsedMs(startedAtNs));
  };
}

export async function withFrameworkPhase<T>(
  phase: FrameworkPhase,
  fn: () => T | Promise<T>,
): Promise<T> {
  const end = startFrameworkPhase(phase);
  try {
    return await fn();
  } finally {
    end();
  }
}

export function snapshotFrameworkPerformance(): FrameworkPerformanceSnapshot | undefined {
  const state = storage.getStore();
  if (!state) return undefined;
  return Object.freeze({
    route: state.route,
    entityCode: state.entityCode,
    operation: state.operation,
    rolloutCohort: state.rolloutCohort,
    tenantClass: state.tenantClass,
    cacheState: state.cacheState,
    totalDurationMs: elapsedMs(state.startedAtNs),
    sqlCount: state.sqlCount,
    sqlDurationMs: state.sqlDurationMs,
    redisCount: state.redisCount,
    redisDurationMs: state.redisDurationMs,
    poolAcquireCount: state.poolAcquireCount,
    poolWaitMs: state.poolWaitMs,
    transactionCount: state.transactionCount,
    transactionDurationMs: state.transactionDurationMs,
    responseBytes: state.responseBytes,
    phases: Object.freeze({ ...state.phases }),
  });
}

/** Instrument one ioredis-compatible client without wrapping its public object. */
export function instrumentFrameworkRedisClient<T extends object>(client: T): T {
  if (instrumentedRedisClients.has(client)) return client;
  const target = client as T & {
    sendCommand: (...args: unknown[]) => unknown;
  };
  if (typeof target.sendCommand !== "function") return client;

  const original = target.sendCommand.bind(client);
  target.sendCommand = (...args: unknown[]): unknown => {
    const startedAtNs = process.hrtime.bigint();
    try {
      const result = original(...args);
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(() => {
          observeFrameworkRedis(elapsedMs(startedAtNs));
        });
      }
      observeFrameworkRedis(elapsedMs(startedAtNs));
      return result;
    } catch (error) {
      observeFrameworkRedis(elapsedMs(startedAtNs));
      throw error;
    }
  };
  instrumentedRedisClients.add(client);
  return client;
}

function elapsedMs(startedAtNs: bigint): number {
  return Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function metricKey(metric: string, labels: Record<string, string>): string {
  return `${metric}\0${Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join(",")}`;
}

function renderMetricLabels(labelKey: string): string {
  if (!labelKey) return "";
  return labelKey.split(",").filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator) : "label";
    const value = separator >= 0 ? part.slice(separator + 1) : part;
    return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }).join(",");
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof (value as { then?: unknown }).then === "function";
}
