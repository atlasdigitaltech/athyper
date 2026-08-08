import {
  MetaEntityContractV2Schema,
  type MetaEntityContractV2,
} from "./meta-entity-contract-v2";
import {
  DEFAULT_META_ENTITY_POLICY_V21,
  MetaEntityContractV21Schema,
  canonicalizeMetaEntityContractV21,
  type MetaEntityActionRuleV21Schema,
  type MetaEntityContractV21,
  type MetaEntityFlowV21,
  type MetaEntityLifecycleV21,
} from "./meta-entity-contract-v21";
import type { z } from "zod";

type ActionRuleV21 = z.infer<typeof MetaEntityActionRuleV21Schema>;

export interface MetaEntityContractV21UpgradeHydration {
  profileCode?: string | null;
  companyCodeById?: Readonly<Record<string, string>>;
  operationPlaneFilter?: Readonly<Record<string, Array<"neon" | "admin" | "mesh"> | null>>;
  actionRulesByOperation?: Readonly<Record<string, readonly ActionRuleV21[]>>;
  lifecycle?: MetaEntityLifecycleV21 | null;
  flows?: Readonly<Record<string, MetaEntityFlowV21>>;
  tenantOverlay?: MetaEntityContractV21["policy"]["tenant_overlay"];
  fieldSecurity?: MetaEntityContractV21["policy"]["field_security"];
  strictHydration?: boolean;
}

/**
 * Deterministic, namespace-local UUID for contract-owned projection rows.
 * It intentionally does not reuse database ids from v2.0.
 */
export function stableMetaEntityContractUuid(namespace: string, logicalPath: string): string {
  const input = `${namespace}\u0000${logicalPath}`;
  let left = BigInt("0x6a09e667f3bcc909");
  let right = BigInt("0xbb67ae8584caa73b");
  const mask = BigInt("0xffffffffffffffff");
  for (let index = 0; index < input.length; index += 1) {
    const code = BigInt(input.charCodeAt(index));
    left = ((left ^ code) * BigInt("0x100000001b3")) & mask;
    right =
      ((right ^ (code + BigInt(index))) * BigInt("0x9e3779b185ebca87")) &
      mask;
    left ^= right >> BigInt(29);
    right ^= left << BigInt(17);
  }
  const hex = `${left.toString(16).padStart(16, "0")}${right.toString(16).padStart(16, "0")}`
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function requireHydration(
  strict: boolean,
  present: boolean,
  path: string,
): void {
  if (strict && !present) {
    throw new Error(`Contract v2.1 upgrade requires hydration for '${path}'.`);
  }
}

export function upgradeMetaEntityContractV20ToV21(
  input: unknown,
  hydration: MetaEntityContractV21UpgradeHydration = {},
): MetaEntityContractV21 {
  const source = MetaEntityContractV2Schema.parse(input);
  const strict = hydration.strictHydration !== false;
  const namespace = source.catalog.entity_code;
  const fieldIds = new Map(source.fields.map((field) => [
    field.id,
    stableMetaEntityContractUuid(namespace, `fields/${field.name}`),
  ]));

  for (const operation of source.operations) {
    requireHydration(
      strict,
      Object.prototype.hasOwnProperty.call(hydration.operationPlaneFilter ?? {}, operation.operation_code),
      `operations.${operation.operation_code}.plane_filter`,
    );
    requireHydration(
      strict,
      Object.prototype.hasOwnProperty.call(hydration.actionRulesByOperation ?? {}, operation.operation_code),
      `operations.${operation.operation_code}.action_rules`,
    );
  }
  if (source.lifecycle) requireHydration(strict, hydration.lifecycle !== undefined, "lifecycle");
  for (const flow of source.flows) {
    requireHydration(
      strict,
      Object.prototype.hasOwnProperty.call(hydration.flows ?? {}, flow.flow_code),
      `flows.${flow.flow_code}`,
    );
  }

  const contract: MetaEntityContractV21 = {
    contract_schema_version: "2.1",
    catalog: {
      module_code: source.catalog.module_id,
      entity_code: source.catalog.entity_code,
      slug: source.catalog.slug,
      entity_class: source.catalog.entity_class,
      profile_code: hydration.profileCode ?? null,
      ownership_model: source.catalog.ownership_model,
      labels: {
        singular: source.catalog.label_singular,
        plural: source.catalog.label_plural,
        description: source.catalog.description ?? null,
      },
      presentation: {
        icon_key: source.catalog.icon_key ?? null,
        color_token: source.catalog.color_token ?? null,
      },
      plane_eligibility: source.catalog.plane_eligibility,
      enabled: source.catalog.is_active,
    },
    runtime: {
      catalog_enabled: true,
      runtime_enabled: source.version_contract.runtime_enabled,
      api_exposure: source.version_contract.api_exposure,
      storage: {
        backing_type: source.version_contract.backing_type,
        table_schema: source.version_contract.table_schema,
        table_name: source.version_contract.table_name,
        key_strategy: source.version_contract.primary_key ? "single" : "none",
        primary_key: source.version_contract.primary_key ?? null,
        tenant_column: source.version_contract.tenant_column,
      },
      capabilities: {
        read: source.version_contract.read_capability,
        write: source.version_contract.write_capability,
        read_handler: source.version_contract.read_handler ?? null,
        write_handler: source.version_contract.write_handler ?? null,
      },
      create_mode: source.version_contract.create_mode,
      draft_ttl_hours: source.version_contract.draft_ttl_hours,
      governance_level: source.version_contract.governance_level,
      security_tier: source.version_contract.security_tier,
      mutability: source.version_contract.mutability,
      identity: source.version_contract.identity_config,
      search: source.version_contract.search_config,
      data_policy: source.version_contract.data_policy,
      concurrency: source.version_contract.concurrency_config,
      storage_config: source.version_contract.storage_config,
    },
    fields: source.fields.map((field) => ({
      id: fieldIds.get(field.id)!,
      name: field.name,
      column_name: field.column_name,
      projection_alias_of: field.projection_alias_of ?? null,
      label: field.label,
      description: field.description ?? null,
      data_type: field.data_type,
      cardinality: field.cardinality,
      origin: field.origin,
      required: field.is_required,
      unique: field.is_unique,
      unique_scope: field.unique_scope,
      read_only: field.is_read_only,
      deprecated: field.is_deprecated,
      computed: field.is_computed,
      write_once: field.is_write_once,
      runtime_enabled: field.runtime_enabled,
      compute: field.compute_mode && field.compute_expr
        ? { mode: field.compute_mode, expression: field.compute_expr }
        : null,
      default_value: field.default_value,
      defaults: field.defaults ?? null,
      capabilities: {
        filterable: field.is_filterable,
        sortable: field.is_sortable,
        groupable: field.is_groupable,
        aggregatable: field.is_aggregatable,
      },
      semantic_roles: field.semantic_roles,
      type_config: field.type_config,
    })),
    relations: source.relations.map((relation) => ({
      id: stableMetaEntityContractUuid(namespace, `relations/${relation.relation_code}`),
      code: relation.relation_code,
      kind: relation.relation_kind,
      target_entity_code: relation.target_entity_code,
      resolution: relation.resolution_kind,
      source_field: relation.source_field,
      target_field: relation.target_field,
      polymorphic: relation.resolution_kind === "polymorphic"
        ? {
            type_field: relation.polymorphic_type_field!,
            type_value: relation.polymorphic_type_value!,
            id_field: relation.polymorphic_id_field!,
          }
        : null,
      source_line_field: relation.source_line_field ?? null,
      runtime_role: relation.runtime_role ?? null,
      on_delete: relation.on_delete,
      record_filter: relation.record_filter,
      mutation: {
        owner: relation.mutation_owner,
        permissions: relation.mutation_permissions,
      },
    })),
    surfaces: source.surfaces.map((entry) => {
      const surfaceId = stableMetaEntityContractUuid(
        namespace,
        `surfaces/${entry.surface.mode}/${entry.surface.surface_key}`,
      );
      return {
        id: surfaceId,
        surface_key: entry.surface.surface_key,
        mode: entry.surface.mode,
        kind: entry.surface.kind,
        placement: "main" as const,
        parent_surface_id: null,
        slot_key: null,
        renderer: {
          key: entry.surface.renderer_key,
          composer_key: null,
          strategy_key: null,
          config: entry.surface.config.renderer_config ?? {},
        },
        layout: { column_count: null, print_span: null, density: null },
        security: { required_permissions: [], visibility_condition: null },
        grouping: { group_codes: [], relation_code: null },
        label: entry.surface.label ?? null,
        order: 0,
        enabled: entry.surface.is_enabled,
        bindings: entry.fields.map((binding) => ({
          id: stableMetaEntityContractUuid(
            namespace,
            `surfaces/${entry.surface.mode}/${entry.surface.surface_key}/bindings/${binding.entity_field_id}`,
          ),
          field_id: fieldIds.get(binding.entity_field_id)!,
          visible: binding.visible,
          required: binding.required_override,
          read_only: binding.readonly_override,
          order: binding.sort_order ?? 0,
          column_span: binding.column_span,
          density: binding.density,
          group_code: null,
          renderer_key: binding.renderer_key ?? null,
          editor_key: binding.editor_key ?? null,
          visibility_condition: binding.visibility_expr ?? null,
          editability_condition: binding.editability_expr ?? null,
          renderer_config: binding.renderer_config,
        })),
      };
    }),
    operations: source.operations.map((operation) => ({
      id: stableMetaEntityContractUuid(namespace, `operations/${operation.operation_code}`),
      operation_code: operation.operation_code,
      permission_code: operation.permission_code,
      surface: operation.surface === "picker"
        ? "PALETTE_ONLY"
        : operation.surface.toUpperCase() as "LIST" | "DETAIL" | "BOTH" | "HIDDEN",
      placement: operation.placement.toUpperCase() as "PRIMARY" | "TOOLBAR" | "OVERFLOW" | "CONTEXT" | "COMMAND",
      plane_filter: hydration.operationPlaneFilter?.[operation.operation_code] ?? null,
      handler: {
        kind: operation.handler_type,
        target: operation.handler_target ?? (
          operation.handler_type === "api"
            ? `api:${operation.operation_code}`
            : operation.operation_code
        ),
      },
      execution: operation.execution_target
        ? {
            target: operation.execution_target,
            timeout_ms: null,
            idempotency_required: true,
          }
        : null,
      record_required: operation.record_required,
      label: operation.label,
      icon: operation.icon ?? null,
      intent: operation.intent,
      confirmation: {
        required: operation.confirmation.required,
        code: operation.confirmation.code,
        message: operation.confirmation.message ?? null,
      },
      reason_required: operation.reason_required,
      selection: operation.selection_config ?? null,
      order: operation.sort_order,
      enabled: operation.enabled,
      action_rules: [...(hydration.actionRulesByOperation?.[operation.operation_code] ?? [])],
    })),
    numbering: {
      configurations: source.numbering
        ? [{
            id: stableMetaEntityContractUuid(namespace, `numbering/${source.numbering.id}`),
            code: `number_${source.numbering.number_field}`,
            company_scope: source.numbering.company_code_id
              ? {
                  mode: "company" as const,
                  company_code: hydration.companyCodeById?.[source.numbering.company_code_id] ?? null,
                }
              : { mode: "all" as const, company_code: null },
            field_scope: {
              field_name: source.numbering.number_field,
              uniqueness: source.numbering.uniqueness_scope,
            },
            reset_policy: source.numbering.reset_strategy,
            segments: source.numbering.segments.map((segment) => ({
              kind: segment.kind === "year"
                ? "calendar_year" as const
                : segment.kind === "static" ? "literal" as const : segment.kind,
              value: segment.value ?? null,
              width: segment.width ?? null,
            })),
            confirmation: { required: false, message: null },
            format: {
              prefix: source.numbering.prefix,
              prefix_configurable: source.numbering.prefix_configurable,
              separator: source.numbering.separator,
              max_length: source.numbering.max_length ?? null,
              allowed_chars: source.numbering.allowed_chars,
            },
            enabled: source.numbering.status === "active",
            metadata: source.numbering.metadata,
          }]
        : [],
    },
    lifecycle: hydration.lifecycle ?? null,
    flows: source.flows.map((flow) => hydration.flows?.[flow.flow_code]).filter(
      (flow): flow is MetaEntityFlowV21 => flow !== undefined,
    ),
    policy: {
      ...DEFAULT_META_ENTITY_POLICY_V21,
      merge_order: ["platform_baseline", "tenant_overlay", "field_security"],
      platform_baseline: {
        access_mode: source.policy.access_mode,
        company_scope_mode: source.policy.company_scope_mode,
        audit_mode: source.policy.audit_mode,
        retention: source.policy.retention_policy,
        filters: source.policy.default_filters,
        cache_flags: source.policy.cache_flags,
        cache_policy: source.policy.cache_policy,
      },
      tenant_overlay: hydration.tenantOverlay ?? null,
      field_security: hydration.fieldSecurity ?? [],
    },
  };

  if (source.numbering?.company_code_id
      && !contract.numbering.configurations[0]?.company_scope.company_code) {
    throw new Error(
      `Contract v2.1 upgrade requires a logical company code for '${source.numbering.company_code_id}'.`,
    );
  }
  return canonicalizeMetaEntityContractV21(MetaEntityContractV21Schema.parse(contract));
}

