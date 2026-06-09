import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type { EntityPrintConfig } from "@athyper/runtime-contracts";

const ALWAYS_EXCLUDED = new Set([
  "id", "tenant_id", "row_version", "sync_token", "import_ref", "legacy_ref",
]);

const EXCLUDED_DATA_TYPES = new Set(["lifecycle_state"]);

export function isPrintExcluded(
  field: EntityField,
  entity: Pick<CompiledEntity, "data_policy">,
): boolean {
  if (ALWAYS_EXCLUDED.has(field.name)) return true;
  if (field.origin === "system") return true;
  if (EXCLUDED_DATA_TYPES.has(field.data_type)) return true;
  // is_pii is hardcoded false in entity-compiler — use data_policy.pii_fields instead
  const piiFields = entity.data_policy?.pii_fields ?? [];
  if (piiFields.includes(field.name)) return true;
  const hideIn = (field.ui_hint as Record<string, unknown> | undefined)?.["display"] as Record<string, unknown> | undefined;
  const hideInArr = hideIn?.["hide_in"] as string[] | undefined;
  if (hideInArr?.includes("print")) return true;
  // UUID foreign key with no reference_config would show raw UUID — exclude
  if (field.data_type === "uuid" && !field.reference_config) return true;
  return false;
}

export function getFieldDisplayLabel(
  field: EntityField,
  printConfig: EntityPrintConfig | undefined,
): string {
  return printConfig?.field_label_overrides?.[field.name] ?? field.label ?? field.name;
}

export function getGroupDisplayLabel(
  groupKey: string,
  defaultLabel: string,
  printConfig: EntityPrintConfig | undefined,
): string {
  return printConfig?.group_label_overrides?.[groupKey] ?? defaultLabel;
}
