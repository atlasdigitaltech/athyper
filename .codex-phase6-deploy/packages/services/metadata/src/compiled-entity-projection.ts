import {
  MetaEntityContractV2Schema,
  type MetaEntityContractV2,
} from "@athyper/api-contracts/meta-entity-contract-v2";
import {
  MetaEntityContractV21Schema,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";
import type { CompiledEntity } from "./entity-compiler.service.js";
import type { ExecutionDescriptorPlane } from "./execution-descriptor/provider.js";

/**
 * The only server-side source for runtime metadata after Phase B cutover.
 * EntityCompilerService satisfies this interface structurally, which keeps
 * route packages independent from the compiler's concrete implementation.
 */
export interface CompiledEntityProjectionProvider {
  loadRuntimeCompiledEntity(
    entityCode: string,
    tenantId: string,
    plane?: ExecutionDescriptorPlane,
  ): Promise<CompiledEntity | null>;
}

/**
 * Read the canonical contract and fail closed when a stale/legacy snapshot is
 * accidentally handed to a v2 consumer.  A compatibility adapter must be
 * explicit at the API boundary; runtime code must not silently reconstruct a
 * contract from legacy columns.
 */
export function readCompiledEntityContract(compiled: CompiledEntity): MetaEntityContractV2 {
  return MetaEntityContractV2Schema.parse(compiled.contract_v2);
}

export function readCompiledEntityContractV21(
  compiled: CompiledEntity,
): MetaEntityContractV21 | null {
  const parsed = MetaEntityContractV21Schema.safeParse(compiled.contract_v21);
  return parsed.success ? parsed.data : null;
}

/**
 * Build the public compiled-entity response from the one compiler output.
 * The properties outside `contract_v2` are response compatibility fields only;
 * they are never read from control.entity by this adapter.
 */
export function projectCompiledEntityResponse(compiled: CompiledEntity): Record<string, unknown> {
  const contract = readCompiledEntityContract(compiled);
  const version = contract.version_contract;
  const catalog = contract.catalog;
  const fields = projectLegacyFields(compiled, contract);
  const displayConfig = projectLegacyDisplayConfig(compiled, contract, fields);
  const legacyRelations = projectLegacyRelations(contract);
  const legacyIdentityConfig = projectLegacyIdentityConfig(contract);
  const legacySearchConfig = projectLegacySearchConfig(contract);
  const legacyDataPolicy = projectLegacyDataPolicy(contract);

  return {
    ...compiled,
    entity_id: catalog.id,
    entity_code: catalog.entity_code,
    slug: catalog.slug,
    entity_name: catalog.label_singular,
    entity_class: catalog.entity_class,
    create_mode: version.create_mode,
    draft_ttl_hours: version.draft_ttl_hours,
    numbering_strategy: compiled.numbering_strategy,
    table_schema: version.table_schema,
    table_name: version.table_name,
    backing_type: version.backing_type,
    runtime_enabled: version.runtime_enabled,
    primary_key: version.primary_key,
    tenant_column: version.tenant_column,
    read_capability: version.read_capability,
    write_capability: version.write_capability,
    concurrency_policy: version.concurrency_config,
    version_id: version.entity_version_id,
    version_hash: compiled.version_hash,
    fields,
    relations: legacyRelations,
    display_config: displayConfig,
    identity_config: legacyIdentityConfig,
    search_config: legacySearchConfig,
    data_policy: legacyDataPolicy,
    mutability: version.mutability === "immutable" ? "immutable" : "mutable",
    contract_v2: contract,
  };
}

/**
 * The public `/compiled` endpoint still has consumers using the historical
 * CompiledEntitySchema.  Keep that response shape as a derived adapter only;
 * the canonical v2 relation graph remains available under contract_v2.
 */
function projectLegacyRelations(contract: MetaEntityContractV2): unknown[] {
  return contract.relations.map((relation) => ({
    id: relation.id,
    name: relation.relation_code,
    relation_kind: relation.relation_kind,
    target_entity: relation.target_entity_code,
    resolution_kind: relation.resolution_kind,
    fk_field: relation.source_field,
    target_key: relation.target_field,
    source_type_field: relation.polymorphic_type_field ?? null,
    source_type_value: relation.polymorphic_type_value ?? null,
    source_id_field: relation.polymorphic_id_field ?? null,
    source_line_field: relation.source_line_field ?? null,
    runtime_role: relation.runtime_role ?? null,
    on_delete: relation.on_delete,
    record_filter: relation.record_filter,
  }));
}

function projectLegacyIdentityConfig(contract: MetaEntityContractV2): Record<string, unknown> {
  const identity = contract.version_contract.identity_config;
  const parent = identity.parent
    ? contract.relations.find((relation) => relation.relation_code === identity.parent?.relation)
    : undefined;
  const duplicate = identity.duplicate_check;

  return {
    primary_key_field: identity.primary_key_field,
    business_key_fields: identity.business_key_fields,
    natural_key_fields: identity.natural_key_fields,
    ...(identity.identity_via ? { identity_via: identity.identity_via } : {}),
    ...(identity.list_entity_code ? { list_entity_code: identity.list_entity_code } : {}),
    ...(parent ? {
      parent: {
        entity: parent.target_entity_code,
        ...(parent.source_field ? { field: parent.source_field } : {}),
        relation: parent.relation_code,
      },
    } : {}),
    duplicate_check: {
      fields: duplicate.fields,
      exact_fields: duplicate.fields,
      block_on_exact: duplicate.enabled,
    },
    ...(identity.replacement ? {
      replacement: { replacement_entity: identity.replacement.entity_code },
    } : {}),
  };
}

function projectLegacySearchConfig(contract: MetaEntityContractV2): Record<string, unknown> {
  const search = contract.version_contract.search_config;
  return {
    enabled: search.enabled,
    mode: search.mode,
    fields: search.fields.map((field) => field.field),
    rank: Object.fromEntries(search.fields.map((field) => [field.field, field.weight])),
    min_query_length: search.minimum_query_length,
    // The old schema only accepts `contains`; the canonical operator remains
    // authoritative under contract_v2 for v2-aware consumers.
    operator: "contains",
  };
}

function projectLegacyDataPolicy(contract: MetaEntityContractV2): Record<string, unknown> {
  const policy = contract.version_contract.data_policy;
  return {
    classification: policy.classification,
    pii_fields: policy.pii_fields,
    ...(policy.retention.days != null ? { retention_days: policy.retention.days } : {}),
    legal_hold_eligible: policy.retention.legal_hold_eligible,
    anonymize_on_delete: policy.deletion.anonymize,
  };
}

function projectLegacyFields(compiled: CompiledEntity, contract: MetaEntityContractV2): unknown[] {
  const contractFieldsByName = new Map(contract.fields.map((field) => [field.name, field]));
  const relationsByCode = new Map(contract.relations.map((relation) => [relation.relation_code, relation]));
  return compiled.fields.map((field) => {
    const canonical = contractFieldsByName.get(field.name);
    if (!canonical) return field;
    const result: Record<string, unknown> = { ...field, label: canonical.label, type_config: canonical.type_config };
    if (canonical.type_config.kind === "reference") {
      const relation = relationsByCode.get(canonical.type_config.relation);
      result["reference_config"] = {
        ...(field.reference_config ?? {}),
        relation: canonical.type_config.relation,
        target_entity: relation?.target_entity_code,
        target_field: relation?.target_field ?? "id",
        display_field: canonical.type_config.display.label_field,
        ...(canonical.type_config.display.code_field ? { code_field: canonical.type_config.display.code_field } : {}),
        ...(canonical.type_config.display.description_field ? { description_field: canonical.type_config.display.description_field } : {}),
      };
    }
    if (canonical.type_config.kind === "money") {
      result["money_config"] = {
        ...(field.money_config ?? {}),
        minor_units: canonical.type_config.minor_units,
        ...(canonical.type_config.currency.source === "field" && canonical.type_config.currency.field
          ? { currency_field: canonical.type_config.currency.field }
          : {}),
        ...(canonical.type_config.currency.source === "constant" && canonical.type_config.currency.code
          ? { currency_code: canonical.type_config.currency.code }
          : {}),
      };
    }
    return result;
  });
}

function projectLegacyDisplayConfig(
  compiled: CompiledEntity,
  contract: MetaEntityContractV2,
  fields: unknown[],
): Record<string, unknown> {
  const fieldNameById = new Map(contract.fields.map((field) => [field.id, field.name]));
  const listColumns = contract.surfaces
    .filter((surface) => surface.surface.is_enabled && ["list", "spreadsheet", "compact_card"].includes(surface.surface.mode))
    .sort((left, right) => left.surface.surface_key.localeCompare(right.surface.surface_key))
    .flatMap((surface) => surface.fields
      .filter((binding) => binding.visible)
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((binding) => fieldNameById.get(binding.entity_field_id)))
    .filter((name): name is string => Boolean(name));
  const identity = contract.version_contract.identity_config.display_identity;
  const result: Record<string, unknown> = {
    ...compiled.display_config,
    title_field: identity.title_field,
    subtitle_field: identity.subtitle_field,
    ...(listColumns.length > 0 ? { list_columns: [...new Set(listColumns)] } : {}),
  };
  const listSurface = contract.surfaces.find((surface) => surface.surface.mode === "list" && surface.surface.is_enabled);
  const features = listSurface?.surface.config.features;
  if (features) result["list_features"] = features;
  // Keep the adapter's field set aligned with the v2 registry even when a
  // legacy snapshot contains an inactive field that the contract excludes.
  const activeNames = new Set(contract.fields.filter((field) => field.runtime_enabled && !field.is_deprecated).map((field) => field.name));
  result["contract_field_count"] = fields.filter((field) => activeNames.has(String((field as Record<string, unknown>)["name"]))).length;
  return result;
}

export function compiledEntityContractHash(compiled: CompiledEntity): string {
  return compiled.compiled_hash;
}
