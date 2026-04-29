/**
 * buildDescriptorFromCompiledEntity — derives an EntityViewDescriptor from
 * the compiled entity metadata snapshot.
 *
 * This is the zero-config Tier 1 path for all 1000+ entities in the registry.
 * No static descriptor files are needed — the metadata API drives everything.
 *
 *   edit.fields    ← resolveFormConfig() → editable non-system fields
 *   identity       ← display_config (title_field, document_header, status_field_names)
 *   audit          ← display_config.document_header audit fields or common column names
 *   hasLifecycle   ← feature_flags.has_lifecycle
 */

import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { resolveFormConfig } from "@athyper/metadata-client/compiled-reader";
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
  const ml = field.validation_rules["max_length"] ?? field.validation_rules["maxLength"];
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

// Generic identifier field names common across entity classes.
// DOCUMENT entities always have display_config.document_header.number_field set —
// these candidates only run for MASTER / REFERENCE / CONTROL entities.
const NUMBER_FIELD_CANDIDATES = ["document_no", "code", "number", "name"];

function detectNumberField(entity: CompiledEntity): string {
  const dh = entity.display_config.document_header;
  if (dh?.number_field) return dh.number_field;

  const fieldNames = new Set(entity.fields.map((f) => f.name));
  for (const candidate of NUMBER_FIELD_CANDIDATES) {
    if (fieldNames.has(candidate)) return candidate;
  }

  if (entity.display_config.title_field) return entity.display_config.title_field;

  const first = entity.fields.find((f) => f.origin !== "system" && !f.is_readonly);
  return first?.name ?? "id";
}

const STATUS_FIELD_CANDIDATES = [
  "status", "record_status", "lifecycle_state", "state",
  "approval_status", "workflow_status",
];

function detectStatusField(entity: CompiledEntity): string | undefined {
  const dh = entity.display_config.document_header;
  if (dh?.status_field) return dh.status_field;

  const names = entity.display_config.status_field_names;
  if (names?.length) return names[0];

  const fieldNames = new Set(entity.fields.map((f) => f.name));
  return STATUS_FIELD_CANDIDATES.find((c) => fieldNames.has(c));
}

// ── Audit descriptor detection ────────────────────────────────────────────────

function detectAuditFields(entity: CompiledEntity): EntityAuditDescriptor | undefined {
  const dh = entity.display_config.document_header;

  const audit: EntityAuditDescriptor = {};

  if (dh) {
    if (dh.created_at_field)         audit.createdAtField         = dh.created_at_field;
    if (dh.created_by_field)         audit.createdByField         = dh.created_by_field;
    if (dh.updated_at_field)         audit.updatedAtField         = dh.updated_at_field;
    if (dh.updated_by_field)         audit.updatedByField         = dh.updated_by_field;
    if (dh.status_changed_at_field)  audit.statusChangedAtField   = dh.status_changed_at_field;
    if (dh.status_changed_by_field)  audit.statusChangedByField   = dh.status_changed_by_field;
  } else {
    const fieldNames = new Set(entity.fields.map((f) => f.name));
    if (fieldNames.has("created_at")) audit.createdAtField = "created_at";
    if (fieldNames.has("created_by")) audit.createdByField = "created_by";
    if (fieldNames.has("updated_at")) audit.updatedAtField = "updated_at";
    if (fieldNames.has("updated_by")) audit.updatedByField = "updated_by";
  }

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
      titleField:   entity.display_config.title_field,
      partyIdField: dh?.party_id_field,
    },

    hasLifecycle: entity.feature_flags?.has_lifecycle ?? false,
    audit:        detectAuditFields(entity),

    edit: editableFields.length > 0 ? { fields: editableFields } : undefined,
  };
}
