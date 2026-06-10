/**
 * @athyper/runtime-contracts — Meta-Entity Runtime Descriptor Compiler
 *
 * compileMetaEntityRuntimeDescriptor(entity, options) converts a raw
 * CompiledMetaEntityInput (from the DB compiled snapshot) into the fully
 * validated MetaEntityRuntimeDescriptor shape consumed by the frontend
 * rendering runtimes.
 *
 * Key responsibilities:
 *   - Normalises snake_case / camelCase field aliases to canonical camelCase
 *   - Resolves renderer family (master | document | ledger | simple)
 *   - Derives surfaces, capabilities, field editors/displays, option sources
 *   - Wires relations into line_items / child_records surface slots
 *   - Produces a stable FNV-1a descriptor hash for cache invalidation
 *
 * Uses Zod v4 — different API from api-contracts (Zod v3).
 */
import {
  META_ENTITY_RUNTIME_CONTRACT_VERSION,
  MetaEntityRuntimeDescriptorSchema,
  type DisabledReason,
  type MetaEntityCapabilities,
  type MetaEntityConcurrencySummary,
  type MetaEntityExtensions,
  type MetaEntityField,
  type MetaEntityFieldDisplay,
  type MetaEntityFieldEditor,
  type MetaEntityFieldGroup,
  type MetaEntityLifecycleStateMask,
  type MetaEntityLifecycleSummary,
  type MetaEntityNumberingSummary,
  type MetaEntityOperation,
  type MetaEntityOption,
  type MetaEntityOptionDependency,
  type MetaEntityOptionSource,
  type MetaEntityPolicySummary,
  type MetaEntityRelation,
  type MetaEntityRenderer,
  type MetaEntityRuntimeDescriptor,
  type MetaEntitySource,
  type MetaEntitySurface,
  type MetaEntityWorkflowSummary,
} from "./schemas";

type JsonRecord = Record<string, unknown>;

export interface CompiledMetaEntityInput {
  entity_id?: string;
  entity_code?: string;
  name?: string;
  slug?: string | null;
  entity_name?: string;
  label_singular?: string | null;
  entity_class?: string;
  table_schema?: string;
  table_name?: string;
  backing_type?: string;
  ownership_model?: string;
  version_id?: string;
  version_no?: number;
  version_hash?: string | null;
  fields?: CompiledMetaEntityFieldInput[];
  field_groups?: unknown[];
  display_config?: unknown;
  identity_config?: unknown;
  search_config?: unknown;
  data_policy?: unknown;
  feature_flags?: unknown;
  governance_level?: string;
  security_tier?: string;
  mutability?: string;
  class_profile?: unknown;
  compiled_at?: string;
  compiled_hash?: string;
  concurrency_policy?: unknown;
}

export interface CompiledMetaEntityFieldInput {
  id?: string;
  name: string;
  column_name?: string;
  columnName?: string;
  label?: string | null;
  description?: string | null;
  data_type?: string;
  dataType?: string;
  ui_type?: string | null;
  uiType?: string | null;
  format?: string | null;
  unit?: string | null;
  cardinality?: string | null;
  origin?: string | null;
  group_key?: string | null;
  groupKey?: string | null;
  sort_order?: number;
  sortOrder?: number;
  is_required?: boolean;
  isRequired?: boolean;
  is_unique?: boolean;
  isUnique?: boolean;
  is_searchable?: boolean;
  isSearchable?: boolean;
  is_filterable?: boolean;
  isFilterable?: boolean;
  is_sortable?: boolean;
  isSortable?: boolean;
  is_groupable?: boolean;
  isGroupable?: boolean;
  is_aggregatable?: boolean;
  isAggregatable?: boolean;
  is_pii?: boolean;
  isPii?: boolean;
  is_read_only?: boolean;
  is_readonly?: boolean;
  isReadOnly?: boolean;
  is_computed?: boolean;
  isComputed?: boolean;
  is_write_once?: boolean;
  isWriteOnce?: boolean;
  enum_domain_code?: string | null;
  enumDomainCode?: string | null;
  fk_target_entity_id?: string | null;
  fk_target_field?: string | null;
  child_entity_name?: string | null;
  childEntityName?: string | null;
  child_fk_field?: string | null;
  childFkField?: string | null;
  lookup_config?: unknown;
  lookupConfig?: unknown;
  lookup_profile?: unknown;
  lookupProfile?: unknown;
  reference_config?: unknown;
  referenceConfig?: unknown;
  filter_config?: unknown;
  filterConfig?: unknown;
  option_source?: unknown;
  optionSource?: unknown;
  editor?: unknown;
  display?: unknown;
  ui_hint?: unknown;
  uiHint?: unknown;
  visibility?: unknown;
  editability?: unknown;
  validation?: unknown;
  validation_rules?: unknown;
  validationRules?: unknown;
  constraints?: unknown;
  default_value?: unknown;
  defaultValue?: unknown;
}

export interface EntityOperationInput {
  id?: string;
  entity_name?: string;
  permission_code?: string;
  permissionCode?: string;
  surface?: string;
  placement?: string;
  handler_type?: string;
  handlerType?: string;
  handler_target?: string | null;
  handlerTarget?: string | null;
  is_record_required?: boolean;
  isRecordRequired?: boolean;
  sort_order?: number;
  sortOrder?: number;
  label_override?: string | null;
  label?: string | null;
  icon_override?: string | null;
  icon?: string | null;
  is_enabled?: boolean;
  enabled?: boolean;
  disabled_reason?: string | null;
  disabledReason?: string | null;
  action_group?: string | null;
  actionGroup?: string | null;
  intent?: string | null;
  requires_confirmation?: boolean | null;
  requiresConfirmation?: boolean | null;
  requires_reason?: boolean | null;
  requiresReason?: boolean | null;
  source?: string | null;
  permission_decision?: string | null;
  permissionDecision?: string | null;
  lifecycle_transitions?: unknown;
  lifecycleTransitions?: unknown;
}

export interface EntityLifecycleTransitionInput {
  id?: string;
  transition_id?: string;
  transitionId?: string;
  lifecycle_id?: string;
  lifecycleId?: string;
  operation_code?: string | null;
  operationCode?: string | null;
  from_state?: string | null;
  fromState?: string | null;
  to_state?: string | null;
  toState?: string | null;
  requires_reason?: boolean | null;
  requiresReason?: boolean | null;
  requires_confirmation?: boolean | null;
  requiresConfirmation?: boolean | null;
}

export interface EntityRelationInput {
  id?: string;
  name: string;
  relation_kind?: string;
  kind?: string;
  target_entity?: string;
  targetEntity?: string;
  fk_field?: string | null;
  fkField?: string | null;
  target_key?: string | null;
  targetKey?: string | null;
  on_delete?: string | null;
  onDelete?: string | null;
  ui_behavior?: unknown;
  uiBehavior?: unknown;
}

export interface EntityPolicyInput {
  access_mode?: string;
  accessMode?: string;
  company_scope_mode?: string;
  companyScopeMode?: string;
  audit_mode?: string;
  auditMode?: string;
  field_scope_eval_order?: string;
  fieldScopeEvalOrder?: string;
}

export interface MetaEntityCompileOptions {
  operations?: EntityOperationInput[];
  lifecycleTransitions?: EntityLifecycleTransitionInput[];
  relations?: EntityRelationInput[];
  entityPolicy?: EntityPolicyInput | null;
  fieldSecurityPolicies?: unknown[];
  lifecycle?: MetaEntityLifecycleSummary | null;
  /**
   * Per-status capability masks fetched from control.entity_lifecycle_state_mask.
   * Tenant-scoped masks override platform defaults; the caller resolves which
   * masks apply before passing them here.
   */
  lifecycleStateMasks?: MetaEntityLifecycleStateMask[];
  workflow?: MetaEntityWorkflowSummary | null;
  numbering?: MetaEntityNumberingSummary | EntityNumberingConfigInput | null;
  concurrencyPolicy?: unknown;
  flows?: EntityFlowInput[];
  extensions?: MetaEntityExtensions;
  compiledAt?: string;
  descriptorHash?: string;
  /**
   * Optional permission-code alias map (alias_code → canonical_code) from
   * control.permission_alias. When provided, hasOperation() treats alias
   * codes on entity_operation rows as equivalent to their canonical form.
   * Empty/missing map falls back to the legacy token-matching heuristic.
   */
  permissionAliasMap?: Record<string, string>;
}

export interface EntityNumberingConfigInput {
  number_field?: string;
  numberField?: string;
  reset_strategy?: string;
  resetStrategy?: string;
  uniqueness_scope?: string;
  uniquenessScope?: string;
  segments?: unknown[];
  is_active?: boolean;
  enabled?: boolean;
}

export interface EntityFlowInput {
  id?: string;
  flow_code?: string;
  flowCode?: string;
  label?: string;
  trigger_context?: string;
  triggerContext?: string;
  is_default?: boolean;
  isDefault?: boolean;
  status?: string;
}

interface ResolutionContext {
  entity: CompiledMetaEntityInput;
  displayConfig: JsonRecord;
  identityConfig: JsonRecord;
  featureFlags: JsonRecord;
  classProfile: JsonRecord;
  operations: MetaEntityOperation[];
  relations: MetaEntityRelation[];
  lineRelations: MetaEntityRelation[];
  childRelations: MetaEntityRelation[];
  policy: MetaEntityPolicySummary;
  lifecycle?: MetaEntityLifecycleSummary;
  workflow?: MetaEntityWorkflowSummary;
  numbering?: MetaEntityNumberingSummary;
  concurrency?: MetaEntityConcurrencySummary;
  flows: EntityFlowInput[];
  renderer: MetaEntityRenderer;
  lifecycleStateMasks: MetaEntityLifecycleStateMask[];
  permissionAliasMap: Record<string, string>;
}

export function compileMetaEntityRuntimeDescriptor(
  entity: CompiledMetaEntityInput,
  options: MetaEntityCompileOptions = {},
): MetaEntityRuntimeDescriptor {
  const displayConfig = asRecord(entity.display_config);
  const identityConfig = asRecord(entity.identity_config);
  const featureFlags = asRecord(entity.feature_flags);
  const classProfile = asRecord(entity.class_profile);
  // Resolve entity code once — used in normalizeFields and the descriptor root.
  const entityCode = resolveEntityCode(entity);
  const operations = enrichOperationsWithLifecycleTransitions(
    normalizeOperations(options.operations ?? []),
    options.lifecycleTransitions ?? [],
  );
  const relations = normalizeRelations(options.relations ?? []);
  const lineRelations = relations.filter((relation) => isLineItemRelation(entity, relation));
  const childRelations = relations.filter((relation) => isChildRecordRelation(entity, relation, lineRelations));
  const renderer = resolveRenderer(entity);
  const policy = resolvePolicy(entity, options);
  const lifecycle = resolveLifecycle(entity, options.lifecycle ?? null);
  const workflow = resolveWorkflow(entity, options.workflow ?? null);
  const numbering = resolveNumbering(entity, options.numbering ?? null);
  const concurrency = resolveConcurrency(options.concurrencyPolicy ?? entity.concurrency_policy);
  const fields = normalizeFields(entity.fields ?? [], entityCode);
  const fieldGroups = normalizeFieldGroups(
    Array.isArray(entity.field_groups) ? entity.field_groups : [],
    fields,
  );

  const context: ResolutionContext = {
    entity,
    displayConfig,
    identityConfig,
    featureFlags,
    classProfile,
    operations,
    relations,
    lineRelations,
    childRelations,
    policy,
    lifecycle,
    workflow,
    numbering,
    concurrency,
    flows: options.flows ?? [],
    renderer,
    lifecycleStateMasks: options.lifecycleStateMasks ?? [],
    permissionAliasMap: options.permissionAliasMap ?? {},
  };

  const capabilities = resolveCapabilities(context);
  const descriptorWithoutHash: MetaEntityRuntimeDescriptor = {
    contractVersion: META_ENTITY_RUNTIME_CONTRACT_VERSION,
    entityCode,
    entityName: resolveEntityName(entity),
    routeSlug: resolveRouteSlug(entity),
    renderer,
    capabilities,
    surfaces: resolveSurfaces(context, capabilities, fields),
    fields,
    fieldGroups,
    operations,
    relations: relations.map((relation) => ({
      ...relation,
      surfaceKind: lineRelations.includes(relation)
        ? "line_items"
        : childRelations.includes(relation)
          ? "child_records"
          : relation.surfaceKind,
    })),
    source: resolveSource(entity),
    policy,
    lifecycle,
    lifecycleStateMasks: context.lifecycleStateMasks,
    workflow,
    numbering,
    concurrency,
    extensions: emptyRecord(options.extensions) ? undefined : options.extensions,
    audit: {
      compiledAt: options.compiledAt ?? entity.compiled_at,
      compiledHash: entity.compiled_hash,
    },
  };

  const descriptor = {
    ...descriptorWithoutHash,
    audit: {
      ...descriptorWithoutHash.audit,
      descriptorHash: options.descriptorHash ?? createDescriptorHash(descriptorWithoutHash),
    },
  };

  return MetaEntityRuntimeDescriptorSchema.parse(descriptor);
}

export function resolveRenderer(entity: CompiledMetaEntityInput): MetaEntityRenderer {
  const displayConfig = asRecord(entity.display_config);
  const featureFlags = asRecord(entity.feature_flags);
  const explicit = normalizeRenderer(readString(displayConfig, "detail_renderer"));
  if (explicit) return explicit;

  if (readBoolean(featureFlags, "has_workflow") || readBoolean(featureFlags, "is_approvable")) {
    return "document";
  }

  const entityClass = normalizeToken(entity.entity_class);
  if (entityClass === "DOCUMENT" || entityClass === "DOCUMENT_RELATION") return "document";
  if (entityClass === "LEDGER" || entityClass === "LOG") return "ledger";
  if (displayConfig["document_header"] !== undefined) return "document";
  if (normalizeToken(entity.table_schema) === "DOCUMENT") return "document";

  return "master";
}

export function isLineItemRelation(
  entity: CompiledMetaEntityInput,
  relation: MetaEntityRelation,
): boolean {
  const featureFlags = asRecord(entity.feature_flags);
  if (readBoolean(featureFlags, "has_lines") !== true) return false;
  if (relation.kind !== "has_many") return false;

  const displayConfig = asRecord(entity.display_config);
  const lineEntityCode = readString(displayConfig, "line_entity_code");
  const surface = normalizeSurfaceHint(relation.uiBehavior);

  return relation.name === "lines"
    || surface === "lines_tab"
    || surface === "line_items"
    || (!!lineEntityCode && relation.targetEntity === lineEntityCode);
}

export function isChildRecordRelation(
  entity: CompiledMetaEntityInput,
  relation: MetaEntityRelation,
  lineRelations: MetaEntityRelation[] = [],
): boolean {
  if (lineRelations.includes(relation)) return false;
  if (relation.kind !== "has_many" && relation.kind !== "m2m") return false;

  const surface = normalizeSurfaceHint(relation.uiBehavior);
  if (surface === "hidden" || surface === "none") return false;
  if (readOptionalBoolean(relation.uiBehavior, "enabled") === false) return false;

  const flags = asRecord(entity.feature_flags);
  if (readBoolean(flags, "is_readonly") && surface === undefined) return false;

  return true;
}

function resolveCapabilities(context: ResolutionContext): MetaEntityCapabilities {
  const {
    entity,
    displayConfig,
    featureFlags,
    operations,
    lineRelations,
    childRelations,
    policy,
    lifecycle,
    workflow,
    renderer,
    permissionAliasMap,
  } = context;

  const recordsDisabled = readBoolean(featureFlags, "records_api_disabled")
    || readBoolean(featureFlags, "generic_runtime_disabled");
  const hardDeleteEnabled = readBoolean(featureFlags, "generic_hard_delete_enabled")
    || readBoolean(featureFlags, "hard_delete_enabled")
    || readBoolean(featureFlags, "allow_hard_delete");
  const hidden = readBoolean(featureFlags, "is_hidden");
  const readOnly = renderer === "ledger"
    || readBoolean(featureFlags, "is_readonly")
    || readString(displayConfig, "detail_profile") === "read-only"
    || normalizeToken(entity.mutability) === "IMMUTABLE"
    || normalizeToken(entity.mutability) === "LOCKED";

  const canRead = !recordsDisabled && !hidden && policy.accessMode !== "default_deny";

  // Resolve each CRUD capability via the cascading gate:
  //   records_api_disabled → entity hidden → default_deny → entity_readonly
  //   → (delete only: hard_delete_enabled) → operation present
  // Each gate carries a stable DisabledReason so the UI can surface it.
  const { allow: canCreate, reason: canCreateReason } = resolveCrudCapability({
    canRead, readOnly, recordsDisabled, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "create",
  });
  const { allow: canEdit, reason: canEditReason } = resolveCrudCapability({
    canRead, readOnly, recordsDisabled, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "edit",
  });
  const { allow: canDelete, reason: canDeleteReason } = resolveCrudCapability({
    canRead, readOnly, recordsDisabled, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "delete",
    extraGate: hardDeleteEnabled ? null : { reason: "hard_delete_disabled" },
  });

  const hasWorkflow = readBoolean(featureFlags, "has_workflow")
    || readBoolean(featureFlags, "is_approvable")
    || workflow?.enabled === true;
  const hasLifecycle = readBoolean(featureFlags, "has_lifecycle")
    || lifecycle?.enabled === true
    || Array.isArray(displayConfig["lifecycle_stages"]);
  const hasVersions = readBoolean(featureFlags, "version_control");
  const hasActivityLog = readBoolean(featureFlags, "event_history");
  const hasAuditTrail = policy.auditMode !== "disabled";

  return {
    canRead,
    canCreate,
    canEdit,
    canDelete,
    canCreateReason,
    canEditReason,
    canDeleteReason,
    hasLineItems: lineRelations.length > 0,
    hasChildRecords: childRelations.length > 0,
    hasDistributions: readBoolean(featureFlags, "has_accounting_distribution"),
    hasAttachments: readOptionalBoolean(featureFlags, "has_attachments") !== false,
    hasComments: readBoolean(featureFlags, "comments_enabled"),
    hasWorkflow,
    hasLifecycle,
    hasVersions,
    hasCompare: hasVersions,
    hasActivityLog,
    hasAuditTrail,
    hasAuditSummary: hasAuditTrail || context.policy.hasFieldSecurity,
    hasImport: readBoolean(featureFlags, "is_importable"),
    hasBulk: readBoolean(featureFlags, "is_bulk_editable"),
    isReadOnly: readOnly,
  };
}

interface CrudCapabilityInput {
  canRead: boolean;
  readOnly: boolean;
  recordsDisabled: boolean;
  hidden: boolean;
  accessMode: MetaEntityPolicySummary["accessMode"];
  operations: MetaEntityOperation[];
  permissionAliasMap: Record<string, string>;
  action: "create" | "edit" | "delete";
  /** Extra gate for capability-specific guards (e.g. delete needs hardDelete). */
  extraGate?: { reason: DisabledReason } | null;
}

function resolveCrudCapability(input: CrudCapabilityInput): {
  allow: boolean;
  reason: DisabledReason | null;
} {
  if (input.recordsDisabled) return { allow: false, reason: "records_api_disabled" };
  if (input.hidden) return { allow: false, reason: "entity_hidden" };
  if (input.accessMode === "default_deny") return { allow: false, reason: "default_deny_policy" };
  if (!input.canRead) return { allow: false, reason: "default_deny_policy" };
  if (input.readOnly) return { allow: false, reason: "entity_readonly" };
  if (input.extraGate) return { allow: false, reason: input.extraGate.reason };
  if (!hasOperation(input.operations, input.action, input.permissionAliasMap)) {
    return { allow: false, reason: "missing_permission" };
  }
  return { allow: true, reason: null };
}

function resolveSurfaces(
  context: ResolutionContext,
  capabilities: MetaEntityCapabilities,
  fields: MetaEntityField[],
): MetaEntitySurface[] {
  const surfaces: MetaEntitySurface[] = [
    {
      kind: "fields",
      key: "fields",
      label: "Details",
      order: 10,
      placement: "main",
      enabled: true,
      groupKeys: unique(fields.map((field) => field.groupKey).filter(isPresent)),
    },
  ];

  let order = 20;
  for (const relation of context.lineRelations) {
    surfaces.push({
      kind: "line_items",
      key: relation.name,
      label: readString(relation.uiBehavior, "label") ?? "Line Items",
      order,
      placement: "main",
      enabled: true,
      entityCode: relation.targetEntity,
      parentField: relation.fkField,
      relationName: relation.name,
      displayMode: normalizeLineDisplayMode(relation.uiBehavior),
      canCreate: capabilities.canCreate,
      canEdit: capabilities.canEdit,
      canDelete: capabilities.canDelete,
      affectsTotals: readBoolean(relation.uiBehavior, "affects_totals"),
      requiredForSubmit: readBoolean(relation.uiBehavior, "required_for_submit"),
    });
    order += 10;
  }

  if (capabilities.hasDistributions) {
    surfaces.push(genericSurface("distributions", "distributions", "Distributions", order, "main"));
    order += 10;
  }

  for (const relation of context.childRelations) {
    surfaces.push({
      kind: "child_records",
      key: relation.name,
      label: readString(relation.uiBehavior, "label") ?? toTitleLabel(relation.name),
      order,
      placement: normalizePlacement(relation.uiBehavior, "main"),
      enabled: true,
      entityCode: relation.targetEntity,
      parentField: relation.fkField,
      relationName: relation.name,
      displayMode: normalizeChildDisplayMode(relation.uiBehavior),
      canCreate: capabilities.canCreate,
      canEdit: capabilities.canEdit,
      canDelete: capabilities.canDelete,
    });
    order += 10;
  }

  if (capabilities.hasWorkflow) {
    surfaces.push(genericSurface("workflow", "workflow", "Workflow", 200, "subroute"));
  }
  if (capabilities.hasLifecycle) {
    surfaces.push(genericSurface("lifecycle", "lifecycle", "Lifecycle", 210, "context_panel"));
  }
  if (capabilities.hasAttachments) {
    surfaces.push(genericSurface("attachments", "attachments", "Attachments", 300, "subroute"));
  }
  if (capabilities.hasVersions) {
    surfaces.push(genericSurface("versions", "versions", "Versions", 320, "subroute"));
    surfaces.push(genericSurface("compare", "compare", "Compare", 330, "subroute"));
  }
  if (capabilities.hasComments) {
    surfaces.push(genericSurface("comments", "comments", "Comments", 340, "context_panel"));
  }
  if (capabilities.hasActivityLog) {
    surfaces.push(genericSurface("activity_log", "activity", "Activity", 360, "subroute"));
  }
  if (capabilities.hasAuditSummary) {
    surfaces.push(genericSurface("audit_summary", "audit-summary", "Audit Summary", 370, "context_panel"));
  }
  if (capabilities.hasAuditTrail) {
    surfaces.push(genericSurface("audit_trail", "audit-trail", "Audit Trail", 380, "subroute"));
  }
  if (hasFlowSurface(context)) {
    surfaces.push(genericSurface("flow", "flow", "Flow", 400, "subroute", {
      flowCodes: resolveFlowCodes(context),
    }));
  }

  return surfaces.sort((left, right) => left.order - right.order);
}

function normalizeFieldGroups(
  rawGroups: unknown[],
  fields: MetaEntityField[],
): MetaEntityFieldGroup[] {
  const defined = rawGroups
    .map((raw, index): MetaEntityFieldGroup | null => {
      const row = asRecordOrUndefined(raw);
      if (!row) return null;

      const key = readString(row, "key") ?? readString(row, "group_key");
      const label = readString(row, "label");
      if (!key || !label) return null;

      const order = typeof row["order"] === "number"
        ? row["order"]
        : typeof row["sort_order"] === "number"
          ? (row["sort_order"] as number)
          : index * 10;

      const rawColumns = row["columns"];
      const columns: 1 | 2 | 3 =
        rawColumns === 1 || rawColumns === 2 || rawColumns === 3 ? rawColumns : 2;

      const rawPageSpan = readString(row, "pageSpan") ?? readString(row, "page_span");
      const pageSpan: MetaEntityFieldGroup["pageSpan"] =
        rawPageSpan === "narrow" || rawPageSpan === "half" || rawPageSpan === "wide" || rawPageSpan === "full"
          ? rawPageSpan
          : "full";

      const rawSurface = readString(row, "surface");
      const surface: MetaEntityFieldGroup["surface"] =
        rawSurface === "detail" || rawSurface === "edit" || rawSurface === "create" || rawSurface === "print"
          ? rawSurface
          : "all";

      return {
        key,
        label,
        description: readString(row, "description"),
        order,
        columns,
        pageSpan,
        surface,
        role: readString(row, "role"),
        initiallyCollapsed: readBoolean(row, "initiallyCollapsed") || readBoolean(row, "initially_collapsed"),
      };
    })
    .filter((g): g is MetaEntityFieldGroup => g !== null)
    .sort((a, b) => a.order - b.order);

  const definedKeys = new Set(defined.map((g) => g.key));

  const fallbackKeys = fields
    .map((f) => f.groupKey)
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0 && !definedKeys.has(k));

  const seenFallback = new Set<string>();
  const fallbacks: MetaEntityFieldGroup[] = [];
  for (const key of fallbackKeys) {
    if (seenFallback.has(key)) continue;
    seenFallback.add(key);
    fallbacks.push({
      key,
      label: toTitleLabel(key),
      order: (defined.at(-1)?.order ?? 0) + (fallbacks.length + 1) * 10,
      columns: 2,
      pageSpan: "full",
      surface: "all",
      initiallyCollapsed: false,
    });
  }

  return [...defined, ...fallbacks];
}

function normalizeFields(fields: CompiledMetaEntityFieldInput[], entityCode: string): MetaEntityField[] {
  return fields
    .map((field, index): MetaEntityField => {
      const lookupConfig = asRecordOrUndefined(field.lookup_config ?? field.lookupConfig);
      const lookupProfile = asRecordOrUndefined(field.lookup_profile ?? field.lookupProfile);
      const filterConfig = asRecordOrUndefined(field.filter_config ?? field.filterConfig);
      const visibility = normalizeFieldVisibility(field);
      const editability = asRecordOrUndefined(field.editability);
      const validation =
        asRecordOrUndefined(field.validation)
        ?? asRecordOrUndefined(field.validation_rules)
        ?? asRecordOrUndefined(field.validationRules);
      const referenceConfig = asRecordOrUndefined(field.reference_config ?? field.referenceConfig)
        ?? referenceConfigFromValidation(validation);
      const constraints = asRecordOrUndefined(field.constraints);
      const explicitEditor = asRecordOrUndefined(field.editor);
      const explicitDisplay = asRecordOrUndefined(field.display);
      const name = field.name;
      const dataType = field.data_type ?? field.dataType ?? "text";
      const enumDomainCode = nullToUndefined(field.enum_domain_code ?? field.enumDomainCode);
      const referenceEntity = resolveReferenceEntity(referenceConfig);
      const optionSource = resolveFieldOptionSource({
        field,
        name,
        dataType,
        enumDomainCode,
        referenceEntity,
        referenceConfig,
        lookupConfig,
        validation,
        constraints,
        explicitEditor,
        entityCode,
      });
      const editor = resolveFieldEditor({
        field,
        dataType,
        optionSource,
        explicitEditor,
      });
      const display = resolveFieldDisplay({
        field,
        dataType,
        optionSource,
        explicitDisplay,
        referenceConfig,
      });

      return {
        key: field.id ?? name,
        name,
        columnName: readString(field, "column_name") ?? readString(field, "columnName") ?? name,
        label: field.label ?? toTitleLabel(name),
        dataType,
        uiType: nullToUndefined(field.ui_type ?? field.uiType),
        format: nullToUndefined(field.format),
        unit: nullToUndefined(field.unit),
        cardinality: nullToUndefined(field.cardinality),
        origin: nullToUndefined(field.origin),
        groupKey: nullToUndefined(field.group_key ?? field.groupKey),
        order: field.sort_order ?? field.sortOrder ?? index,
        isRequired: field.is_required ?? field.isRequired ?? false,
        isUnique: field.is_unique ?? field.isUnique ?? false,
        isSearchable: field.is_searchable ?? field.isSearchable ?? false,
        isFilterable: field.is_filterable ?? field.isFilterable ?? false,
        isSortable: field.is_sortable ?? field.isSortable ?? false,
        isGroupable: field.is_groupable ?? field.isGroupable ?? false,
        isAggregatable: field.is_aggregatable ?? field.isAggregatable ?? false,
        isPii: field.is_pii ?? field.isPii ?? false,
        isReadOnly: field.is_read_only ?? field.is_readonly ?? field.isReadOnly ?? false,
        isComputed: field.is_computed ?? field.isComputed ?? false,
        isWriteOnce: field.is_write_once ?? field.isWriteOnce ?? false,
        enumDomainCode,
        referenceEntity,
        childEntityName: nullToUndefined(field.child_entity_name ?? field.childEntityName),
        childFkField: nullToUndefined(field.child_fk_field ?? field.childFkField),
        lookupConfig,
        lookupProfile,
        referenceConfig,
        filterConfig,
        optionSource,
        editor,
        display,
        visibility,
        editability,
        validation,
        constraints,
        defaultValue: field.default_value ?? field.defaultValue,
      };
    })
    .sort((left, right) => left.order - right.order);
}

function normalizeFieldVisibility(field: CompiledMetaEntityFieldInput): JsonRecord | undefined {
  const explicit = asRecordOrUndefined(field.visibility);
  const uiHint = asRecord(field.ui_hint ?? field.uiHint);
  const display = asRecord(uiHint["display"]);
  const merged: JsonRecord = { ...(explicit ?? {}) };

  copyIfMissing(merged, "hide_in", display["hide_in"]);
  copyIfMissing(merged, "hideIn", display["hideIn"]);
  copyIfMissing(merged, "show_in", display["show_in"]);
  copyIfMissing(merged, "showIn", display["showIn"]);
  copyIfMissing(merged, "hidden", display["hidden"]);
  copyIfMissing(merged, "visible", display["visible"]);
  copyIfMissing(merged, "visible_when", display["visible_when"] ?? uiHint["visible_when"]);
  copyIfMissing(merged, "visibleWhen", display["visibleWhen"] ?? uiHint["visibleWhen"]);

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function copyIfMissing(target: JsonRecord, key: string, value: unknown): void {
  if (value !== undefined && target[key] === undefined) target[key] = value;
}

function resolveFieldOptionSource({
  field,
  name,
  dataType,
  enumDomainCode,
  referenceEntity,
  referenceConfig,
  lookupConfig,
  validation,
  constraints,
  explicitEditor,
  entityCode,
}: {
  field: CompiledMetaEntityFieldInput;
  name: string;
  dataType: string;
  enumDomainCode?: string;
  referenceEntity?: string;
  referenceConfig?: JsonRecord;
  lookupConfig?: JsonRecord;
  validation?: JsonRecord;
  constraints?: JsonRecord;
  explicitEditor?: JsonRecord;
  entityCode: string;
}): MetaEntityOptionSource | undefined {
  const explicit = normalizeExplicitOptionSource(
    field.option_source
      ?? field.optionSource
      ?? explicitEditor?.["optionSource"]
      ?? explicitEditor?.["option_source"],
  );
  if (explicit) return explicit.kind === "none" ? undefined : explicit;

  const staticOptions = resolveStaticOptions(constraints) ?? resolveStaticOptions(validation);
  if (staticOptions && staticOptions.length > 0) {
    return {
      kind: "static",
      options: staticOptions,
    };
  }

  const lookupDomainCode = enumDomainCode
    ?? readString(lookupConfig, "domain_code")
    ?? readString(lookupConfig, "domainCode")
    ?? readString(lookupConfig, "lookup_domain")
    ?? readString(lookupConfig, "lookupDomain")
    ?? readString(lookupConfig, "domain");
  if (lookupDomainCode) {
    return {
      kind: "lookup",
      domainCode: lookupDomainCode,
      valueField: normalizeLookupValueField(readString(lookupConfig, "value_field") ?? readString(lookupConfig, "valueField")),
      includeInactive: readOptionalBoolean(lookupConfig, "include_inactive") ?? readOptionalBoolean(lookupConfig, "includeInactive"),
      ownershipMode: normalizeLookupOwnershipMode(
        readString(lookupConfig, "ownership_mode") ?? readString(lookupConfig, "ownershipMode"),
      ),
    };
  }

  const normalizedDataType = dataType.toLowerCase();
  if (name.endsWith("_type") || isStatusField(name) || normalizedDataType === "enum" || normalizedDataType === "lifecycle_state") {
    return {
      kind: "lookup",
      domainCode: name,
      valueField: "code",
    };
  }

  const targetEntity = referenceEntity ?? inferReferenceEntity(name, normalizedDataType, entityCode);
  if (targetEntity || normalizedDataType === "reference") {
    const picker = asRecord(referenceConfig?.["picker"]);
    return {
      kind: "reference",
      entity: normalizeReferenceEntityCode(targetEntity ?? name),
      valueField: readString(referenceConfig, "value_field")
        ?? readString(referenceConfig, "valueField")
        ?? readString(referenceConfig, "target_field")
        ?? readString(referenceConfig, "targetField")
        ?? "id",
      labelField: readString(referenceConfig, "label_field")
        ?? readString(referenceConfig, "labelField")
        ?? readString(referenceConfig, "display_field")
        ?? readString(referenceConfig, "displayField")
        ?? "name",
      codeField: readString(referenceConfig, "code_field")
        ?? readString(referenceConfig, "codeField")
        ?? readString(picker, "code_field")
        ?? readString(picker, "codeField")
        ?? "code",
      descriptionField: readString(referenceConfig, "description_field")
        ?? readString(referenceConfig, "descriptionField"),
      filters: asRecordOrUndefined(referenceConfig?.["filters"]),
      dependsOn: normalizeOptionDependency(
        referenceConfig?.["dependent_filter"]
          ?? referenceConfig?.["dependentFilter"]
          ?? lookupConfig?.["dependent_filter"]
          ?? lookupConfig?.["dependentFilter"],
      ),
      scopeMode: normalizeScopeMode(readString(referenceConfig, "scope_mode") ?? readString(referenceConfig, "scopeMode")),
      includeInactive: readOptionalBoolean(referenceConfig, "include_inactive") ?? readOptionalBoolean(referenceConfig, "includeInactive"),
    };
  }

  return undefined;
}

function resolveFieldEditor({
  field,
  dataType,
  optionSource,
  explicitEditor,
}: {
  field: CompiledMetaEntityFieldInput;
  dataType: string;
  optionSource?: MetaEntityOptionSource;
  explicitEditor?: JsonRecord;
}): MetaEntityFieldEditor {
  const explicitControl = normalizeEditorControl(readString(explicitEditor, "control"));
  const control = explicitControl ?? defaultEditorControl(field, dataType, optionSource);
  return {
    control,
    optionSource,
    allowClear: readOptionalBoolean(explicitEditor, "allowClear")
      ?? readOptionalBoolean(explicitEditor, "allow_clear")
      ?? !Boolean(field.is_required ?? field.isRequired),
    placeholder: readString(explicitEditor, "placeholder"),
    search: readOptionalBoolean(explicitEditor, "search")
      ?? (optionSource?.kind === "reference" || optionSource?.kind === "lookup"),
  };
}

function resolveFieldDisplay({
  field,
  dataType,
  optionSource,
  explicitDisplay,
  referenceConfig,
}: {
  field: CompiledMetaEntityFieldInput;
  dataType: string;
  optionSource?: MetaEntityOptionSource;
  explicitDisplay?: JsonRecord;
  referenceConfig?: JsonRecord;
}): MetaEntityFieldDisplay {
  const explicitRenderer = normalizeDisplayRenderer(readString(explicitDisplay, "renderer"));
  const renderer = explicitRenderer ?? defaultDisplayRenderer(field, dataType, optionSource);
  return {
    renderer,
    fallback: normalizeDisplayFallback(readString(explicitDisplay, "fallback")) ?? "dash",
    format: normalizeDisplayFormat(readString(explicitDisplay, "format"))
      ?? normalizeDisplayFormat(readString(referenceConfig, "display_format") ?? readString(referenceConfig, "displayFormat"))
      ?? (renderer === "reference_label" ? "label_code" : undefined),
    valueField: readString(explicitDisplay, "valueField") ?? readString(explicitDisplay, "value_field"),
    labelField: readString(explicitDisplay, "labelField") ?? readString(explicitDisplay, "label_field"),
  };
}

function normalizeExplicitOptionSource(value: unknown): MetaEntityOptionSource | undefined {
  const source = asRecordOrUndefined(value);
  const kind = normalizeOptionSourceKind(readString(source, "kind"));
  if (!source || !kind) return undefined;
  if (kind === "none") return { kind: "none" };
  if (kind === "static") {
    return {
      kind,
      options: resolveStaticOptions(source) ?? [],
    };
  }
  if (kind === "lookup") {
    const domainCode = readString(source, "domainCode")
      ?? readString(source, "domain_code")
      ?? readString(source, "domain");
    if (!domainCode) return undefined;
    return {
      kind,
      domainCode,
      valueField: normalizeLookupValueField(readString(source, "valueField") ?? readString(source, "value_field")),
      includeInactive: readOptionalBoolean(source, "includeInactive") ?? readOptionalBoolean(source, "include_inactive"),
      ownershipMode: normalizeLookupOwnershipMode(readString(source, "ownershipMode") ?? readString(source, "ownership_mode")),
    };
  }

  const entity = readString(source, "entity")
    ?? readString(source, "targetEntity")
    ?? readString(source, "target_entity")
    ?? readString(source, "ref_entity");
  if (!entity) return undefined;
  return {
    kind,
    entity: normalizeReferenceEntityCode(entity),
    valueField: readString(source, "valueField") ?? readString(source, "value_field") ?? "id",
    labelField: readString(source, "labelField") ?? readString(source, "label_field") ?? "name",
    codeField: readString(source, "codeField") ?? readString(source, "code_field") ?? "code",
    descriptionField: readString(source, "descriptionField") ?? readString(source, "description_field"),
    filters: asRecordOrUndefined(source["filters"]),
    dependsOn: normalizeOptionDependency(source["dependsOn"] ?? source["depends_on"]),
    scopeMode: normalizeScopeMode(readString(source, "scopeMode") ?? readString(source, "scope_mode")),
    includeInactive: readOptionalBoolean(source, "includeInactive") ?? readOptionalBoolean(source, "include_inactive"),
  };
}

function resolveStaticOptions(value: unknown): MetaEntityOption[] | undefined {
  const record = asRecordOrUndefined(value);
  const raw = readArray(record?.["options"]).length > 0
    ? readArray(record?.["options"])
    : readArray(record?.["values"]);
  if (raw.length === 0) return undefined;

  return raw
    .map((item): MetaEntityOption | null => {
      if (typeof item === "string") {
        return { value: item, label: toTitleLabel(item) };
      }
      const option = asRecordOrUndefined(item);
      if (!option) return null;
      const valueText = readString(option, "value") ?? readString(option, "code") ?? readString(option, "id");
      if (!valueText) return null;
      return {
        value: valueText,
        label: readString(option, "label") ?? readString(option, "name") ?? toTitleLabel(valueText),
        code: readString(option, "code"),
        description: readString(option, "description"),
        disabled: readOptionalBoolean(option, "disabled"),
        metadata: asRecordOrUndefined(option["metadata"]),
      };
    })
    .filter((item): item is MetaEntityOption => Boolean(item));
}

function referenceConfigFromValidation(validation: JsonRecord | undefined): JsonRecord | undefined {
  if (!validation) return undefined;
  const hasReferenceKeys = [
    "ref_entity",
    "targetEntity",
    "target_entity",
    "entity_code",
    "entity",
    "value_field",
    "valueField",
    "target_field",
    "targetField",
    "label_field",
    "labelField",
    "display_field",
    "displayField",
    "code_field",
    "codeField",
    "scope_mode",
    "scopeMode",
    "dependent_filter",
    "dependentFilter",
    "filters",
  ].some((key) => validation[key] !== undefined);

  return hasReferenceKeys ? validation : undefined;
}

function normalizeOptionDependency(value: unknown): MetaEntityOptionDependency | undefined {
  const dependency = asRecordOrUndefined(value);
  if (!dependency) return undefined;
  const field = readString(dependency, "field") ?? readString(dependency, "source_field") ?? readString(dependency, "sourceField");
  const targetField = readString(dependency, "targetField") ?? readString(dependency, "target_field") ?? field;
  if (!field || !targetField) return undefined;
  return {
    field,
    targetField,
    required: readOptionalBoolean(dependency, "required"),
  };
}

function defaultEditorControl(
  field: CompiledMetaEntityFieldInput,
  dataType: string,
  optionSource?: MetaEntityOptionSource,
): MetaEntityFieldEditor["control"] {
  const uiType = normalizeToken(field.ui_type ?? field.uiType);
  if (optionSource?.kind === "reference") return "reference_picker";
  if (optionSource?.kind === "lookup") return "combobox";
  if (optionSource?.kind === "static") return "select";
  if (uiType === "TEXTAREA" || uiType === "LONG_TEXT") return "textarea";
  if (uiType === "CHECKBOX") return "checkbox";

  const normalized = dataType.toLowerCase();
  if (normalized === "boolean" || normalized === "bool") return "checkbox";
  if (normalized === "date") return "date";
  if (normalized === "datetime" || normalized === "timestamptz" || normalized === "timestamp") return "datetime";
  if (["integer", "bigint", "decimal", "numeric", "money"].includes(normalized)) return "number";
  if (normalized === "json" || normalized === "jsonb") return "json";
  return "text";
}

function defaultDisplayRenderer(
  field: CompiledMetaEntityFieldInput,
  dataType: string,
  optionSource?: MetaEntityOptionSource,
): MetaEntityFieldDisplay["renderer"] {
  if (optionSource?.kind === "reference") return "reference_label";
  if (optionSource?.kind === "lookup" || optionSource?.kind === "static") return "lookup_label";

  const normalized = dataType.toLowerCase();
  if (normalized === "boolean" || normalized === "bool" || normalizeToken(field.ui_type ?? field.uiType) === "CHECKBOX") return "boolean";
  if (normalized === "date") return "date";
  if (normalized === "datetime" || normalized === "timestamptz" || normalized === "timestamp") return "datetime";
  if (["integer", "bigint", "decimal", "numeric"].includes(normalized)) return "number";
  if (normalized === "money") return "money";
  if (normalized === "json" || normalized === "jsonb") return "json";
  return "text";
}

function inferReferenceEntity(name: string, dataType: string, entityCode: string): string | undefined {
  if (dataType !== "uuid") return undefined;
  if (name === "id" || name === "tenant_id") return undefined;
  if (name === "parent_id") return entityCode;
  if (name.startsWith("parent_") && name.endsWith("_id")) return name.slice("parent_".length, -"_id".length);
  if (name.endsWith("_id")) return name.slice(0, -"_id".length);
  return undefined;
}

function normalizeReferenceEntityCode(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(".").filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

function normalizeEditorControl(value: string | undefined): MetaEntityFieldEditor["control"] | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized === "text"
    || normalized === "textarea"
    || normalized === "number"
    || normalized === "checkbox"
    || normalized === "date"
    || normalized === "datetime"
    || normalized === "select"
    || normalized === "combobox"
    || normalized === "reference_picker"
    || normalized === "json"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeDisplayRenderer(value: string | undefined): MetaEntityFieldDisplay["renderer"] | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized === "text"
    || normalized === "boolean"
    || normalized === "date"
    || normalized === "datetime"
    || normalized === "number"
    || normalized === "money"
    || normalized === "json"
    || normalized === "lookup_label"
    || normalized === "reference_label"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeDisplayFallback(value: string | undefined): MetaEntityFieldDisplay["fallback"] | undefined {
  if (value === "blank" || value === "dash" || value === "raw_value") return value;
  return undefined;
}

function normalizeDisplayFormat(value: string | undefined): MetaEntityFieldDisplay["format"] | undefined {
  if (value === "label" || value === "code_label" || value === "label_code" || value === "code") return value;
  return undefined;
}

function normalizeLookupValueField(value: string | undefined): "code" | "id" | undefined {
  return value === "code" || value === "id" ? value : undefined;
}

function normalizeLookupOwnershipMode(value: string | undefined): "global" | "tenant_overlay" | "tenant_owned" | "legal_entity_overlay" | undefined {
  if (value === "global" || value === "tenant_overlay" || value === "tenant_owned" || value === "legal_entity_overlay") {
    return value;
  }
  return undefined;
}

function normalizeScopeMode(value: string | undefined): "tenant" | "legal_entity" | "company_code" | "unscoped" | undefined {
  if (value === "tenant" || value === "legal_entity" || value === "company_code" || value === "unscoped") return value;
  return undefined;
}

function normalizeOptionSourceKind(value: string | undefined): MetaEntityOptionSource["kind"] | undefined {
  if (value === "none" || value === "static" || value === "lookup" || value === "reference") return value;
  return undefined;
}

function isStatusField(fieldName: string): boolean {
  return fieldName === "status" || fieldName.endsWith("_status");
}

function normalizeOperations(operations: EntityOperationInput[]): MetaEntityOperation[] {
  return operations
    .map((operation, index): MetaEntityOperation => {
      const permissionCode = operation.permission_code ?? operation.permissionCode ?? operation.id ?? `operation_${index}`;
      const lifecycleTransitions = normalizeLifecycleTransitions(
        operation.lifecycle_transitions ?? operation.lifecycleTransitions,
      );
      return {
        key: operation.id ?? permissionCode,
        permissionCode,
        surface: normalizeOperationSurface(operation.surface),
        placement: normalizeOperationPlacement(operation.placement),
        handlerType: normalizeOperationHandler(operation.handler_type ?? operation.handlerType),
        handlerTarget: operation.handler_target ?? operation.handlerTarget ?? null,
        isRecordRequired: operation.is_record_required ?? operation.isRecordRequired ?? false,
        order: operation.sort_order ?? operation.sortOrder ?? index,
        label: operation.label_override ?? operation.label ?? null,
        icon: operation.icon_override ?? operation.icon ?? null,
        enabled: operation.is_enabled ?? operation.enabled ?? true,
        disabledReason: nullToUndefined(operation.disabled_reason ?? operation.disabledReason),
        actionGroup: normalizeOperationActionGroup(operation.action_group ?? operation.actionGroup),
        intent: normalizeOperationIntent(operation.intent),
        requiresConfirmation: operation.requires_confirmation ?? operation.requiresConfirmation ?? undefined,
        requiresReason: operation.requires_reason ?? operation.requiresReason ?? undefined,
        source: normalizeOperationSource(operation.source),
        permissionDecision: normalizePermissionDecision(operation.permission_decision ?? operation.permissionDecision),
        lifecycleTransitions: lifecycleTransitions.length > 0 ? lifecycleTransitions : undefined,
      };
    })
    .sort((left, right) => left.order - right.order);
}

function normalizeLifecycleTransitions(value: unknown): NonNullable<MetaEntityOperation["lifecycleTransitions"]> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = asRecordOrUndefined(item);
      const fromState = readString(row, "fromState") ?? readString(row, "from_state");
      const toState = readString(row, "toState") ?? readString(row, "to_state");
      if (!fromState || !toState) return null;

      return {
        transitionId: readString(row, "transitionId") ?? readString(row, "transition_id"),
        lifecycleId: readString(row, "lifecycleId") ?? readString(row, "lifecycle_id"),
        fromState,
        toState,
        requiresReason: readOptionalBoolean(row, "requiresReason")
          ?? readOptionalBoolean(row, "requires_reason"),
        requiresConfirmation: readOptionalBoolean(row, "requiresConfirmation")
          ?? readOptionalBoolean(row, "requires_confirmation"),
      };
    })
    .filter(isPresent);
}

function enrichOperationsWithLifecycleTransitions(
  operations: MetaEntityOperation[],
  rows: EntityLifecycleTransitionInput[],
): MetaEntityOperation[] {
  if (rows.length === 0 || operations.length === 0) return operations;

  const transitionsByOperationCode = new Map<string, NonNullable<MetaEntityOperation["lifecycleTransitions"]>>();
  for (const row of rows) {
    const transition = normalizeLifecycleTransitionRow(row);
    const operationCode = row.operation_code ?? row.operationCode;
    if (!transition || !operationCode) continue;

    const keys = operationJoinKeys(operationCode);
    for (const key of keys) {
      const existing = transitionsByOperationCode.get(key) ?? [];
      existing.push(transition);
      transitionsByOperationCode.set(key, existing);
    }
  }

  return operations.map((operation) => {
    const extra = operationJoinKeys(operation.permissionCode)
      .flatMap((key) => transitionsByOperationCode.get(key) ?? []);
    const keyExtras = operationJoinKeys(operation.key)
      .flatMap((key) => transitionsByOperationCode.get(key) ?? []);
    const additions = dedupeLifecycleTransitions([...extra, ...keyExtras]);
    if (additions.length === 0) return operation;

    return {
      ...operation,
      actionGroup: operation.actionGroup ?? "lifecycle",
      source: operation.source ?? "lifecycle_transition",
      lifecycleTransitions: dedupeLifecycleTransitions([
        ...(operation.lifecycleTransitions ?? []),
        ...additions,
      ]),
    };
  });
}

function normalizeLifecycleTransitionRow(
  row: EntityLifecycleTransitionInput,
): NonNullable<MetaEntityOperation["lifecycleTransitions"]>[number] | null {
  const fromState = row.from_state ?? row.fromState ?? undefined;
  const toState = row.to_state ?? row.toState ?? undefined;
  if (!fromState || !toState) return null;

  return {
    transitionId: row.transition_id ?? row.transitionId ?? row.id,
    lifecycleId: row.lifecycle_id ?? row.lifecycleId,
    fromState,
    toState,
    requiresReason: row.requires_reason ?? row.requiresReason ?? undefined,
    requiresConfirmation: row.requires_confirmation ?? row.requiresConfirmation ?? undefined,
  };
}

function dedupeLifecycleTransitions(
  transitions: NonNullable<MetaEntityOperation["lifecycleTransitions"]>,
): NonNullable<MetaEntityOperation["lifecycleTransitions"]> {
  const seen = new Set<string>();
  const result: NonNullable<MetaEntityOperation["lifecycleTransitions"]> = [];
  for (const transition of transitions) {
    const key = [
      transition.transitionId ?? "",
      transition.lifecycleId ?? "",
      transition.fromState,
      transition.toState,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(transition);
  }
  return result;
}

function operationJoinKeys(value: string): string[] {
  const normalized = value.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  const parts = value.split(/[.:/]+/).filter(Boolean);
  const last = parts.at(-1)?.trim().toLowerCase().replace(/[\s.-]+/g, "_");
  return unique([normalized, last ?? normalized].filter(Boolean));
}

function normalizeRelations(relations: EntityRelationInput[]): MetaEntityRelation[] {
  return relations.map((relation): MetaEntityRelation => {
    const uiBehavior = asRecord(relation.ui_behavior ?? relation.uiBehavior);
    const kind = normalizeRelationKind(relation.relation_kind ?? relation.kind);
    const name = relation.name;
    return {
      key: relation.id ?? name,
      name,
      kind,
      targetEntity: relation.target_entity ?? relation.targetEntity ?? name,
      fkField: nullToUndefined(relation.fk_field ?? relation.fkField),
      targetKey: relation.target_key ?? relation.targetKey ?? "id",
      onDelete: nullToUndefined(relation.on_delete ?? relation.onDelete),
      uiBehavior,
      surfaceKind: readSurfaceKind(uiBehavior, kind),
    };
  });
}

function resolvePolicy(
  entity: CompiledMetaEntityInput,
  options: MetaEntityCompileOptions,
): MetaEntityPolicySummary {
  const policy = options.entityPolicy ?? undefined;
  const fieldSecurityPolicies = options.fieldSecurityPolicies ?? [];
  const flags = asRecord(entity.feature_flags);
  const auditMode = normalizeAuditMode(policy?.audit_mode ?? policy?.auditMode);

  return {
    accessMode: policy?.access_mode ?? policy?.accessMode,
    companyScopeMode: policy?.company_scope_mode ?? policy?.companyScopeMode,
    auditMode,
    fieldScopeEvalOrder: policy?.field_scope_eval_order ?? policy?.fieldScopeEvalOrder,
    hasFieldSecurity: fieldSecurityPolicies.length > 0 || readBoolean(flags, "pii_bearing"),
    securityTier: entity.security_tier,
    governanceLevel: entity.governance_level,
    mutability: entity.mutability,
  };
}

function resolveLifecycle(
  entity: CompiledMetaEntityInput,
  lifecycle: MetaEntityLifecycleSummary | null,
): MetaEntityLifecycleSummary | undefined {
  if (lifecycle) return lifecycle;
  const displayConfig = asRecord(entity.display_config);
  const stages = readStringArrayFromObjects(displayConfig["lifecycle_stages"], "key");
  if (stages.length === 0 && !readBoolean(entity.feature_flags, "has_lifecycle")) return undefined;
  return {
    enabled: true,
    states: stages,
    terminalStates: [],
    transitions: [],
  };
}

function resolveWorkflow(
  entity: CompiledMetaEntityInput,
  workflow: MetaEntityWorkflowSummary | null,
): MetaEntityWorkflowSummary | undefined {
  if (workflow) return workflow;
  const flags = asRecord(entity.feature_flags);
  if (!readBoolean(flags, "has_workflow") && !readBoolean(flags, "is_approvable")) return undefined;
  const displayConfig = asRecord(entity.display_config);
  return {
    enabled: true,
    stages: readStringArrayFromObjects(displayConfig["lifecycle_stages"], "key"),
    slaTargetHours: readNumber(flags, "sla_target_hours"),
  };
}

function resolveNumbering(
  entity: CompiledMetaEntityInput,
  numbering: MetaEntityNumberingSummary | EntityNumberingConfigInput | null,
): MetaEntityNumberingSummary | undefined {
  if (numbering) {
    if ("enabled" in numbering && typeof numbering.enabled === "boolean" && "segments" in numbering) {
      return {
        enabled: numbering.enabled,
        numberField: numbering.numberField,
        resetStrategy: numbering.resetStrategy,
        uniquenessScope: numbering.uniquenessScope,
        segments: numbering.segments ?? [],
      };
    }

    return {
      enabled: numbering.is_active ?? numbering.enabled ?? true,
      numberField: numbering.number_field ?? numbering.numberField,
      resetStrategy: numbering.reset_strategy ?? numbering.resetStrategy,
      uniquenessScope: numbering.uniqueness_scope ?? numbering.uniquenessScope,
      segments: numbering.segments ?? [],
    };
  }

  const flags = asRecord(entity.feature_flags);
  const identityConfig = asRecord(entity.identity_config);
  const numberingConfig = asRecordOrUndefined(identityConfig["numbering"]);
  if (!readBoolean(flags, "auto_number") && !numberingConfig) return undefined;

  return {
    enabled: true,
    numberField: readString(numberingConfig, "field") ?? readString(numberingConfig, "number_field"),
    resetStrategy: readString(numberingConfig, "reset_strategy"),
    uniquenessScope: readString(numberingConfig, "uniqueness_scope"),
    segments: readArray(numberingConfig?.["segments"]),
  };
}

function resolveConcurrency(value: unknown): MetaEntityConcurrencySummary | undefined {
  const policy = asRecordOrUndefined(value);
  if (!policy || Object.keys(policy).length === 0) return undefined;
  const strategy = normalizeConcurrencyStrategy(readString(policy, "strategy"));
  return {
    strategy,
    rollout: normalizeConcurrencyRollout(readString(policy, "rollout")),
    versionColumn: readString(policy, "version_column") ?? readString(policy, "versionColumn"),
    lockTtlSeconds: readNumber(policy, "lock_ttl_seconds") ?? readNumber(policy, "lockTtlSeconds"),
    heartbeatSeconds: readNumber(policy, "heartbeat_seconds") ?? readNumber(policy, "heartbeatSeconds"),
    children: readStringArray(policy["children"]),
    referencesExcluded: readStringArray(policy["references_excluded"] ?? policy["referencesExcluded"]),
  };
}

function resolveSource(entity: CompiledMetaEntityInput): MetaEntitySource {
  return {
    entityId: entity.entity_id,
    entityVersionId: entity.version_id,
    versionNo: entity.version_no,
    versionHash: nullToUndefined(entity.version_hash),
    tableSchema: entity.table_schema ?? "master",
    tableName: entity.table_name ?? resolveEntityCode(entity),
    backingType: normalizeBackingType(entity.backing_type),
    entityClass: entity.entity_class ?? "MASTER",
    ownershipModel: entity.ownership_model ?? "system",
  };
}

function resolveEntityCode(entity: CompiledMetaEntityInput): string {
  const code = entity.entity_code ?? entity.name ?? entity.table_name;
  if (!code?.trim()) {
    throw new Error("Cannot compile meta-entity runtime descriptor without entity_code, name, or table_name.");
  }
  return code;
}

function resolveEntityName(entity: CompiledMetaEntityInput): string {
  return entity.entity_name ?? entity.label_singular ?? toTitleLabel(resolveEntityCode(entity));
}

function resolveRouteSlug(entity: CompiledMetaEntityInput): string {
  const explicit = entity.slug?.trim();
  if (explicit) return explicit;
  return resolveEntityCode(entity).replace(/_/g, "-");
}

// Canonical permission codes per action. The alias map (loaded from
// control.permission_alias) lets entity_operation rows that reference legacy
// codes (e.g. 'edit') resolve to the canonical form ('update').
const CANONICAL_ACTION_CODES: Record<"read" | "create" | "edit" | "delete", readonly string[]> = {
  read:   ["read"],
  create: ["create"],
  edit:   ["update"],
  delete: ["delete"],
};

function hasOperation(
  operations: MetaEntityOperation[],
  action: "read" | "create" | "edit" | "delete",
  aliasMap: Record<string, string>,
): boolean {
  return operations.some((operation) => {
    if (!operation.enabled || operation.surface === "HIDDEN") return false;
    return permissionMatchesAction(operation.permissionCode, action, aliasMap);
  });
}

function permissionMatchesAction(
  permissionCode: string,
  action: "read" | "create" | "edit" | "delete",
  aliasMap: Record<string, string>,
): boolean {
  // Resolve aliases first: 'edit' → 'update' when the DB carries that mapping.
  const canonicalCode = aliasMap[permissionCode] ?? permissionCode;

  // Match canonical codes directly. CANONICAL_ACTION_CODES enumerates the
  // exact codes a runtime descriptor must reference for each action.
  if (CANONICAL_ACTION_CODES[action].includes(canonicalCode)) return true;

  // Tolerant fallback for namespaced/legacy codes that have not yet been
  // collapsed via permission_alias. We keep the token-bag heuristic from the
  // pre-Phase-3 implementation here so the compiler stays drift-tolerant
  // until the alias seed migrates the remaining one-off codes.
  const normalized = canonicalCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));

  if (action === "read")   return tokens.has("read")   || tokens.has("view")   || tokens.has("open")   || tokens.has("list");
  if (action === "create") return tokens.has("create") || tokens.has("new")    || tokens.has("insert") || tokens.has("add");
  if (action === "edit")   return tokens.has("edit")   || tokens.has("update") || tokens.has("write")  || tokens.has("save") || tokens.has("patch");
  return tokens.has("delete") || tokens.has("remove") || tokens.has("archive") || tokens.has("destroy");
}

function genericSurface(
  kind: Exclude<MetaEntitySurface["kind"], "fields" | "line_items" | "child_records">,
  key: string,
  label: string,
  order: number,
  placement: MetaEntitySurface["placement"],
  config?: JsonRecord,
): MetaEntitySurface {
  return {
    kind,
    key,
    label,
    order,
    placement,
    enabled: true,
    ...(config ? { config } : {}),
  } as MetaEntitySurface;
}

function hasFlowSurface(context: ResolutionContext): boolean {
  if (context.flows.some((flow) => normalizeToken(flow.status) !== "ARCHIVED")) return true;
  const alternateFlows = readStringArray(context.displayConfig["alternate_flows"]);
  const intakeModes = readArray(context.displayConfig["intake_modes"]);
  return alternateFlows.length > 0 || intakeModes.length > 0;
}

function resolveFlowCodes(context: ResolutionContext): string[] {
  const fromFlows = context.flows
    .map((flow) => flow.flow_code ?? flow.flowCode)
    .filter(isPresent);
  const fromDisplay = readStringArray(context.displayConfig["alternate_flows"]);
  return unique([...fromFlows, ...fromDisplay]);
}

function resolveReferenceEntity(referenceConfig: JsonRecord | undefined): string | undefined {
  if (!referenceConfig) return undefined;
  const entity = readString(referenceConfig, "ref_entity")
    ?? readString(referenceConfig, "targetEntity")
    ?? readString(referenceConfig, "target_entity")
    ?? readString(referenceConfig, "entity_code")
    ?? readString(referenceConfig, "entity");
  return entity ? normalizeReferenceEntityCode(entity) : undefined;
}

function normalizeRenderer(value: string | undefined): MetaEntityRenderer | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "document_detail") return "document";
  if (normalized === "master" || normalized === "document" || normalized === "ledger" || normalized === "simple") {
    return normalized;
  }
  return undefined;
}

function normalizeRelationKind(value: string | undefined): MetaEntityRelation["kind"] {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "belongs_to" || normalized === "has_many" || normalized === "m2m") return normalized;
  return "has_many";
}

function normalizeOperationSurface(value: string | undefined): MetaEntityOperation["surface"] {
  const normalized = normalizeUpperEnumToken(value);
  if (normalized === "LIST" || normalized === "DETAIL" || normalized === "BOTH" || normalized === "PALETTE_ONLY" || normalized === "HIDDEN") {
    return normalized;
  }
  return "BOTH";
}

function normalizeOperationPlacement(value: string | undefined): MetaEntityOperation["placement"] {
  const normalized = normalizeUpperEnumToken(value);
  if (normalized === "PRIMARY" || normalized === "TOOLBAR" || normalized === "OVERFLOW" || normalized === "CONTEXT" || normalized === "COMMAND") {
    return normalized;
  }
  return "TOOLBAR";
}

function normalizeOperationHandler(value: string | undefined): MetaEntityOperation["handlerType"] {
  const normalized = normalizeUpperEnumToken(value);
  if (normalized === "NAVIGATE" || normalized === "API" || normalized === "MODAL" || normalized === "INLINE") {
    return normalized;
  }
  return "API";
}

function normalizeOperationActionGroup(value: string | null | undefined): MetaEntityOperation["actionGroup"] | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "lifecycle" || normalized === "record" || normalized === "general" || normalized === "workflow_task") return normalized;
  return undefined;
}

function normalizeOperationIntent(value: string | null | undefined): MetaEntityOperation["intent"] | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "neutral" || normalized === "success" || normalized === "warning" || normalized === "danger") return normalized;
  return undefined;
}

function normalizeOperationSource(value: string | null | undefined): MetaEntityOperation["source"] | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "entity_operation" || normalized === "lifecycle_transition" || normalized === "workflow_task") return normalized;
  return undefined;
}

function normalizePermissionDecision(value: string | null | undefined): MetaEntityOperation["permissionDecision"] | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (
    normalized === "allow"
    || normalized === "deny"
    || normalized === "not_found"
    || normalized === "not_in_plan"
    || normalized === "addon_required"
    || normalized === "not_granted"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeAuditMode(value: string | undefined): MetaEntityPolicySummary["auditMode"] {
  if (value === "enabled" || value === "disabled" || value === "sampling") return value;
  return "enabled";
}

function normalizeBackingType(value: string | undefined): MetaEntitySource["backingType"] {
  if (value === "table" || value === "view" || value === "external") return value;
  return "table";
}

function normalizeConcurrencyStrategy(value: string | undefined): MetaEntityConcurrencySummary["strategy"] {
  if (value === "version_only" || value === "lease_plus_version") return value;
  return "none";
}

function normalizeConcurrencyRollout(value: string | undefined): MetaEntityConcurrencySummary["rollout"] {
  if (value === "optional" || value === "enforced") return value;
  return "observe";
}

function normalizeLineDisplayMode(uiBehavior: JsonRecord): "grid" | "cards" | "split_accounting" {
  const value = readString(uiBehavior, "displayMode") ?? readString(uiBehavior, "display_mode");
  if (value === "cards" || value === "split_accounting") return value;
  return "grid";
}

function normalizeChildDisplayMode(uiBehavior: JsonRecord): "table" | "cards" | "drawer" | "accordion" {
  const value = readString(uiBehavior, "displayMode") ?? readString(uiBehavior, "display_mode");
  if (value === "cards" || value === "drawer" || value === "accordion") return value;
  return "table";
}

function normalizePlacement(
  uiBehavior: JsonRecord,
  fallback: MetaEntitySurface["placement"],
): MetaEntitySurface["placement"] {
  const value = readString(uiBehavior, "placement");
  if (value === "main" || value === "context_panel" || value === "subroute" || value === "header" || value === "inline") {
    return value;
  }
  return fallback;
}

function normalizeSurfaceHint(uiBehavior: JsonRecord): string | undefined {
  return readString(uiBehavior, "surface")
    ?? readString(uiBehavior, "surfaceKind")
    ?? readString(uiBehavior, "surface_kind")
    ?? readString(uiBehavior, "tab");
}

function readSurfaceKind(
  uiBehavior: JsonRecord,
  kind: MetaEntityRelation["kind"],
): MetaEntityRelation["surfaceKind"] | undefined {
  const surface = normalizeSurfaceHint(uiBehavior);
  if (surface === "line_items" || surface === "lines_tab") return "line_items";
  if (surface === "child_records" || surface === "children" || surface === "tab") return "child_records";
  if (kind === "belongs_to") return "reference";
  return undefined;
}

function readBoolean(value: unknown, key?: string): boolean {
  if (key) return asRecord(value)[key] === true;
  return value === true;
}

function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  const item = asRecord(value)[key];
  return typeof item === "boolean" ? item : undefined;
}

function readNumber(record: unknown, key: string): number | undefined {
  const value = asRecord(record)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(record: unknown, key: string): string | undefined {
  const value = asRecord(record)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return readArray(value).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readStringArrayFromObjects(value: unknown, key: string): string[] {
  return readArray(value)
    .map((item) => readString(item, key))
    .filter(isPresent);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asRecordOrUndefined(value: unknown): JsonRecord | undefined {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function emptyRecord(value: unknown): boolean {
  return !value || Object.keys(asRecord(value)).length === 0;
}

function nullToUndefined(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function isPresent<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeUpperEnumToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
}

function normalizeLowerEnumToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createDescriptorHash(descriptor: MetaEntityRuntimeDescriptor): string {
  const withoutHash = {
    ...descriptor,
    audit: {
      ...descriptor.audit,
      descriptorHash: undefined,
    },
  };
  return `fnv1a32:${fnv1a32(stableStringify(withoutHash))}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as JsonRecord;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
