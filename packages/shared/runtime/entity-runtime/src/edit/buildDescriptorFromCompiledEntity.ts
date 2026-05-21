/**
 * buildDescriptorFromCompiledEntity — derives an EntityViewDescriptor from
 * the compiled entity metadata snapshot.
 *
 * This is the zero-config Tier 1 path for all 1000+ entities in the registry.
 * No static descriptor files are needed — the metadata API drives everything.
 *
 *   edit.fields    ← resolveFormConfig() → editable non-system fields
 *   identity       ← identity_config + display_config (business key, title, status)
 *   audit          ← display_config.document_header audit fields
 *   hasLifecycle   ← feature_flags.has_lifecycle
 */

import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { resolveFormConfig } from "@athyper/metadata-client/compiled-reader";
import {
  configuredAuditFieldNames,
  configuredCodeFieldName,
  configuredStatusFieldNames,
  configuredTitleFieldName,
  editableEntityField,
} from "../metadata/fieldSemantics";
import type {
  EntityViewDescriptor,
  EntityAuditDescriptor,
  EntityEditFieldDescriptor,
} from "@athyper/runtime-shared/descriptors";

// ── Input type mapping ────────────────────────────────────────────────────────

const NUMERIC_DATA_TYPES = new Set(["integer", "bigint", "decimal", "numeric", "money"]);
const DATE_DATA_TYPES    = new Set(["date", "datetime", "timestamptz"]);

function dataTypeToInputType(field: EntityField): EntityEditFieldDescriptor["inputType"] {
  if (field.ui_type === "email")                return "email";
  if (field.data_type === "text")               return "textarea";
  if (DATE_DATA_TYPES.has(field.data_type))     return "date";
  if (NUMERIC_DATA_TYPES.has(field.data_type))  return "number";
  return "text";
}

// ── Max-length extraction from validation_rules ───────────────────────────────

function extractMaxLength(field: EntityField): number | undefined {
  if (!field.validation_rules) return undefined;
  const ml = field.validation_rules["max_length"];
  return typeof ml === "number" ? ml : undefined;
}

// ── Title-case helper for field names without labels ─────────────────────────

function toTitleCase(fieldName: string): string {
  return fieldName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Identity field detection ──────────────────────────────────────────────────

function detectNumberField(entity: CompiledEntity): string {
  const configured = configuredCodeFieldName(entity) ?? configuredTitleFieldName(entity);
  if (configured) return configured;

  const first = entity.fields.find(editableEntityField);
  return first?.name ?? "id";
}

function detectStatusField(entity: CompiledEntity): string | undefined {
  return configuredStatusFieldNames(entity)[0];
}

// ── Audit descriptor detection ────────────────────────────────────────────────

function detectAuditFields(entity: CompiledEntity): EntityAuditDescriptor | undefined {
  const configured = configuredAuditFieldNames(entity);
  const audit: EntityAuditDescriptor = {};
  if (configured.createdAt)       audit.createdAtField       = configured.createdAt;
  if (configured.createdBy)       audit.createdByField       = configured.createdBy;
  if (configured.updatedAt)       audit.updatedAtField       = configured.updatedAt;
  if (configured.updatedBy)       audit.updatedByField       = configured.updatedBy;
  if (configured.statusChangedAt) audit.statusChangedAtField = configured.statusChangedAt;
  if (configured.statusChangedBy) audit.statusChangedByField = configured.statusChangedBy;

  return Object.keys(audit).length > 0 ? audit : undefined;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildDescriptorFromCompiledEntity(
  entity: CompiledEntity,
): EntityViewDescriptor {
  const dh       = entity.display_config.document_header;
  const formConfig = resolveFormConfig(entity);

  const editableFields: EntityEditFieldDescriptor[] = formConfig.sections
    .flatMap((s) => s.fields)
    .map((f): EntityEditFieldDescriptor => ({
      name:      f.name,
      label:     f.label ?? toTitleCase(f.name),
      editable:  true,
      inputType: dataTypeToInputType(f),
      required:  f.is_required || undefined,
      maxLength: extractMaxLength(f),
    }));

  return {
    entityCode: entity.entity_code,

    identity: {
      typeLabel:    entity.entity_name,
      numberField:  detectNumberField(entity),
      statusField:  detectStatusField(entity),
      titleField:   configuredTitleFieldName(entity),
      partyIdField: dh?.party_id_field,
    },

    hasLifecycle: entity.feature_flags?.has_lifecycle ?? false,
    audit:        detectAuditFields(entity),

    edit: editableFields.length > 0 ? { fields: editableFields } : undefined,
  };
}
