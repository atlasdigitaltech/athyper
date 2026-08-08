import { z } from "zod";
import {
  EntityListCachePolicySchema,
  PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
} from "./entity-cache-policy";
import {
  MetaEntityDataPolicySchema,
  MetaEntityFieldTypeConfigSchema,
  MetaEntityIdentityConfigSchema,
  MetaEntitySearchConfigSchema,
} from "./meta-entity-contract-v2";

export const META_ENTITY_CONTRACT_V21_VERSION = "2.1" as const;

const UuidSchema = z.string().uuid();
const IdentifierSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const CodeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);
const LogicalCodeSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
const PlaneSchema = z.enum(["neon", "admin", "mesh"]);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const ConditionSchema = JsonObjectSchema.nullable();

const EntityOperationScopeBindingV21Schema = z.object({
  scope_kind: z.enum([
    "tenant",
    "workspace",
    "module",
    "company_code",
    "legal_entity",
    "operating_organization",
    "network_account",
    "network_relationship",
    "resource",
  ]),
  coordinate_source: z.enum([
    "tenant_context",
    "request_field",
    "record_field",
    "collection_field",
    "relation_resolver",
  ]),
  coordinate_key: IdentifierSchema.nullable(),
  resolver_key: z.string().regex(/^[a-z][a-z0-9_.:-]{1,126}$/).nullable(),
}).strict().superRefine((binding, ctx) => {
  const fieldSource = ["request_field", "record_field", "collection_field"]
    .includes(binding.coordinate_source);
  if (fieldSource !== (binding.coordinate_key !== null)) {
    ctx.addIssue({ code: "custom", path: ["coordinate_key"], message: "Field coordinate sources require exactly one coordinate_key." });
  }
  if ((binding.coordinate_source === "relation_resolver") !== (binding.resolver_key !== null)) {
    ctx.addIssue({ code: "custom", path: ["resolver_key"], message: "relation_resolver requires exactly one resolver_key." });
  }
  if (binding.scope_kind === "tenant" && binding.coordinate_source !== "tenant_context") {
    ctx.addIssue({ code: "custom", path: ["coordinate_source"], message: "Tenant scope must resolve from authenticated tenant context." });
  }
  if (binding.scope_kind !== "tenant" && binding.coordinate_source === "tenant_context") {
    ctx.addIssue({ code: "custom", path: ["coordinate_source"], message: "Non-tenant scope requires an explicit coordinate." });
  }
});

const EntityOperationAuthorizationV21Schema = z.object({
  decision_mode: z.enum(["entity_resource", "collection"]),
  missing_value_behavior: z.literal("deny"),
  bindings: z.array(EntityOperationScopeBindingV21Schema).min(1),
}).strict().superRefine((authorization, ctx) => {
  const scopeKinds = new Set<string>();
  authorization.bindings.forEach((binding, index) => {
    if (scopeKinds.has(binding.scope_kind)) {
      ctx.addIssue({ code: "custom", path: ["bindings", index, "scope_kind"], message: "An operation may define only one binding per scope kind." });
    }
    scopeKinds.add(binding.scope_kind);
    if (authorization.decision_mode === "collection"
        && ["request_field", "record_field"].includes(binding.coordinate_source)) {
      ctx.addIssue({ code: "custom", path: ["bindings", index, "coordinate_source"], message: "Collection authorization cannot resolve from one request or record field." });
    }
    if (authorization.decision_mode === "entity_resource"
        && binding.coordinate_source === "collection_field") {
      ctx.addIssue({ code: "custom", path: ["bindings", index, "coordinate_source"], message: "Entity-resource authorization cannot use a collection field." });
    }
  });
});

const ContractOwnedRefSchema = z.object({
  id: UuidSchema,
  code: CodeSchema,
}).strict();

export const MetaEntityFieldV21Schema = z.object({
  id: UuidSchema,
  name: IdentifierSchema,
  column_name: IdentifierSchema,
  projection_alias_of: IdentifierSchema.nullable().optional(),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  data_type: z.string().min(1),
  cardinality: z.enum(["one", "many", "zero_or_one"]),
  origin: z.enum(["system", "standard", "business"]),
  required: z.boolean(),
  unique: z.boolean(),
  unique_scope: z.enum(["global", "tenant", "entity_instance"]).nullable(),
  read_only: z.boolean(),
  deprecated: z.boolean(),
  computed: z.boolean(),
  write_once: z.boolean(),
  runtime_enabled: z.boolean(),
  compute: z.object({
    mode: CodeSchema,
    expression: JsonObjectSchema,
  }).strict().nullable(),
  default_value: z.unknown().optional(),
  defaults: JsonObjectSchema.nullable(),
  capabilities: z.object({
    filterable: z.boolean(),
    sortable: z.boolean(),
    groupable: z.boolean(),
    aggregatable: z.boolean(),
  }).strict(),
  semantic_roles: z.array(LogicalCodeSchema),
  type_config: MetaEntityFieldTypeConfigSchema,
}).strict();

export const MetaEntityRelationV21Schema = z.object({
  id: UuidSchema,
  code: CodeSchema,
  kind: z.enum(["belongs_to", "has_many", "m2m"]),
  target_entity_code: CodeSchema,
  resolution: z.enum(["fk", "polymorphic", "join", "array_fk"]),
  source_field: IdentifierSchema.nullable(),
  target_field: IdentifierSchema,
  polymorphic: z.object({
    type_field: IdentifierSchema,
    type_value: z.string().min(1),
    id_field: IdentifierSchema,
  }).strict().nullable(),
  source_line_field: IdentifierSchema.nullable(),
  runtime_role: CodeSchema.nullable(),
  on_delete: z.enum(["restrict", "cascade", "set_null", "set_default", "no_action"]),
  record_filter: JsonObjectSchema,
  mutation: z.object({
    owner: z.enum(["generic", "workspace", "handler", "read_only"]),
    permissions: z.array(LogicalCodeSchema),
  }).strict(),
}).strict();

export const MetaEntitySurfaceBindingV21Schema = z.object({
  id: UuidSchema,
  field_id: UuidSchema,
  visible: z.boolean(),
  required: z.boolean().nullable(),
  read_only: z.boolean().nullable(),
  order: z.number().int(),
  column_span: z.number().int().min(1).max(12).nullable(),
  density: z.enum(["compact", "comfortable", "document"]).nullable(),
  group_code: CodeSchema.nullable(),
  renderer_key: LogicalCodeSchema.nullable(),
  editor_key: LogicalCodeSchema.nullable(),
  visibility_condition: ConditionSchema,
  editability_condition: ConditionSchema,
  renderer_config: JsonObjectSchema,
}).strict();

export const MetaEntitySurfaceV21Schema = z.object({
  id: UuidSchema,
  surface_key: CodeSchema,
  mode: z.enum([
    "list", "compact_card", "spreadsheet", "detail", "create", "edit",
    "picker", "print", "line_editor", "child_collection", "header",
  ]),
  kind: z.enum(["TABLE", "CARDS", "FORM", "DETAIL", "PICKER", "PRINT", "COLLECTION", "HEADER", "CUSTOM"]),
  placement: z.enum(["main", "header", "context_panel", "subroute", "toolbar", "action_only", "mount_only"]),
  parent_surface_id: UuidSchema.nullable(),
  slot_key: CodeSchema.nullable(),
  renderer: z.object({
    key: LogicalCodeSchema,
    composer_key: LogicalCodeSchema.nullable(),
    strategy_key: LogicalCodeSchema.nullable(),
    config: JsonObjectSchema,
  }).strict(),
  layout: z.object({
    column_count: z.number().int().min(1).max(12).nullable(),
    print_span: z.enum(["full", "half"]).nullable(),
    density: z.enum(["compact", "comfortable", "document"]).nullable(),
  }).strict(),
  security: z.object({
    required_permissions: z.array(LogicalCodeSchema),
    visibility_condition: ConditionSchema,
  }).strict(),
  grouping: z.object({
    group_codes: z.array(CodeSchema),
    relation_code: CodeSchema.nullable(),
  }).strict(),
  label: z.string().min(1).nullable(),
  order: z.number().int(),
  enabled: z.boolean(),
  bindings: z.array(MetaEntitySurfaceBindingV21Schema),
}).strict();

const OperationHandlerV21Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), target: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("api"), target: z.string().regex(/^(?:\/|[a-z][a-z0-9_-]*:)[^\s]+$/) }).strict(),
  z.object({ kind: z.literal("modal"), target: LogicalCodeSchema }).strict(),
  z.object({ kind: z.literal("inline"), target: LogicalCodeSchema }).strict(),
]);

const OperationExecutionV21Schema = z.object({
  target: z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/),
  timeout_ms: z.number().int().positive().nullable(),
  idempotency_required: z.boolean(),
}).strict();

export const MetaEntityActionRuleV21Schema = z.object({
  id: UuidSchema,
  status: LogicalCodeSchema,
  action_code: LogicalCodeSchema,
  capability: z.enum(["allowed", "denied", "requires_permission"]),
  required_permission: LogicalCodeSchema.nullable(),
  reason: z.string().min(1).nullable(),
  condition: ConditionSchema,
  metadata: JsonObjectSchema,
}).strict().superRefine((rule, ctx) => {
  if ((rule.capability === "requires_permission") !== (rule.required_permission !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["required_permission"],
      message: "required_permission is present exactly when capability is requires_permission.",
    });
  }
});

export const MetaEntityOperationV21Schema = z.object({
  id: UuidSchema,
  operation_code: LogicalCodeSchema,
  permission_code: LogicalCodeSchema,
  surface: z.enum(["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"]),
  placement: z.enum(["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"]),
  plane_filter: z.array(PlaneSchema).nullable(),
  /** Explicit compiler input. Absence emits no consumer binding and therefore cannot activate. */
  authorization: EntityOperationAuthorizationV21Schema.nullable().optional(),
  handler: OperationHandlerV21Schema,
  execution: OperationExecutionV21Schema.nullable(),
  record_required: z.boolean(),
  label: z.string().min(1),
  icon: LogicalCodeSchema.nullable(),
  intent: z.enum(["neutral", "success", "warning", "danger"]),
  confirmation: z.object({
    required: z.boolean(),
    code: LogicalCodeSchema.nullable(),
    message: z.string().min(1).nullable(),
  }).strict(),
  reason_required: z.boolean(),
  selection: JsonObjectSchema.nullable(),
  order: z.number().int(),
  enabled: z.boolean(),
  action_rules: z.array(MetaEntityActionRuleV21Schema),
}).strict();

export const MetaEntityNumberingConfigurationV21Schema = z.object({
  id: UuidSchema,
  code: CodeSchema,
  company_scope: z.object({
    mode: z.enum(["all", "company"]),
    company_code: CodeSchema.nullable(),
  }).strict(),
  field_scope: z.object({
    field_name: IdentifierSchema,
    uniqueness: z.enum(["tenant", "company", "global"]),
  }).strict(),
  reset_policy: z.enum(["never", "yearly", "fiscal_yearly", "monthly", "quarterly"]),
  segments: z.array(z.object({
    kind: z.enum(["tenant_code", "company_code", "branch_code", "calendar_year", "fiscal_year", "period", "quarter", "sequence", "literal"]),
    value: z.string().min(1).nullable(),
    width: z.number().int().positive().nullable(),
  }).strict()).min(1),
  confirmation: z.object({
    required: z.boolean(),
    message: z.string().min(1).nullable(),
  }).strict(),
  format: z.object({
    prefix: z.string(),
    prefix_configurable: z.boolean(),
    separator: z.string(),
    max_length: z.number().int().positive().nullable(),
    allowed_chars: z.string().min(1),
  }).strict(),
  enabled: z.boolean(),
  metadata: JsonObjectSchema,
}).strict().superRefine((configuration, ctx) => {
  if (configuration.company_scope.mode === "company" && !configuration.company_scope.company_code) {
    ctx.addIssue({ code: "custom", path: ["company_scope", "company_code"], message: "Company-scoped numbering requires company_code." });
  }
  if (configuration.company_scope.mode === "all" && configuration.company_scope.company_code !== null) {
    ctx.addIssue({ code: "custom", path: ["company_scope", "company_code"], message: "All-company numbering cannot carry company_code." });
  }
  if (configuration.segments.filter((segment) => segment.kind === "sequence").length !== 1) {
    ctx.addIssue({ code: "custom", path: ["segments"], message: "A numbering configuration requires exactly one sequence segment." });
  }
});

const LifecycleConditionV21Schema = z.object({
  expression: JsonObjectSchema,
  failure_code: LogicalCodeSchema.nullable(),
}).strict();

export const MetaEntityLifecycleV21Schema = z.object({
  binding: z.object({
    id: UuidSchema,
    code: CodeSchema,
    status_field: IdentifierSchema,
    definition: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("owned"), id: UuidSchema, version: z.number().int().positive() }).strict(),
      z.object({ kind: z.literal("reference"), definition_code: CodeSchema, version: z.number().int().positive() }).strict(),
    ]),
    condition: ConditionSchema,
    priority: z.number().int(),
  }).strict(),
  states: z.array(z.object({
    id: UuidSchema,
    code: CodeSchema,
    label: z.string().min(1),
    initial: z.boolean(),
    terminal: z.boolean(),
    presentation: z.object({
      badge: LogicalCodeSchema.nullable(),
      icon: LogicalCodeSchema.nullable(),
      color: LogicalCodeSchema.nullable(),
    }).strict(),
    capabilities: z.object({
      edit: z.boolean(),
      delete: z.boolean(),
      reversible: z.boolean(),
      transition_to: z.array(CodeSchema),
    }).strict(),
    masks: z.array(z.object({
      id: UuidSchema,
      planes: z.array(PlaneSchema).min(1),
      edit: z.boolean(),
      delete: z.boolean(),
      transition_to: z.array(CodeSchema),
      disabled_reason: LogicalCodeSchema.nullable(),
    }).strict()),
  }).strict()).min(1),
  transitions: z.array(z.object({
    id: UuidSchema,
    from: CodeSchema,
    to: CodeSchema,
    operation_code: LogicalCodeSchema,
    conditions: z.array(LifecycleConditionV21Schema),
    gates: z.array(z.object({
      id: UuidSchema,
      gate_code: LogicalCodeSchema,
      order: z.number().int(),
      config: JsonObjectSchema,
    }).strict()),
    hooks: z.array(z.object({
      id: UuidSchema,
      phase: z.enum(["before", "after"]),
      hook_code: LogicalCodeSchema,
      order: z.number().int(),
      config: JsonObjectSchema,
    }).strict()),
    timers: z.array(z.object({
      id: UuidSchema,
      timer_code: LogicalCodeSchema,
      duration_iso: z.string().regex(/^P/),
      operation_code: LogicalCodeSchema,
      config: JsonObjectSchema,
    }).strict()),
  }).strict()),
  command_handler: LogicalCodeSchema.nullable(),
}).strict();

export const MetaEntityFlowV21Schema = z.object({
  id: UuidSchema,
  flow_code: CodeSchema,
  label: z.string().min(1),
  description: z.string().nullable(),
  icon_key: LogicalCodeSchema.nullable(),
  trigger_context: z.enum(["new", "edit", "approve", "duplicate", "read_only", "clone"]),
  default: z.boolean(),
  version: z.number().int().positive(),
  condition: ConditionSchema,
  required_permissions: z.array(LogicalCodeSchema),
  writer_operation: LogicalCodeSchema,
  submit_operation: LogicalCodeSchema.nullable(),
  config: JsonObjectSchema,
  steps: z.array(z.object({
    id: UuidSchema,
    step_key: CodeSchema,
    label: z.string().min(1),
    description: z.string().nullable(),
    icon_key: LogicalCodeSchema.nullable(),
    order: z.number().int(),
    skip_when: ConditionSchema,
    advance_rule: JsonObjectSchema,
    layout_hint: z.enum(["two_column", "single_column", "summary_side", "line_editor", "grid", "card"]),
    required_permissions: z.array(LogicalCodeSchema),
    sections: z.array(z.object({
      id: UuidSchema,
      section_key: CodeSchema,
      label: z.string().min(1),
      description: z.string().nullable(),
      order: z.number().int(),
      collapsed: z.boolean(),
      visible_when: ConditionSchema,
      reveal_behavior: z.enum(["auto_expand", "honor_default"]),
      icon_key: LogicalCodeSchema.nullable(),
      help_text: z.string().nullable(),
    }).strict()),
    fields: z.array(z.object({
      id: UuidSchema,
      field_id: UuidSchema,
      section_id: UuidSchema.nullable(),
      mode: z.enum(["required", "editable", "readonly", "hidden", "summary_only", "chip"]),
      derivation: z.object({
        mode: z.enum(["derived_locked", "derived_overrideable", "manual"]),
        default_source: LogicalCodeSchema.nullable(),
        expression: z.string().min(1).nullable(),
        override_permission: LogicalCodeSchema.nullable(),
        override_requires_note: z.boolean(),
      }).strict().nullable(),
      visible_when: ConditionSchema,
      required_when: ConditionSchema,
      summary_role: LogicalCodeSchema.nullable(),
      ui_variant: LogicalCodeSchema.nullable(),
      format: z.string().nullable(),
      span: z.number().int().min(1).max(3),
      help_text: z.string().nullable(),
      placeholder: z.string().nullable(),
      order: z.number().int(),
      metadata: JsonObjectSchema,
    }).strict()),
  }).strict()).min(1),
}).strict();

const PolicyBodyV21Schema = z.object({
  access_mode: z.enum(["default_deny", "default_allow", "explicit"]),
  company_scope_mode: z.enum(["none", "single", "subtree", "full"]),
  audit_mode: z.enum(["enabled", "disabled", "sampling"]),
  retention: JsonObjectSchema,
  filters: JsonObjectSchema,
  cache_flags: JsonObjectSchema,
  cache_policy: EntityListCachePolicySchema,
}).strict();

export const MetaEntityPolicyV21Schema = z.object({
  merge_order: z.tuple([
    z.literal("platform_baseline"),
    z.literal("tenant_overlay"),
    z.literal("field_security"),
  ]),
  platform_baseline: PolicyBodyV21Schema,
  tenant_overlay: z.object({
    overlay_code: CodeSchema,
    values: PolicyBodyV21Schema.partial(),
  }).strict().nullable(),
  field_security: z.array(z.object({
    id: UuidSchema,
    field_name: IdentifierSchema,
    classification: z.enum(["public", "internal", "confidential", "restricted"]),
    read_permissions: z.array(LogicalCodeSchema),
    write_permissions: z.array(LogicalCodeSchema),
    mask: z.enum(["none", "partial", "full", "hash"]),
    condition: ConditionSchema,
  }).strict()),
}).strict();

export const MetaEntityContractV21Schema = z.object({
  contract_schema_version: z.literal(META_ENTITY_CONTRACT_V21_VERSION),
  catalog: z.object({
    module_code: CodeSchema,
    entity_code: CodeSchema,
    slug: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    entity_class: z.string().min(1),
    profile_code: CodeSchema.nullable(),
    ownership_model: z.enum(["system", "tenant", "package", "overlay"]),
    labels: z.object({
      singular: z.string().min(1),
      plural: z.string().min(1),
      description: z.string().nullable(),
    }).strict(),
    presentation: z.object({
      icon_key: LogicalCodeSchema.nullable(),
      color_token: LogicalCodeSchema.nullable(),
    }).strict(),
    plane_eligibility: z.array(PlaneSchema).min(1),
    enabled: z.boolean(),
  }).strict(),
  runtime: z.object({
    catalog_enabled: z.boolean(),
    runtime_enabled: z.boolean(),
    api_exposure: z.enum(["NONE", "CATALOG_ONLY", "API"]),
    storage: z.object({
      backing_type: z.enum(["table", "view", "materialized_view", "external", "virtual"]),
      table_schema: IdentifierSchema,
      table_name: IdentifierSchema,
      key_strategy: z.enum(["none", "single", "composite", "natural"]),
      primary_key: IdentifierSchema.nullable(),
      tenant_column: IdentifierSchema.nullable(),
    }).strict(),
    capabilities: z.object({
      read: z.enum(["none", "generic", "facade", "projection"]),
      write: z.enum(["none", "generic", "facade", "append_only"]),
      read_handler: LogicalCodeSchema.nullable(),
      write_handler: LogicalCodeSchema.nullable(),
    }).strict(),
    create_mode: z.enum(["FORM_ONLY", "EARLY_DRAFT", "DIRECT_CREATE", "SOURCE_DOCUMENT_CREATE"]),
    draft_ttl_hours: z.number().int().positive().nullable(),
    governance_level: z.string().min(1),
    security_tier: z.string().min(1),
    mutability: z.string().min(1),
    identity: MetaEntityIdentityConfigSchema,
    search: MetaEntitySearchConfigSchema,
    data_policy: MetaEntityDataPolicySchema,
    concurrency: z.object({
      strategy: z.enum(["none", "version", "lease_plus_version"]),
      rollout: z.enum(["observe", "optional", "enforced"]),
      row_version_field: IdentifierSchema.nullable(),
      lock_required: z.boolean(),
    }).strict(),
    storage_config: JsonObjectSchema,
  }).strict(),
  fields: z.array(MetaEntityFieldV21Schema),
  relations: z.array(MetaEntityRelationV21Schema),
  surfaces: z.array(MetaEntitySurfaceV21Schema),
  operations: z.array(MetaEntityOperationV21Schema),
  numbering: z.object({
    configurations: z.array(MetaEntityNumberingConfigurationV21Schema),
  }).strict(),
  lifecycle: MetaEntityLifecycleV21Schema.nullable(),
  flows: z.array(MetaEntityFlowV21Schema),
  policy: MetaEntityPolicyV21Schema,
}).strict().superRefine((contract, ctx) => {
  const requireUnique = (
    values: Array<{ value: string; path: (string | number)[] }>,
    message: string,
  ) => {
    const seen = new Set<string>();
    for (const item of values) {
      if (seen.has(item.value)) {
        ctx.addIssue({ code: "custom", path: item.path, message });
      }
      seen.add(item.value);
    }
  };

  requireUnique(contract.fields.map((field, index) => ({ value: field.id, path: ["fields", index, "id"] })), "Field ids must be stable and unique.");
  requireUnique(contract.fields.map((field, index) => ({ value: field.name, path: ["fields", index, "name"] })), "Field names must be unique.");
  requireUnique(contract.surfaces.map((surface, index) => ({ value: `${surface.mode}:${surface.surface_key}`, path: ["surfaces", index, "surface_key"] })), "Surface mode and key must be unique.");
  requireUnique(contract.operations.map((operation, index) => ({ value: operation.operation_code, path: ["operations", index, "operation_code"] })), "Operation codes must be unique.");
  requireUnique(contract.numbering.configurations.map((configuration, index) => ({ value: configuration.id, path: ["numbering", "configurations", index, "id"] })), "Numbering ids must be unique.");
  requireUnique(contract.flows.map((flow, index) => ({ value: flow.flow_code, path: ["flows", index, "flow_code"] })), "Flow codes must be unique.");

  const fieldsById = new Map(contract.fields.map((field) => [field.id, field]));
  const fieldsByName = new Set(contract.fields.map((field) => field.name));
  const surfaceIds = new Set(contract.surfaces.map((surface) => surface.id));
  for (const [surfaceIndex, surface] of contract.surfaces.entries()) {
    if (surface.parent_surface_id && !surfaceIds.has(surface.parent_surface_id)) {
      ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "parent_surface_id"], message: "Parent surface must reference a contract surface." });
    }
    for (const [bindingIndex, binding] of surface.bindings.entries()) {
      if (!fieldsById.has(binding.field_id)) {
        ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "bindings", bindingIndex, "field_id"], message: "Surface binding field_id must reference a contract field." });
      }
    }
  }
  for (const [index, configuration] of contract.numbering.configurations.entries()) {
    if (!fieldsByName.has(configuration.field_scope.field_name)) {
      ctx.addIssue({ code: "custom", path: ["numbering", "configurations", index, "field_scope", "field_name"], message: "Numbering field must reference a contract field." });
    }
  }
  for (const [relationIndex, relation] of contract.relations.entries()) {
    for (const sourceField of [
      relation.source_field,
      relation.source_line_field,
      relation.polymorphic?.type_field,
      relation.polymorphic?.id_field,
    ]) {
      if (sourceField && !fieldsByName.has(sourceField)) {
        ctx.addIssue({ code: "custom", path: ["relations", relationIndex], message: `Relation source field '${sourceField}' must reference a contract field.` });
      }
    }
  }

  const operations = new Set(contract.operations.map((operation) => operation.operation_code));
  const flows = new Set(contract.flows.map((flow) => flow.flow_code));
  const lifecycleOperations = new Set(
    contract.lifecycle?.transitions.map((transition) => transition.operation_code) ?? [],
  );
  for (const [operationIndex, operation] of contract.operations.entries()) {
    const targets = [operation.handler.target, operation.execution?.target].filter(
      (target): target is string => Boolean(target),
    );
    for (const target of targets) {
      const [namespace, code] = target.split(":", 2);
      if (namespace === "flow" && (!code || !flows.has(code))) {
        ctx.addIssue({ code: "custom", path: ["operations", operationIndex], message: `Flow handler '${target}' must reference a declared flow.` });
      }
      if (namespace === "lifecycle" && (!code || ![...lifecycleOperations].some(
        (operationCode) => operationCode === code || operationCode.endsWith(`.${code}`),
      ))) {
        ctx.addIssue({ code: "custom", path: ["operations", operationIndex], message: `Lifecycle execution '${target}' must reference a declared transition operation.` });
      }
    }
  }
  for (const [flowIndex, flow] of contract.flows.entries()) {
    for (const [key, operation] of [["writer_operation", flow.writer_operation], ["submit_operation", flow.submit_operation]] as const) {
      if (operation && !operations.has(operation)) {
        ctx.addIssue({ code: "custom", path: ["flows", flowIndex, key], message: "Flow operation must reference a declared operation." });
      }
    }
    const sectionIds = new Set(flow.steps.flatMap((step) => step.sections.map((section) => section.id)));
    for (const [stepIndex, step] of flow.steps.entries()) {
      for (const [fieldIndex, field] of step.fields.entries()) {
        if (!fieldsById.has(field.field_id)) {
          ctx.addIssue({ code: "custom", path: ["flows", flowIndex, "steps", stepIndex, "fields", fieldIndex, "field_id"], message: "Flow field must reference a contract field." });
        }
        if (field.section_id && !sectionIds.has(field.section_id)) {
          ctx.addIssue({ code: "custom", path: ["flows", flowIndex, "steps", stepIndex, "fields", fieldIndex, "section_id"], message: "Flow field section_id must reference a flow section." });
        }
      }
    }
  }

  if (contract.lifecycle) {
    const initial = contract.lifecycle.states.filter((state) => state.initial);
    if (initial.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["lifecycle", "states"], message: "Lifecycle requires exactly one initial state." });
    }
    const states = new Set(contract.lifecycle.states.map((state) => state.code));
    for (const [stateIndex, state] of contract.lifecycle.states.entries()) {
      for (const target of state.capabilities.transition_to) {
        if (!states.has(target)) {
          ctx.addIssue({ code: "custom", path: ["lifecycle", "states", stateIndex, "capabilities", "transition_to"], message: `Lifecycle capability target '${target}' must reference a declared state.` });
        }
      }
      for (const [maskIndex, mask] of state.masks.entries()) {
        for (const target of mask.transition_to) {
          if (!states.has(target)) {
            ctx.addIssue({ code: "custom", path: ["lifecycle", "states", stateIndex, "masks", maskIndex, "transition_to"], message: `Lifecycle mask target '${target}' must reference a declared state.` });
          }
        }
      }
    }
    for (const [index, transition] of contract.lifecycle.transitions.entries()) {
      if (!states.has(transition.from) || !states.has(transition.to)) {
        ctx.addIssue({ code: "custom", path: ["lifecycle", "transitions", index], message: "Transition endpoints must reference declared states." });
      }
      if (!operations.has(transition.operation_code)) {
        ctx.addIssue({ code: "custom", path: ["lifecycle", "transitions", index, "operation_code"], message: "Transition operation must reference a declared operation." });
      }
      for (const [timerIndex, timer] of transition.timers.entries()) {
        if (!operations.has(timer.operation_code)) {
          ctx.addIssue({ code: "custom", path: ["lifecycle", "transitions", index, "timers", timerIndex, "operation_code"], message: "Timer operation must reference a declared operation." });
        }
      }
    }
  }
});

export type MetaEntityContractV21 = z.infer<typeof MetaEntityContractV21Schema>;
export type MetaEntityNumberingConfigurationV21 = z.infer<typeof MetaEntityNumberingConfigurationV21Schema>;
export type MetaEntityFlowV21 = z.infer<typeof MetaEntityFlowV21Schema>;
export type MetaEntityLifecycleV21 = z.infer<typeof MetaEntityLifecycleV21Schema>;

export const DEFAULT_META_ENTITY_POLICY_V21 = {
  merge_order: ["platform_baseline", "tenant_overlay", "field_security"] as const,
  platform_baseline: {
    access_mode: "default_deny" as const,
    company_scope_mode: "none" as const,
    audit_mode: "enabled" as const,
    retention: {},
    filters: {},
    cache_flags: {},
    cache_policy: {
      ...PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
      source: "platform" as const,
    },
  },
  tenant_overlay: null,
  field_security: [],
};

/**
 * Canonical JSON intentionally sorts object keys and only set-like owner
 * collections. Semantic order is carried by explicit order fields and is
 * therefore also normalized deterministically.
 */
export function canonicalizeMetaEntityContractV21(input: unknown): MetaEntityContractV21 {
  const parsed = MetaEntityContractV21Schema.parse(input);
  const by = <T>(items: readonly T[], key: (item: T) => string): T[] =>
    [...items].sort((left, right) => key(left).localeCompare(key(right)));

  return MetaEntityContractV21Schema.parse({
    ...parsed,
    catalog: {
      ...parsed.catalog,
      plane_eligibility: [...new Set(parsed.catalog.plane_eligibility)].sort(),
    },
    fields: by(parsed.fields, (field) => field.name).map((field) => ({
      ...field,
      semantic_roles: [...new Set(field.semantic_roles)].sort(),
    })),
    relations: by(parsed.relations, (relation) => relation.code).map((relation) => ({
      ...relation,
      mutation: {
        ...relation.mutation,
        permissions: [...new Set(relation.mutation.permissions)].sort(),
      },
    })),
    surfaces: by(parsed.surfaces, (surface) => `${surface.mode}:${surface.surface_key}`).map((surface) => ({
      ...surface,
      security: {
        ...surface.security,
        required_permissions: [...new Set(surface.security.required_permissions)].sort(),
      },
      grouping: {
        ...surface.grouping,
        group_codes: [...new Set(surface.grouping.group_codes)].sort(),
      },
      bindings: [...surface.bindings].sort((left, right) =>
        left.order - right.order || left.id.localeCompare(right.id)),
    })),
    operations: by(parsed.operations, (operation) => operation.operation_code).map((operation) => ({
      ...operation,
      plane_filter: operation.plane_filter
        ? [...new Set(operation.plane_filter)].sort()
        : null,
      ...(operation.authorization
        ? {
            authorization: {
              ...operation.authorization,
              bindings: by(operation.authorization.bindings, (binding) => binding.scope_kind),
            },
          }
        : {}),
      action_rules: by(operation.action_rules, (rule) => `${rule.status}:${rule.action_code}`),
    })),
    numbering: {
      configurations: by(parsed.numbering.configurations, (configuration) =>
        `${configuration.code}:${configuration.company_scope.company_code ?? "*"}`),
    },
    lifecycle: parsed.lifecycle
      ? {
          ...parsed.lifecycle,
          states: by(parsed.lifecycle.states, (state) => state.code).map((state) => ({
            ...state,
            capabilities: {
              ...state.capabilities,
              transition_to: [...new Set(state.capabilities.transition_to)].sort(),
            },
            masks: by(state.masks, (mask) => mask.id).map((mask) => ({
              ...mask,
              planes: [...new Set(mask.planes)].sort(),
              transition_to: [...new Set(mask.transition_to)].sort(),
            })),
          })),
          transitions: by(parsed.lifecycle.transitions, (transition) =>
            `${transition.from}:${transition.to}:${transition.operation_code}`).map((transition) => ({
              ...transition,
              gates: [...transition.gates].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
              hooks: [...transition.hooks].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
              timers: by(transition.timers, (timer) => timer.timer_code),
            })),
        }
      : null,
    flows: by(parsed.flows, (flow) => flow.flow_code).map((flow) => ({
      ...flow,
      required_permissions: [...new Set(flow.required_permissions)].sort(),
      steps: [...flow.steps].sort((left, right) => left.order - right.order || left.step_key.localeCompare(right.step_key)).map((step) => ({
        ...step,
        required_permissions: [...new Set(step.required_permissions)].sort(),
        sections: [...step.sections].sort((left, right) => left.order - right.order || left.section_key.localeCompare(right.section_key)),
        fields: [...step.fields].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      })),
    })),
  });
}

function canonicalJsonValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJsonValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalMetaEntityContractV21Json(input: unknown): string {
  return canonicalJsonValue(canonicalizeMetaEntityContractV21(input));
}

