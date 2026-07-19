import { createHash } from "node:crypto";

import {
  EntityListCachePolicyOverrideSchema,
  resolveEntityListCachePolicy,
  type EntityListCachePolicyOverride,
} from "@athyper/api-contracts/entity-cache-policy";

import type { CompiledEntity, CompiledField } from "./entity-compiler.service.js";
import type { EffectiveTenantExecutionOverlay } from "./execution-descriptor/compiler.js";

export interface TenantOverlayQuery {
  query<T extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface TenantOverlayResolution {
  readonly tenantId: string;
  readonly entityId: string;
  readonly entityVersionId: string;
  readonly baseCompiledHash: string;
  readonly overlaySet: readonly string[];
  readonly overlayHash: string;
  readonly executionOverlay: EffectiveTenantExecutionOverlay;
  readonly catalogFieldOverrides: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly cachePolicyOverride?: EntityListCachePolicyOverride;
}

export class TenantOverlayValidationError extends Error {
  constructor(
    readonly entityCode: string,
    readonly diagnostics: readonly TenantOverlayDiagnostic[],
  ) {
    super(diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("; "));
    this.name = "TenantOverlayValidationError";
  }
}

export interface TenantOverlayDiagnostic {
  readonly overlayId: string;
  readonly path: string;
  readonly message: string;
}

interface OverlayRow {
  id: string;
  priority: number | string;
  version: number | string;
}

interface OverlayChangeRow {
  overlay_id: string;
  change_order: number | string;
  kind: string;
  path: string;
  value: unknown;
}

const EXECUTION_FIELD_KEYS = new Set([
  "searchable", "filterable", "sortable", "createWritable", "updateWritable", "defaultValue",
]);
const CATALOG_FIELD_KEYS = new Set([
  "label", "description", "uiType", "format", "isVisible", "isReadOnly", "sortOrder",
]);
const POLICY_KEYS = new Set(["accessMode", "companyScopeMode", "auditMode", "dataPolicy", "cachePolicy"]);
const PROHIBITED_POLICY_KEYS = new Set([
  "principalId", "principal_id", "personaId", "persona_id", "accountGrantId", "account_grant_id",
  "permissionDecision", "permission_decision", "allowedPermissions", "deniedPermissions",
]);

/**
 * Resolves the effective tenant overlay for one immutable base version.
 *
 * Overlay changes are presentation/policy deltas only. Physical storage,
 * identity, fields, relations, operations, handlers, and capabilities remain
 * owned by the platform/base contract and cannot be changed by a tenant.
 */
export async function resolveTenantOverlay(
  query: TenantOverlayQuery,
  input: {
    tenantId: string;
    entityId: string;
    entityCode: string;
    entityVersionId: string;
    baseCompiledHash: string;
    fields: readonly CompiledField[];
  },
): Promise<TenantOverlayResolution | null> {
  const overlays = await query.query<OverlayRow>(`
    SELECT ov.id::text, ov.priority, ov.version
      FROM control.overlay ov
     WHERE ov.tenant_id = $1::uuid
       AND ov.base_entity_id = $2::uuid
       AND ov.is_active = true
       AND (ov.base_version_id IS NULL OR ov.base_version_id = $3::uuid)
     ORDER BY ov.priority ASC, ov.version ASC, ov.id ASC
  `, [input.tenantId, input.entityId, input.entityVersionId]);
  if (overlays.rows.length === 0) return null;

  const overlayIds = overlays.rows.map((row) => row.id);
  const changes = await query.query<OverlayChangeRow>(`
    SELECT oc.overlay_id::text, oc.change_order, oc.kind, oc.path, oc.value
      FROM control.overlay_change oc
     WHERE oc.tenant_id = $1::uuid
       AND oc.overlay_id = ANY($2::uuid[])
     ORDER BY oc.overlay_id, oc.change_order ASC
  `, [input.tenantId, overlayIds]);

  const changesByOverlay = new Map<string, OverlayChangeRow[]>();
  for (const change of changes.rows) {
    const list = changesByOverlay.get(change.overlay_id) ?? [];
    list.push(change);
    changesByOverlay.set(change.overlay_id, list);
  }

  const fieldNames = new Set(input.fields.map((field) => field.name));
  const fieldOverrides: Record<string, Record<string, unknown>> = {};
  const catalogFieldOverrides: Record<string, Record<string, unknown>> = {};
  const policy: Record<string, unknown> = {};
  let cachePolicyOverride: EntityListCachePolicyOverride | undefined;
  let defaultSort: EffectiveTenantExecutionOverlay["defaultSort"];
  const diagnostics: TenantOverlayDiagnostic[] = [];

  for (const overlay of overlays.rows) {
    for (const change of changesByOverlay.get(overlay.id) ?? []) {
      const kind = normalizeKind(change.kind);
      const value = asRecord(change.value);
      if (!value) {
        diagnostics.push({ overlayId: overlay.id, path: change.path, message: "Overlay change value must be a JSON object." });
        continue;
      }

      if (kind === "modify_field" && change.path === "display.default_sort") {
        const sort = parseDefaultSort(value, fieldNames);
        if (!sort) diagnostics.push({ overlayId: overlay.id, path: change.path, message: "Invalid default sort overlay." });
        else defaultSort = [sort];
        continue;
      }

      const fieldTarget = parseFieldPath(change.path);
      if (kind === "modify_field" || kind === "override_ui") {
        if (!fieldTarget || !fieldNames.has(fieldTarget.name)) {
          diagnostics.push({ overlayId: overlay.id, path: change.path, message: "Tenant overlays may only modify an existing field." });
          continue;
        }
        const allowed = kind === "modify_field" ? new Set([...EXECUTION_FIELD_KEYS, ...CATALOG_FIELD_KEYS]) : CATALOG_FIELD_KEYS;
        const invalidKeys = Object.keys(value).filter((key) => !allowed.has(key));
        const invalidValues = Object.entries(value)
          .filter(([key, child]) => allowed.has(key) && !validFieldOverrideValue(key, child))
          .map(([key]) => key);
        if (invalidKeys.length > 0 || invalidValues.length > 0) {
          diagnostics.push({ overlayId: overlay.id, path: change.path, message: invalidKeys.length > 0
            ? `Unsupported tenant field override(s): ${invalidKeys.join(", ")}.`
            : `Invalid value type for tenant field override(s): ${invalidValues.join(", ")}.` });
          continue;
        }
        for (const [key, child] of Object.entries(value)) {
          if (EXECUTION_FIELD_KEYS.has(key)) (fieldOverrides[fieldTarget.name] ??= {})[key] = child;
          if (CATALOG_FIELD_KEYS.has(key)) (catalogFieldOverrides[fieldTarget.name] ??= {})[key] = child;
        }
        continue;
      }

      if (kind === "tweak_policy") {
        if (change.path !== "policy") {
          diagnostics.push({ overlayId: overlay.id, path: change.path, message: "Policy overlays must target the policy path." });
          continue;
        }
        const invalidKeys = Object.keys(value).filter((key) => !POLICY_KEYS.has(key));
        const prohibited = findProhibitedKey(value);
        const invalidValues = Object.entries(value)
          .filter(([key, child]) => POLICY_KEYS.has(key) && !validPolicyOverrideValue(key, child))
          .map(([key]) => key);
        if (invalidKeys.length > 0 || prohibited || invalidValues.length > 0) {
          diagnostics.push({ overlayId: overlay.id, path: change.path, message: prohibited
            ? `Policy overlay contains prohibited principal-specific key '${prohibited}'.`
            : invalidKeys.length > 0
              ? `Unsupported policy override(s): ${invalidKeys.join(", ")}.`
              : `Invalid value type for policy override(s): ${invalidValues.join(", ")}.` });
          continue;
        }
        const parsedCachePolicy = value["cachePolicy"] === undefined
          ? undefined
          : EntityListCachePolicyOverrideSchema.parse(value["cachePolicy"]);
        if (parsedCachePolicy && Object.keys(parsedCachePolicy).length > 0) {
          cachePolicyOverride = { ...cachePolicyOverride, ...parsedCachePolicy };
        }
        const { cachePolicy: _cachePolicy, ...executionPolicy } = value;
        Object.assign(policy, executionPolicy);
        continue;
      }

      diagnostics.push({
        overlayId: overlay.id,
        path: change.path,
        message: `Overlay operation '${change.kind}' is not permitted to change the runtime contract.`,
      });
    }
  }

  if (diagnostics.length > 0) throw new TenantOverlayValidationError(input.entityCode, diagnostics);

  const material = {
    tenantId: input.tenantId,
    entityVersionId: input.entityVersionId,
    baseCompiledHash: input.baseCompiledHash,
    overlaySet: overlayIds,
    changes: changes.rows.map((change) => ({
      overlayId: change.overlay_id,
      order: Number(change.change_order),
      kind: normalizeKind(change.kind),
      path: change.path,
      value: change.value,
    })),
  };
  const overlayHash = createHash("sha256").update(canonicalJson(material)).digest("hex");
  const executionOverlay: EffectiveTenantExecutionOverlay = {
    tenantId: input.tenantId,
    compiledHash: overlayHash,
    ...(Object.keys(policy).length > 0 ? { policy: policy as EffectiveTenantExecutionOverlay["policy"] } : {}),
    ...(defaultSort ? { defaultSort } : {}),
    ...(Object.keys(fieldOverrides).length > 0 ? { fieldOverrides } : {}),
  };
  return {
    tenantId: input.tenantId,
    entityId: input.entityId,
    entityVersionId: input.entityVersionId,
    baseCompiledHash: input.baseCompiledHash,
    overlaySet: overlayIds,
    overlayHash,
    executionOverlay,
    catalogFieldOverrides,
    ...(cachePolicyOverride ? { cachePolicyOverride } : {}),
  };
}

export function applyTenantCatalogOverlay(
  compiled: CompiledEntity,
  resolution: TenantOverlayResolution,
): CompiledEntity {
  const fields = compiled.fields.map((field) => {
    const override = resolution.catalogFieldOverrides[field.name];
    if (!override) return field;
    return {
      ...field,
      ...(typeof override.label === "string" ? { label: override.label } : {}),
      ...(typeof override.description === "string" ? { description: override.description } : {}),
      ...(typeof override.uiType === "string" ? { ui_type: override.uiType } : {}),
      ...(typeof override.format === "string" ? { format: override.format } : {}),
      ...(typeof override.isVisible === "boolean" ? { visibility: { ...(field.visibility ?? {}), overlayVisible: override.isVisible } } : {}),
      ...(typeof override.isReadOnly === "boolean" ? { is_readonly: override.isReadOnly } : {}),
      ...(typeof override.sortOrder === "number" ? { sort_order: override.sortOrder } : {}),
    };
  });
  const effectiveHash = createHash("sha256")
    .update(`${compiled.compiled_hash}:${resolution.overlayHash}`)
    .digest("hex");
  const contract = compiled.contract_v2;
  const contractFields = contract?.fields.map((field) => {
    const override = resolution.catalogFieldOverrides[field.name];
    if (!override) return field;
    return {
      ...field,
      ...(typeof override.label === "string" ? { label: override.label } : {}),
      ...(typeof override.description === "string" ? { description: override.description } : {}),
    };
  });
  const overlayPolicy = resolution.executionOverlay.policy;
  const effectiveDataPolicy = overlayPolicy?.dataPolicy
    ? { ...compiled.data_policy, ...overlayPolicy.dataPolicy }
    : compiled.data_policy;
  const classCachePolicy = asRecord(compiled.class_profile?.["cache_policy"]);
  const { source: basePolicySource, ...baseCachePolicy } = compiled.cache_policy;
  const effectiveMutability = compiled.contract_v2?.version_contract.mutability ?? compiled.mutability;
  const resolvedCachePolicy = resolution.cachePolicyOverride || overlayPolicy?.dataPolicy
    ? resolveEntityListCachePolicy({
      platformPolicy: baseCachePolicy,
      entityClassPolicy: {
        eager_prefetch_allowed: classCachePolicy?.["eager_prefetch_allowed"] === true,
      },
      tenantPolicy: resolution.cachePolicyOverride ?? {},
      dataClassification: typeof effectiveDataPolicy["classification"] === "string"
        ? effectiveDataPolicy["classification"]
        : null,
      mutable: !["locked", "immutable"].includes(effectiveMutability.trim().toLowerCase()),
    })
    : compiled.cache_policy;
  const effectiveCachePolicy = resolution.cachePolicyOverride
    ? resolvedCachePolicy
    : { ...resolvedCachePolicy, source: basePolicySource };
  const effectiveContract = contract
    ? {
      ...contract,
      ...(contractFields ? { fields: contractFields } : {}),
      policy: {
        ...contract.policy,
        ...(overlayPolicy?.accessMode === "default_deny" || overlayPolicy?.accessMode === "default_allow" || overlayPolicy?.accessMode === "explicit"
          ? { access_mode: overlayPolicy.accessMode } : {}),
        ...(overlayPolicy?.companyScopeMode === "none" || overlayPolicy?.companyScopeMode === "single" || overlayPolicy?.companyScopeMode === "subtree" || overlayPolicy?.companyScopeMode === "full"
          ? { company_scope_mode: overlayPolicy.companyScopeMode } : {}),
        ...(overlayPolicy?.auditMode === "enabled" || overlayPolicy?.auditMode === "disabled" || overlayPolicy?.auditMode === "sampling"
          ? { audit_mode: overlayPolicy.auditMode } : {}),
        cache_policy: effectiveCachePolicy,
      },
      ...(overlayPolicy?.dataPolicy ? {
        version_contract: {
          ...contract.version_contract,
          data_policy: { ...contract.version_contract.data_policy, ...overlayPolicy.dataPolicy },
        },
      } : {}),
    } as NonNullable<CompiledEntity["contract_v2"]>
    : undefined;
  return {
    ...compiled,
    fields,
    cache_policy: effectiveCachePolicy,
    ...(resolution.executionOverlay.policy?.dataPolicy ? {
      data_policy: effectiveDataPolicy,
    } : {}),
    ...(effectiveContract ? { contract_v2: effectiveContract } : {}),
    compiled_hash: effectiveHash,
  };
}

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseFieldPath(path: string): { name: string } | null {
  const match = /^field\.([a-z_][a-z0-9_]*)$/.exec(path.trim());
  return match ? { name: match[1]! } : null;
}

function parseDefaultSort(
  value: Record<string, unknown>,
  fieldNames: ReadonlySet<string>,
): { field: string; direction: "asc" | "desc"; nulls: "first" | "last" } | null {
  const field = typeof value.field === "string" ? value.field : "";
  const direction = value.direction === "asc" || value.direction === "desc" ? value.direction : null;
  const nulls = value.nulls === "first" || value.nulls === "last" ? value.nulls : "last";
  return fieldNames.has(field) && direction ? { field, direction, nulls } : null;
}

function validFieldOverrideValue(key: string, value: unknown): boolean {
  if (key === "defaultValue") return true;
  if (["sortOrder"].includes(key)) return typeof value === "number" && Number.isFinite(value);
  if (["label", "description", "uiType", "format"].includes(key)) return typeof value === "string";
  return typeof value === "boolean";
}

function validPolicyOverrideValue(key: string, value: unknown): boolean {
  if (key === "dataPolicy") return asRecord(value) !== null;
  if (key === "cachePolicy") return EntityListCachePolicyOverrideSchema.safeParse(value).success;
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function findProhibitedKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value.map(findProhibitedKey).find(Boolean) ?? null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_POLICY_KEYS.has(key)) return key;
    const nested = findProhibitedKey(child);
    if (nested) return nested;
  }
  return null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
