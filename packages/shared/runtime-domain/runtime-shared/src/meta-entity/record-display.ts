import type { MetaEntityField } from "@athyper/runtime-contracts";
import { formatZonedDateTime, resolveTemporalKind } from "@athyper/platform-temporal";
import {
  readRuntimeRecordField,
  runtimeRecordData,
  type RuntimeFieldRecord,
} from "../core/runtime-records";

export type FieldRecord = RuntimeFieldRecord;

export function formatFieldValue(record: FieldRecord, field: MetaEntityField): string {
  const value = readRecordValue(record, field);
  const renderer = field.display?.renderer;
  const isReferenceField = renderer === "reference_label";
  const isLookupField = renderer === "lookup_label";
  const label = readReferenceLabel(record, field, value)
    ?? (isLookupField ? readStaticOptionLabel(field, value) : null);
  if (!label) {
    // Safety net ONLY fires for fields whose descriptor claims they render as
    // a reference label but the data layer didn't provide the join. Fields
    // that never declared reference_label (primary keys, raw audit ids,
    // system FKs) intentionally render raw and shouldn't trigger the warning.
    return isReferenceField
      ? formatRecordValueWithUuidSafetyNet(value, field)
      : formatRecordValue(value, field);
  }

  const code = readReferenceCode(record, field, value)
    ?? (!isReferenceField ? toNonBlankString(value) : null);
  return isReferenceField
    ? formatReferenceDisplay(label, code, field.display?.format)
    : formatLookupDisplay(label, code, field.display?.format);
}

export function hasResolvedFieldLabel(record: FieldRecord, field: MetaEntityField): boolean {
  const value = readRecordValue(record, field);
  return readReferenceLabel(record, field, value) !== null
    || (field.display?.renderer === "lookup_label" && readStaticOptionLabel(field, value) !== null);
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
  ]);
}

function readReferenceCode(record: FieldRecord, field: MetaEntityField, value: unknown): string | null {
  if (isRecord(value)) {
    return readStringValue(value, "code") ?? readStringValue(value, field.display?.valueField);
  }

  return readCompanionValue(record, field, [
    `${field.name}_code`,
    `${field.columnName}_code`,
  ]);
}

function readStaticOptionLabel(field: MetaEntityField, value: unknown): string | null {
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "static") {
    const selected = source.options.find((option) => option.value === String(value));
    return selected ? toNonBlankString(selected.label) : null;
  }
  if (source?.kind === "lifecycle") {
    const selected = source.options.find((option) => option.value === String(value))
      ?? source.fallbackOptions.find((option) => option.value === String(value));
    if (selected) return toNonBlankString(selected.label);
    reportLifecycleLabelMiss(field, value);
  }
  return null;
}

const reportedLifecycleLabelMisses = new Set<string>();

function reportLifecycleLabelMiss(field: MetaEntityField, value: unknown): void {
  const key = `${field.name}:${String(value)}`;
  if (reportedLifecycleLabelMisses.has(key)) return;
  reportedLifecycleLabelMisses.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[lifecycle-label-missing] field "${field.name}" has no label for state "${String(value)}"; `
    + "rendering the stored code. Verify the entity lifecycle binding and lifecycle_state.name.",
  );
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

function formatReferenceDisplay(label: string, code: string | null, format: string | undefined): string {
  if (!code || code === label) return label;
  if (format === "label") return label;
  if (format === "code") return code;
  if (format === "code_label") return `${code} - ${label}`;
  if (format === "label_code") return `${label} (${code})`;
  return label;
}

function formatLookupDisplay(label: string, code: string | null, format: string | undefined): string {
  if (!code || code === label) return label;
  if (format === "code") return code;
  if (format === "code_label") return `${code} - ${label}`;
  if (format === "label_code") return `${label} (${code})`;
  return label;
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

// ── UUID safety net ─────────────────────────────────────────────────────────
//
// Last-line defense for reference fields whose descriptor never declared a
// `reference_label` renderer (or whose reference target failed to resolve).
// Rendering a raw UUID in a user-facing cell reads as a broken page; show
// a shortened form like "Ref: 019ee864" instead, and log a dev-only warning
// once per field so the underlying descriptor misconfig surfaces.
//
// Heuristic: triggers ONLY when (a) the value looks like a UUID and (b) the
// field looks reference-y (`data_type=uuid` or `name` ends in `_id`/`_by`).
// Plain UUID-typed columns that happen to surface raw (e.g. `id` in a
// debug view) are also caught — they would never read as useful to users.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const warnedUuidFields = new Set<string>();

function looksLikeReferenceField(field: MetaEntityField): boolean {
  return field.display?.renderer === "reference_label";
}

function formatRecordValueWithUuidSafetyNet(value: unknown, field: MetaEntityField): string {
  const base = formatRecordValue(value, field);
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return base;
  if (!looksLikeReferenceField(field)) return base;

  // One-shot dev warning per field name. The Set guard prevents repeat
  // logs across many rows of the same misconfigured field. Production
  // builds still log (cheap, never repeats) which helps when descriptor
  // drift sneaks past CI.
  if (!warnedUuidFields.has(field.name)) {
    warnedUuidFields.add(field.name);
    // eslint-disable-next-line no-console
    console.warn(
      `[descriptor-misconfig] field "${field.name}" rendered as raw UUID — `
      + `set display.renderer="reference_label" + reference_config.label_field on its entity_field row.`,
    );
  }

  return `Ref: ${value.slice(0, 8)}`;
}

export function formatRecordTitle(value: unknown, field: MetaEntityField): string | undefined {
  const temporalTitle = formatTemporalTitle(value, field);
  if (temporalTitle) return temporalTitle;

  const displayValue = formatRecordValue(value, field);
  return displayValue === "-" ? undefined : displayValue;
}

type TemporalDisplayKind = "date" | "datetime" | "zonedDateTime";

function formatTemporalValue(value: unknown, field: MetaEntityField): string | null {
  const kind = resolveTemporalDisplayKind(value, field);
  if (!kind) return null;

  if (kind === "zonedDateTime") {
    if (!isZonedDateTimeValue(value)) return null;
    try {
      return formatZonedDateTime(value, { locale: "en-GB", showZone: true });
    } catch {
      return null;
    }
  }

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
  const kind = resolveTemporalDisplayKind(value, field);
  if (!kind) return null;

  if (kind === "zonedDateTime") {
    return isZonedDateTimeValue(value)
      ? `Zone: ${value.timeZone}; local time: ${value.localDateTime}`
      : null;
  }

  const original = typeof value === "string" ? value.trim() : "";
  if (original && isDateOnlyText(original)) return `Date: ${original}`;

  const date = parseTemporalDate(value);
  return date ? `UTC: ${date.toISOString()}` : null;
}

function resolveTemporalDisplayKind(value: unknown, field: MetaEntityField): TemporalDisplayKind | null {
  const resolution = resolveTemporalKind(field);
  if (resolution.status === "resolved") {
    if (resolution.kind === "businessDate") return "date";
    if (resolution.kind === "zonedDateTime") return "zonedDateTime";
    return resolution.displayMode === "date" ? "date" : "datetime";
  }

  return null;
}

function isZonedDateTimeValue(value: unknown): value is { localDateTime: string; timeZone: string } {
  return isRecord(value)
    && typeof value["localDateTime"] === "string"
    && typeof value["timeZone"] === "string";
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
