import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeContextDrawerEntity } from "./RuntimeContextDrawer";

/**
 * Project a runtime descriptor into the lightweight entity shape consumed
 * by `EntityContextDrawer` / `ContextDrawerHost`. Both record and document
 * workspaces feed the host through this helper so the drawer's identity
 * resolution stays consistent across the two surfaces.
 */
export function buildContextDrawerEntity(
  contract: MetaEntityRuntimeDescriptor,
): RuntimeContextDrawerEntity {
  const fields = contract.fields.map((field) => ({
    id: field.key,
    name: field.name,
    column_name: field.columnName,
    label: field.label,
    data_type: field.dataType,
    origin: field.origin,
    is_readonly: field.isReadOnly,
    is_computed: field.isComputed,
    is_write_once: field.isWriteOnce,
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
    field_groups: [],
    display_config: {
      code_field: firstExistingField(contract, ["code", "document_no", "number", "external_code"]),
      title_field: firstExistingField(contract, ["name", "display_name", "title"]),
      subtitle_field: firstExistingField(contract, ["description", "subtitle"]),
    },
    feature_flags: {
      has_attachments: contract.capabilities.hasAttachments,
      comments_enabled: contract.capabilities.hasComments,
      event_history: contract.capabilities.hasActivityLog,
      version_control: contract.capabilities.hasVersions,
    },
    governance_level: contract.policy.governanceLevel ?? "standard",
    security_tier: contract.policy.securityTier ?? "standard",
    mutability: contract.policy.mutability === "immutable" ? "immutable" : "mutable",
    compiled_at: contract.audit.compiledAt ?? "1970-01-01T00:00:00.000Z",
    compiled_hash: contract.audit.compiledHash ?? contract.audit.descriptorHash ?? "",
  } as unknown as RuntimeContextDrawerEntity;
}

function firstExistingField(
  contract: MetaEntityRuntimeDescriptor,
  candidates: string[],
): string | undefined {
  return candidates.find((candidate) => (
    contract.fields.some((field) => field.name === candidate || field.columnName === candidate)
  ));
}
