import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";

type PlainRecord = Record<string, unknown>;

export interface EntityAuditFieldNames {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
}

function asRecord(value: unknown): PlainRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function uniqueFieldNames(names: unknown[]): string[] {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const name of names) {
    const fieldName = asString(name);
    if (!fieldName || seen.has(fieldName)) continue;
    seen.add(fieldName);
    fields.push(fieldName);
  }
  return fields;
}

export function displayConfigRecord(entity: CompiledEntity): PlainRecord {
  return asRecord(entity.display_config) ?? {};
}

export function identityConfigRecord(entity: CompiledEntity): PlainRecord {
  return asRecord(entity.identity_config) ?? {};
}

export function documentHeaderRecord(entity: CompiledEntity): PlainRecord {
  return asRecord(displayConfigRecord(entity).document_header) ?? {};
}

export function fieldByName(entity: CompiledEntity, fieldName?: string | null): EntityField | undefined {
  const name = asString(fieldName);
  return name ? entity.fields.find((field) => field.name === name) : undefined;
}

export function fieldValue(row: PlainRecord, field?: EntityField | null): unknown {
  if (!field) return undefined;
  return row[field.name] ?? (field.column_name ? row[field.column_name] : undefined);
}

export function fieldValueByName(
  entity: CompiledEntity,
  row: PlainRecord,
  fieldName?: string | null,
): unknown {
  return fieldValue(row, fieldByName(entity, fieldName));
}

export function configuredCodeFieldName(entity: CompiledEntity): string | undefined {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  const identityConfig = identityConfigRecord(entity);
  const businessKeyFields = asStringArray(identityConfig.business_key_fields);
  const naturalKeyFields = asStringArray(identityConfig.natural_key_fields)
    .filter((fieldName) => fieldName !== "tenant_id" && fieldName !== "id");
  return asString(documentHeader.number_field)
    ?? businessKeyFields[0]
    ?? naturalKeyFields[0]
    ?? asString(displayConfig.code_field);
}

export function configuredTitleFieldName(entity: CompiledEntity): string | undefined {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  return asString(displayConfig.title_field)
    ?? asString(documentHeader.title_field)
    ?? asString(documentHeader.name_field);
}

export function configuredSubtitleFieldName(entity: CompiledEntity): string | undefined {
  return asString(displayConfigRecord(entity).subtitle_field);
}

export function configuredPrimaryKeyFieldName(entity: CompiledEntity): string {
  return asString(identityConfigRecord(entity).primary_key_field) ?? "id";
}

export function configuredBusinessKeyFieldNames(entity: CompiledEntity): string[] {
  return uniqueFieldNames(asStringArray(identityConfigRecord(entity).business_key_fields));
}

export function configuredNaturalKeyFieldNames(entity: CompiledEntity): string[] {
  return uniqueFieldNames(asStringArray(identityConfigRecord(entity).natural_key_fields));
}

export function configuredStatusFieldNames(entity: CompiledEntity): string[] {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  const configured = uniqueFieldNames([
    documentHeader.status_field,
    ...asStringArray(displayConfig.status_field_names),
  ]);
  if (configured.length > 0) return configured;
  return entity.fields.some((field) => field.name === "status") ? ["status"] : [];
}

export function configuredAuditFieldNames(entity: CompiledEntity): EntityAuditFieldNames {
  const documentHeader = documentHeaderRecord(entity);
  return {
    createdAt:       asString(documentHeader.created_at_field),
    createdBy:       asString(documentHeader.created_by_field),
    updatedAt:       asString(documentHeader.updated_at_field),
    updatedBy:       asString(documentHeader.updated_by_field),
    statusChangedAt: asString(documentHeader.status_changed_at_field),
    statusChangedBy: asString(documentHeader.status_changed_by_field),
  };
}

export function configuredIdentityFieldNames(entity: CompiledEntity): string[] {
  return uniqueFieldNames([
    configuredPrimaryKeyFieldName(entity),
    configuredCodeFieldName(entity),
    configuredTitleFieldName(entity),
    configuredSubtitleFieldName(entity),
    ...configuredBusinessKeyFieldNames(entity),
    ...configuredNaturalKeyFieldNames(entity),
    ...configuredStatusFieldNames(entity),
  ]);
}

export function configuredListColumnNames(entity: CompiledEntity): string[] {
  return uniqueFieldNames(asStringArray(displayConfigRecord(entity).list_columns));
}

export function fieldSettingRecord(field: EntityField, key: string): PlainRecord | undefined {
  return asRecord(asRecord(field.ui_hint)?.[key]);
}

export function fieldHiddenInSurface(field: EntityField, surface: string): boolean {
  const display = fieldSettingRecord(field, "display");
  const hidden = asStringArray(display?.hide_in);
  return hidden.includes(surface);
}

export function fieldExcludedFromCopy(field: EntityField): boolean {
  const copy = fieldSettingRecord(field, "copy");
  const behavior = asString(copy?.behavior) ?? asString(asRecord(field.ui_hint)?.copy_behavior);
  const editability = asRecord(field.editability);
  const editableIn = Array.isArray(editability?.editable_in) ? editability.editable_in : undefined;
  return field.origin === "system"
    || field.is_readonly
    || field.is_computed === true
    || field.is_write_once === true
    || editability?.editable === false
    || (editableIn !== undefined && editableIn.length === 0)
    || behavior === "exclude";
}

export function editableEntityField(field: EntityField): boolean {
  return !fieldExcludedFromCopy(field) && field.data_type !== "lifecycle_state";
}
