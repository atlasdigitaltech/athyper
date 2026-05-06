/**
 * buildMasterHeaderModel — shared header builder for the "master" page family.
 *
 * Used by both MasterDetailPage (simple + rich profiles). All identity field
 * slots are config-driven from display_config — no field-name hardcoding.
 */

import { adminStatusIntent } from "@athyper/theme/domain-intents";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import type { CompiledEntity, EntityField, EntityOperation, StatusDimensionConfig } from "@athyper/api-contracts/metadata";
import type { EntityHeaderModel, HeaderAction, HeaderFact, HeaderStatusDimension, HeaderTab } from "../types";
import { titleCase, fmtDateTime } from "@athyper/runtime-shared/core";

// ── Placement map: entity_operation.placement → HeaderAction.placement ────────

const PLACEMENT_MAP: Record<string, "primary" | "secondary" | "overflow" | "danger"> = {
  PRIMARY:  "primary",
  TOOLBAR:  "secondary",
  OVERFLOW: "overflow",
  CONTEXT:  "overflow",
  COMMAND:  "overflow",
};

// ── Action group classifier ───────────────────────────────────────────────────

const LIFECYCLE_VERBS = new Set([
  "activate", "deactivate", "block", "unblock", "archive", "unarchive",
  "reactivate", "suspend", "resume", "cancel", "void", "close", "reopen",
  "lock", "unlock", "freeze", "thaw", "discontinue", "terminate", "reinstate",
  "enable", "disable",
]);

const RECORD_VERBS = new Set([
  "copy", "duplicate", "export", "print", "new", "delete", "purge", "destroy",
]);

function classifyActionGroup(permissionCode: string): "lifecycle" | "record" | undefined {
  const code = permissionCode.toLowerCase();
  const stem = code.split("_")[0] ?? "";
  if (LIFECYCLE_VERBS.has(code) || LIFECYCLE_VERBS.has(stem)) return "lifecycle";
  if (RECORD_VERBS.has(code)    || RECORD_VERBS.has(stem))    return "record";
  return undefined;
}

// ── Value formatter (display only) ───────────────────────────────────────────

function formatDate(val: unknown): string {
  if (!val) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(String(val)));
  } catch {
    return String(val);
  }
}

export function formatValue(val: unknown, field?: EntityField): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const dt = field?.data_type;
  if (dt === "date" || dt === "datetime" || dt === "timestamptz") return formatDate(val);
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) return formatDate(val);
  if (dt === "enum" || dt === "lifecycle_state") return titleCase(String(val));
  return String(val);
}

// ── Facts rail builder ────────────────────────────────────────────────────────

const AMOUNT_TYPES = new Set(["decimal", "numeric", "integer", "money", "bigint"]);
const DATE_TYPES   = new Set(["date", "datetime", "timestamptz"]);
const ENUM_TYPES   = new Set(["enum", "lifecycle_state"]);

function formatFactValue(val: unknown, field: EntityField | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const dt = field?.data_type ?? "";
  if (AMOUNT_TYPES.has(dt)) {
    const n = typeof val === "number" ? val : Number(val);
    if (!Number.isNaN(n)) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    }
  }
  return formatValue(val, field);
}

function buildFactsRail(
  entity:     CompiledEntity,
  data:       Record<string, unknown>,
  fieldNames: string[] | undefined,
): HeaderFact[] | undefined {
  if (!fieldNames || fieldNames.length === 0) return undefined;

  const facts: HeaderFact[] = [];
  let firstAmountSeen = false;

  for (const fieldName of fieldNames) {
    const field    = entity.fields.find((f) => f.name === fieldName);
    const rawVal   = data[fieldName] ?? (field?.column_name ? data[field.column_name] : undefined);
    const dt       = field?.data_type ?? "";
    const isAmount = AMOUNT_TYPES.has(dt);
    const isDate   = DATE_TYPES.has(dt);
    const isEnum   = ENUM_TYPES.has(dt);

    const valueType: HeaderFact["valueType"] =
      isAmount ? "amount" : isDate ? "date" : isEnum ? "enum" : "text";

    const xl = isAmount && !firstAmountSeen ? true : undefined;
    if (isAmount) firstAmountSeen = true;

    facts.push({
      id:        fieldName,
      label:     field?.label ?? titleCase(fieldName),
      value:     formatFactValue(rawVal, field),
      valueType,
      xl,
    });
  }

  return facts.length > 0 ? facts : undefined;
}

// ── Config shape ──────────────────────────────────────────────────────────────

export interface MasterHeaderConfig {
  type_label?:           string;
  classification_field?: string;
  /** Field names to render as P2 KPI facts in the header (rich profile only). */
  header_facts?:         string[];
  /** Secondary boolean status dimensions for the P3 header strip. */
  status_dimensions?:    StatusDimensionConfig[];
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildMasterHeaderModel(
  entity:     CompiledEntity,
  data:       Record<string, unknown>,
  config:     MasterHeaderConfig,
  tabs:       HeaderTab[] | undefined,
  recordId:   string,
  operations: EntityOperation[] | undefined,
  editMode:   boolean,
  isDirty:    boolean,
): EntityHeaderModel {
  const statusField  = entity.display_config.status_field_names?.[0] ?? "status";
  const statusVal    = String(data[statusField] ?? "active").toLowerCase();
  const statusIntent = adminStatusIntent(statusVal);

  // Inline classification: driven by config.classification_field, no hardcoding
  const classField      = config.classification_field
    ? entity.fields.find((f) => f.name === config.classification_field)
    : undefined;
  const classRawVal     = config.classification_field
    ? (data[config.classification_field] ?? (classField?.column_name ? data[classField.column_name] : undefined))
    : undefined;
  const classification  = classRawVal ? formatValue(classRawVal, classField) : undefined;

  // P1 identity — all slots driven by display_config field pointers
  const codeFieldName  = entity.display_config.code_field ?? "code";
  const titleFieldName = entity.display_config.title_field;

  const codeNumber  = data[codeFieldName] ? String(data[codeFieldName]) : recordId;
  const entityName  = titleFieldName && data[titleFieldName]
    ? String(data[titleFieldName])
    : undefined;
  const typeLabel = config.type_label
    ?? entity.entity_name.toUpperCase().replace(/_/g, " ");

  const editStatus = isDirty
    ? { label: "Unsaved changes", intent: "warning" as SemanticIntent }
    : { label: "Editing",         intent: "info"    as SemanticIntent };

  let actions: HeaderAction[];
  if (editMode) {
    actions = isDirty
      ? [
          { id: "__save",    label: "Save",    placement: "primary",   order: 1 },
          { id: "__discard", label: "Discard", placement: "secondary", order: 2 },
        ]
      : [
          { id: "__exit", label: "Exit", placement: "secondary", order: 1 },
        ];
  } else {
    const detailOps = (operations ?? []).filter(
      (op) => op.surface === "DETAIL" || op.surface === "BOTH",
    );
    actions = detailOps.map((op) => ({
      id:        op.permission_code,
      label:     op.label_override ?? titleCase(op.permission_code),
      placement: PLACEMENT_MAP[op.placement] ?? "overflow",
      order:     op.sort_order,
      disabled:  !op.is_enabled,
      icon:      op.icon_override ?? undefined,
      group:     classifyActionGroup(op.permission_code),
    }));
  }

  // Status dimensions — resolve from current entity OR from any cross-entity field that
  // has been merged into data by the backend (e.g. supplier_qualification fields merged
  // into the supplier detail response).
  let statuses: HeaderStatusDimension[] | undefined;
  if (!editMode && config.status_dimensions && config.status_dimensions.length > 0) {
    const resolved: HeaderStatusDimension[] = [];
    for (const dim of config.status_dimensions) {
      const ownEntity = dim.source_entity === entity.entity_code || dim.source_entity === entity.entity_name;
      if (!ownEntity && !(dim.source_field in data)) {
        continue;
      }
      const rawVal = data[dim.source_field];
      if (rawVal === undefined || rawVal === null) continue;
      const boolVal = typeof rawVal === "boolean" ? rawVal : rawVal === "true" || rawVal === 1;
      resolved.push({
        id:     dim.id,
        label:  dim.label,
        value:  boolVal ? dim.true_label : dim.false_label,
        intent: (boolVal ? dim.true_intent : dim.false_intent) as SemanticIntent,
      });
    }
    if (resolved.length > 0) statuses = resolved;
  }

  return {
    identity: {
      typeLabel,
      typeHref:         `/app/${entity.entity_code}`,
      number:           codeNumber,
      name:             entityName,
      classification,
      identifierAction: "copy",
      status: editMode
        ? editStatus
        : { label: titleCase(statusVal), intent: statusIntent },
    },
    actions,
    facts:    editMode ? undefined : buildFactsRail(entity, data, config.header_facts),
    statuses,
    tabs,
  };
}
