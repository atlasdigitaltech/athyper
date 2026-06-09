import type { MetaEntityField } from "@athyper/runtime-contracts";
import {
  readRuntimeRecordField,
  runtimeRecordData,
  type RuntimeFieldRecord,
} from "../core/runtime-records";

export type FieldRecord = RuntimeFieldRecord;

export function formatFieldValue(record: FieldRecord, field: MetaEntityField): string {
  const value = readRecordValue(record, field);
  const label = readReferenceLabel(record, field, value);
  if (field.display?.renderer !== "reference_label" || !label) return formatRecordValue(value, field);

  const code = readReferenceCode(record, field, value);
  return formatReferenceDisplay(label, code, field.display?.format);
}

export function formatFieldTitle(record: FieldRecord, field: MetaEntityField): string | undefined {
  const value = readRecordValue(record, field);
  return formatRecordTitle(value, field);
}

export function readRecordValue(record: FieldRecord, field: MetaEntityField): unknown {
  return readRuntimeRecordField(record, field.name, field.columnName);
}

function readReferenceLabel(record: FieldRecord, field: MetaEntityField, value: unknown): string | null {
  if (isRecord(value)) {
    return (
      readStringValue(value, field.display?.labelField)
      ?? readStringValue(value, "label")
      ?? readStringValue(value, "name")
      ?? readStringValue(value, "display_name")
    );
  }

  return readCompanionValue(record, field, [
    `${field.name}_label`,
    `${field.name}_name`,
    `${field.columnName}_label`,
    `${field.columnName}_name`,
    `${referenceBaseName(field.name)}_label`,
    `${referenceBaseName(field.name)}_name`,
  ]);
}

function readReferenceCode(record: FieldRecord, field: MetaEntityField, value: unknown): string | null {
  if (isRecord(value)) {
    return readStringValue(value, "code") ?? readStringValue(value, field.display?.valueField);
  }

  return readCompanionValue(record, field, [
    `${field.name}_code`,
    `${field.columnName}_code`,
    `${referenceBaseName(field.name)}_code`,
  ]);
}

function readCompanionValue(record: FieldRecord, field: MetaEntityField, keys: string[]): string | null {
  const data = runtimeRecordData(record);
  for (const key of keys) {
    if (!key || key === field.name || key === field.columnName) continue;
    const value = data[key] ?? record[key];
    const text = toNonBlankString(value);
    if (text) return text;
  }
  return null;
}

function readStringValue(record: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null;
  return toNonBlankString(record[key]);
}

export function toNonBlankString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function referenceBaseName(fieldName: string): string {
  if (fieldName.endsWith("_id")) return fieldName.slice(0, -"_id".length);
  if (fieldName.endsWith("_code")) return fieldName.slice(0, -"_code".length);
  return fieldName;
}

function formatReferenceDisplay(label: string, code: string | null, format: string | undefined): string {
  if (!code || code === label) return label;
  if (format === "code") return code;
  if (format === "code_label") return `${code} - ${label}`;
  return `${label} (${code})`;
}

export function formatRecordValue(value: unknown, field?: MetaEntityField): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  const temporal = field ? formatTemporalValue(value, field) : null;
  if (temporal) return temporal;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

export function formatRecordTitle(value: unknown, field: MetaEntityField): string | undefined {
  const temporalTitle = formatTemporalTitle(value, field);
  if (temporalTitle) return temporalTitle;

  const displayValue = formatRecordValue(value, field);
  return displayValue === "-" ? undefined : displayValue;
}

function formatTemporalValue(value: unknown, field: MetaEntityField): string | null {
  const kind = resolveTemporalDisplayKind(value, field);
  if (!kind) return null;

  const date = parseTemporalDate(value);
  if (!date) return null;

  const options: Intl.DateTimeFormatOptions = kind === "date"
    ? { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }
    : {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      };

  try {
    return new Intl.DateTimeFormat("en-GB", options).format(date).replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
  } catch {
    return null;
  }
}

function formatTemporalTitle(value: unknown, field: MetaEntityField): string | null {
  if (!resolveTemporalDisplayKind(value, field)) return null;

  const original = typeof value === "string" ? value.trim() : "";
  if (original && isDateOnlyText(original)) return `Date: ${original}`;

  const date = parseTemporalDate(value);
  return date ? `UTC: ${date.toISOString()}` : null;
}

function resolveTemporalDisplayKind(value: unknown, field: MetaEntityField): "date" | "datetime" | null {
  const dataType = field.dataType.toLowerCase();
  if (dataType === "date") return "date";
  if (isTimestampDataType(dataType)) return "datetime";
  if (field.name.toLowerCase().endsWith("_at") && isTemporalLikeValue(value)) return "datetime";
  return null;
}

function isTimestampDataType(dataType: string): boolean {
  return [
    "datetime",
    "timestamp",
    "timestamptz",
    "timestampz",
    "timestamp with time zone",
    "timestamp without time zone",
  ].includes(dataType);
}

function isTemporalLikeValue(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (typeof value !== "string") return false;
  const text = value.trim();
  return isDateOnlyText(text) || /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(text);
}

function parseTemporalDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const text = String(value).trim();
  if (!text) return null;

  const date = new Date(isDateOnlyText(text) ? `${text}T00:00:00Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateOnlyText(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
