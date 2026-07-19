import "server-only";

export type AthyperCacheState = "hit" | "miss" | "stale" | "bypass";

export type RuntimeListDiagnosticOperation =
  | "route_params"
  | "session"
  | "session_config"
  | "saved_views"
  | "saved_view_state"
  | "descriptor"
  | "access_context"
  | "scope"
  | "record_scope"
  | "records"
  | "records_http"
  | "records_decode"
  | "references"
  | "reference_hydration"
  | "lookup_hydration"
  | "lookup_domain"
  | "presenter_build"
  | "browser_cache"
  | "rsc_total";

export type RuntimeListDiagnosticAttribute = string | number | boolean | null | undefined;

export interface RuntimeListDiagnosticContext {
  parent?: RuntimeListDiagnosticOperation;
  attributes?: Readonly<Record<string, RuntimeListDiagnosticAttribute>>;
}

export interface RuntimeListDiagnosticRecorder {
  record(
    operation: RuntimeListDiagnosticOperation,
    durationMs: number,
    cacheState?: AthyperCacheState,
    context?: RuntimeListDiagnosticContext,
  ): void;
}

export interface RuntimeListDiagnosticEntry {
  operation: RuntimeListDiagnosticOperation;
  durationMs: number;
  cacheState: AthyperCacheState;
  count: number;
}

export interface RuntimeListDiagnosticSnapshot {
  entityCode: string;
  routeKind: "rsc" | "api";
  cacheState: AthyperCacheState;
  totalMs: number;
  totalMetric: "rsc_total" | "rsc_resolve" | "total";
  serverTiming: string;
  operations: RuntimeListDiagnosticEntry[];
  spans: RuntimeListDiagnosticSpan[];
}

export interface RuntimeListDiagnosticSpan {
  operation: RuntimeListDiagnosticOperation;
  startedAtMs: number;
  durationMs: number;
  cacheState: AthyperCacheState;
  parent?: RuntimeListDiagnosticOperation;
  attributes?: Record<string, Exclude<RuntimeListDiagnosticAttribute, undefined>>;
}

const SERVER_TIMING_NAMES: Record<RuntimeListDiagnosticOperation, string> = {
  route_params: "route_params",
  session: "session",
  session_config: "session_config",
  saved_views: "saved_views",
  saved_view_state: "saved_view_state",
  descriptor: "descriptor",
  access_context: "access_context",
  scope: "scope",
  record_scope: "record_scope",
  records: "records",
  records_http: "records_http",
  records_decode: "records_decode",
  references: "references",
  reference_hydration: "reference_hydration",
  lookup_hydration: "lookup_hydration",
  lookup_domain: "lookup_domain",
  presenter_build: "presenter_build",
  browser_cache: "browser_cache",
  rsc_total: "rsc_total",
};

/**
 * Request-local collector for the runtime-list baseline. It records observed
 * work only; it does not memoize, coalesce, or otherwise alter loader behavior.
 */
export class RuntimeListDiagnosticCollector implements RuntimeListDiagnosticRecorder {
  private readonly entries = new Map<RuntimeListDiagnosticOperation, RuntimeListDiagnosticEntry>();
  private readonly spans: RuntimeListDiagnosticSpan[] = [];
  private readonly startedAt = performance.now();

  constructor(private readonly context: {
    entityCode: string;
    routeKind: "rsc" | "api";
  }) {}

  record(
    operation: RuntimeListDiagnosticOperation,
    durationMs: number,
    cacheState: AthyperCacheState = "bypass",
    context?: RuntimeListDiagnosticContext,
  ): void {
    const safeDuration = roundDuration(durationMs);
    const endedAt = performance.now();
    this.spans.push({
      operation,
      startedAtMs: roundDuration(Math.max(0, endedAt - this.startedAt - safeDuration)),
      durationMs: safeDuration,
      cacheState,
      ...(context?.parent ? { parent: context.parent } : {}),
      ...(context?.attributes
        ? { attributes: definedAttributes(context.attributes) }
        : {}),
    });
    const current = this.entries.get(operation);
    if (current) {
      current.durationMs = roundDuration(current.durationMs + safeDuration);
      current.cacheState = mergeCacheStates(current.cacheState, cacheState);
      current.count += 1;
      return;
    }

    this.entries.set(operation, {
      operation,
      durationMs: safeDuration,
      cacheState,
      count: 1,
    });
  }

  async measure<T>(
    operation: RuntimeListDiagnosticOperation,
    cacheState: AthyperCacheState,
    loader: () => Promise<T>,
    context?: RuntimeListDiagnosticContext,
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      return await loader();
    } finally {
      this.record(operation, performance.now() - startedAt, cacheState, context);
    }
  }

  snapshot(
    totalMs: number,
    cacheState?: AthyperCacheState,
    totalMetric: "rsc_total" | "rsc_resolve" | "total" = this.context.routeKind === "rsc"
      ? "rsc_total"
      : "total",
  ): RuntimeListDiagnosticSnapshot {
    const safeTotal = roundDuration(totalMs);
    const operations = [...this.entries.values()].map((entry) => ({ ...entry }));
    const effectiveCacheState = cacheState ?? aggregateCacheState(operations);
    const serverTiming = buildServerTimingHeader(
      operations,
      safeTotal,
      totalMetric,
    );
    return {
      ...this.context,
      cacheState: effectiveCacheState,
      totalMs: safeTotal,
      totalMetric,
      serverTiming,
      operations,
      spans: this.spans.map((span) => ({
        ...span,
        ...(span.attributes ? { attributes: { ...span.attributes } } : {}),
      })),
    };
  }

  responseHeaders(totalMs: number, cacheState: AthyperCacheState): Record<string, string> {
    const snapshot = this.snapshot(totalMs, cacheState, "total");
    const descriptorCacheState = snapshot.operations
      .find((entry) => entry.operation === "descriptor")?.cacheState ?? "bypass";
    const recordsCacheState = snapshot.operations
      .find((entry) => entry.operation === "records")?.cacheState ?? "bypass";
    return {
      "Cache-Control": "no-store",
      "X-Athyper-Cache": snapshot.cacheState,
      "X-Athyper-Descriptor-Cache": descriptorCacheState,
      "X-Athyper-Record-Cache": recordsCacheState,
      "Server-Timing": snapshot.serverTiming,
    };
  }
}

export function runtimeDescriptorCacheState(
  value: string | undefined,
): AthyperCacheState {
  if (value === "warm" || value === "hot" || value === "hit") return "hit";
  if (value === "cold" || value === "miss") return "miss";
  if (value === "stale") return "stale";
  return "bypass";
}

export function logRuntimeListDiagnosticSnapshot(snapshot: RuntimeListDiagnosticSnapshot): void {
  console.info("[runtime-list-observability]", {
    event: "runtime_list_baseline",
    ...snapshot,
  });
}

function buildServerTimingHeader(
  operations: RuntimeListDiagnosticEntry[],
  totalMs: number,
  totalName: "rsc_total" | "rsc_resolve" | "total",
): string {
  const timings = operations
    .filter((entry) => entry.operation !== "rsc_total")
    .map((entry) => {
      const description = entry.count > 1
        ? `;desc=\"cache=${entry.cacheState}; ${entry.count} calls\"`
        : `;desc=\"cache=${entry.cacheState}\"`;
      return `${SERVER_TIMING_NAMES[entry.operation]};dur=${entry.durationMs}${description}`;
    });
  timings.push(`${totalName};dur=${roundDuration(totalMs)}`);
  return timings.join(", ");
}

function aggregateCacheState(entries: RuntimeListDiagnosticEntry[]): AthyperCacheState {
  const states = entries.map((entry) => entry.cacheState);
  if (states.includes("stale")) return "stale";
  if (states.includes("miss")) return "miss";
  if (states.length > 0 && states.every((state) => state === "hit")) return "hit";
  return "bypass";
}

function mergeCacheStates(left: AthyperCacheState, right: AthyperCacheState): AthyperCacheState {
  if (left === right) return left;
  if (left === "stale" || right === "stale") return "stale";
  if (left === "miss" || right === "miss") return "miss";
  if (left === "bypass" || right === "bypass") return "bypass";
  return "hit";
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

function definedAttributes(
  attributes: Readonly<Record<string, RuntimeListDiagnosticAttribute>>,
): Record<string, Exclude<RuntimeListDiagnosticAttribute, undefined>> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, Exclude<RuntimeListDiagnosticAttribute, undefined>] =>
        entry[1] !== undefined,
    ),
  );
}
