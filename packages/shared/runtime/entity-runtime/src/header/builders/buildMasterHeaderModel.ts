/**
 * buildMasterHeaderModel — shared header builder for the "master" page family.
 *
 * Used by both MasterDetailPage (simple + rich profiles). All identity field
 * slots are config-driven from display_config — no field-name hardcoding.
 */

import { adminStatusIntent } from "@athyper/theme/domain-intents";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import type { CompiledEntity, EntityField, EntityOperation } from "@athyper/api-contracts/metadata";
import type { EntityHeaderModel, HeaderAction, HeaderTab } from "../types";

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

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Config shape (minimal — rich detail comes from rich_master_config) ────────

export interface MasterHeaderConfig {
  type_label?:           string;
  classification_field?: string;
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
  const codeFieldName     = entity.display_config.code_field ?? "code";
  const titleFieldName    = entity.display_config.title_field;
  const subtitleFieldName = entity.display_config.subtitle_field;

  const codeNumber  = data[codeFieldName] ? String(data[codeFieldName]) : recordId;
  const entityName  = titleFieldName && data[titleFieldName]
    ? String(data[titleFieldName])
    : undefined;
  const description = subtitleFieldName &&
    data[subtitleFieldName] &&
    data[subtitleFieldName] !== data[titleFieldName ?? ""]
      ? String(data[subtitleFieldName])
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

  return {
    identity: {
      typeLabel,
      typeHref:         `/app/${entity.entity_code}`,
      number:           codeNumber,
      name:             entityName,
      classification,
      description,
      identifierAction: "copy",
      status: editMode
        ? editStatus
        : { label: titleCase(statusVal), intent: statusIntent },
    },
    actions,
    facts: undefined,
    tabs,
  };
}
