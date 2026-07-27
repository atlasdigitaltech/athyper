import { createHash } from "node:crypto";

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { extractOrgHeaders, resolveTenantId, verifyBearer } from "@athyper/svc-shared";
import {
  MetaEntityContractV21Schema,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";
import { OperationSelectionConfigSchema } from "@athyper/api-contracts/metadata";

import { executionDescriptorGenerationKeys, type ExecutionDescriptorIdentity } from "../src/execution-descriptor/index.js";

type AnyDb = Kysely<Record<string, any>>;
type JsonObject = Record<string, unknown>;

export interface RuntimeBootstrapChild {
  relationName: string;
  entityCode: string;
  descriptorHash: string;
  compiledEntity: JsonObject;
  operations: JsonObject[];
  policy: JsonObject | null;
  lifecycleStateMasks: JsonObject[];
}

export interface RuntimeBootstrapPayload {
  schemaVersion: 1;
  entityCode: string;
  bootstrapHash: string;
  compiledEntity: JsonObject;
  operations: JsonObject[];
  policy: JsonObject | null;
  lifecycleStateMasks: JsonObject[];
  permissionAliases: Record<string, string>;
  childProjections: RuntimeBootstrapChild[];
  effectiveSurfaceIds?: string[];
  effectiveFieldIds?: string[];
}

export interface RuntimeBootstrapRedis {
  mget(...keys: string[]): Promise<Array<string | null>>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface RuntimeBootstrapProviderOptions {
  redis?: RuntimeBootstrapRedis;
  load: (identity: ExecutionDescriptorIdentity) => Promise<Omit<RuntimeBootstrapPayload, "bootstrapHash"> | null>;
  l1Limit?: number;
  l1TtlMs?: number;
  l2TtlSeconds?: number;
  now?: () => number;
}

export interface RuntimeBootstrapResult {
  payload: RuntimeBootstrapPayload;
  generation: string;
  cacheState: "L1" | "L2" | "L3" | "L3_REDIS_DEGRADED";
}

interface L1Entry { result: RuntimeBootstrapResult; expiresAt: number }
interface CacheRead { generation: string; l2: string | null; healthy: boolean }

const DEFAULT_L1_LIMIT = 300;
const DEFAULT_L1_TTL_MS = 60_000;
const DEFAULT_L2_TTL_SECONDS = 24 * 60 * 60;

export class RuntimeBootstrapProvider {
  private readonly l1 = new Map<string, L1Entry>();
  private readonly inFlight = new Map<string, Promise<RuntimeBootstrapResult>>();

  constructor(private readonly options: RuntimeBootstrapProviderOptions) {}

  async get(identity: ExecutionDescriptorIdentity): Promise<RuntimeBootstrapResult> {
    const read = await this.read(identity);
    const key = `${scopeKey(identity)}\0${read.generation}`;
    const cached = this.l1.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.l1.delete(key); this.l1.set(key, cached);
      return { ...cached.result, cacheState: "L1" };
    }
    if (cached) this.l1.delete(key);

    if (read.healthy && read.l2) {
      try {
        const parsed = JSON.parse(read.l2) as { generation?: string; payload?: RuntimeBootstrapPayload };
        if (parsed.generation === read.generation && parsed.payload) {
          const result: RuntimeBootstrapResult = { payload: parsed.payload, generation: read.generation, cacheState: "L2" };
          this.setL1(key, result);
          return result;
        }
      } catch { /* corrupted cache falls through to L3 */ }
    }

    const active = this.inFlight.get(key);
    if (active) return active;
    const promise = this.load(identity, read, 0);
    this.inFlight.set(key, promise);
    try { return await promise; }
    finally { if (this.inFlight.get(key) === promise) this.inFlight.delete(key); }
  }

  get size(): number { return this.l1.size; }

  private async load(identity: ExecutionDescriptorIdentity, captured: CacheRead, retry: number): Promise<RuntimeBootstrapResult> {
    const source = await this.options.load(identity);
    if (!source) throw new Error(`Runtime bootstrap '${identity.entityCode}' was not found.`);
    const payload = { ...source, bootstrapHash: hashBootstrap(source) } satisfies RuntimeBootstrapPayload;
    const degraded: RuntimeBootstrapResult = {
      payload, generation: captured.generation,
      cacheState: captured.healthy ? "L3" : "L3_REDIS_DEGRADED",
    };
    if (!captured.healthy || !this.options.redis) return degraded;

    const current = await this.read(identity, false);
    if (!current.healthy) return { ...degraded, cacheState: "L3_REDIS_DEGRADED" };
    if (current.generation !== captured.generation) {
      if (retry < 2) return this.load(identity, current, retry + 1);
      return { ...degraded, generation: current.generation, cacheState: "L3_REDIS_DEGRADED" };
    }
    // Redis is an acceleration layer: a write outage must never turn an
    // otherwise valid PostgreSQL bootstrap into a 5xx.  Treat cache-fill
    // failures exactly like a degraded read and return the authoritative L3
    // payload while allowing the next request to retry the fill.
    try {
      await this.options.redis.set(runtimeBootstrapCacheKey(identity), JSON.stringify({
        generation: captured.generation,
        payload,
      }), this.options.l2TtlSeconds ?? DEFAULT_L2_TTL_SECONDS);
    } catch {
      return { ...degraded, cacheState: "L3_REDIS_DEGRADED" };
    }
    const afterFill = await this.read(identity, false);
    if (afterFill.healthy && afterFill.generation === captured.generation) {
      this.setL1(`${scopeKey(identity)}\0${captured.generation}`, degraded);
    }
    return degraded;
  }

  /** One MGET is the only Redis round trip on a warm request. */
  private async read(identity: ExecutionDescriptorIdentity, includePayload = true): Promise<CacheRead> {
    if (!this.options.redis) return { generation: "local", l2: null, healthy: false };
    const generationKeys = executionDescriptorGenerationKeys(identity);
    const keys = includePayload ? [...generationKeys, runtimeBootstrapCacheKey(identity)] : [...generationKeys];
    try {
      const values = await this.options.redis.mget(...keys);
      return {
        generation: values.slice(0, generationKeys.length).map(normalizeGeneration).join("."),
        l2: includePayload ? values[generationKeys.length] ?? null : null,
        healthy: true,
      };
    } catch {
      return { generation: "local", l2: null, healthy: false };
    }
  }

  private setL1(key: string, result: RuntimeBootstrapResult): void {
    this.l1.delete(key);
    this.l1.set(key, { result, expiresAt: this.now() + (this.options.l1TtlMs ?? DEFAULT_L1_TTL_MS) });
    while (this.l1.size > (this.options.l1Limit ?? DEFAULT_L1_LIMIT)) {
      const oldest = this.l1.keys().next().value as string | undefined;
      if (!oldest) break;
      this.l1.delete(oldest);
    }
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
}

export interface RuntimeBootstrapRoutesDeps {
  db: AnyDb;
  meshDb?: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  provider: RuntimeBootstrapProvider;
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

export function createRuntimeBootstrapRoute(router: Router, deps: RuntimeBootstrapRoutesDeps): Router {
  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(deps.db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }
      const plane = resolvePlane(req.headers["x-plane-key"] ?? req.headers["x-plane"]);
      if (plane === "mesh" && !await hasActiveMeshBinding(res, deps.meshDb ?? deps.db)) {
        res.status(404).json({ error: "NOT_FOUND", message: "The requested resource was not found." });
        return;
      }
      const result = await deps.provider.get({ plane, tenantId, entityCode });
      const permissions = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
        | { allowed: ReadonlySet<string>; denied: ReadonlySet<string> }
        | undefined;
      const payload = projectRuntimeBootstrapPermissions(result.payload, permissions, plane);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", `"metaboot-${result.payload.bootstrapHash}"`);
      res.setHeader("X-Bootstrap-Cache", result.cacheState);
      res.setHeader("X-Bootstrap-Hash", result.payload.bootstrapHash);
      res.setHeader("X-Descriptor-Generation", result.generation);
      res.json(payload);
    } catch (error) {
      if (String(error).includes("Runtime bootstrap") && String(error).includes("was not found")) {
        res.status(404).json({ error: "NOT_FOUND", message: "The requested resource was not found." });
        return;
      }
      deps.logger?.error("runtime_bootstrap_route_error", { err: String(error) });
      next(error);
    }
  };
  router.get("/metadata/entities/:entity/runtime-bootstrap", handler);
  return router;
}

export function createRuntimeBootstrapLoader(input: {
  db: AnyDb;
  loadCompiledEntity: (
    entityCode: string,
    tenantId: string,
    plane: ExecutionDescriptorIdentity["plane"],
  ) => Promise<JsonObject | null>;
}): RuntimeBootstrapProviderOptions["load"] {
  return async ({ entityCode, tenantId, plane }) => {
    const compiledEntity = await input.loadCompiledEntity(entityCode, tenantId, plane);
    if (!compiledEntity) return null;
    const v21Result = MetaEntityContractV21Schema.safeParse(compiledEntity["contract_v21"]);
    if (!v21Result.success) return null;
    const v21 = v21Result.data;
    const relations = v21.relations as unknown as JsonObject[];
    const relationTargets = new Map<string, string>();
    for (const relation of relations) {
      const target = stringValue(relation["target_entity_code"] ?? relation["target_entity"] ?? relation["targetEntity"]);
      const name = stringValue(relation["relation_code"] ?? relation["name"]);
      if (target && name && !relationTargets.has(target)) relationTargets.set(target, name);
    }
    const [operations, permissionAliases, children] = await Promise.all([
      projectContractOperationsV21(v21, plane),
      loadPermissionAliases(input.db),
      Promise.all([...relationTargets].map(async ([childCode, relationName]): Promise<RuntimeBootstrapChild | null> => {
        const child = await input.loadCompiledEntity(childCode, tenantId, plane);
        if (!child) return null;
        const childV21Result = MetaEntityContractV21Schema.safeParse(child["contract_v21"]);
        if (!childV21Result.success) return null;
        const childV21 = childV21Result.data;
        return {
          relationName,
          entityCode: childCode,
          descriptorHash: stringValue(child["compiled_hash"] ?? child["version_hash"]) ?? hashBootstrap(child),
          compiledEntity: child,
          operations: projectContractOperationsV21(childV21, plane),
          policy: projectContractPolicyV21(childV21),
          lifecycleStateMasks: projectLifecycleMasksV21(childV21, plane),
        };
      })),
    ]);
    return {
      schemaVersion: 1,
      entityCode,
      compiledEntity,
      operations,
      policy: projectContractPolicyV21(v21),
      lifecycleStateMasks: projectLifecycleMasksV21(v21, plane),
      permissionAliases,
      childProjections: children.filter((child): child is RuntimeBootstrapChild => child !== null),
    };
  };
}

function projectContractOperationsV21(
  contract: MetaEntityContractV21,
  plane: ExecutionDescriptorIdentity["plane"],
): JsonObject[] {
  return contract.operations
    .filter((operation) => operation.enabled
      && operation.surface !== "HIDDEN"
      && (operation.plane_filter === null || operation.plane_filter.includes(plane)))
    .sort((left, right) => left.order - right.order)
    .map((operation) => ({
      id: operation.id,
      entity_name: contract.catalog.entity_code,
      permission_code: operation.permission_code,
      operation_code: operation.operation_code,
      surface: operation.surface,
      placement: operation.placement,
      handler_type: operation.handler.kind.toUpperCase(),
      handler_target: operation.handler.target,
      execution_target: operation.execution?.target ?? null,
      is_record_required: operation.record_required,
      sort_order: operation.order,
      label_override: operation.label,
      icon_override: operation.icon,
      is_enabled: operation.enabled,
      selection_config: projectOperationSelection(operation.selection),
      intent: operation.intent,
      requires_confirmation: operation.confirmation.required,
      requires_reason: operation.reason_required,
      action_rules: operation.action_rules,
      source: "entity_operation",
    }));
}

function projectOperationSelection(value: unknown): JsonObject | null {
  const parsed = OperationSelectionConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function projectContractPolicyV21(contract: MetaEntityContractV21): JsonObject {
  const baseline = contract.policy.platform_baseline;
  const overlay = contract.policy.tenant_overlay?.values;
  return {
    access_mode: overlay?.access_mode ?? baseline.access_mode,
    company_scope_mode: overlay?.company_scope_mode ?? baseline.company_scope_mode,
    audit_mode: overlay?.audit_mode ?? baseline.audit_mode,
    retention_policy: { ...baseline.retention, ...(overlay?.retention ?? {}) },
    default_filters: { ...baseline.filters, ...(overlay?.filters ?? {}) },
    cache_flags: { ...baseline.cache_flags, ...(overlay?.cache_flags ?? {}) },
    cache_policy: { ...baseline.cache_policy, ...(overlay?.cache_policy ?? {}) },
    field_security: contract.policy.field_security,
    merge_order: contract.policy.merge_order,
  };
}

function projectLifecycleMasksV21(
  contract: MetaEntityContractV21,
  plane: ExecutionDescriptorIdentity["plane"],
): JsonObject[] {
  return contract.lifecycle?.states.map((state) => {
    const mask = state.masks.find((candidate) => candidate.planes.includes(plane));
    return {
      recordStatus: state.code,
      canEdit: mask?.edit ?? state.capabilities.edit,
      canDelete: mask?.delete ?? state.capabilities.delete,
      canTransitionTo: mask?.transition_to ?? state.capabilities.transition_to,
      disabledReason: mask?.disabled_reason ?? null,
      presentation: {
        label: state.label,
        badgeVariant: state.presentation.badge,
        color: state.presentation.color,
        icon: state.presentation.icon,
      },
    };
  }) ?? [];
}

export function projectRuntimeBootstrapPermissions(
  payload: RuntimeBootstrapPayload,
  permissions: { allowed: ReadonlySet<string>; denied: ReadonlySet<string> } | undefined,
  plane?: ExecutionDescriptorIdentity["plane"],
): RuntimeBootstrapPayload {
  const filter = (operations: JsonObject[]) => operations.filter((operation) => {
    const code = stringValue(operation["permission_code"] ?? operation["permissionCode"]);
    if (!code || !permissions) return false;
    if (plane === "mesh" && !isMeshBootstrapOperationAllowed(operation)) return false;
    const canonical = payload.permissionAliases[code] ?? code;
    return !permissions.denied.has(code) && !permissions.denied.has(canonical)
      && (permissions.allowed.has(code) || permissions.allowed.has(canonical));
  }).map((operation) => ({ ...operation, permission_decision: "allow" }));
  const effective = plane === "mesh"
    ? projectMeshEffectiveSurfaceFields(payload, permissions)
    : undefined;
  return {
    ...payload,
    operations: filter(payload.operations),
    childProjections: payload.childProjections.map((child) => ({ ...child, operations: filter(child.operations) })),
    ...(effective ?? {}),
  };
}

function projectMeshEffectiveSurfaceFields(
  payload: RuntimeBootstrapPayload,
  permissions: { allowed: ReadonlySet<string>; denied: ReadonlySet<string> } | undefined,
): { effectiveSurfaceIds: string[]; effectiveFieldIds: string[] } {
  const contract = MetaEntityContractV21Schema.safeParse(payload.compiledEntity["contract_v21"]);
  if (!permissions || !contract.success) return { effectiveSurfaceIds: [], effectiveFieldIds: [] };
  const hasPermission = (code: string): boolean => {
    const canonical = payload.permissionAliases[code] ?? code;
    return !permissions.denied.has(code)
      && !permissions.denied.has(canonical)
      && (permissions.allowed.has(code) || permissions.allowed.has(canonical));
  };
  const surfaces = contract.data.surfaces.filter((surface) =>
    surface.enabled
    && surface.kind !== "CUSTOM"
    && surface.security.required_permissions.every(hasPermission));
  return {
    effectiveSurfaceIds: surfaces.map((surface) => surface.id),
    effectiveFieldIds: [...new Set(surfaces.flatMap((surface) =>
      surface.bindings.filter((binding) => binding.visible).map((binding) => binding.field_id)))],
  };
}

async function hasActiveMeshBinding(res: Parameters<RequestHandler>[1], meshDb: AnyDb): Promise<boolean> {
  const context = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
    | {
        planeKey?: string;
        principalId?: string;
        accountGrantId?: string;
        networkAccountId?: string;
      }
    | undefined;
  if (context?.planeKey !== "mesh"
      || !context.principalId
      || !context.accountGrantId
      || !context.networkAccountId) return false;
  const result = await sql<{ present: boolean }>`
    SELECT true AS present
      FROM mesh.account_grant
     WHERE id=${context.accountGrantId}::uuid
       AND principal_id=${context.principalId}::uuid
       AND account_id=${context.networkAccountId}::uuid
       AND status='active'
     LIMIT 1
  `.execute(meshDb);
  return result.rows[0]?.present === true;
}

function isMeshBootstrapOperationAllowed(operation: JsonObject): boolean {
  if (operation["is_enabled"] !== true) return false;
  const type = stringValue(operation["handler_type"])?.toLowerCase();
  const target = stringValue(operation["handler_target"]);
  if (!type || !target) return false;
  if (type === "navigate") return target.startsWith("/app/");
  if (type === "api") return target.startsWith("/api/mesh/") || target.startsWith("mesh:");
  return type === "modal" || type === "inline";
}

async function loadPermissionAliases(db: AnyDb): Promise<Record<string, string>> {
  const result = await sql<{ alias_code: string; canonical_code: string }>`
    SELECT alias_code, canonical_code FROM control.permission_alias
     WHERE hard_fail_after IS NULL OR hard_fail_after > now()
     ORDER BY alias_code
  `.execute(db);
  return Object.fromEntries(result.rows.map((row) => [row.alias_code, row.canonical_code]));
}

function runtimeBootstrapCacheKey(identity: ExecutionDescriptorIdentity): string {
  return `metaboot:v1:${identity.plane}:${identity.tenantId}:${identity.entityCode}`;
}
function scopeKey(identity: ExecutionDescriptorIdentity): string {
  return `${identity.plane}\0${identity.tenantId}\0${identity.entityCode}`;
}
function normalizeGeneration(value: string | null): string {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? String(parsed) : "0";
}
function resolvePlane(value: unknown): "neon" | "mesh" | "admin" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "mesh" || raw === "admin" ? raw : "neon";
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function hashBootstrap(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as JsonObject;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined
      && !["compiled_at", "compiledAt", "cacheState"].includes(key))
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
