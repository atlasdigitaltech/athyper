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

export function setFrameworkCacheState(cacheState: FrameworkCacheState): void {
  const state = storage.getStore();
  if (state) state.cacheState = cacheState;
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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof (value as { then?: unknown }).then === "function";
}
