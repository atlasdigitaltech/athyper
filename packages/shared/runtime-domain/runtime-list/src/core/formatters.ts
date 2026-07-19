// Minimal cell-value formatter — no product package dependencies.
// Server adapters may hydrate companion *_label / *_code values; this module
// keeps those values visible without importing product runtime packages.

import type { ResolvedColumn, RuntimeRecordRow } from "./types";

export interface RuntimeCellDisplay {
  raw:      unknown;
  display:  string;
  title?:   string;
}

export function formatRuntimeColumnValue(
  row:    RuntimeRecordRow,
  column: ResolvedColumn,
): RuntimeCellDisplay {
  const raw = readRuntimeColumnValue(row, column);
  const display = formatRuntimeColumnDisplay(row, column, raw);
  return {
    raw,
    display,
    title: formatCellTitle(raw, display),
  };
}

export function readRuntimeColumnValue(row: RuntimeRecordRow, column: ResolvedColumn): unknown {
  return row[column.name] ??
    valueFromData(row, column.name) ??
    (column.columnName ? row[column.columnName] ?? valueFromData(row, column.columnName) : undefined);
}

function formatRuntimeColumnDisplay(
  row:    RuntimeRecordRow,
  column: ResolvedColumn,
  raw:    unknown,
): string {
  const label = readReferenceLabel(row, column, raw);
  if ((column.display?.renderer === "reference_label" || column.display?.renderer === "lookup_label" || label) && label) {
    const code = readReferenceCode(row, column, raw);
    return formatReferenceDisplay(label, code, column.display?.format);
  }

  return formatCellValue(raw, column.dataType, column.uiType);
}

export function formatCellValue(value: unknown, dataType: string, uiType?: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const str = String(value);

  if (uiType === "country") {
    try {
      return new Intl.DisplayNames(["en-US"], { type: "region" }).of(str.toUpperCase().trim()) ?? str;
    } catch {
      return str;
    }
  }

  if (dataType === "date" || uiType === "date") {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      // Fixed locale prevents SSR/client hydration mismatch when system locale differs.
      return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
    }
  }

  if (dataType === "timestamp" || dataType === "timestamptz" || uiType === "datetime") {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      // Fixed locale prevents SSR/client hydration mismatch when system locale differs.
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    }
  }

  if (typeof value === "object") return "";

  return str;
}

export function formatCellTitle(raw: unknown, display: string): string | undefined {
  const rawStr = raw === null || raw === undefined ? "" : String(raw);
  return rawStr !== display && display ? rawStr || undefined : undefined;
}

export function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveRecordId(row: Record<string, unknown>): string | null {
  const id = row["id"];
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  return s || null;
}

function readReferenceLabel(
  row:    RuntimeRecordRow,
  column: ResolvedColumn,
  value:  unknown,
): string | null {
  if (isRecord(value)) {
    return readStringValue(value, column.display?.labelField) ??
      readStringValue(value, "label") ??
      readStringValue(value, "name") ??
      readStringValue(value, "display_name") ??
      readStringValue(value, "display");
  }

  return readCompanionValue(row, column, [
    `${column.name}_label`,
    `${column.name}_name`,
    column.columnName ? `${column.columnName}_label` : "",
    column.columnName ? `${column.columnName}_name` : "",
  ]);
}

function readReferenceCode(
  row:    RuntimeRecordRow,
  column: ResolvedColumn,
  value:  unknown,
): string | null {
  if (isRecord(value)) {
    return readStringValue(value, "code") ??
      readStringValue(value, column.display?.valueField);
  }

  return readCompanionValue(row, column, [
    `${column.name}_code`,
    column.columnName ? `${column.columnName}_code` : "",
  ]);
}

function readCompanionValue(
  row:    RuntimeRecordRow,
  column: ResolvedColumn,
  keys:   string[],
): string | null {
  for (const key of keys) {
    if (!key || key === column.name || key === column.columnName) continue;
    const text = toNonBlankString(row[key] ?? valueFromData(row, key));
    if (text) return text;
  }
  return null;
}

function readStringValue(record: Record<string, unknown>, key: string | undefined): string | null {
  return key ? toNonBlankString(record[key]) : null;
}

function toNonBlankString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function formatReferenceDisplay(label: string, code: string | null, format: string | undefined): string {
  if (!code || code === label) return label;
  if (format === "label") return label;
  if (format === "code") return code;
  if (format === "code_label") return `${code} - ${label}`;
  if (format === "label_code") return `${label} (${code})`;
  return label;
}

function valueFromData(row: RuntimeRecordRow, key: string): unknown {
  const data = row["data"];
  return isRecord(data) ? data[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
