"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveFormConfig } from "@athyper/metadata-client";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { cn } from "@athyper/theme/utils";
import { resolveFieldRenderer, BOOLEAN_UI_TYPES } from "@athyper/entity-runtime/field-renderers";
import {
  BusinessIntentPicker,
  EntityPicker,
  ItemPicker,
  SpendCategoryPicker,
  entityRowToPickerOption,
  resolveEntityPickerOptionConfig,
  searchLookupOptions,
  type EntityPickerOption,
  type EntityPickerOptionConfig,
  type EntityPickerSearchContext,
  type EntityPickerSearchResponse,
} from "@athyper/runtime-shared/entity-search";
import { appEntityDetailHref } from "@athyper/runtime-shared/core";

export type LineRecord = Record<string, unknown> & {
  id?: string;
  data?: Record<string, unknown> | null;
};

export type MetaLineAlign = "left" | "right" | "center";

export interface MetaLineColumn {
  key: string;
  field: EntityField;
  label: string;
  align: MetaLineAlign;
  width?: string | number;
  valuePath?: string;
  aggregate?: "sum" | "count";
  sortOrder: number;
}

const NUMERIC_TYPES = new Set(["integer", "bigint", "decimal", "numeric", "money"]);
const DATE_TYPES = new Set(["date", "datetime", "timestamptz"]);
const SKIP_AUTO_COLUMN_TYPES = new Set(["json", "jsonb", "tsvector", "jsonb_array"]);
const LINE_METADATA_ALIAS_FIELDS = ["unspsc_code", "hs_code", "trade_code"] as const;
const UOM_CODE_ALIAS_FIELDS = ["uom_code", "unit_code", "unit_of_measure_code", "uom"] as const;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scalarTextValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function columnValueForField(
  source: Record<string, unknown>,
  name: string,
  columnName?: string | null,
): unknown {
  if (!columnName || !Object.prototype.hasOwnProperty.call(source, columnName)) return undefined;
  const value = source[columnName];
  const nested = asRecord(value);
  if (nested && columnName !== name) {
    return Object.prototype.hasOwnProperty.call(nested, name) ? nested[name] : undefined;
  }
  return value;
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function fieldLabel(field: EntityField): string {
  return field.label ?? titleCase(field.name);
}

export function fieldHint(field: EntityField, surface: string): Record<string, unknown> | null {
  return asRecord(asRecord(field.ui_hint)?.[surface]);
}

function lineGridConfig(entity: CompiledEntity | null | undefined): Record<string, unknown> | null {
  return asRecord(entity?.display_config?.line_grid);
}

export function useCompiledEntityMetadata(entityCode: string | null | undefined): CompiledEntity | null {
  const [compiledEntity, setCompiledEntity] = useState<CompiledEntity | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!entityCode) {
      setCompiledEntity(null);
      return () => { cancelled = true; };
    }

    setCompiledEntity(null);
    void fetch(`/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`)
      .then((res) => res.ok ? res.json() as Promise<CompiledEntity> : null)
      .then((body) => {
        if (!cancelled) setCompiledEntity(body);
      })
      .catch(() => {
        if (!cancelled) setCompiledEntity(null);
      });

    return () => { cancelled = true; };
  }, [entityCode]);

  return compiledEntity;
}

export function resolveLineEntityCode(entity: CompiledEntity | undefined, parentEntityCode?: string): string | null {
  const display = asRecord(entity?.display_config);
  const flags = asRecord(entity?.feature_flags);
  const lines = asRecord(display?.["lines"]) ?? asRecord(display?.["line_items"]);
  return textValue(display?.["line_entity_code"])
    ?? textValue(lines?.["entity_code"])
    ?? textValue(lines?.["line_entity_code"])
    ?? textValue(flags?.["line_entity_code"])
    ?? textValue(parentEntityCode ? undefined : null)
    ?? null;
}

export function recordData(record: LineRecord | null | undefined): Record<string, unknown> {
  return asRecord(record?.data) ?? {};
}

export function recordValue(record: LineRecord | null | undefined, fieldOrName: EntityField | string): unknown {
  if (!record) return undefined;
  const name = typeof fieldOrName === "string" ? fieldOrName : fieldOrName.name;
  const columnName = typeof fieldOrName === "string" ? undefined : fieldOrName.column_name;
  const direct = record[name];
  if (direct !== undefined) return direct;
  const columnValue = columnValueForField(record, name, columnName);
  if (columnValue !== undefined) return columnValue;
  const data = recordData(record);
  if (data[name] !== undefined) return data[name];
  const dataColumnValue = columnValueForField(data, name, columnName);
  if (dataColumnValue !== undefined) return dataColumnValue;
  return undefined;
}

export function recordId(record: LineRecord | null | undefined): string {
  const value = record?.id ?? record?.["id"];
  return value == null ? "" : String(value);
}

function alignForField(field: EntityField): MetaLineAlign {
  if (NUMERIC_TYPES.has(field.data_type)) return "right";
  if (field.data_type === "boolean") return "center";
  return "left";
}

function aggregateForField(field: EntityField): MetaLineColumn["aggregate"] {
  if (!field.is_aggregatable) return undefined;
  return NUMERIC_TYPES.has(field.data_type) ? "sum" : "count";
}

function columnFromField(field: EntityField, orderFallback: number): MetaLineColumn {
  const hint = fieldHint(field, "line_grid");
  return {
    key: field.name,
    field,
    label: textValue(hint?.["label"]) ?? fieldLabel(field),
    align: (textValue(hint?.["align"]) as MetaLineAlign | undefined) ?? alignForField(field),
    width: textValue(hint?.["width"]) ?? undefined,
    valuePath: textValue(hint?.["path"]) ?? undefined,
    aggregate: aggregateForField(field),
    sortOrder: numberValue(hint?.["order"], field.sort_order ?? orderFallback),
  };
}

export function resolveLineColumn(
  entity: CompiledEntity | null | undefined,
  fieldName: string,
  orderFallback = 0,
): MetaLineColumn | null {
  if (!entity) return null;
  const field = entity.fields.find((candidate) => candidate.name === fieldName);
  if (!field) return null;
  return columnFromField(field, orderFallback);
}

export function resolveLineColumns(entity: CompiledEntity | null | undefined): MetaLineColumn[] {
  if (!entity) return [];

  const fieldsByName = new Map(entity.fields.map((field) => [field.name, field]));
  const grid = lineGridConfig(entity);
  const configuredColumns = Array.isArray(grid?.["columns"])
    ? grid?.["columns"] as unknown[]
    : undefined;

  if (configuredColumns?.length) {
    return configuredColumns.flatMap((entry, index): MetaLineColumn[] => {
      const config = asRecord(entry);
      const name = textValue(config?.["field"]) ?? textValue(config?.["name"]) ?? textValue(entry);
      const field = name ? fieldsByName.get(name) : undefined;
      if (!field) return [];
      const column = columnFromField(field, index);
      return [{
        ...column,
        label: textValue(config?.["label"]) ?? column.label,
        width: textValue(config?.["width"]) ?? column.width,
        valuePath: textValue(config?.["path"]) ?? column.valuePath,
        sortOrder: numberValue(config?.["order"], column.sortOrder),
      }];
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const fieldConfiguredColumns = entity.fields
    .filter((field) => fieldHint(field, "line_grid")?.["visible"] === true)
    .map(columnFromField);

  if (fieldConfiguredColumns.length > 0) {
    return fieldConfiguredColumns.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const listColumns = entity.display_config.list_columns
    ?.flatMap((name, index): MetaLineColumn[] => {
      const field = fieldsByName.get(name);
      return field ? [{ ...columnFromField(field, index), sortOrder: index }] : [];
    });

  if (listColumns?.length) return listColumns;

  return entity.fields
    .filter((field) => field.origin !== "system")
    .filter((field) => fieldHint(field, "line_grid")?.["visible"] !== false)
    .filter((field) => !SKIP_AUTO_COLUMN_TYPES.has(field.data_type))
    .map(columnFromField)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveSearchFields(entity: CompiledEntity | null | undefined, columns: MetaLineColumn[]): EntityField[] {
  if (!entity) return [];
  if (entity.search_config?.enabled === false) return [];
  const names = entity.search_config?.fields?.length
    ? entity.search_config.fields
    : undefined;
  if (names?.length) {
    const fieldsByName = new Map(entity.fields.map((field) => [field.name, field]));
    return names.flatMap((name) => {
      const field = fieldsByName.get(name);
      return field ? [field] : [];
    });
  }
  const searchable = entity.fields.filter((field) => field.is_searchable);
  return searchable.length > 0 ? searchable : columns.map((column) => column.field);
}

export function resolveTitleField(entity: CompiledEntity | null | undefined): EntityField | undefined {
  if (!entity) return undefined;
  const fieldsByName = new Map(entity.fields.map((field) => [field.name, field]));
  return textValue(entity.display_config.title_field)
    ? fieldsByName.get(entity.display_config.title_field!)
    : resolveLineColumns(entity)[0]?.field;
}

export function resolveDefaultSortField(entity: CompiledEntity | null | undefined, columns: MetaLineColumn[]): string | undefined {
  if (!entity) return columns[0]?.field.name;
  if (entity.display_config.default_sort_field) return entity.display_config.default_sort_field;
  return entity.fields.find((field) => field.is_sortable)?.name ?? columns[0]?.field.name;
}

// ── Line Organizer ────────────────────────────────────────────────────────────

export interface LineOrganizerFilter {
  key: string;
  label: string;
  kind: string;
  value?: unknown;
  op?: string;
  tone?: "danger" | "warning" | "info" | "neutral";
  order: number;
}

export interface LineOrganizerSort {
  key: string;
  label: string;
  field: string;
  direction: "asc" | "desc";
  absolute?: boolean;
  order: number;
}

export interface LineOrganizerGroup {
  key: string;
  label: string;
  kind?: string;
  order: number;
}

export interface LineOrganizerDensity {
  key: string;
  label: string;
  order: number;
}

export interface LineOrganizerConfig {
  toolbarLabel: string;
  allLinesLabel: string;
  defaultSort: string;
  defaultGroup: string;
  defaultDensity: string;
  filters: LineOrganizerFilter[];
  sorts: LineOrganizerSort[];
  groups: LineOrganizerGroup[];
  densities: LineOrganizerDensity[];
}

function parseOrgItems<T extends { order: number }>(
  raw: unknown,
  transform: (item: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry): T[] => {
      const item = asRecord(entry);
      if (!item) return [];
      const result = transform(item);
      return result ? [result] : [];
    })
    .sort((a, b) => a.order - b.order);
}

export function resolveLineOrganizer(entity: CompiledEntity | null | undefined): LineOrganizerConfig | null {
  const raw = asRecord(asRecord(lineGridConfig(entity)?.["organizer"]));
  if (!raw) return null;
  return {
    toolbarLabel:   textValue(raw["toolbar_label"])   ?? "Organize",
    allLinesLabel:  textValue(raw["all_lines_label"])  ?? "All lines",
    defaultSort:    textValue(raw["default_sort"])    ?? "",
    defaultGroup:   textValue(raw["default_group"])   ?? "none",
    defaultDensity: textValue(raw["default_density"]) ?? "comfortable",
    filters: parseOrgItems(raw["filters"], (item) => {
      const key   = textValue(item["key"]);
      const label = textValue(item["label"]);
      const kind  = textValue(item["kind"]);
      if (!key || !label || !kind) return null;
      return {
        key, label, kind,
        value: item["value"],
        op:    textValue(item["op"]),
        tone:  (textValue(item["tone"]) ?? "neutral") as LineOrganizerFilter["tone"],
        order: Number(item["order"] ?? 0),
      };
    }),
    sorts: parseOrgItems(raw["sorts"], (item) => {
      const key   = textValue(item["key"]);
      const label = textValue(item["label"]);
      const field = textValue(item["field"]);
      if (!key || !label || !field) return null;
      return {
        key, label, field,
        direction: textValue(item["direction"]) === "desc" ? "desc" : "asc",
        absolute:  item["absolute"] === true,
        order:     Number(item["order"] ?? 0),
      };
    }),
    groups: parseOrgItems(raw["groups"], (item) => {
      const key   = textValue(item["key"]);
      const label = textValue(item["label"]);
      if (!key || !label) return null;
      return { key, label, kind: textValue(item["kind"]), order: Number(item["order"] ?? 0) };
    }),
    densities: parseOrgItems(raw["densities"], (item) => {
      const key   = textValue(item["key"]);
      const label = textValue(item["label"]);
      if (!key || !label) return null;
      return { key, label, order: Number(item["order"] ?? 0) };
    }),
  };
}

export function isEditableLineField(field: EntityField): boolean {
  return !field.is_readonly && field.origin !== "system" && field.is_computed !== true;
}

export function editableLineFields(entity: CompiledEntity | null | undefined): EntityField[] {
  if (!entity) return [];
  return resolveFormConfig(entity).sections.flatMap((section) => section.fields);
}

/**
 * Returns the ordered set of fields to carry over when duplicating a line.
 *
 * Resolution order:
 *   1. Field group with group_key === "copy" — explicit per-entity declaration.
 *      Add this group to the line entity seed to control exactly what is copied.
 *   2. Fallback — all editable non-unique fields (original behaviour).
 *
 * Fields flagged is_unique are always excluded regardless of which path is taken.
 */
export function resolveCopyFields(entity: CompiledEntity | null | undefined): EntityField[] {
  if (!entity) return [];

  const copyGroup = entity.field_groups.find((g) => g.group_key === "copy");
  if (copyGroup) {
    const fieldsByName = new Map(entity.fields.map((f) => [f.name, f]));
    return copyGroup.fields
      .flatMap((name): EntityField[] => {
        const field = fieldsByName.get(name);
        return field && isEditableLineField(field) && !field.is_unique ? [field] : [];
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  // Fallback: every editable field that is not unique
  return editableLineFields(entity).filter((f) => !f.is_unique);
}

export function initialDraft(entity: CompiledEntity | null | undefined, record?: LineRecord | null): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of editableLineFields(entity)) {
    const existing = recordValue(record, field);
    const uomAlias = isUomLikeField(field) && !isUomIdField(field)
      ? UOM_CODE_ALIAS_FIELDS.map((fieldName) => recordValue(record, fieldName)).find((value) => value !== undefined && value !== null && value !== "")
      : undefined;
    draft[field.name] = existing !== undefined ? existing : field.default_value ?? emptyValueForField(field);
    if ((draft[field.name] == null || draft[field.name] === "") && uomAlias !== undefined) {
      draft[field.name] = uomAlias;
    }
  }
  for (const fieldName of LINE_METADATA_ALIAS_FIELDS) {
    if (draft[fieldName] !== undefined) continue;
    const existing = recordValue(record, fieldName);
    if (existing !== undefined) draft[fieldName] = existing;
  }
  return draft;
}

function emptyValueForField(field: EntityField): unknown {
  if (field.data_type === "boolean") return false;
  return "";
}

function isEmptyDraftValue(value: unknown): boolean {
  return value == null || value === "";
}

export function coerceFieldValue(field: EntityField, value: unknown): unknown {
  if (isEmptyDraftValue(value)) return field.is_required ? null : null;
  if (field.data_type === "boolean") return Boolean(value);
  if (NUMERIC_TYPES.has(field.data_type)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (field.data_type === "json" || field.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function comparable(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lineFieldValuesEqual(field: EntityField, next: unknown, prev: unknown): boolean {
  if (NUMERIC_TYPES.has(field.data_type)) {
    const nextEmpty = next == null || next === "";
    const prevEmpty = prev == null || prev === "";
    if (nextEmpty || prevEmpty) return nextEmpty && prevEmpty;
    const nextNumber = Number(next);
    const prevNumber = Number(prev);
    if (Number.isFinite(nextNumber) && Number.isFinite(prevNumber)) {
      return nextNumber === prevNumber;
    }
  }
  return comparable(next) === comparable(prev);
}

export function buildLinePatch(
  entity: CompiledEntity,
  draft: Record<string, unknown>,
  original: LineRecord,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of editableLineFields(entity)) {
    const next = coerceFieldValue(field, draft[field.name]);
    const prev = recordValue(original, field);
    if (!lineFieldValuesEqual(field, next, prev)) {
      patch[field.name] = next;
    }
  }
  for (const fieldName of LINE_METADATA_ALIAS_FIELDS) {
    if (patch[fieldName] !== undefined || !(fieldName in draft)) continue;
    const next = draft[fieldName] == null || draft[fieldName] === "" ? null : draft[fieldName];
    const prev = recordValue(original, fieldName);
    if (comparable(next) !== comparable(prev)) {
      patch[fieldName] = next;
    }
  }
  return patch;
}

export function buildCreatePayload(entity: CompiledEntity, draft: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of editableLineFields(entity)) {
    const raw = draft[field.name];
    if (isEmptyDraftValue(raw) && field.default_value == null && !field.is_required) continue;
    payload[field.name] = coerceFieldValue(field, raw);
  }
  for (const fieldName of LINE_METADATA_ALIAS_FIELDS) {
    if (payload[fieldName] !== undefined || !(fieldName in draft)) continue;
    const raw = draft[fieldName];
    if (isEmptyDraftValue(raw)) continue;
    payload[fieldName] = raw;
  }
  if (!asRecord(payload["data"])) payload["data"] = {};
  return payload;
}

export function buildCopyPayload(entity: CompiledEntity, source: LineRecord): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of resolveCopyFields(entity)) {
    const value = recordValue(source, field);
    if (value !== undefined) draft[field.name] = value;
  }
  return buildCreatePayload(entity, draft);
}

export function formatFieldValue(value: unknown, field?: EntityField, currencyCode?: string): string {
  if (value == null || value === "") return "-";
  if (!field) return String(value);
  if (field.data_type === "boolean") return value ? "Yes" : "No";
  if (NUMERIC_TYPES.has(field.data_type)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: field.data_type === "integer" || field.data_type === "bigint" ? 0 : 2,
      maximumFractionDigits: field.data_type === "integer" || field.data_type === "bigint" ? 0 : 2,
    }).format(n);
    return field.data_type === "money" && currencyCode ? `${formatted} ${currencyCode}` : formatted;
  }
  if (DATE_TYPES.has(field.data_type)) {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldInputType(field: EntityField): "text" | "number" | "date" | "datetime-local" {
  if (NUMERIC_TYPES.has(field.data_type)) return "number";
  if (field.data_type === "date") return "date";
  if (field.data_type === "datetime" || field.data_type === "timestamptz") return "datetime-local";
  return "text";
}

function inputStringValue(field: EntityField, value: unknown): string {
  if (value == null) return "";
  if (field.data_type === "date") return String(value).slice(0, 10);
  if (field.data_type === "datetime" || field.data_type === "timestamptz") return String(value).slice(0, 16);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function fieldOptions(field: EntityField): Array<{ value: string; label: string }> {
  const hintOptions = asRecord(field.ui_hint)?.["options"];
  const ruleOptions = field.validation_rules?.["options"] ?? field.validation_rules?.["enum"];
  const raw = Array.isArray(hintOptions) ? hintOptions : Array.isArray(ruleOptions) ? ruleOptions : [];
  return raw.flatMap((item): Array<{ value: string; label: string }> => {
    const config = asRecord(item);
    if (config) {
      const value = textValue(config["value"]) ?? textValue(config["key"]);
      if (!value) return [];
      return [{ value, label: textValue(config["label"]) ?? value }];
    }
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return [{ value: String(item), label: String(item) }];
    }
    return [];
  });
}

function isUomIdField(field: EntityField): boolean {
  return /(^|_)id$/i.test(field.name);
}

export function isUomLikeField(field: EntityField): boolean {
  const name = field.name.toLowerCase();
  const label = fieldLabel(field).toLowerCase();
  return (
    name === "uom" ||
    name === "uom_code" ||
    name === "uom_id" ||
    name === "unit_code" ||
    name === "unit_of_measure" ||
    name === "unit_of_measure_code" ||
    name === "unit_of_measure_id" ||
    label === "uom" ||
    label === "uo m" ||
    label.includes("unit of measure")
  );
}

function uomStorageValue(field: EntityField, row: Record<string, unknown>): string {
  const config = asRecord(field.reference_config);
  const storageField = textValue(
    config?.["target_field"] ??
    config?.["value_field"] ??
    config?.["storage_field"],
  );
  const code = scalarTextValue(
    row["code"] ??
    row["uom_code"] ??
    row["unit_code"] ??
    row["unit_of_measure_code"] ??
    row["canonical_code"],
  );
  const preferred = storageField
    ? scalarTextValue(row[storageField])
    : isUomIdField(field)
      ? scalarTextValue(row["id"])
      : code;
  return preferred ?? code ?? scalarTextValue(row["id"]) ?? "";
}

function uomOption(field: EntityField, row: Record<string, unknown>): EntityPickerOption | null {
  const value = uomStorageValue(field, row);
  if (!value) return null;
  const code = scalarTextValue(
    row["code"] ??
    row["uom_code"] ??
    row["unit_code"] ??
    row["unit_of_measure_code"] ??
    row["canonical_code"],
  ) ?? value;
  const name = scalarTextValue(row["name"] ?? row["uom_name"] ?? row["display_name"] ?? row["label"]);
  const symbol = scalarTextValue(row["symbol"] ?? row["uom_symbol"]);
  const quantityType = scalarTextValue(row["quantity_type"] ?? row["quantityType"] ?? row["type"] ?? row["category"]);
  return {
    value,
    label: name && name !== code ? `${code} - ${name}` : code,
    code,
    description: [symbol && symbol !== code ? symbol : null, quantityType].filter(Boolean).join(" · ") || undefined,
    recordId: scalarTextValue(row["id"]) ?? value,
    raw: row,
  };
}

async function searchUomOptions(
  field: EntityField,
  query: string,
  context?: EntityPickerSearchContext,
): Promise<EntityPickerSearchResponse> {
  const page = context?.page ?? 1;
  const limit = context?.limit ?? context?.pageSize ?? 20;
  const params = new URLSearchParams({
    search: query.trim(),
    q: query.trim(),
    active: "true",
    page: String(page),
    limit: String(limit),
  });
  const response = await fetch(`/api/relay/api/platform/ref/uom?${params}`);
  if (!response.ok) return { options: [], totalCount: 0 };
  const body = await response.json() as {
    data?: Record<string, unknown>[];
    values?: Record<string, unknown>[];
    records?: Record<string, unknown>[];
    items?: Record<string, unknown>[];
    meta?: { total?: number | string };
  } | Record<string, unknown>[];
  const rows = Array.isArray(body) ? body : body.data ?? body.values ?? body.records ?? body.items ?? [];
  const options = rows
    .map((row) => uomOption(field, row))
    .filter((option): option is EntityPickerOption => Boolean(option));
  const total = Array.isArray(body) ? options.length : body.meta?.total;
  return { options, totalCount: Number(total ?? options.length) };
}

function useResolvedUomLabel(field: EntityField, value: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(null);
    if (!value) return;
    let cancelled = false;
    void searchUomOptions(field, value, { limit: 20, pageSize: 20, page: 1 })
      .then((result) => {
        if (cancelled) return;
        const options = Array.isArray(result) ? result : result.options;
        const match = options.find((option) =>
          option.value === value ||
          option.code === value ||
          option.recordId === value,
        );
        setLabel(match?.label ?? value);
      })
      .catch(() => {
        if (!cancelled) setLabel(value);
      });
    return () => { cancelled = true; };
  }, [field, value]);

  return label;
}

export function UomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: EntityField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const currentValue = referenceInputValue(value);
  const [selected, setSelected] = useState<EntityPickerOption | null>(null);
  const resolvedLabel = useResolvedUomLabel(field, currentValue);
  const displayLabel = selected?.value === currentValue
    ? selected.label
    : resolvedLabel ?? currentValue;
  const optionConfig = useMemo<EntityPickerOptionConfig>(() => ({
    codeField: "code",
    descriptionField: "description",
    showCode: true,
    showDescription: true,
    variant: "advanced",
    density: "compact",
    width: 420,
    maxListHeight: 320,
    showRecentlyUsed: false,
    showKeyboardHints: false,
    resultLabel: "UoM",
    pageSize: 20,
    defaultSearchMode: "server",
    sections: [{ id: "matches", label: "All units" }],
  }), []);

  return (
    <EntityPicker
      value={currentValue}
      displayLabel={displayLabel}
      search={(query, context) => searchUomOptions(field, query, context)}
      optionConfig={optionConfig}
      placeholder="Search UoM..."
      disabled={disabled}
      loadOnOpen
      clearable
      onOptionSelect={(option) => setSelected(option)}
      onChange={(next) => onChange(next ?? "")}
    />
  );
}

function ReferenceInput({
  field,
  value,
  onChange,
  disabled,
  formData,
}: {
  field: EntityField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  formData?: Record<string, unknown> | null;
}) {
  const targetEntity = referenceTargetEntity(field);
  const currentValue = referenceInputValue(value);
  const optionConfig = useMemo(
    () => resolveEntityPickerOptionConfig(field.reference_config),
    [field.reference_config],
  );
  const [picked, setPicked] = useState<{ value: string; label: string } | null>(null);
  const resolvedLabel = useResolvedReferenceLabel(targetEntity, currentValue, optionConfig);
  const displayLabel = picked?.value === currentValue
    ? picked.label
    : resolvedLabel ?? null;

  function commit(id: string | null, label?: string | null) {
    setPicked(id && label ? { value: id, label } : null);
    onChange(id ?? "");
  }

  if (!targetEntity) return null;

  const pickerProps = {
    value: currentValue,
    displayLabel,
    field,
    formData,
    disabled,
    placeholder: `Search ${fieldLabel(field).toLowerCase()}...`,
  };

  if (targetEntity === "commodity_category") {
    return <SpendCategoryPicker {...pickerProps} onChange={commit} />;
  }
  if (targetEntity === "business_intent") {
    return <BusinessIntentPicker {...pickerProps} onChange={commit} />;
  }
  if (targetEntity === "item") {
    return <ItemPicker {...pickerProps} onChange={commit} />;
  }

  return (
    <GenericReferencePicker
      field={field}
      value={currentValue}
      displayLabel={displayLabel}
      entityCode={targetEntity}
      optionConfig={optionConfig}
      formData={formData}
      disabled={disabled}
      onChange={commit}
    />
  );
}

function commodityDomainForField(field: EntityField): "unspsc" | "hs" | null {
  const hint = asRecord(field.ui_hint);
  const configured = textValue(hint?.["taxonomy_domain"] ?? hint?.["commodity_domain"])?.toLowerCase();
  if (configured === "unspsc" || configured === "hs") return configured;

  const name = field.name.toLowerCase();
  const label = fieldLabel(field).toLowerCase();
  const text = `${name} ${label}`;
  if (text.includes("unspsc")) return "unspsc";
  if (/\bhs\b/.test(text) || text.includes("trade") || text.includes("tariff")) return "hs";
  return null;
}

function commodityOption(row: Record<string, unknown>): EntityPickerOption {
  const code = scalarTextValue(row["code"] ?? row["value"] ?? row["id"]) ?? "";
  const name = scalarTextValue(row["name"] ?? row["label"] ?? row["description"]) ?? code;
  return {
    value:       code,
    label:       code ? `${code} - ${name}` : name,
    code,
    description: scalarTextValue(row["description"]) ?? undefined,
    raw:         row,
  };
}

function commodityPickerConfig(domain: "unspsc" | "hs"): EntityPickerOptionConfig {
  const domainLabel = domain === "unspsc" ? "UNSPSC" : "HS";
  return {
    variant:          "advanced",
    density:          "compact",
    width:            420,
    maxListHeight:    320,
    showRecentlyUsed: false,
    showKeyboardHints: false,
    resultLabel:      `${domainLabel} codes`,
    pageSize:         20,
    defaultSearchMode: "server",
    sections: [
      { id: "matches", label: "All matches" },
    ],
  };
}

function useResolvedCommodityCodeLabel(domain: "unspsc" | "hs", code: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(null);
    if (!code) return;
    const controller = new AbortController();
    void fetch(
      `/api/relay/api/platform/taxonomy/commodity/domains/${encodeURIComponent(domain)}/nodes/${encodeURIComponent(code)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Commodity code lookup failed (${response.status})`);
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((row) => {
        if (!controller.signal.aborted && row) {
          setLabel(commodityOption(row).label);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [code, domain]);

  return label;
}

function commodityInputValue(value: unknown, domain: "unspsc" | "hs"): string | null {
  if (value == null) return null;
  const record = asRecord(value);
  if (record) {
    const domainSpecific = domain === "unspsc"
      ? record["unspsc_code"]
      : record["hs_code"] ?? record["trade_code"];
    const domainSpecificText = scalarTextValue(domainSpecific);
    if (domainSpecificText) return domainSpecificText;

    const valueDomain = scalarTextValue(
      record["domain_code"] ?? record["domain"] ?? record["commodity_domain"],
    )?.toLowerCase();
    if (valueDomain && valueDomain !== domain) return null;

    return scalarTextValue(record["value"] ?? record["code"] ?? record["id"]) ?? null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function CommodityCodeInput({
  field,
  value,
  onChange,
  disabled,
  domain,
}: {
  field: EntityField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  domain: "unspsc" | "hs";
}) {
  const currentValue = commodityInputValue(value, domain);
  const resolvedLabel = useResolvedCommodityCodeLabel(domain, currentValue);
  const [selected, setSelected] = useState<EntityPickerOption | null>(null);
  const optionConfig = useMemo(() => commodityPickerConfig(domain), [domain]);

  async function searchCommodityCodes(
    query: string,
    context?: EntityPickerSearchContext,
  ): Promise<EntityPickerSearchResponse> {
    const term = query.trim();
    const page = context?.page ?? 1;
    const limit = context?.limit ?? context?.pageSize ?? 20;
    const params = new URLSearchParams({
      domain,
      page: String(page),
      limit: String(limit),
    });
    const endpoint = term
      ? "/api/relay/api/platform/ref/commodity-codes/search"
      : "/api/relay/api/platform/ref/commodity-codes";
    if (term) params.set("q", term);

    const response = await fetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) return { options: [], totalCount: 0 };
    const body = await response.json() as {
      data?: Record<string, unknown>[];
      meta?: { total?: number | string };
    };
    const rows = body.data ?? [];
    return {
      options: rows.map(commodityOption),
      totalCount: Number(body.meta?.total ?? rows.length),
    };
  }

  return (
    <EntityPicker
      value={currentValue}
      displayLabel={selected?.value === currentValue ? selected.label : resolvedLabel}
      search={searchCommodityCodes}
      optionConfig={optionConfig}
      placeholder={`Search ${fieldLabel(field).toLowerCase()}...`}
      disabled={disabled}
      loadOnOpen
      clearable
      optionActionLabel="Open code"
      onOptionSelect={(option) => setSelected(option)}
      onChange={(next) => onChange(next ?? "")}
    />
  );
}

function referenceTargetEntity(field: EntityField): string | null {
  const config = asRecord(field.reference_config);
  const explicit = textValue(
    config?.["target_entity"] ??
    config?.["targetEntity"] ??
    config?.["ref_entity"] ??
    config?.["refEntity"] ??
    config?.["entity"] ??
    config?.["entity_code"],
  );
  if (explicit) return explicit;

  const name = field.name.toLowerCase();
  if (name.includes("commodity_category")) return "commodity_category";
  if (name.includes("business_intent")) return "business_intent";
  if (name === "item_id" || name.endsWith("_item_id")) return "item";
  return null;
}

function referenceInputValue(value: unknown): string | null {
  if (value == null) return null;
  const record = asRecord(value);
  if (record) {
    const scalar = scalarTextValue(
      record["value"] ??
      record["code"] ??
      record["id"] ??
      record["unspsc_code"] ??
      record["hs_code"] ??
      record["trade_code"] ??
      record["uom_code"] ??
      record["unit_code"],
    );
    return scalar ?? null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function useResolvedReferenceLabel(
  entityCode: string | null,
  value: string | null,
  optionConfig?: EntityPickerOptionConfig,
): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(null);
    if (!entityCode || !value) return;
    const controller = new AbortController();
    void fetch(
      `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(value)}`,
      { signal: controller.signal },
    )
      .then((response) => response.ok ? response.json() as Promise<{ data?: Record<string, unknown> }> : null)
      .then((body) => {
        const row = body?.data;
        if (!controller.signal.aborted && row) {
          setLabel(entityRowToPickerOption(row, entityCode, optionConfig).label || null);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [entityCode, optionConfig, value]);

  return label;
}

function GenericReferencePicker({
  field,
  value,
  displayLabel,
  entityCode,
  optionConfig,
  formData,
  disabled,
  onChange,
}: {
  field: EntityField;
  value: string | null;
  displayLabel: string | null;
  entityCode: string;
  optionConfig?: EntityPickerOptionConfig;
  formData?: Record<string, unknown> | null;
  disabled?: boolean;
  onChange: (id: string | null, label: string | null) => void;
}) {
  const [selected, setSelected] = useState<EntityPickerOption | null>(null);

  async function search(
    query: string,
    context?: EntityPickerSearchContext,
  ): Promise<EntityPickerSearchResponse> {
    return searchLookupOptions({
      entityCode,
      query,
      lookupConfig: field.lookup_config,
      formData,
      optionConfig,
      context,
    });
  }

  return (
    <EntityPicker
      value={value}
      displayLabel={selected?.value === value ? selected.label : displayLabel}
      entityCode={entityCode}
      search={search}
      optionConfig={optionConfig}
      getOptionHref={(option) => {
        const recordIdValue = option.recordId ?? option.value;
        return appEntityDetailHref(entityCode, recordIdValue);
      }}
      optionActionLabel={optionConfig?.optionActionLabel ?? `Open ${entityCode.replace(/_/g, " ")}`}
      placeholder={`Search ${fieldLabel(field).toLowerCase()}...`}
      disabled={disabled}
      loadOnOpen
      clearable
      onOptionSelect={(option) => setSelected(option)}
      onChange={(next) => {
        const id = next ?? null;
        const label = id ? (selected?.value === id ? selected.label : displayLabel) : null;
        onChange(id, label);
      }}
    />
  );
}

export function MetaFieldInput({
  field,
  value,
  onChange,
  disabled,
  formData,
}: {
  field: EntityField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  formData?: Record<string, unknown> | null;
}) {
  const options = fieldOptions(field);
  const commodityDomain = commodityDomainForField(field);

  if (commodityDomain) {
    return (
      <CommodityCodeInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        domain={commodityDomain}
      />
    );
  }

  if (isUomLikeField(field)) {
    return <UomFieldInput field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  if (referenceTargetEntity(field)) {
    return <ReferenceInput field={field} value={value} onChange={onChange} disabled={disabled} formData={formData} />;
  }

  if (BOOLEAN_UI_TYPES.has(field.ui_type ?? field.data_type)) {
    const Renderer = resolveFieldRenderer(field);
    return (
      <Renderer
        value={value}
        field={field}
        mode="edit"
        density="compact"
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (options.length > 0 || field.data_type === "enum" || field.data_type === "lifecycle_state") {
    return (
      <select
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring/50 focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (field.data_type === "text" || field.ui_type === "textarea") {
    return (
      <textarea
        value={inputStringValue(field, value)}
        disabled={disabled}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring/50 focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
      />
    );
  }

  return (
    <input
      type={fieldInputType(field)}
      value={inputStringValue(field, value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring/50 focus:ring-2 focus:ring-ring/30 disabled:opacity-50",
        NUMERIC_TYPES.has(field.data_type) && "text-right tabular-nums",
      )}
    />
  );
}

export type LineFormMode = "compose" | "edit" | "view";

function isFieldDisabledForMode(field: EntityField, globalDisabled: boolean | undefined, mode: LineFormMode): boolean {
  if (globalDisabled) return true;
  const hint = fieldHint(field, "form");
  const disabledIn = hint?.["disabled_in"];
  return Array.isArray(disabledIn) && (disabledIn as unknown[]).includes(mode);
}

export function MetaLineForm({
  entity,
  draft,
  onDraftChange,
  disabled,
  mode = "edit",
}: {
  entity: CompiledEntity;
  draft: Record<string, unknown>;
  onDraftChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  mode?: LineFormMode;
}) {
  const formConfig = useMemo(() => resolveFormConfig(entity), [entity]);

  if (formConfig.sections.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        No editable fields are configured for this line entity.
      </div>
    );
  }

  return (
    <div className="space-y-5 px-5 py-4">
      {formConfig.sections.map((section) => (
        <section key={section.group.group_key} className="space-y-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
              {section.group.label}
            </h3>
            {section.group.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{section.group.description}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((field) => (
              <label key={field.name} className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {fieldLabel(field)}
                  {field.is_required && <span className="ml-0.5 text-destructive">*</span>}
                </span>
                <MetaFieldInput
                  field={field}
                  value={draft[field.name]}
                  disabled={isFieldDisabledForMode(field, disabled, mode)}
                  formData={draft}
                  onChange={(value) => onDraftChange({ ...draft, [field.name]: value })}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
