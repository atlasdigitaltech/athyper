import type { NextFunction, Request, RequestHandler, Response } from "express";

import {
  observeFrameworkPhase,
  runWithFrameworkPerformance,
  setFrameworkCacheState,
  setFrameworkTenantClass,
  setFrameworkResponseBytes,
  collectFrameworkInfrastructureMetrics,
  observeFrameworkInfrastructure,
  snapshotFrameworkPerformance,
  startFrameworkPhase,
  type FrameworkPerformanceSnapshot,
  type FrameworkRequestIdentity,
  type FrameworkRolloutCohort,
} from "../packages/adapters/telemetry/src/index.js";

export { startFrameworkPhase };

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const COUNT_BUCKETS = [0, 1, 2, 4, 8, 16, 32, 64];
const BYTE_BUCKETS = [256, 1024, 4096, 16_384, 65_536, 262_144, 1_048_576];

interface ObservationLabels {
  route: string;
  entity: string;
  operation: string;
  cacheState: string;
  cohort: string;
  tenantClass: string;
}

class HistogramStore {
  private readonly buckets = new Map<string, number>();
  private readonly sums = new Map<string, number>();
  private readonly counts = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly boundaries: readonly number[],
  ) {}

  observe(labelKey: string, value: number): void {
    const safe = Number.isFinite(value) && value >= 0 ? value : 0;
    this.sums.set(labelKey, (this.sums.get(labelKey) ?? 0) + safe);
    this.counts.set(labelKey, (this.counts.get(labelKey) ?? 0) + 1);
    for (const boundary of this.boundaries) {
      if (safe <= boundary) increment(this.buckets, `${labelKey}\0${boundary}`);
    }
    increment(this.buckets, `${labelKey}\0+Inf`);
  }

  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, value] of this.buckets) {
      const parts = key.split("\0");
      const le = parts.pop() ?? "+Inf";
      lines.push(`${this.name}_bucket{${renderLabels(parts.join("\0"))},le="${le}"} ${value}`);
    }
    for (const [key, value] of this.sums) {
      lines.push(`${this.name}_sum{${renderLabels(key)}} ${value}`);
    }
    for (const [key, value] of this.counts) {
      lines.push(`${this.name}_count{${renderLabels(key)}} ${value}`);
    }
    return lines;
  }
}

const requests = new Map<string, number>();
const reported = new Map<"true" | "false", number>();
const sqlStatements = new Map<string, number>();
const redisOperations = new Map<string, number>();

const totalDuration = new HistogramStore(
  "athyper_framework_request_duration_seconds",
  "Meta-entity framework request duration",
  DURATION_BUCKETS,
);
const sqlCount = new HistogramStore(
  "athyper_framework_sql_statements",
  "Logical SQL statements per meta-entity framework request",
  COUNT_BUCKETS,
);
const sqlDuration = new HistogramStore(
  "athyper_framework_sql_duration_seconds",
  "Cumulative logical SQL duration per meta-entity framework request",
  DURATION_BUCKETS,
);
const redisCount = new HistogramStore(
  "athyper_framework_redis_operations",
  "Redis operations per meta-entity framework request",
  COUNT_BUCKETS,
);
const poolWait = new HistogramStore(
  "athyper_framework_db_pool_wait_seconds",
  "Cumulative database connection acquisition time per meta-entity framework request",
  DURATION_BUCKETS,
);
const transactionDuration = new HistogramStore(
  "athyper_framework_transaction_duration_seconds",
  "Cumulative database transaction duration per meta-entity framework request",
  DURATION_BUCKETS,
);
const responseBytes = new HistogramStore(
  "athyper_framework_response_bytes",
  "Serialized response size for meta-entity framework requests",
  BYTE_BUCKETS,
);
const phaseDuration = new HistogramStore(
  "athyper_framework_phase_duration_seconds",
  "Meta-entity framework phase duration",
  DURATION_BUCKETS,
);

export function createFrameworkPerformanceMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = classifyFrameworkRequest(req);
    if (!identity) {
      next();
      return;
    }

    runWithFrameworkPerformance(identity, () => {
      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        const endSerialization = startFrameworkPhase("serialization");
        try {
          return originalJson(body);
        } finally {
          endSerialization();
        }
      }) as Response["json"];

      res.once("finish", () => {
        applyResponseObservations(res);
        const snapshot = snapshotFrameworkPerformance();
        if (snapshot) observeFrameworkRequest(snapshot, res.statusCode);
        else increment(reported, "false");
      });
      next();
    });
  };
}

export function classifyFrameworkRequest(req: Pick<Request, "method" | "originalUrl" | "url" | "headers">): FrameworkRequestIdentity | null {
  const pathname = (req.originalUrl || req.url).split("?")[0] ?? "";
  const metadata = /^\/api\/metadata\/entities\/([^/]+)\/compiled\/?$/.exec(pathname);
  if (metadata) {
    return identity(
      "/api/metadata/entities/:entity/compiled",
      metadata[1]!,
      "descriptor_bootstrap",
      req.headers["x-rollout-cohort"],
      req.headers["x-tenant-class"] ?? req.headers["x-tenant-size-class"],
    );
  }

  const records = /^\/api\/(records|runtime\/v1\/entities)\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!records) return null;
  const entityCode = records[2]!;
  const suffix = records[3] ?? "";
  const method = req.method.toUpperCase();
  const prefix = records[1] === "records" ? "/api/records" : "/api/runtime/v1/entities";

  if (!suffix || suffix === "/") {
    const operation = method === "GET" ? "list" : method === "POST" ? "create" : "other";
    return identity(`${prefix}/:entity`, entityCode, operation, req.headers["x-rollout-cohort"], req.headers["x-tenant-class"] ?? req.headers["x-tenant-size-class"]);
  }
  if (/^\/[^/]+\/edit\/submit\/?$/.test(suffix) && method === "POST") {
    return identity(`${prefix}/:entity/:id/edit/submit`, entityCode, "aggregate_save", req.headers["x-rollout-cohort"], req.headers["x-tenant-class"] ?? req.headers["x-tenant-size-class"]);
  }
  if (/^\/[^/]+\/?$/.test(suffix)) {
    const operation = method === "GET"
      ? "detail"
      : method === "PATCH" || method === "PUT"
        ? "patch"
        : method === "DELETE"
          ? "delete"
          : "other";
    return identity(`${prefix}/:entity/:id`, entityCode, operation, req.headers["x-rollout-cohort"], req.headers["x-tenant-class"] ?? req.headers["x-tenant-size-class"]);
  }
  return null;
}

export function collectFrameworkPerformanceMetrics(): string[] {
  const lines = [
    "# HELP athyper_framework_requests_total Meta-entity framework requests by controlled execution attributes",
    "# TYPE athyper_framework_requests_total counter",
  ];
  for (const [key, count] of requests) {
    const parts = key.split("\0");
    const statusClass = parts.pop() ?? "unknown";
    lines.push(`athyper_framework_requests_total{${renderLabels(parts.join("\0"))},status_class="${escape(statusClass)}"} ${count}`);
  }
  lines.push(
    "# HELP athyper_framework_observability_total Protected framework requests with or without a complete performance snapshot",
    "# TYPE athyper_framework_observability_total counter",
  );
  for (const [isReported, count] of reported) {
    lines.push(`athyper_framework_observability_total{reported="${isReported}"} ${count}`);
  }
  lines.push(
    "# HELP athyper_framework_sql_statements_total Logical SQL statements executed by framework requests",
    "# TYPE athyper_framework_sql_statements_total counter",
  );
  for (const [key, count] of sqlStatements) {
    lines.push(`athyper_framework_sql_statements_total{${renderLabels(key)}} ${count}`);
  }
  lines.push(
    "# HELP athyper_framework_redis_operations_total Redis operations executed by framework requests",
    "# TYPE athyper_framework_redis_operations_total counter",
  );
  for (const [key, count] of redisOperations) {
    lines.push(`athyper_framework_redis_operations_total{${renderLabels(key)}} ${count}`);
  }
  lines.push(
    ...totalDuration.render(),
    ...sqlCount.render(),
    ...sqlDuration.render(),
    ...redisCount.render(),
    ...poolWait.render(),
    ...transactionDuration.render(),
    ...responseBytes.render(),
    ...phaseDuration.render(),
  );
  lines.push(...collectFrameworkInfrastructureMetrics());
  return lines;
}

function observeFrameworkRequest(snapshot: FrameworkPerformanceSnapshot, statusCode: number): void {
  const labels: ObservationLabels = {
    route: snapshot.route,
    entity: snapshot.entityCode,
    operation: snapshot.operation,
    cacheState: snapshot.cacheState,
    cohort: snapshot.rolloutCohort,
    tenantClass: snapshot.tenantClass,
  };
  const key = labelKey(labels);
  increment(reported, "true");
  increment(requests, `${key}\0${statusClass(statusCode)}`);
  increment(sqlStatements, key, snapshot.sqlCount);
  increment(redisOperations, key, snapshot.redisCount);
  totalDuration.observe(key, snapshot.totalDurationMs / 1000);
  sqlCount.observe(key, snapshot.sqlCount);
  sqlDuration.observe(key, snapshot.sqlDurationMs / 1000);
  redisCount.observe(key, snapshot.redisCount);
  poolWait.observe(key, snapshot.poolWaitMs / 1000);
  transactionDuration.observe(key, snapshot.transactionDurationMs / 1000);
  responseBytes.observe(key, snapshot.responseBytes);
  for (const [phase, durationMs] of Object.entries(snapshot.phases) as Array<[string, number]>) {
    phaseDuration.observe(`${key}\0${phase}`, durationMs / 1000);
  }
}

function applyResponseObservations(res: Response): void {
  const locals = res.locals as Record<string, unknown>;
  const endAuthentication = locals["authenticationPhaseEnd"];
  if (typeof endAuthentication === "function") (endAuthentication as () => void)();
  if (typeof locals["authenticationStartedAt"] === "bigint" && locals["authenticationMs"] === undefined) {
    locals["authenticationMs"] =
      Number(process.hrtime.bigint() - (locals["authenticationStartedAt"] as bigint)) / 1_000_000;
  }
  const cacheHeader = String(res.getHeader("X-Cache") ?? "").toUpperCase();
  const listCacheHeader = String(res.getHeader("X-List-Cache") ?? "").toUpperCase();
  const descriptorCacheHeader = String(res.getHeader("X-Descriptor-Cache") ?? "").toUpperCase();
  const effectiveCacheHeader = descriptorCacheHeader || cacheHeader || listCacheHeader;
  const localsTenantClass = String(locals["tenantClass"] ?? res.getHeader("X-Tenant-Class") ?? "");
  if (localsTenantClass) setFrameworkTenantClass(localsTenantClass);
  if (effectiveCacheHeader === "L0" || effectiveCacheHeader === "L1") setFrameworkCacheState("l1_hit");
  else if (effectiveCacheHeader === "L2") setFrameworkCacheState("l2_hit");
  else if (effectiveCacheHeader === "L3") setFrameworkCacheState("miss");
  else if (effectiveCacheHeader === "L3_REDIS_DEGRADED") {
    setFrameworkCacheState("error");
    observeFrameworkInfrastructure("redis_degradation");
  }
  if (String(res.getHeader("X-Cache-Fallback") ?? "").toLowerCase() === "true") {
    observeFrameworkInfrastructure("cache_fallback");
  }
  else if (effectiveCacheHeader === "HIT") setFrameworkCacheState("l2_hit");
  else if (effectiveCacheHeader === "MISS") setFrameworkCacheState("miss");
  else if (effectiveCacheHeader === "BYPASS") setFrameworkCacheState("bypass");
  else if (effectiveCacheHeader === "ERROR") setFrameworkCacheState("error");

  const length = Number(res.getHeader("Content-Length") ?? 0);
  if (Number.isFinite(length) && length >= 0) setFrameworkResponseBytes(length);

  const compileMs = Number(locals["descriptorCompileMs"] ?? 0);
  if (Number.isFinite(compileMs) && compileMs > 0) {
    observeFrameworkPhase("descriptor_compile", compileMs);
  }
  for (const [localKey, phase] of [
    ["authenticationMs", "authentication"],
    ["requestContextMs", "request_context"],
    ["descriptorHydrateMs", "descriptor_hydrate"],
  ] as const) {
    const durationMs = Number(locals[localKey] ?? 0);
    if (Number.isFinite(durationMs) && durationMs > 0) observeFrameworkPhase(phase, durationMs);
  }
}

function identity(
  route: string,
  rawEntity: string,
  operation: FrameworkRequestIdentity["operation"],
  rawCohort: unknown,
  rawTenantClass: unknown,
): FrameworkRequestIdentity {
  return {
    route,
    entityCode: decodeURIComponent(rawEntity).trim().replace(/-/g, "_").toLowerCase() || "unknown",
    operation,
    rolloutCohort: rolloutCohort(rawCohort),
    tenantClass: tenantClass(rawTenantClass),
  };
}

function rolloutCohort(value: unknown): FrameworkRolloutCohort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "control" || raw === "internal" || raw === "canary" || raw === "full"
    ? raw
    : "unassigned";
}

function labelKey(labels: ObservationLabels): string {
  return [labels.route, labels.entity, labels.operation, labels.cacheState, labels.cohort, labels.tenantClass].join("\0");
}

function renderLabels(key: string): string {
  const [route = "unknown", entity = "unknown", operation = "other", cacheState = "none", cohort = "unassigned", tenantClass = "unknown", phase] = key.split("\0");
  const labels = [
    `route="${escape(route)}"`,
    `entity="${escape(entity)}"`,
    `operation="${escape(operation)}"`,
    `cache_state="${escape(cacheState)}"`,
    `rollout_cohort="${escape(cohort)}"`,
    `tenant_class="${escape(tenantClass)}"`,
  ];
  if (phase) labels.push(`phase="${escape(phase)}"`);
  return labels.join(",");
}

function tenantClass(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && /^[a-z0-9_-]{1,32}$/i.test(raw.trim())
    ? raw.trim().toLowerCase()
    : "unknown";
}

function statusClass(statusCode: number): string {
  return statusCode >= 100 && statusCode < 600 ? `${Math.floor(statusCode / 100)}xx` : "unknown";
}

function increment<K>(map: Map<K, number>, key: K, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
