import { sql, type Kysely } from "kysely";

import type { CacheClient } from "../session/session.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

export const PARAMETER_SNAPSHOT_CACHE_TTL_SECONDS = 300;

export interface ParameterRecord {
  code: string;
  namespace: string;
  displayName: string;
  description: string | null;
  ownerModel: "product" | "tenant";
  controlLevel: "system_controlled" | "tenant_configurable" | "tenant_owned";
  tenantVisibility: "hidden" | "readonly" | "configurable";
  dataType: "boolean" | "integer" | "number" | "string" | "enum" | "duration" | "json";
  unit: string | null;
  defaultValue: unknown;
  productValue: unknown;
  tenantValue: unknown;
  overrideEnabled: boolean;
  effectiveValue: unknown;
  minValue: unknown;
  maxValue: unknown;
  allowedValues: unknown[];
  runtimeReload: "immediate" | "next_request" | "next_login" | "restart" | "external_provider";
  cacheTtlSeconds: number;
  isSecuritySensitive: boolean;
  isRuntimeReloadable: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
}

export interface ParameterSnapshot {
  tenantId: string;
  namespace: string | null;
  values: Record<string, unknown>;
  parameters: ParameterRecord[];
  resolvedAt: string;
}

interface DbParameterRow {
  code: string;
  namespace: string;
  display_name: string;
  description: string | null;
  owner_model: "product" | "tenant";
  control_level: "system_controlled" | "tenant_configurable" | "tenant_owned";
  tenant_visibility: "hidden" | "readonly" | "configurable";
  data_type: "boolean" | "integer" | "number" | "string" | "enum" | "duration" | "json";
  unit: string | null;
  default_value: unknown;
  product_value: unknown;
  tenant_value: unknown;
  override_enabled: boolean | null;
  min_value: unknown;
  max_value: unknown;
  allowed_values: unknown;
  runtime_reload: "immediate" | "next_request" | "next_login" | "restart" | "external_provider";
  cache_ttl_seconds: number;
  is_security_sensitive: boolean;
  is_runtime_reloadable: boolean;
  sort_order: number;
  metadata: unknown;
}

function snapshotKey(tenantId: string, namespace?: string | null): string {
  return `parameter_snapshot:${tenantId}:${namespace || "all"}`;
}

export async function resolveParameterSnapshot(
  db: Kysely<AnyDb>,
  cache: CacheClient,
  tenantId: string,
  namespace?: string | null,
): Promise<ParameterSnapshot> {
  const key = snapshotKey(tenantId, namespace);
  const cached = await cache.get(key).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as ParameterSnapshot;
    } catch {
      await cache.del(key).catch(() => undefined);
    }
  }

  const allRecords = await loadParameterRecords(db, tenantId);
  const parameters = namespace
    ? allRecords.filter((record) => record.namespace === namespace || record.namespace.startsWith(`${namespace}.`))
    : allRecords;
  const snapshot: ParameterSnapshot = {
    tenantId,
    namespace: namespace ?? null,
    values: Object.fromEntries(parameters.map((record) => [record.code, record.effectiveValue])),
    parameters,
    resolvedAt: new Date().toISOString(),
  };

  await cache.set(key, JSON.stringify(snapshot), "EX", PARAMETER_SNAPSHOT_CACHE_TTL_SECONDS).catch(() => undefined);
  return snapshot;
}

export async function invalidateParameterSnapshot(
  cache: CacheClient,
  tenantId: string,
  namespace?: string | null,
): Promise<void> {
  const keys = [snapshotKey(tenantId, null)];
  if (namespace) {
    keys.push(snapshotKey(tenantId, namespace));
    const root = namespace.split(".")[0];
    if (root && root !== namespace) keys.push(snapshotKey(tenantId, root));
  }
  await cache.del([...new Set(keys)]).catch(() => undefined);
}

export async function loadParameterRecords(
  db: Kysely<AnyDb>,
  tenantId: string,
): Promise<ParameterRecord[]> {
  const result = await sql<DbParameterRow>`
    WITH product_params AS (
      SELECT
        d.code,
        d.namespace,
        d.display_name,
        d.description,
        d.owner_model,
        d.control_level,
        d.tenant_visibility,
        d.data_type,
        d.unit,
        d.default_value,
        d.product_value,
        tv.value AS tenant_value,
        tv.override_enabled,
        d.min_value,
        d.max_value,
        d.allowed_values,
        d.runtime_reload,
        d.cache_ttl_seconds,
        d.is_security_sensitive,
        d.is_runtime_reloadable,
        d.sort_order,
        d.metadata
      FROM control.parameter_definition d
      LEFT JOIN master.tenant_parameter_value tv
        ON tv.tenant_id = ${tenantId}::uuid
       AND tv.parameter_code = d.code
       AND tv.status = 'active'
       AND now() >= tv.effective_from
       AND (tv.effective_to IS NULL OR now() < tv.effective_to)
      WHERE d.status = 'active'
        AND d.is_enabled = true
        AND d.tenant_visibility <> 'hidden'
    ),
    tenant_params AS (
      SELECT
        d.code,
        d.namespace,
        d.display_name,
        d.description,
        'tenant'::text AS owner_model,
        'tenant_owned'::text AS control_level,
        'configurable'::text AS tenant_visibility,
        d.data_type,
        d.unit,
        d.default_value,
        NULL::jsonb AS product_value,
        tv.value AS tenant_value,
        COALESCE(tv.override_enabled, false) AS override_enabled,
        d.min_value,
        d.max_value,
        d.allowed_values,
        d.runtime_reload,
        d.cache_ttl_seconds,
        d.is_security_sensitive,
        d.is_runtime_reloadable,
        d.sort_order,
        d.metadata
      FROM master.tenant_parameter_definition d
      LEFT JOIN master.tenant_parameter_value tv
        ON tv.tenant_id = d.tenant_id
       AND tv.parameter_code = d.code
       AND tv.status = 'active'
       AND now() >= tv.effective_from
       AND (tv.effective_to IS NULL OR now() < tv.effective_to)
      WHERE d.tenant_id = ${tenantId}::uuid
        AND d.status = 'active'
        AND d.is_enabled = true
    )
    SELECT * FROM product_params
    UNION ALL
    SELECT * FROM tenant_params
    ORDER BY namespace, sort_order, code
  `.execute(db);

  return result.rows.map(normalizeRow);
}

function normalizeRow(row: DbParameterRow): ParameterRecord {
  const defaultValue = normalizeJson(row.default_value);
  const productValue = row.product_value === null || row.product_value === undefined
    ? defaultValue
    : normalizeJson(row.product_value);
  const tenantValue = row.tenant_value === null || row.tenant_value === undefined
    ? null
    : normalizeJson(row.tenant_value);
  const overrideEnabled = row.override_enabled === true;
  const effectiveValue = overrideEnabled ? tenantValue : productValue;
  const allowed = normalizeJson(row.allowed_values);

  return {
    code: row.code,
    namespace: row.namespace,
    displayName: row.display_name,
    description: row.description,
    ownerModel: row.owner_model,
    controlLevel: row.control_level,
    tenantVisibility: row.tenant_visibility,
    dataType: row.data_type,
    unit: row.unit,
    defaultValue,
    productValue,
    tenantValue,
    overrideEnabled,
    effectiveValue,
    minValue: normalizeJson(row.min_value),
    maxValue: normalizeJson(row.max_value),
    allowedValues: Array.isArray(allowed) ? allowed : [],
    runtimeReload: row.runtime_reload,
    cacheTtlSeconds: Number(row.cache_ttl_seconds ?? PARAMETER_SNAPSHOT_CACHE_TTL_SECONDS),
    isSecuritySensitive: row.is_security_sensitive === true,
    isRuntimeReloadable: row.is_runtime_reloadable === true,
    sortOrder: Number(row.sort_order ?? 0),
    metadata: isRecord(row.metadata) ? row.metadata : {},
  };
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!["{", "[", "\""].includes(trimmed[0]!) && !/^(true|false|null|-?\d)/.test(trimmed)) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
