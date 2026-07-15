import type { PrintPreviewModalProps } from "@athyper/entity-print/modal";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

type PrintPreviewEntity = PrintPreviewModalProps["entity"];

export function buildPrintPreviewEntity(
  contract: MetaEntityRuntimeDescriptor,
): PrintPreviewEntity {
  const displayConfig = runtimeDisplayConfig(contract);
  const fields = contract.fields.map((field) => ({
    id: field.key,
    name: field.name,
    column_name: field.columnName,
    label: field.label,
    data_type: field.dataType,
    ui_type: field.uiType ?? field.dataType,
    origin: field.origin,
    sort_order: field.order,
    is_readonly: field.isReadOnly,
    is_computed: field.isComputed,
    is_write_once: field.isWriteOnce,
    reference_config: field.referenceConfig ?? (
      field.referenceEntity
        ? { ref_entity: field.referenceEntity }
        : undefined
    ),
  }));

  return {
    entity_id: contract.source.entityId ?? "00000000-0000-0000-0000-000000000000",
    entity_code: contract.entityCode,
    slug: contract.routeSlug,
    entity_name: contract.entityName,
    entity_class: contract.source.entityClass,
    table_schema: contract.source.tableSchema,
    table_name: contract.source.tableName,
    version_no: contract.source.versionNo ?? 0,
    version_hash: contract.source.versionHash ?? contract.audit.descriptorHash ?? "",
    fields,
    field_groups: printFieldGroups(contract, displayConfig),
    display_config: {
      ...displayConfig,
      code_field: displayConfig["code_field"] ?? firstExistingField(contract, ["code", "document_no", "number", "external_code"]),
      title_field: displayConfig["title_field"] ?? firstExistingField(contract, ["name", "display_name", "title"]),
      subtitle_field: displayConfig["subtitle_field"] ?? firstExistingField(contract, ["description", "subtitle"]),
    },
    identity_config: {
      business_key_fields: [firstExistingField(contract, ["code", "document_no", "number", "external_code"]) ?? "id"],
    },
    feature_flags: {},
    data_policy: {
      pii_fields: [],
    },
    governance_level: contract.policy.governanceLevel ?? "standard",
    security_tier: contract.policy.securityTier ?? "standard",
    mutability: contract.policy.mutability === "immutable" ? "immutable" : "mutable",
    compiled_at: contract.audit.compiledAt ?? "1970-01-01T00:00:00.000Z",
    compiled_hash: contract.audit.compiledHash ?? contract.audit.descriptorHash ?? "",
  } as unknown as PrintPreviewEntity;
}

function runtimeDisplayConfig(contract: MetaEntityRuntimeDescriptor): Record<string, unknown> {
  const displayConfig = contract.extensions?.["displayConfig"];
  return isRecord(displayConfig) ? displayConfig : {};
}

function printFieldGroups(
  contract: MetaEntityRuntimeDescriptor,
  displayConfig: Record<string, unknown>,
): Array<{ group_key: string; label: string; sort_order: number; fields: string[] }> {
  const printConfig = isRecord(displayConfig["print_config"]) ? displayConfig["print_config"] : {};
  const labelOverrides = isRecord(printConfig["group_label_overrides"]) ? printConfig["group_label_overrides"] : {};
  const groupOrder = Array.isArray(printConfig["group_order"])
    ? printConfig["group_order"].filter((item): item is string => typeof item === "string")
    : [];
  const groupOrderMap = new Map(groupOrder.map((key, index) => [key, index]));
  const grouped = new Map<string, { minOrder: number; fields: string[] }>();

  for (const field of contract.fields) {
    if (!field.groupKey) continue;
    const existing = grouped.get(field.groupKey) ?? { minOrder: field.order, fields: [] };
    existing.minOrder = Math.min(existing.minOrder, field.order);
    existing.fields.push(field.name);
    grouped.set(field.groupKey, existing);
  }

  return [...grouped.entries()]
    .sort(([aKey, a], [bKey, b]) => {
      const ai = groupOrderMap.get(aKey) ?? 999;
      const bi = groupOrderMap.get(bKey) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.minOrder - b.minOrder;
    })
    .map(([groupKey, group], index) => ({
      group_key: groupKey,
      label: typeof labelOverrides[groupKey] === "string" ? labelOverrides[groupKey] : toTitleLabel(groupKey),
      sort_order: groupOrderMap.get(groupKey) ?? group.minOrder ?? index,
      fields: group.fields,
    }));
}

function firstExistingField(
  contract: MetaEntityRuntimeDescriptor,
  candidates: string[],
): string | undefined {
  return candidates.find((candidate) => (
    contract.fields.some((field) => field.name === candidate || field.columnName === candidate)
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
