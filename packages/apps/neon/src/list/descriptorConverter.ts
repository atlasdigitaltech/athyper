import type { MetaEntityRuntimeDescriptor, MetaEntityField } from "@athyper/runtime-contracts";
import type {
  RuntimeColumnAggregation,
  RuntimeDescriptor,
  RuntimeFieldDisplay,
  RuntimeFieldEditor,
  RuntimeFieldFilter,
  RuntimeFilterKind,
  RuntimeFilterOperator,
  RuntimeFilterOption,
  RuntimeFilterOptionSource,
  RuntimeListPresentationConfig,
  RuntimeScopeFieldRole,
  ViewMode,
} from "@athyper/runtime-list/core";

// Converts the neon-plane MetaEntityRuntimeDescriptor (product type) to the
// shared RuntimeDescriptor (no product imports). This is the ONLY file in the
// codebase where this conversion lives.

// Mirrors isSensitiveFieldName from apps/neon/lib/server/meta-entity-write-validation.ts.
// Must stay in sync if that set is expanded.
const SENSITIVE_NAME_RE = /(^|_)(ssn|sin|tax_id|tin|pan|aadhaar|passport|bank_account|iban|swift|routing_number|secret|password|token|credential)($|_)/;
const B5_VIEW_MODE: Record<string, ViewMode> = {
  table:       "list",
  compact:     "compact",
  kanban:      "board",
  dashboard:   "dashboard",
  spreadsheet: "excel",
};
const AGGREGATIONS = new Set(["sum", "count", "avg", "min", "max"]);
const LIST_VISIBILITY_SURFACES = new Set([
  "all",
  "list",
  "table",
  "grid",
  "runtime_list",
  "runtime-list",
  "compact",
  "excel",
  "spreadsheet",
]);

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase();
  // Also normalize camelCase → snake_case so names like bankAccountNumber, ibanCode,
  // passwordHash all match the snake_case terms in SENSITIVE_NAME_RE.
  const snaked = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).toLowerCase();
  return SENSITIVE_NAME_RE.test(lower) || SENSITIVE_NAME_RE.test(snaked);
}

// Returns true when the field's visibility JSON marks it read-denied under field security.
function isReadDenied(field: MetaEntityField): boolean {
  const vis = field.visibility;
  if (!vis || typeof vis !== "object" || Array.isArray(vis)) return false;
  return (
    vis["secured"]      === true ||
    vis["readDenied"]   === true ||
    vis["read_denied"]  === true
  );
}

function isListHidden(field: MetaEntityField): boolean {
  const raw = field as MetaEntityField & Record<string, unknown>;
  const visibility = asRecord(raw["visibility"]);
  const uiHint = asRecord(raw["uiHint"] ?? raw["ui_hint"]);
  const uiDisplay = asRecord(uiHint?.["display"]);
  return isListHiddenByVisibility(visibility) ||
    isListHiddenByVisibility(uiHint) ||
    isListHiddenByVisibility(uiDisplay);
}

function isListHiddenByVisibility(visibility: Record<string, unknown> | null): boolean {
  if (!visibility) return false;
  if (
    visibility["hidden"] === true ||
    visibility["isHidden"] === true ||
    visibility["is_hidden"] === true ||
    visibility["visible"] === false
  ) {
    return true;
  }

  const hideIn = readVisibilitySurfaces(visibility["hideIn"] ?? visibility["hide_in"]);
  if (hideIn.some(isListVisibilitySurface)) return true;

  const showIn = readVisibilitySurfaces(visibility["showIn"] ?? visibility["show_in"]);
  return showIn.length > 0 && !showIn.some(isListVisibilitySurface);
}

function readVisibilitySurfaces(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map(normalizeVisibilitySurface).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value.map(normalizeVisibilitySurface).filter(Boolean);
}

function normalizeVisibilitySurface(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_")
    : "";
}

function isListVisibilitySurface(surface: string): boolean {
  return LIST_VISIBILITY_SURFACES.has(surface);
}

function readFieldPii(meta: MetaEntityRuntimeDescriptor, field: MetaEntityField): boolean {
  const raw = field as MetaEntityField & Record<string, unknown>;
  const explicit = readBoolean(raw["isPii"]) ?? readBoolean(raw["is_pii"]);
  if (explicit === true) return true;

  const dataPolicy = readDataPolicy(meta);
  const piiFields = readStringArray(dataPolicy?.["pii_fields"] ?? dataPolicy?.["piiFields"]) ?? [];
  if (piiFields.includes(field.name) || piiFields.includes(field.columnName)) return true;

  return isSensitiveName(field.name);
}

function readDataPolicy(meta: MetaEntityRuntimeDescriptor): Record<string, unknown> | null {
  const raw = meta as MetaEntityRuntimeDescriptor & Record<string, unknown>;
  return asRecord(meta.extensions?.["dataPolicy"]) ??
    asRecord(meta.extensions?.["data_policy"]) ??
    asRecord(raw["dataPolicy"]) ??
    asRecord(raw["data_policy"]);
}

function readFieldSemanticRole(field: MetaEntityField): string | undefined {
  const raw = field as MetaEntityField & Record<string, unknown>;
  return readString(raw["semanticRole"] ?? raw["semantic_role"]);
}

function readFieldScopeRole(field: MetaEntityField): RuntimeScopeFieldRole | undefined {
  const raw = field as MetaEntityField & Record<string, unknown>;
  const display = asRecord(raw["display"]);
  const visibility = asRecord(raw["visibility"]);
  const value = readString(
    raw["scopeRole"] ??
    raw["scope_role"] ??
    display?.["scopeRole"] ??
    display?.["scope_role"] ??
    visibility?.["scopeRole"] ??
    visibility?.["scope_role"],
  );
  return normalizeScopeRole(value);
}

function normalizeScopeRole(value: string | undefined): RuntimeScopeFieldRole | undefined {
  if (
    value === "tenant" ||
    value === "legalEntity" ||
    value === "businessEntity" ||
    value === "companyCode" ||
    value === "buyerOrg" ||
    value === "supplierOrg"
  ) {
    return value;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStaticOptions(field: MetaEntityField): RuntimeFilterOption[] | undefined {
  const optionSource = field.editor?.optionSource ?? field.optionSource;
  if (optionSource?.kind !== "static") return undefined;
  const options = optionSource.options
    .map((option) => ({
      value: readString(option.value) ?? "",
      label: readString(option.label) ?? readString(option.value) ?? "",
      description: readString(option.description),
      disabled: readBoolean(option.disabled),
    }))
    .filter((option) => option.value && option.label);
  return options.length > 0 ? options : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map(readString)
    .filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readAggregation(value: unknown): RuntimeColumnAggregation | null | undefined {
  if (value === null) return null;
  const raw = readString(value);
  return raw && AGGREGATIONS.has(raw) ? raw as RuntimeColumnAggregation : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readFieldFilterConfig(field: MetaEntityField): Record<string, unknown> | null {
  const raw = field as MetaEntityField & Record<string, unknown>;
  return asRecord(raw["filterConfig"]) ?? asRecord(raw["filter_config"]);
}

function readValueLabelMap(filterConfig: Record<string, unknown> | null): Record<string, string> | undefined {
  const raw = asRecord(filterConfig?.["valueLabelMap"]) ?? asRecord(filterConfig?.["value_label_map"]);
  if (!raw) return undefined;
  const entries = Object.entries(raw)
    .map(([key, value]) => [key, readString(value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readRuntimeFieldEditor(field: MetaEntityField): RuntimeFieldEditor | undefined {
  const editor = field.editor;
  return editor
    ? {
        control: editor.control,
        allowClear: readBoolean(editor.allowClear),
        placeholder: readString(editor.placeholder),
        search: readBoolean(editor.search),
      }
    : undefined;
}

function readRuntimeFieldDisplay(field: MetaEntityField): RuntimeFieldDisplay | undefined {
  const display = field.display;
  return display
    ? {
        renderer: display.renderer,
        fallback: readString(display.fallback),
        format: readString(display.format),
        valueField: readString(display.valueField),
        labelField: readString(display.labelField),
      }
    : undefined;
}

function readRuntimeFilterOptionSource(field: MetaEntityField): RuntimeFilterOptionSource | undefined {
  const source = field.editor?.optionSource ?? field.optionSource;
  if (!source || source.kind === "none") return undefined;
  if (source.kind === "static") {
    return {
      kind: "static",
      options: readStaticOptions(field) ?? [],
    };
  }
  if (source.kind === "lookup") {
    return {
      kind: "lookup",
      domainCode: source.domainCode,
      valueField: source.valueField,
      includeInactive: source.includeInactive,
    };
  }
  return {
    kind: "reference",
    entity: source.entity,
    valueField: source.valueField,
    labelField: source.labelField,
    codeField: source.codeField,
    descriptionField: source.descriptionField,
    includeInactive: source.includeInactive,
  };
}

function toRuntimeFieldFilter(field: MetaEntityField): RuntimeFieldFilter {
  const filterConfig = readFieldFilterConfig(field);
  const optionSource = readRuntimeFilterOptionSource(field);
  const explicitKind = normalizeFilterKind(readString(filterConfig?.["kind"]) ?? readString(filterConfig?.["control_type"]));
  const kind = explicitKind ?? inferFilterKind(field, optionSource);
  const sectionKey = readString(filterConfig?.["section_key"]) ?? readString(filterConfig?.["sectionKey"]);
  const sectionLabel = readString(filterConfig?.["section_label"]) ?? readString(filterConfig?.["sectionLabel"]);
  const sectionOrder = readNumber(filterConfig?.["section_order"]) ?? readNumber(filterConfig?.["sectionOrder"]);
  const operators = readFilterOperators(filterConfig) ?? defaultFilterOperators(kind);

  return {
    kind,
    operators,
    optionSource,
    placeholder: readString(filterConfig?.["placeholder"]) ?? field.editor?.placeholder,
    quick: readBoolean(filterConfig?.["quick_filter"]) ?? readBoolean(filterConfig?.["quickFilter"]) ?? undefined,
    quickLabel: readString(filterConfig?.["quick_label"]) ?? readString(filterConfig?.["quickLabel"]),
    quickOrder: readNumber(filterConfig?.["quick_order"]) ?? readNumber(filterConfig?.["quickOrder"]),
    valueLabelMap: readValueLabelMap(filterConfig),
    section: sectionKey
      ? {
          key: sectionKey,
          label: sectionLabel ?? titleLabel(sectionKey),
          order: sectionOrder,
        }
      : undefined,
  };
}

function readFilterOperators(filterConfig: Record<string, unknown> | null): RuntimeFilterOperator[] | undefined {
  const raw = filterConfig?.["operators"];
  if (!Array.isArray(raw)) return undefined;
  const operators = raw
    .map((value) => normalizeFilterOperator(readString(value)))
    .filter((value): value is RuntimeFilterOperator => Boolean(value));
  return operators.length > 0 ? [...new Set(operators)] : undefined;
}

function normalizeFilterOperator(value: string | undefined): RuntimeFilterOperator | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized === "eq" ||
    normalized === "contains" ||
    normalized === "in" ||
    normalized === "not_in" ||
    normalized === "gt" ||
    normalized === "lt" ||
    normalized === "gte" ||
    normalized === "lte" ||
    normalized === "between" ||
    normalized === "relative" ||
    normalized === "empty" ||
    normalized === "not_empty"
  ) {
    return normalized;
  }
  if (normalized === "is_null") return "empty";
  if (normalized === "is_not_null") return "not_empty";
  return undefined;
}

function normalizeFilterKind(value: string | undefined): RuntimeFilterKind | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized === "text" ||
    normalized === "number" ||
    normalized === "money" ||
    normalized === "boolean" ||
    normalized === "date" ||
    normalized === "datetime" ||
    normalized === "enum" ||
    normalized === "lookup" ||
    normalized === "reference" ||
    normalized === "json" ||
    normalized === "presence"
  ) {
    return normalized;
  }
  if (normalized === "select" || normalized === "multi_select" || normalized === "multiselect") return "enum";
  if (normalized === "combobox") return "lookup";
  if (normalized === "reference_picker" || normalized === "entity_picker") return "reference";
  if (normalized === "checkbox") return "boolean";
  return undefined;
}

function inferFilterKind(
  field: MetaEntityField,
  optionSource: RuntimeFilterOptionSource | undefined,
): RuntimeFilterKind {
  if (optionSource?.kind === "reference") return "reference";
  if (optionSource?.kind === "lookup") return "lookup";
  if (optionSource?.kind === "static") return "enum";

  const control = field.editor?.control;
  if (control === "reference_picker") return "reference";
  if (control === "combobox") return "lookup";
  if (control === "select") return "enum";
  if (control === "checkbox") return "boolean";
  if (control === "date") return "date";
  if (control === "datetime") return "datetime";
  if (control === "number") return field.display?.renderer === "money" ? "money" : "number";
  if (control === "json") return "json";

  const dataType = field.dataType.toLowerCase();
  if (dataType === "boolean" || dataType === "bool") return "boolean";
  if (dataType === "date") return "date";
  if (dataType === "datetime" || dataType === "timestamp" || dataType === "timestamptz") return "datetime";
  if (["integer", "bigint", "decimal", "numeric", "number"].includes(dataType)) return "number";
  if (dataType === "money") return "money";
  if (dataType === "enum" || dataType === "lifecycle_state") return "enum";
  if (dataType === "json" || dataType === "jsonb") return "json";
  return "text";
}

function defaultFilterOperators(kind: RuntimeFilterKind): RuntimeFilterOperator[] {
  if (kind === "date" || kind === "datetime") return ["relative", "between", "gte", "lte", "empty", "not_empty"];
  if (kind === "number" || kind === "money") return ["between", "gte", "lte", "eq", "empty", "not_empty"];
  if (kind === "boolean") return ["eq", "empty", "not_empty"];
  if (kind === "enum" || kind === "lookup" || kind === "reference") return ["in", "not_in", "empty", "not_empty"];
  if (kind === "json" || kind === "presence") return ["empty", "not_empty"];
  return ["contains", "eq", "empty", "not_empty"];
}

function titleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readDisplayConfig(meta: MetaEntityRuntimeDescriptor): Record<string, unknown> | null {
  return asRecord(meta.extensions?.["displayConfig"]);
}

function mapViewMode(value: unknown): ViewMode | undefined {
  const raw = readString(value);
  return raw ? B5_VIEW_MODE[raw] : undefined;
}

function readViewModes(displayConfig: Record<string, unknown> | null): ViewMode[] | undefined {
  const raw = displayConfig?.["view_modes"];
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 1 && readString(raw[0]) === "table") return undefined;
  const modes = raw
    .map(mapViewMode)
    .filter((mode): mode is ViewMode => Boolean(mode));
  return modes.length > 0 ? [...new Set(modes)] : undefined;
}

function readListPresentation(meta: MetaEntityRuntimeDescriptor): RuntimeListPresentationConfig | undefined {
  const displayConfig = readDisplayConfig(meta);
  if (!displayConfig) return undefined;

  const compactCard = asRecord(displayConfig["compact_card"]);
  const presentation: RuntimeListPresentationConfig = {
    defaultViewMode: mapViewMode(displayConfig["list_renderer"]),
    viewModes:       readViewModes(displayConfig),
    compact: {
      titleField:    readString(displayConfig["title_field"]),
      subtitleField: readString(displayConfig["subtitle_field"]),
      bottomFields:  readStringArray(compactCard?.["bottom_fields"]),
    },
  };

  const hasCompactConfig = Boolean(
    presentation.compact?.titleField ||
    presentation.compact?.subtitleField ||
    presentation.compact?.bottomFields?.length,
  );

  return {
    ...(presentation.defaultViewMode ? { defaultViewMode: presentation.defaultViewMode } : {}),
    ...(presentation.viewModes ? { viewModes: presentation.viewModes } : {}),
    ...(hasCompactConfig ? { compact: presentation.compact } : {}),
  };
}

function readFieldPresentation(field: MetaEntityField): Record<string, unknown> | null {
  const raw = field as MetaEntityField & Record<string, unknown>;
  return (
    asRecord(raw["presentation"]) ??
    asRecord(raw["listPresentation"]) ??
    asRecord(raw["columnPresentation"]) ??
    asRecord(field.display)
  );
}

function readColumnFlag(field: MetaEntityField, camelKey: string, snakeKey: string): boolean | undefined {
  const presentation = readFieldPresentation(field);
  return readBoolean(presentation?.[camelKey]) ?? readBoolean(presentation?.[snakeKey]);
}

function readColumnAggregation(field: MetaEntityField): RuntimeColumnAggregation | null | undefined {
  const presentation = readFieldPresentation(field);
  return readAggregation(presentation?.["aggregation"]);
}

export function toRuntimeDescriptor(meta: MetaEntityRuntimeDescriptor): RuntimeDescriptor {
  const hasFieldSecurity = meta.policy.hasFieldSecurity;

  return {
    entityCode:   meta.entityCode,
    entityName:   meta.entityName,
    routeSlug:    meta.routeSlug,
    source: {
      tableSchema: meta.source.tableSchema,
      tableName:   meta.source.tableName,
    },
    capabilities: {
      canCreate: meta.capabilities?.canCreate ?? false,
    },
    listPresentation: readListPresentation(meta),
    fields: meta.fields.map((f) => ({
      name:          f.name,
      columnName:    f.columnName,
      label:         f.label,
      dataType:      f.dataType ?? "text",
      uiType:        f.uiType,
      options:       readStaticOptions(f),
      filter:        toRuntimeFieldFilter(f),
      editor:        readRuntimeFieldEditor(f),
      display:       readRuntimeFieldDisplay(f),
      semanticRole:  readFieldSemanticRole(f),
      scopeRole:     readFieldScopeRole(f),
      // Default-visible unless security or surface visibility hides it from list UIs.
      isVisible:     (hasFieldSecurity && isReadDenied(f)) || isListHidden(f) ? false : undefined,
      // Used by runtime-list guards to keep sensitive fields out of user-controlled surfaces.
      isPii:         readFieldPii(meta, f) ? true : undefined,
      isSearchable:  f.isSearchable ?? false,
      isFilterable:  f.isFilterable ?? false,
      isSortable:    f.isSortable ?? false,
      isGroupable:   f.isGroupable ?? false,
      isAggregatable:f.isAggregatable ?? false,
      compactVisible:readColumnFlag(f, "compactVisible", "compact_visible"),
      excelVisible:  readColumnFlag(f, "excelVisible", "excel_visible"),
      aggregation:   readColumnAggregation(f),
      order:         f.order ?? 0,
    })),
    operations: meta.operations
      .filter((op): op is typeof op & {
        surface:   "LIST" | "DETAIL" | "BOTH";
        placement: "PRIMARY" | "TOOLBAR" | "OVERFLOW";
      } => (
        (op.surface === "LIST" || op.surface === "DETAIL" || op.surface === "BOTH") &&
        (op.placement === "PRIMARY" || op.placement === "TOOLBAR" || op.placement === "OVERFLOW")
      ))
      .map((op) => ({
        key:             op.key,
        label:           op.label ?? undefined,
        permissionCode:  op.permissionCode,
        surface:         op.surface,
        placement:       op.placement,
        handlerType:     op.handlerType,
        handlerTarget:   op.handlerTarget ?? undefined,
        intent:          op.intent,
        enabled:         op.enabled,
        isRecordRequired:op.isRecordRequired,
        disabledReason:  op.disabledReason,
      })),
    extensions: meta.extensions as Record<string, unknown> | undefined,
  };
}
