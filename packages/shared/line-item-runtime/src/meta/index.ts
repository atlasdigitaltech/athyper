"use client";

import { useEffect, useState } from "react";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { fmtAmount } from "@athyper/runtime-shared/core";
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
  return (
    name === "unit_code" ||
    name === "uom_code" ||
    name === "uom" ||
    name === "unit_of_measure" ||
    name.endsWith("_uom") ||
    name.endsWith("_unit") ||
    (field.reference_config as Record<string, unknown> | null | undefined)?.["target_entity"] === "unit_of_measure"
  );
}

export function isEditableLineField(field: EntityField): boolean {
  return !field.is_readonly && field.origin !== "system" && !field.is_computed;
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
      return Number.isFinite(n) ? fmtAmount(n, currencyCode) : String(value);
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
// COLUMN RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export function resolveLineColumns(entity: CompiledEntity | null): MetaLineColumn[] {
  if (!entity) return [];
  return entity.fields
    .filter((f) => f.origin !== "system" && !f.is_computed)
    .map((f): MetaLineColumn => ({
      key:     f.name,
      label:   fieldLabel(f),
      field:   f,
      align:   ["money", "decimal", "integer", "numeric", "bigint"].includes(f.data_type) ? "right" : "left",
      numeric: ["money", "decimal", "integer", "numeric", "bigint"].includes(f.data_type),
      sortable: true,
    }));
}

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

export function editableLineFields(entity: CompiledEntity | null): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter(isEditableLineField);
}

export function resolveCopyFields(entity: CompiledEntity | null): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter((f) => isEditableLineField(f) && f.name !== "line_number");
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT / PAYLOAD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function initialDraft(
  entity:  CompiledEntity,
  line:    LineRecord | null | undefined,
): Record<string, unknown> {
  const editable = editableLineFields(entity);
  const draft: Record<string, unknown> = {};
  for (const field of editable) {
    draft[field.name] = line ? (recordValue(line, field) ?? null) : null;
  }
  return draft;
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
  for (const field of editableLineFields(entity)) {
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

// ─────────────────────────────────────────────────────────────────────────────
// useCompiledEntityMetadata HOOK
// ─────────────────────────────────────────────────────────────────────────────

type MetadataResponse = {
  data?: CompiledEntity;
  entity?: CompiledEntity;
};

export function useCompiledEntityMetadata(
  entityCode: string | null | undefined,
): CompiledEntity | null {
  const [entity, setEntity] = useState<CompiledEntity | null>(null);

  useEffect(() => {
    if (!entityCode) { setEntity(null); return; }
    let cancelled = false;
    void fetch(`/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`)
      .then((r) => r.ok ? r.json() as Promise<MetadataResponse> : null)
      .then((body) => { if (!cancelled) setEntity(body?.data ?? body?.entity ?? null); })
      .catch(() => { if (!cancelled) setEntity(null); });
    return () => { cancelled = true; };
  }, [entityCode]);

  return entity;
}
