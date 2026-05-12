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
  return asString(documentHeader.number_field)
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

export function configuredStatusFieldNames(entity: CompiledEntity): string[] {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  return uniqueFieldNames([
    documentHeader.status_field,
    ...asStringArray(displayConfig.status_field_names),
  ]);
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
    configuredCodeFieldName(entity),
    configuredTitleFieldName(entity),
    configuredSubtitleFieldName(entity),
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
  return field.origin === "system"
    || field.is_readonly
    || field.is_computed === true
    || behavior === "exclude";
}

export function editableEntityField(field: EntityField): boolean {
  return !fieldExcludedFromCopy(field) && field.data_type !== "lifecycle_state";
}

