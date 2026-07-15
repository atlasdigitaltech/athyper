"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { fmtAmount, fmtMoneyFromFieldConfig } from "@athyper/runtime-shared/core";
import type { LineRecord, MetaLineColumn } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// RECORD ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

export function asRecord(line: LineRecord | null | undefined): Record<string, unknown> {
  if (!line) return {};
  const data = (line.data ?? {}) as Record<string, unknown>;
  return { ...data, ...line };
}

export function recordValue(line: LineRecord, fieldOrName: EntityField | string): unknown {
  const record = asRecord(line);
  const name   = typeof fieldOrName === "string" ? fieldOrName : fieldOrName.name;
  if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];

  const columnName = typeof fieldOrName === "string" ? undefined : fieldOrName.column_name;
  if (columnName && Object.prototype.hasOwnProperty.call(record, columnName)) {
    const colVal = record[columnName];
    if (colVal && typeof colVal === "object" && !Array.isArray(colVal)) {
      const nested = colVal as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(nested, name) ? nested[name] : colVal;
    }
    return colVal;
  }

  return undefined;
}

export function recordId(line: LineRecord | null | undefined): string {
  if (!line) return "";
  const id = (line as Record<string, unknown>)["id"] ??
             (line as Record<string, unknown>)["line_id"] ??
             (line as Record<string, unknown>)["line_uid"];
  return id ? String(id) : "";
}

export function textValue(line: LineRecord, fieldOrName: EntityField | string): string {
  const value = recordValue(line, fieldOrName);
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function fieldLabel(field: EntityField): string {
  return field.label ?? field.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type FieldOption = { value: string; label: string };

export function fieldOptions(field: EntityField): FieldOption[] {
  const cfg = field.enum_config as Record<string, unknown> | null | undefined;
  const raw = cfg?.["values"] ?? cfg?.["options"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const value = String(obj["value"] ?? obj["code"] ?? "");
    const label = String(obj["label"] ?? obj["name"] ?? value);
    return value ? [{ value, label }] : [];
  });
}

export function isUomLikeField(field: EntityField): boolean {
  const name = field.name.toLowerCase();
  const refEntity = (field.reference_config as Record<string, unknown> | null | undefined)?.["target_entity"];
  return (
    name === "unit_code" ||
    name === "uom_code" ||
    name === "uom" ||
    name === "unit_of_measure" ||
    name === "unit_of_measure_code" ||
    name.endsWith("_uom") ||
    refEntity === "unit_of_measure" ||
    refEntity === "uom"
  );
}

export function isQuantityLikeFieldName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "quantity" ||
    normalized === "qty" ||
    normalized.endsWith("_quantity") ||
    normalized.endsWith("_qty") ||
    normalized.startsWith("quantity_") ||
    normalized.startsWith("qty_")
  );
}

export type LineFieldVisibilitySurface = "list" | "detail" | "create" | "edit" | "print";

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringProp(value: unknown, ...keys: string[]): string | undefined {
  const record = asObject(value);
  if (!record) return undefined;
  for (const key of keys) {
    const child = record[key];
    if (typeof child === "string" && child.trim()) return child.trim();
  }
  return undefined;
}

function readArrayProp(value: unknown, ...keys: string[]): unknown[] {
  const record = asObject(value);
  if (!record) return [];
  for (const key of keys) {
    const child = record[key];
    if (Array.isArray(child)) return child;
    if (typeof child === "string" && child.trim()) {
      return child.split(",").map((part) => part.trim()).filter(Boolean);
    }
  }
  return [];
}

function surfaceMatches(value: unknown, surface: LineFieldVisibilitySurface): boolean {
  return typeof value === "string"
    && (value.trim().toLowerCase() === surface || value.trim().toLowerCase() === "all");
}

function predicateMatches(predicate: Record<string, unknown>, values: Record<string, unknown>): boolean {
  const field = predicate["field"];
  if (typeof field !== "string" || !field) return true;
  const value = values[field];
  const eq = predicate["eq"] ?? predicate["equals"] ?? predicate["value"];
  const ne = predicate["ne"] ?? predicate["not"] ?? predicate["notEquals"];
  const isNull = predicate["isNull"] ?? predicate["is_null"];
  const notNull = predicate["notNull"] ?? predicate["not_null"];

  if (isNull === true) return value == null || value === "";
  if (notNull === true) return value != null && value !== "";
  if (eq !== undefined) {
    const expected = Array.isArray(eq) ? eq : [eq];
    return expected.some((entry) => String(entry) === String(value));
  }
  if (ne !== undefined) {
    const blocked = Array.isArray(ne) ? ne : [ne];
    return !blocked.some((entry) => String(entry) === String(value));
  }
  return true;
}

export function isLineFieldVisible(
  field: EntityField,
  surface: LineFieldVisibilitySurface = "edit",
  values: Record<string, unknown> = {},
): boolean {
  const visibility = asObject(field.visibility);
  if (!visibility) return true;

  if (visibility["hidden"] === true || visibility["visible"] === false) return false;

  const hideIn = readArrayProp(visibility, "hideIn", "hide_in");
  if (hideIn.some((entry) => surfaceMatches(entry, surface))) return false;

  const showIn = readArrayProp(visibility, "showIn", "show_in");
  if (showIn.length > 0 && !showIn.some((entry) => surfaceMatches(entry, surface))) return false;

  const rawWhen = visibility["when"] ?? visibility["condition"] ?? visibility["visible_when"] ?? visibility["visibleWhen"];
  const predicates = Array.isArray(rawWhen) ? rawWhen : rawWhen ? [rawWhen] : [];
  for (const raw of predicates) {
    const predicate = asObject(raw);
    if (predicate && !predicateMatches(predicate, values)) return false;
  }

  return true;
}

export function isEditableLineField(
  field: EntityField,
  surface: LineFieldVisibilitySurface = "edit",
  values: Record<string, unknown> = {},
): boolean {
  return !field.is_readonly
    && field.origin !== "system"
    && !field.is_computed
    && isLineFieldVisible(field, surface, values);
}

// ─────────────────────────────────────────────────────────────────────────────
// TITLE FIELD RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_FIELD_NAMES = [
  "item_description",
  "description",
  "line_description",
  "title",
  "name",
  "item_name",
  "product_name",
];

export function resolveTitleField(entity: CompiledEntity | null | undefined): EntityField | null {
  if (!entity) return null;
  for (const name of TITLE_FIELD_NAMES) {
    const found = entity.fields.find((f) => f.name === name && f.data_type === "text");
    if (found) return found;
  }
  return entity.fields.find((f) => f.data_type === "text" && f.origin !== "system") ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT / COERCE
// ─────────────────────────────────────────────────────────────────────────────

export function formatFieldValue(
  value:       unknown,
  field:       EntityField,
  currencyCode?: string,
): string {
  if (value == null || value === "") return "-";

  switch (field.data_type) {
    case "money":
    case "decimal":
    case "numeric": {
      const n = Number(value);
      if (isQuantityLikeFieldName(field.name)) {
        return Number.isFinite(n) ? formatQuantityValue(n, field) : String(value);
      }
      if (field.ui_type === "percent") {
        return Number.isFinite(n)
          ? `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`
          : String(value);
      }
      const moneyConfig = (field.money_config as Record<string, unknown> | null | undefined) ?? null;
      if (field.data_type === "money" || field.ui_type === "money" || moneyConfig) {
        const formatted = fmtMoneyFromFieldConfig(n, moneyConfig, {
          fallbackCurrencyCode: currencyCode,
        });
        if (formatted) return formatted;
        return Number.isFinite(n) ? fmtAmount(n, currencyCode) : String(value);
      }
      return Number.isFinite(n)
        ? n.toLocaleString(undefined, { maximumFractionDigits: 4 })
        : String(value);
    }
    case "integer":
    case "bigint": {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString() : String(value);
    }
    case "boolean":
      return value === true || value === "true" || value === 1 ? "Yes" : "No";
    case "date":
    case "datetime":
    case "timestamptz": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default: {
      if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const label = obj["label"] ?? obj["name"] ?? obj["code"];
        return label ? String(label) : JSON.stringify(value);
      }
      return String(value);
    }
  }
}

function fieldFormatConfig(field: EntityField): Record<string, unknown> {
  const uiHint = (field as { ui_hint?: unknown }).ui_hint;
  if (!uiHint || typeof uiHint !== "object" || Array.isArray(uiHint)) return {};
  const format = (uiHint as Record<string, unknown>)["format"];
  return format && typeof format === "object" && !Array.isArray(format)
    ? format as Record<string, unknown>
    : {};
}

function intOption(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function formatQuantityValue(value: number, field: EntityField): string {
  const format = fieldFormatConfig(field);
  const maximumFractionDigits = intOption(
    format["maximumFractionDigits"] ?? format["decimals"],
    4,
  );
  const minimumFractionDigits = Math.min(
    intOption(format["minimumFractionDigits"], 0),
    maximumFractionDigits,
  );

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function coerceFieldValue(value: unknown, field: EntityField): unknown {
  if (value == null || value === "") return null;
  switch (field.data_type) {
    case "integer":
    case "bigint": {
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) ? n : null;
    }
    case "decimal":
    case "money":
    case "numeric": {
      const n = parseFloat(String(value));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return value === true || value === "true" || value === 1 || value === "1";
    default:
      return value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH FIELDS
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSearchFields(entity: CompiledEntity | null): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter(
    (f) => f.data_type === "text" && f.origin !== "system",
  );
}

export function resolveDefaultSortField(entity: CompiledEntity | null): string {
  if (!entity) return "line_number";
  const lineNumber = entity.fields.find((f) => f.name === "line_number");
  if (lineNumber) return "line_number";
  const firstSortable = entity.fields.find(
    (f) => f.origin !== "system" && (f.data_type === "integer" || f.data_type === "text"),
  );
  return firstSortable?.name ?? "line_number";
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITABLE FIELDS
// ─────────────────────────────────────────────────────────────────────────────

export function editableLineFields(
  entity: CompiledEntity | null,
  surface: LineFieldVisibilitySurface = "edit",
  values: Record<string, unknown> = {},
): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter((field) => isEditableLineField(field, surface, values));
}

function readCopyPolicy(field: EntityField): string | null {
  const uiHint = (field as { ui_hint?: unknown }).ui_hint;
  if (!uiHint || typeof uiHint !== "object" || Array.isArray(uiHint)) return null;
  const hint = uiHint as Record<string, unknown>;
  const direct = hint["copy_policy"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const copy = hint["copy"];
  if (copy && typeof copy === "object" && !Array.isArray(copy)) {
    const behavior = (copy as Record<string, unknown>)["behavior"];
    if (typeof behavior === "string" && behavior.trim()) return behavior.trim();
  }
  return null;
}

export function resolveCopyFields(entity: CompiledEntity | null): EntityField[] {
  if (!entity) return [];
  const explicit = entity.fields.filter((field) => {
    const policy = readCopyPolicy(field);
    return policy === "preserve" || policy === "copy";
  });
  if (explicit.length > 0) return explicit;
  return entity.fields.filter((f) => isEditableLineField(f) && f.name !== "line_number");
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT / PAYLOAD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function initialDraft(
  entity:  CompiledEntity,
  line:    LineRecord | null | undefined,
  parentRecord?: Record<string, unknown> | null,
): Record<string, unknown> {
  const sourceValues = line ? asRecord(line) : {};
  const editable = editableLineFields(entity, line ? "edit" : "create", sourceValues);
  const draft: Record<string, unknown> = {};
  for (const field of editable) {
    draft[field.name] = line
      ? (recordValue(line, field) ?? null)
      : (cloneDefaultValue(readFieldDefaultValue(field)) ?? null);
  }
  return applySynchronousLineDefaults(entity, draft, parentRecord, line ? "edit" : "create");
}

export function buildLinePatch(
  entity:  CompiledEntity,
  draft:   Record<string, unknown>,
  original: LineRecord,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of editableLineFields(entity)) {
    const next = coerceFieldValue(draft[field.name], field);
    const prev = coerceFieldValue(recordValue(original, field), field);
    const changed = JSON.stringify(next) !== JSON.stringify(prev);
    if (changed) patch[field.name] = next;
  }
  return patch;
}

export function buildCreatePayload(
  entity: CompiledEntity,
  draft:  Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of editableLineFields(entity, "create", draft)) {
    const value = coerceFieldValue(draft[field.name], field);
    if (value != null) payload[field.name] = value;
  }
  return payload;
}

export function buildCopyPayload(
  entity: CompiledEntity,
  source: LineRecord,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of resolveCopyFields(entity)) {
    const value = coerceFieldValue(recordValue(source, field), field);
    if (value != null) payload[field.name] = value;
  }
  return payload;
}

type FieldWithDefaultExtensions = EntityField & {
  defaultValue?: unknown;
  defaults?: unknown;
};

function readFieldDefaultValue(field: EntityField): unknown | undefined {
  const extended = field as FieldWithDefaultExtensions;
  const value = extended.default_value ?? extended.defaultValue;
  return value === null ? undefined : value;
}

function cloneDefaultValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
      return undefined;
    }
  }
  return value;
}

function isBlankDefaultTarget(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

interface TenantConfigDefault {
  fieldName: string;
  namespace: string;
  configKey: string;
}

function applySynchronousLineDefaults(
  entity: CompiledEntity,
  draft: Record<string, unknown>,
  parentRecord: Record<string, unknown> | null | undefined,
  surface: LineFieldVisibilitySurface,
): Record<string, unknown> {
  const next = { ...draft };
  for (const field of editableLineFields(entity, surface, next)) {
    if (!isBlankDefaultTarget(next[field.name])) continue;
    const value = resolveSynchronousDefaultValue(field, parentRecord);
    if (!isBlankDefaultTarget(value)) next[field.name] = cloneDefaultValue(value);
  }
  return next;
}

function resolveSynchronousDefaultValue(
  field: EntityField,
  parentRecord: Record<string, unknown> | null | undefined,
): unknown {
  const defaults = asObject((field as FieldWithDefaultExtensions).defaults);
  const source = asObject(defaults?.["default_value_source"] ?? defaults?.["defaultValueSource"]);
  if (!source) return undefined;

  const kind = readStringProp(source, "kind")?.toLowerCase();
  switch (kind) {
    case "parent_field": {
      const parentField = readStringProp(source, "parent_field", "parentField");
      if (!parentField || !parentRecord) return undefined;
      if (Object.prototype.hasOwnProperty.call(parentRecord, parentField)) {
        return parentRecord[parentField];
      }
      const aliases = parentFieldAliases(parentField);
      for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(parentRecord, alias)) {
          return parentRecord[alias];
        }
      }
      return undefined;
    }
    case "static":
      return source["static_value"] ?? source["staticValue"];
    case "current_actor":
      return parentRecord?.["__actor_id"] ?? parentRecord?.["actor_id"];
    default:
      return undefined;
  }
}

function parentFieldAliases(parentField: string): string[] {
  switch (parentField) {
    case "supplier_id":
      return ["party_id", "vendor_id"];
    case "party_id":
      return ["supplier_id", "vendor_id"];
    default:
      return [];
  }
}

function readTenantConfigDefault(field: EntityField, draft: Record<string, unknown>): TenantConfigDefault | null {
  if (!isEditableLineField(field, "create", draft)) return null;
  if (!isBlankDefaultTarget(draft[field.name])) return null;

  const defaults = asObject((field as FieldWithDefaultExtensions).defaults);
  const source = asObject(defaults?.["default_value_source"] ?? defaults?.["defaultValueSource"]);
  if (!source) return null;
  const kind = readStringProp(source, "kind")?.toLowerCase();
  if (kind !== "tenant_config") return null;

  const applyOn = readArrayProp(source, "apply_on", "applyOn");
  if (applyOn.length > 0 && !applyOn.some((entry) => typeof entry === "string" && entry.toLowerCase() === "create")) {
    return null;
  }

  const configKey = readStringProp(source, "config_key", "configKey", "code", "parameter_code", "parameterCode");
  if (!configKey) return null;
  const namespace = readStringProp(source, "namespace") ?? inferParameterNamespace(configKey);
  if (!namespace) return null;

  return { fieldName: field.name, namespace, configKey };
}

function inferParameterNamespace(configKey: string): string | null {
  const parts = configKey.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(0, -1).join(".");
}

interface ParameterSnapshotResponse {
  values?: Record<string, unknown>;
}

async function fetchParameterValues(namespace: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/iam/parameters/effective?namespace=${encodeURIComponent(namespace)}`, {
    cache: "no-store",
  });
  if (!response.ok) return {};
  const body = await response.json().catch(() => null) as ParameterSnapshotResponse | null;
  return body?.values && typeof body.values === "object" ? body.values : {};
}

export async function resolveAsyncCreateLineDefaults(
  entity: CompiledEntity,
  draft: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const defaults = entity.fields
    .map((field) => readTenantConfigDefault(field, draft))
    .filter((entry): entry is TenantConfigDefault => Boolean(entry));
  if (defaults.length === 0) return {};

  const namespaces = [...new Set(defaults.map((entry) => entry.namespace))];
  const valuesByNamespace = new Map<string, Record<string, unknown>>();
  await Promise.all(namespaces.map(async (namespace) => {
    valuesByNamespace.set(namespace, await fetchParameterValues(namespace).catch(() => ({})));
  }));

  const patch: Record<string, unknown> = {};
  for (const entry of defaults) {
    const value = valuesByNamespace.get(entry.namespace)?.[entry.configKey];
    if (!isBlankDefaultTarget(value)) patch[entry.fieldName] = value;
  }
  return patch;
}

// ─────────────────────────────────────────────────────────────────────────────
// useCompiledEntityMetadata HOOK
// ─────────────────────────────────────────────────────────────────────────────

type MetadataResponse = CompiledEntity | {
  data?: unknown;
  entity?: unknown;
};

export interface CompiledEntityCacheScope {
  tenantId: string;
  planeKey?: string;
  realmKey?: string;
  effectivePrincipal: string;
  permissionStamp: string;
}

const CompiledEntityCacheScopeContext = createContext<CompiledEntityCacheScope | null>(null);

export function CompiledEntityCacheScopeProvider({
  scope,
  children,
}: {
  scope?: CompiledEntityCacheScope;
  children: ReactNode;
}) {
  return createElement(CompiledEntityCacheScopeContext.Provider, { value: scope ?? null }, children);
}

export function buildCompiledEntityQueryKey(
  entityCode: string | null,
  scope?: CompiledEntityCacheScope | null,
) {
  return [
    "compiled-entity",
    scope?.tenantId ?? "public",
    scope?.planeKey ?? "",
    scope?.realmKey ?? "",
    scope?.effectivePrincipal ?? "",
    scope?.permissionStamp ?? "",
    entityCode,
  ] as const;
}

function isCompiledEntity(value: unknown): value is CompiledEntity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<CompiledEntity>;
  return typeof record.entity_code === "string" && Array.isArray(record.fields);
}

function unwrapCompiledEntity(value: MetadataResponse | null): CompiledEntity | null {
  if (isCompiledEntity(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as { data?: unknown; entity?: unknown };
  if (isCompiledEntity(body.data)) return body.data;
  if (isCompiledEntity(body.entity)) return body.entity;
  return null;
}

export function useCompiledEntityMetadata(
  entityCode: string | null | undefined,
): CompiledEntity | null {
  const canonicalEntityCode = entityCode?.trim().replace(/-/g, "_") || null;
  const cacheScope = useContext(CompiledEntityCacheScopeContext);
  const query = useQuery({
    queryKey: buildCompiledEntityQueryKey(canonicalEntityCode, cacheScope),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/relay/api/metadata/entities/${encodeURIComponent(canonicalEntityCode!)}/compiled`,
        { signal },
      );
      if (!response.ok) return null;
      return unwrapCompiledEntity(await response.json() as MetadataResponse);
    },
    enabled: Boolean(canonicalEntityCode),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  return query.data ?? null;
}
