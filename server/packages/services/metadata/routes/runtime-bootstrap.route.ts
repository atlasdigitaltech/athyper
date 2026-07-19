import { createHash } from "node:crypto";

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { extractOrgHeaders, resolveTenantId, verifyBearer } from "@athyper/svc-shared";
import { MetaEntityContractV2Schema } from "@athyper/api-contracts/meta-entity-contract-v2";

import { executionDescriptorGenerationKeys, type ExecutionDescriptorIdentity } from "../src/execution-descriptor/index.js";
import { loadPublicEntityOperations } from "./entity-operations.route.js";

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
      const result = await deps.provider.get({ plane, tenantId, entityCode });
      const permissions = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
        | { allowed: ReadonlySet<string>; denied: ReadonlySet<string> }
        | undefined;
      const payload = projectRuntimeBootstrapPermissions(result.payload, permissions);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", `"metaboot-${result.payload.bootstrapHash}"`);
      res.setHeader("X-Bootstrap-Cache", result.cacheState);
      res.setHeader("X-Bootstrap-Hash", result.payload.bootstrapHash);
      res.setHeader("X-Descriptor-Generation", result.generation);
      res.json(payload);
    } catch (error) {
      deps.logger?.error("runtime_bootstrap_route_error", { err: String(error) });
      next(error);
    }
  };
  router.get("/metadata/entities/:entity/runtime-bootstrap", handler);
  return router;
}

export function createRuntimeBootstrapLoader(input: {
  db: AnyDb;
  loadCompiledEntity: (entityCode: string, tenantId: string) => Promise<JsonObject | null>;
}): RuntimeBootstrapProviderOptions["load"] {
  return async ({ entityCode, tenantId }) => {
    const compiledEntity = await input.loadCompiledEntity(entityCode, tenantId);
    if (!compiledEntity) return null;
    const parsedContract = MetaEntityContractV2Schema.safeParse(compiledEntity["contract_v2"]);
    const contract = parsedContract.success ? parsedContract.data : null;
    // v2 is authoritative. The legacy relation array is retained only for
    // snapshots created before the Phase B compiler cutover.
    const relations = contract
      ? contract.relations as unknown as JsonObject[]
      : Array.isArray(compiledEntity["relations"])
        ? compiledEntity["relations"] as JsonObject[] : [];
    const relationTargets = new Map<string, string>();
    for (const relation of relations) {
      const target = stringValue(relation["target_entity_code"] ?? relation["target_entity"] ?? relation["targetEntity"]);
      const name = stringValue(relation["relation_code"] ?? relation["name"]);
      if (target && name && !relationTargets.has(target)) relationTargets.set(target, name);
    }
    const [operations, policy, lifecycleStateMasks, permissionAliases, children] = await Promise.all([
      contract ? projectContractOperations(contract) : loadPublicEntityOperations(input.db, entityCode, tenantId),
      loadPolicy(input.db, entityCode, tenantId),
      loadLifecycleMasks(input.db, entityCode, tenantId),
      loadPermissionAliases(input.db),
      Promise.all([...relationTargets].map(async ([childCode, relationName]) => {
        const child = await input.loadCompiledEntity(childCode, tenantId);
        if (!child) return null;
        const childContractResult = MetaEntityContractV2Schema.safeParse(child["contract_v2"]);
        const childContract = childContractResult.success ? childContractResult.data : null;
        const [childOperations, childPolicy, childMasks] = await Promise.all([
          childContract ? projectContractOperations(childContract) : loadPublicEntityOperations(input.db, childCode, tenantId),
          loadPolicy(input.db, childCode, tenantId),
          loadLifecycleMasks(input.db, childCode, tenantId),
        ]);
        return {
          relationName,
          entityCode: childCode,
          descriptorHash: stringValue(child["compiled_hash"] ?? child["version_hash"]) ?? hashBootstrap(child),
          compiledEntity: child,
          operations: childOperations,
          policy: childPolicy,
          lifecycleStateMasks: childMasks,
        } satisfies RuntimeBootstrapChild;
      })),
    ]);
    return {
      schemaVersion: 1,
      entityCode,
      compiledEntity,
      operations,
      policy,
      lifecycleStateMasks,
      permissionAliases,
      childProjections: children.filter((child): child is RuntimeBootstrapChild => child !== null),
    };
  };
}

/** Principal-agnostic operation projection sourced from contract_v2. */
async function projectContractOperations(
  contract: import("@athyper/api-contracts/meta-entity-contract-v2").MetaEntityContractV2,
): Promise<JsonObject[]> {
  return contract.operations
    .filter((operation) => operation.enabled && operation.surface !== "hidden")
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((operation) => ({
      id: operation.id,
      entity_name: contract.catalog.entity_code,
      permission_code: operation.permission_code,
      operation_code: operation.operation_code,
      surface: operation.surface,
      placement: operation.placement,
      handler_type: operation.handler_type,
      handler_target: operation.handler_target ?? null,
      execution_target: operation.execution_target ?? null,
      is_record_required: operation.record_required,
      sort_order: operation.sort_order,
      label_override: operation.label,
      icon_override: operation.icon ?? null,
      is_enabled: operation.enabled,
      selection_config: operation.selection_config ?? null,
      intent: operation.intent,
      requires_confirmation: operation.confirmation.required,
      requires_reason: operation.reason_required,
      source: "entity_operation",
    }));
}

export function projectRuntimeBootstrapPermissions(
  payload: RuntimeBootstrapPayload,
  permissions: { allowed: ReadonlySet<string>; denied: ReadonlySet<string> } | undefined,
): RuntimeBootstrapPayload {
  const filter = (operations: JsonObject[]) => operations.filter((operation) => {
    const code = stringValue(operation["permission_code"] ?? operation["permissionCode"]);
    if (!code || !permissions) return false;
    const canonical = payload.permissionAliases[code] ?? code;
    return !permissions.denied.has(code) && !permissions.denied.has(canonical)
      && (permissions.allowed.has(code) || permissions.allowed.has(canonical));
  }).map((operation) => ({ ...operation, permission_decision: "allow" }));
  return {
    ...payload,
    operations: filter(payload.operations),
    childProjections: payload.childProjections.map((child) => ({ ...child, operations: filter(child.operations) })),
  };
}

async function loadPolicy(db: AnyDb, entityCode: string, tenantId: string): Promise<JsonObject | null> {
  const result = await sql<JsonObject>`
    SELECT ep.access_mode, ep.company_scope_mode, ep.audit_mode,
           ep.field_scope_eval_order, ep.default_filters, ep.cache_flags, ep.extended_scope
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
      JOIN control.entity_policy ep ON ep.entity_id = e.id
       AND ep.tenant_id = ${tenantId}::uuid
       AND (ep.entity_version_id = ev.id OR ep.entity_version_id IS NULL)
     WHERE e.tenant_id IS NULL
       AND (e.entity_code = ${entityCode} OR e.name = ${entityCode} OR e.slug = ${entityCode.replace(/_/g, "-")})
     ORDER BY (ep.entity_version_id = ev.id) DESC
     LIMIT 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function loadLifecycleMasks(db: AnyDb, entityCode: string, tenantId: string): Promise<JsonObject[]> {
  const result = await sql<{
    record_status: string; can_edit: boolean; can_delete: boolean;
    can_transition_to: string[] | null; disabled_reason: string | null;
    state_name: string | null; badge_variant: string | null;
    ui_color: string | null; icon_key: string | null;
  }>`
    WITH preferred AS (
      SELECT DISTINCT ON (record_status)
             record_status, can_edit, can_delete, can_transition_to, disabled_reason
        FROM control.entity_lifecycle_state_mask
       WHERE entity_name = ${entityCode}
         AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
       ORDER BY record_status, tenant_id NULLS LAST
    ), chosen_lifecycle AS (
      SELECT DISTINCT ON (entity_name) entity_name, lifecycle_id
        FROM control.entity_lifecycle
       WHERE entity_name = ${entityCode}
         AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
       ORDER BY entity_name, tenant_id NULLS LAST, priority ASC
    )
    SELECT ls.code AS record_status,
           COALESCE(p.can_edit, false) AS can_edit,
           COALESCE(p.can_delete, false) AS can_delete,
           p.can_transition_to,
           COALESCE(p.disabled_reason, 'lifecycle_locked') AS disabled_reason,
           ls.name AS state_name, ls.config->>'badge_variant' AS badge_variant,
           ls.config->>'ui_color' AS ui_color, ls.config->>'icon_key' AS icon_key
      FROM chosen_lifecycle cl
      JOIN control.lifecycle_state ls ON ls.lifecycle_id = cl.lifecycle_id
      LEFT JOIN preferred p ON p.record_status = ls.code
     ORDER BY ls.sort_order, ls.code
  `.execute(db);
  return result.rows.map((row) => ({
    recordStatus: row.record_status,
    canEdit: row.can_edit,
    canDelete: row.can_delete,
    ...(row.can_transition_to ? { canTransitionTo: row.can_transition_to } : {}),
    disabledReason: row.disabled_reason,
    ...([row.state_name, row.badge_variant, row.ui_color, row.icon_key].some((value) => value !== null)
      ? { presentation: {
        label: row.state_name,
        badgeVariant: row.badge_variant,
        color: row.ui_color,
        icon: row.icon_key,
      } }
      : {}),
  }));
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
