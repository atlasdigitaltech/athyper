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
  DEFAULT_META_ENTITY_LIST_CACHE_POLICY,
  MetaEntityListCachePolicySchema,
  MetaEntityRuntimeDescriptorSchema,
  MetaEntitySurfaceSchema,
  type DisabledReason,
  type MetaEntityCapabilities,
  type MetaEntityCollectionConfig,
  type MetaEntityConcurrencySummary,
  type MetaEntityExtensions,
  type MetaEntityField,
  type MetaEntityFieldDisplay,
  type MetaEntityFieldEditor,
  type MetaEntityFieldGroup,
  type MetaEntityHeaderPresentation,
  type MetaEntityLifecycleStateMask,
  type MetaEntityListCachePolicy,
  type MetaEntityLineItemsExtras,
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
  type MetaEntityRuntimeHeaderIdentity,
  type MetaEntitySource,
  type MetaEntitySurface,
  type MetaEntityWorkflowSummary,
} from "./schemas";
import {
  compileDocumentEditRuntimeContract,
  type CompiledDocumentRuntimePlanInput,
} from "./document-edit-runtime-compiler";
import { compileRecordWorkspaceDefinition } from "./record-workspace";

type JsonRecord = Record<string, unknown>;

export interface CompiledMetaEntityInput {
  entity_id?: string;
  entity_code?: string;
  name?: string;
  slug?: string | null;
  entity_name?: string;
  label_singular?: string | null;
  entity_class?: string;
  create_mode?: "FORM_ONLY" | "EARLY_DRAFT" | "DIRECT_CREATE" | "SOURCE_DOCUMENT_CREATE" | string;
  draft_ttl_hours?: number | null;
  numbering_strategy?: "none" | "manual" | "auto" | "auto_or_manual" | "AUTO_ON_CREATE" | "AUTO_ON_PROMOTE" | "AUTO_ON_SUBMIT" | string;
  table_schema?: string;
  table_name?: string;
  backing_type?: string;
  primary_key?: string | null;
  tenant_column?: string | null;
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
  capability_manifest?: unknown;
  governance_level?: string;
  security_tier?: string;
  mutability?: string;
  class_profile?: unknown;
  cache_policy?: unknown;
  compiled_at?: string;
  compiled_hash?: string;
  concurrency_policy?: unknown;
  document_runtime_plan?: unknown;
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
  /** Raw control.entity_field.defaults JSONB (cascade + on_source_change). */
  defaults?: unknown;
  temporal_kind?: string | null;
  temporalKind?: string | null;
  display_mode?: string | null;
  displayMode?: string | null;
  affects_posting_period?: boolean | null;
  affectsPostingPeriod?: boolean | null;
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
  execution_target?: string | null;
  executionTarget?: string | null;
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
  selection_config?: unknown;
  selectionConfig?: unknown;
  interaction_surface_kind?: string | null;
  interactionSurfaceKind?: string | null;
  interaction_options?: unknown;
  interactionOptions?: unknown;
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
  resolution_kind?: string | null;
  resolutionKind?: string | null;
  fk_field?: string | null;
  fkField?: string | null;
  target_key?: string | null;
  targetKey?: string | null;
  source_type_field?: string | null;
  sourceTypeField?: string | null;
  source_type_value?: string | null;
  sourceTypeValue?: string | null;
  source_id_field?: string | null;
  sourceIdField?: string | null;
  source_line_field?: string | null;
  sourceLineField?: string | null;
  runtime_role?: string | null;
  runtimeRole?: string | null;
  on_delete?: string | null;
  onDelete?: string | null;
  record_filter?: unknown;
  recordFilter?: unknown;
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
  relationCapabilities?: Record<string, {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
  /** Tenant/entity rollout decision supplied by the server-side caller. */
  documentSaveAndTransitionEnabled?: boolean;
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
  fields: MetaEntityField[];
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
  const cachePolicy = normalizeListCachePolicy(entity.cache_policy);
  // Resolve entity code once — used in normalizeFields and the descriptor root.
  const entityCode = resolveEntityCode(entity);
  const operations = enrichOperationsWithLifecycleTransitions(
    normalizeOperations(options.operations ?? []),
    options.lifecycleTransitions ?? [],
  );
  const relations = normalizeRelations(options.relations ?? []);
  const lineRelations = relations.filter((relation) => isLineItemRelation(entity, relation));
  const renderer = resolveRenderer(entity);
  const preliminaryChildRelations = relations.filter((relation) => isChildRecordRelation(entity, relation, lineRelations));
  for (const relation of relations) {
    relation.mutationOwner = resolveRelationMutationOwner({
      renderer,
      relation,
      isLineRelation: lineRelations.includes(relation),
    });
    relation.mutationPermissions = resolveRelationCapabilities(
      options.relationCapabilities ?? {},
      relation,
    );
  }
  enforceStagedOperationOwnership(operations, renderer, relations);
  const childRelations = preliminaryChildRelations.filter((relation) => relation.mutationOwner === "direct_crud");
  const policy = resolvePolicy(entity, options);
  const lifecycle = resolveLifecycle(entity, options.lifecycle ?? null);
  const workflow = resolveWorkflow(entity, options.workflow ?? null);
  const numbering = resolveNumbering(entity, options.numbering ?? null);
  const concurrency = resolveConcurrency(options.concurrencyPolicy ?? entity.concurrency_policy)
    ?? (renderer === "ledger" ? undefined : {
      strategy: "version_only" as const,
      rollout: "enforced" as const,
      versionColumn: "row_version",
      children: [],
      referencesExcluded: [],
    });
  const fields = normalizeFields(entity.fields ?? [], entityCode);
  const fieldGroups = normalizeFieldGroups(
    Array.isArray(entity.field_groups) ? entity.field_groups : [],
    fields,
  );
  const compiledCapability = asRecord(entity.capability_manifest);
  const compiledLifecycle = asRecord(compiledCapability["lifecycle"]);
  const compiledStates = asRecord(compiledLifecycle["states"]);
  const compiledDeletionMode = readString(compiledCapability, "deletionMode");
  const providedMasks = options.lifecycleStateMasks ?? [];
  const maskByStatus = new Map(providedMasks.map((mask) => [normalizeToken(mask.recordStatus), mask]));
  for (const [status, rawFlags] of Object.entries(compiledStates)) {
    const flags = asRecord(rawFlags);
    const existing = maskByStatus.get(normalizeToken(status));
    const canEdit = flags["isEditable"] === true;
    const canDelete = flags["isDeletable"] === true
      && compiledDeletionMode !== "prohibited"
      && compiledDeletionMode !== "lifecycle_only";
    maskByStatus.set(normalizeToken(status), {
      recordStatus: status,
      canEdit,
      canDelete,
      ...(existing?.canTransitionTo ? { canTransitionTo: existing.canTransitionTo } : {}),
      disabledReason: canEdit || canDelete ? null : "lifecycle_locked",
      ...(existing?.presentation ? { presentation: existing.presentation } : {}),
    });
  }

  const lifecycleOptions: MetaEntityOption[] = [...maskByStatus.values()]
    .map((mask): MetaEntityOption | null => {
      const label = mask.presentation?.label?.trim();
      if (!label) return null;
      return {
        value: mask.recordStatus,
        code: mask.recordStatus,
        label,
        metadata: {
          badgeVariant: mask.presentation?.badgeVariant ?? null,
          color: mask.presentation?.color ?? null,
          icon: mask.presentation?.icon ?? null,
        },
      };
    })
    .filter((option): option is MetaEntityOption => option !== null);
  for (const field of fields) {
    const source = field.editor?.optionSource ?? field.optionSource;
    if (source?.kind !== "lifecycle") continue;
    const resolved = { ...source, options: lifecycleOptions };
    field.optionSource = resolved;
    if (field.editor) field.editor = { ...field.editor, optionSource: resolved };
  }

  const context: ResolutionContext = {
    entity,
    fields,
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
    lifecycleStateMasks: [...maskByStatus.values()],
    permissionAliasMap: options.permissionAliasMap ?? {},
  };

  const capabilities = resolveCapabilities(context);
  const surfaces = resolveAuthoritativeSurfaces(context, capabilities, fields);
  const recordWorkspace = compileRecordWorkspaceDefinition({
    entityCode,
    renderer,
    capabilities,
    surfaces,
  });
  const descriptorRelations = relations.map((relation) => ({
    ...relation,
    surfaceKind: lineRelations.includes(relation)
      ? "line_items" as const
      : childRelations.includes(relation)
        ? "child_records" as const
        : relation.surfaceKind,
  }));
  const editRuntime = renderer === "document"
    ? compileDocumentEditRuntimeContract({
        entityCode,
        renderer,
        fields,
        relations: descriptorRelations,
        plan: readCompiledDocumentRuntimePlan(entity.document_runtime_plan),
        saveAndTransitionEnabled: options.documentSaveAndTransitionEnabled ?? true,
      })
    : undefined;
  const compiledExtensions: MetaEntityExtensions = {
    displayConfig,
    searchConfig: asRecord(entity.search_config),
    dataPolicy: asRecord(entity.data_policy),
    runtimeCanvasFlags: asRecord(displayConfig["runtime_canvas_flags"]),
    ...(options.extensions ?? {}),
  };
  const descriptorWithoutHash: MetaEntityRuntimeDescriptor = {
    contractVersion: META_ENTITY_RUNTIME_CONTRACT_VERSION,
    entityCode,
    entityName: resolveEntityName(entity),
    routeSlug: resolveRouteSlug(entity),
    storage: {
      primaryKey: entity.primary_key ?? null,
      tenantColumn: entity.tenant_column ?? null,
    },
    createMode: normalizeCreateMode(entity.create_mode),
    draftTtlHours: normalizeDraftTtlHours(entity.draft_ttl_hours),
    numberingStrategy: normalizeNumberingStrategy(entity.numbering_strategy),
    renderer,
    capabilities,
    surfaces,
    recordWorkspace,
    fields,
    fieldGroups,
    operations,
    relations: descriptorRelations,
    source: resolveSource(entity),
    policy,
    cachePolicy,
    lifecycle,
    lifecycleStateMasks: context.lifecycleStateMasks,
    workflow,
    numbering,
    identity: resolveRuntimeIdentity(context),
    headerPresentation: resolveHeaderPresentation(context),
    concurrency,
    editRuntime,
    extensions: emptyRecord(compiledExtensions) ? undefined : compiledExtensions,
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

function resolveAuthoritativeSurfaces(
  context: ResolutionContext,
  capabilities: MetaEntityCapabilities,
  fields: MetaEntityField[],
): MetaEntitySurface[] {
  const compiled = resolveSurfaces(context, capabilities, fields);
  if (context.renderer !== "document") return compiled;
  const documentRuntime = asRecord(context.displayConfig["document_runtime"]);
  const rawSurfaces = documentRuntime["surfaces"];
  if (rawSurfaces === undefined) return compiled;
  if (!Array.isArray(rawSurfaces)) {
    throw new Error("display_config.document_runtime.surfaces must be an array.");
  }
  const metadataSurfaces = rawSurfaces.map((surface, index) => {
    const parsed = MetaEntitySurfaceSchema.safeParse(surface);
    if (!parsed.success) {
      throw new Error(`Invalid document surface at index ${index}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  const replacesLines = metadataSurfaces.some((surface) =>
    surface.kind === "document_lines" || surface.kind === "polymorphic_pc_lines",
  );
  const replacesDistributions = metadataSurfaces.some((surface) =>
    surface.kind === "document_accounting" || surface.kind === "postings_preview",
  );
  return [
    ...compiled.filter((surface) =>
      !(replacesLines && surface.kind === "line_items")
      && !(replacesDistributions && surface.kind === "distributions"),
    ),
    ...metadataSurfaces,
  ];
}

function readCompiledDocumentRuntimePlan(value: unknown): CompiledDocumentRuntimePlanInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Document renderer requires metadata document_runtime_plan.");
  }
  const plan = value as Record<string, unknown>;
  if (plan["source"] !== "compiled_v6"
    || plan["schemaVersion"] !== "document-edit-runtime/v6.0"
    || typeof plan["planVersion"] !== "string"
    || typeof plan["planHash"] !== "string"
    || !Array.isArray(plan["nodes"])
    || !Array.isArray(plan["invalidationActions"])) {
    throw new Error("Metadata document_runtime_plan is malformed or not compiler-owned v6.");
  }
  return plan as unknown as CompiledDocumentRuntimePlanInput;
}

function normalizeCreateMode(value: unknown): "FORM_ONLY" | "EARLY_DRAFT" | "DIRECT_CREATE" | "SOURCE_DOCUMENT_CREATE" {
  return value === "EARLY_DRAFT" || value === "DIRECT_CREATE" || value === "SOURCE_DOCUMENT_CREATE" ? value : "FORM_ONLY";
}

function normalizeDraftTtlHours(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeNumberingStrategy(value: unknown): "none" | "manual" | "auto" | "auto_or_manual" | "AUTO_ON_CREATE" | "AUTO_ON_PROMOTE" | "AUTO_ON_SUBMIT" {
  return value === "manual"
    || value === "auto"
    || value === "auto_or_manual"
    || value === "AUTO_ON_CREATE"
    || value === "AUTO_ON_PROMOTE"
    || value === "AUTO_ON_SUBMIT"
    ? value
    : "none";
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

  const hardDeleteEnabled = readBoolean(featureFlags, "generic_hard_delete_enabled")
    || readBoolean(featureFlags, "hard_delete_enabled")
    || readBoolean(featureFlags, "allow_hard_delete");
  const capabilityManifest = asRecord(entity.capability_manifest);
  const compiledDeletionMode = readString(capabilityManifest, "deletionMode");
  const compiledDeleteBinding = asRecord(asRecord(capabilityManifest["mutation"])["delete"]);
  const compiledDeleteEnabled = compiledDeleteBinding["enabled"] === true
    && compiledDeletionMode !== "prohibited"
    && compiledDeletionMode !== "lifecycle_only";
  const hidden = readBoolean(featureFlags, "is_hidden");
  const readOnly = renderer === "ledger"
    || readBoolean(featureFlags, "is_readonly")
    || readString(displayConfig, "detail_profile") === "read-only"
    || normalizeToken(entity.mutability) === "IMMUTABLE"
    || normalizeToken(entity.mutability) === "LOCKED";

  const canRead = !hidden && policy.accessMode !== "default_deny";

  // Resolve each CRUD capability via the cascading gate:
  //   → (delete only: hard_delete_enabled) → operation present
  // Each gate carries a stable DisabledReason so the UI can surface it.
  const { allow: canCreate, reason: canCreateReason } = resolveCrudCapability({
    canRead, readOnly, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "create",
  });
  const { allow: canEdit, reason: canEditReason } = resolveCrudCapability({
    canRead, readOnly, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "edit",
  });
  const { allow: canDelete, reason: canDeleteReason } = resolveCrudCapability({
    canRead, readOnly, hidden, accessMode: policy.accessMode,
    operations, permissionAliasMap, action: "delete",
    extraGate: compiledDeletionMode
      ? compiledDeleteEnabled ? null : { reason: "lifecycle_locked" }
      : hardDeleteEnabled ? null : { reason: "hard_delete_disabled" },
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
    const collection = resolveCollectionConfig(relation.uiBehavior);
    const line = resolveLineItemsExtras(context, relation.uiBehavior);
    const childCapabilities = relation.mutationPermissions;
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
      mutationOwner: relation.mutationOwner,
      displayMode: normalizeLineDisplayMode(relation.uiBehavior),
      ...(collection ? { collection } : {}),
      ...(line ? { line } : {}),
      canCreate: childCapabilities.canCreate,
      canEdit: childCapabilities.canEdit,
      canDelete: childCapabilities.canDelete,
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
    // visible_as_tab:false suppresses this auto-emitted child_records surface;
    // relation still appears in descriptor.relations for runtime data consumers.
    if (readOptionalBoolean(relation.uiBehavior, "visible_as_tab") === false) continue;
    const collection = resolveCollectionConfig(relation.uiBehavior);
    const childCapabilities = relation.mutationPermissions;
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
      mutationOwner: "direct_crud",
      displayMode: normalizeChildDisplayMode(relation.uiBehavior),
      ...(collection ? { collection } : {}),
      canCreate: childCapabilities.canCreate,
      canEdit: childCapabilities.canEdit,
      canDelete: childCapabilities.canDelete,
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
      const uiHint = asRecordOrUndefined(field.ui_hint ?? field.uiHint);
      const explicitEditor = asRecordOrUndefined(field.editor)
        ?? asRecordOrUndefined(uiHint?.["editor"]);
      const explicitDisplay = asRecordOrUndefined(field.display)
        ?? asRecordOrUndefined(uiHint?.["display"]);
      const name = field.name;
      const dataType = field.data_type ?? field.dataType ?? "text";
      const enumDomainCode = nullToUndefined(field.enum_domain_code ?? field.enumDomainCode);
      const referenceEntity = resolveReferenceEntity(referenceConfig);
      const optionSource = resolveFieldOptionSource({
        field,
        dataType,
        enumDomainCode,
        referenceEntity,
        referenceConfig,
        lookupConfig,
        validation,
        constraints,
        explicitEditor,
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
        colSpan: resolveColSpan(field),
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
        defaults: asRecordOrUndefined(field.defaults),
        temporalKind: resolveTemporalKindProjection(
          field.temporal_kind ?? field.temporalKind,
          dataType,
        ),
        displayMode: resolveDisplayModeProjection(
          field.display_mode ?? field.displayMode,
        ),
        affectsPostingPeriod:
          field.affects_posting_period ?? field.affectsPostingPeriod ?? false,
      };
    })
    .sort((left, right) => left.order - right.order);
}

function resolveTemporalKindProjection(
  raw: string | null | undefined,
  dataType: string,
): "businessDate" | "instant" | "zonedDateTime" | undefined {
  if (raw === "businessDate" || raw === "instant" || raw === "zonedDateTime") {
    return raw;
  }
  if (raw != null) return undefined;
  const dt = dataType.toLowerCase();
  if (dt === "date") return "businessDate";
  if (dt === "timestamptz") return "instant";
  return undefined;
}

function resolveDisplayModeProjection(
  raw: string | null | undefined,
): "date" | "dateTime" | undefined {
  if (raw === "date" || raw === "dateTime") return raw;
  return undefined;
}

function resolveColSpan(field: CompiledMetaEntityFieldInput): "full" | undefined {
  const explicit = asRecordOrUndefined(field.display);
  const uiHint = asRecord(field.ui_hint ?? field.uiHint);
  const displayInHint = asRecord(uiHint["display"]);
  const value = explicit?.["col_span"] ?? explicit?.["colSpan"]
    ?? displayInHint["col_span"] ?? displayInHint["colSpan"]
    ?? uiHint["col_span"] ?? uiHint["colSpan"];
  return value === "full" ? "full" : undefined;
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
  dataType,
  enumDomainCode,
  referenceEntity,
  referenceConfig,
  lookupConfig,
  validation,
  constraints,
  explicitEditor,
}: {
  field: CompiledMetaEntityFieldInput;
  dataType: string;
  enumDomainCode?: string;
  referenceEntity?: string;
  referenceConfig?: JsonRecord;
  lookupConfig?: JsonRecord;
  validation?: JsonRecord;
  constraints?: JsonRecord;
  explicitEditor?: JsonRecord;
}): MetaEntityOptionSource | undefined {
  const explicit = normalizeExplicitOptionSource(
    field.option_source
      ?? field.optionSource
      ?? explicitEditor?.["optionSource"]
      ?? explicitEditor?.["option_source"],
  );
  if (explicit) {
    if (explicit.kind === "none") return undefined;
    if (explicit.kind === "lifecycle") {
      return {
        ...explicit,
        fallbackOptions: resolveStaticOptions(constraints)
          ?? resolveStaticOptions(validation)
          ?? explicit.fallbackOptions,
      };
    }
    return explicit;
  }

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
  const targetEntity = referenceEntity;
  if (targetEntity) {
    const picker = asRecord(referenceConfig?.["picker"]);
    return {
      kind: "reference",
      entity: normalizeReferenceEntityCode(targetEntity),
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
  if (kind === "lifecycle") {
    const entityLifecycle = readString(source, "entityLifecycle")
      ?? readString(source, "entity_lifecycle");
    if (entityLifecycle !== "current") return undefined;
    return {
      kind,
      entityLifecycle,
      options: resolveStaticOptions(source) ?? [],
      fallbackOptions: resolveStaticOptions({
        options: source["fallbackOptions"] ?? source["fallback_options"],
      }) ?? [],
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
  if (optionSource?.kind === "static" || optionSource?.kind === "lifecycle") return "select";
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
  if (optionSource?.kind === "lookup" || optionSource?.kind === "static" || optionSource?.kind === "lifecycle") return "lookup_label";

  const normalized = dataType.toLowerCase();
  if (normalized === "boolean" || normalized === "bool" || normalizeToken(field.ui_type ?? field.uiType) === "CHECKBOX") return "boolean";
  if (normalized === "date") return "date";
  if (normalized === "datetime" || normalized === "timestamptz" || normalized === "timestamp") return "datetime";
  if (["integer", "bigint", "decimal", "numeric"].includes(normalized)) return "number";
  if (normalized === "money") return "money";
  if (normalized === "json" || normalized === "jsonb") return "json";
  return "text";
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
  if (value === "none" || value === "static" || value === "lifecycle" || value === "lookup" || value === "reference") return value;
  return undefined;
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
        executionTarget: operation.execution_target ?? operation.executionTarget ?? null,
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
        selectionConfig: normalizeOperationSelectionConfig(operation.selection_config ?? operation.selectionConfig),
        interactionSurfaceKind: normalizeInteractionSurfaceKind(
          operation.interaction_surface_kind ?? operation.interactionSurfaceKind,
        ),
        interactionOptions: asRecordOrUndefined(
          operation.interaction_options ?? operation.interactionOptions,
        ) as MetaEntityOperation["interactionOptions"],
        lifecycleTransitions: lifecycleTransitions.length > 0 ? lifecycleTransitions : undefined,
      };
    })
    .sort((left, right) => left.order - right.order);
}

function normalizeInteractionSurfaceKind(value: unknown): MetaEntityOperation["interactionSurfaceKind"] {
  return value === "page"
    || value === "overlay"
    || value === "drawer-form"
    || value === "drawer-peek"
    || value === "modal-select"
    || value === "dialog-confirm"
    ? value
    : undefined;
}

function normalizeOperationSelectionConfig(
  value: unknown,
): MetaEntityOperation["selectionConfig"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const cardinality = source["cardinality"];
  const group = source["group"];
  if (cardinality !== "single" && cardinality !== "multiple" && cardinality !== "both") return undefined;
  if (group !== "item" && group !== "components" && group !== "accounting" && group !== "clipboard" && group !== "danger") return undefined;
  const presentation = source["presentation"] === "menu_item" ? "menu_item" : "action";
  const rawBulkStrategy = source["bulk_strategy"] ?? source["bulkStrategy"];
  const bulkStrategy = rawBulkStrategy === "bulk_patch" || rawBulkStrategy === "per_record_atomic" || rawBulkStrategy === "management_matrix"
    ? rawBulkStrategy
    : "none";
  return {
    enabled: source["enabled"] === true,
    cardinality,
    group,
    presentation,
    bulkStrategy,
    preserveSelectionOnSuccess: (source["preserve_selection_on_success"] ?? source["preserveSelectionOnSuccess"]) === true,
  };
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
    const resolutionKind = normalizeRelationResolutionKind(relation.resolution_kind ?? relation.resolutionKind);
    const name = relation.name;
    return {
      key: relation.id ?? name,
      name,
      kind,
      targetEntity: relation.target_entity ?? relation.targetEntity ?? name,
      resolutionKind,
      fkField: nullToUndefined(relation.fk_field ?? relation.fkField),
      targetKey: relation.target_key ?? relation.targetKey ?? "id",
      sourceTypeField: nullToUndefined(relation.source_type_field ?? relation.sourceTypeField),
      sourceTypeValue: nullToUndefined(relation.source_type_value ?? relation.sourceTypeValue),
      sourceIdField: nullToUndefined(relation.source_id_field ?? relation.sourceIdField),
      sourceLineField: nullToUndefined(relation.source_line_field ?? relation.sourceLineField),
      runtimeRole: nullToUndefined(relation.runtime_role ?? relation.runtimeRole),
      onDelete: nullToUndefined(relation.on_delete ?? relation.onDelete),
      recordFilter: asRecord(relation.record_filter ?? relation.recordFilter),
      uiBehavior,
      surfaceKind: readSurfaceKind(uiBehavior, kind),
      mutationOwner: "direct_crud",
      mutationPermissions: { canCreate: false, canEdit: false, canDelete: false },
    };
  });
}

function resolveRelationMutationOwner(input: {
  renderer: MetaEntityRenderer;
  relation: MetaEntityRelation;
  isLineRelation: boolean;
}): MetaEntityRelation["mutationOwner"] {
  const configured = readString(input.relation.uiBehavior, "mutation_owner")
    ?? readString(input.relation.uiBehavior, "mutationOwner");
  if (configured === "workspace" && input.renderer !== "document") {
    throw new Error(`Relation "${input.relation.name}" cannot be workspace-owned on renderer "${input.renderer}".`);
  }
  if (configured === "workspace" || configured === "direct_crud") return configured;
  if (configured) {
    throw new Error(`Relation "${input.relation.name}" has invalid mutation_owner "${configured}".`);
  }
  if (input.renderer !== "document") return "direct_crud";
  const workspaceRoles = new Set([
    "lines",
    "line_items",
    "pricing_components",
    "components",
    "accounting_distributions",
    "distributions",
  ]);
  return input.isLineRelation
    || workspaceRoles.has(input.relation.name)
    || workspaceRoles.has(input.relation.key)
    || (input.relation.runtimeRole ? workspaceRoles.has(input.relation.runtimeRole) : false)
    ? "workspace"
    : "direct_crud";
}

function resolveRelationCapabilities(
  relationCapabilities: NonNullable<MetaEntityCompileOptions["relationCapabilities"]>,
  relation: MetaEntityRelation,
): { canCreate: boolean; canEdit: boolean; canDelete: boolean } {
  const resolved = relationCapabilities[relation.key]
    ?? relationCapabilities[relation.name]
    ?? relationCapabilities[relation.targetEntity];
  if (resolved) return resolved;
  return {
    canCreate: readOptionalBoolean(relation.uiBehavior, "can_create")
      ?? readOptionalBoolean(relation.uiBehavior, "canCreate")
      ?? false,
    canEdit: readOptionalBoolean(relation.uiBehavior, "can_edit")
      ?? readOptionalBoolean(relation.uiBehavior, "canEdit")
      ?? false,
    canDelete: readOptionalBoolean(relation.uiBehavior, "can_delete")
      ?? readOptionalBoolean(relation.uiBehavior, "canDelete")
      ?? false,
  };
}

function enforceStagedOperationOwnership(
  operations: MetaEntityOperation[],
  renderer: MetaEntityRenderer,
  relations: MetaEntityRelation[],
): void {
  const relationByKey = new Map(relations.flatMap((relation) => [
    [relation.key, relation] as const,
    [relation.name, relation] as const,
  ]));
  for (const operation of operations) {
    const addContract = operation.interactionOptions?.addContract;
    if (addContract?.commitMode !== "stage_then_parent_save") continue;
    if (renderer !== "document") {
      operation.enabled = false;
      operation.disabledReason = "handler_invalid";
      continue;
    }
    const relation = relationByKey.get(addContract.targetRelation);
    if (relation && relation.mutationOwner !== "workspace") {
      throw new Error(
        `Staged operation "${operation.key}" targets direct-CRUD relation "${relation.name}".`,
      );
    }
  }
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

function resolveRuntimeIdentity(
  context: ResolutionContext,
): MetaEntityRuntimeHeaderIdentity | undefined {
  const headerConfig = asRecord(context.identityConfig["header"]);
  if (Object.keys(headerConfig).length === 0) return undefined;

  const primary = resolveRuntimeIdentitySlot(context, headerConfig["primary"]);
  const secondary = resolveRuntimeIdentitySlot(context, headerConfig["secondary"]);
  const classification = resolveRuntimeIdentitySlot(context, headerConfig["classification"]);
  const status = resolveRuntimeIdentityStatus(context, headerConfig["status"]);

  if (!primary && !secondary && !classification && !status) return undefined;
  return { primary, secondary, classification, status };
}

function resolveRuntimeIdentitySlot(
  context: ResolutionContext,
  raw: unknown,
): MetaEntityRuntimeHeaderIdentity["primary"] | undefined {
  const slot = asRecord(raw);
  const fieldCode = readString(slot, "field");
  if (!fieldCode) return undefined;
  const fieldName = resolveEntityFieldName(context.fields, fieldCode);
  if (!fieldName) return undefined;

  return {
    ...slot,
    field: fieldName,
  };
}

function resolveRuntimeIdentityStatus(
  context: ResolutionContext,
  raw: unknown,
): MetaEntityRuntimeHeaderIdentity["status"] | undefined {
  const statusConfig = asRecord(raw);
  const hasStatusConfig = Object.keys(statusConfig).length > 0;

  const processStateFirst = readBoolean(statusConfig, "processStateFirst");
  const preferProcessState = readBoolean(statusConfig, "preferProcessState");
  const preferProcessStateSnake = readBoolean(statusConfig, "prefer_process_state");
  const processStateFirstSnake = readBoolean(statusConfig, "process_state_first");
  const hasPreferenceKey =
    Object.hasOwn(statusConfig, "processStateFirst")
    || Object.hasOwn(statusConfig, "preferProcessState")
    || Object.hasOwn(statusConfig, "prefer_process_state")
    || Object.hasOwn(statusConfig, "process_state_first");
  const resolvedField = resolveRuntimeIdentitySlotField(context, statusConfig);
  const isProcessStatePreferred = processStateFirst
    ?? processStateFirstSnake
    ?? preferProcessState
    ?? preferProcessStateSnake;

  if (!hasStatusConfig && !hasPreferenceKey && !resolvedField) return undefined;

  const status: MetaEntityRuntimeHeaderIdentity["status"] = {};
  if (resolvedField) status.field = resolvedField;
  if (hasPreferenceKey) {
    if (Object.hasOwn(statusConfig, "processStateFirst")) {
      status.processStateFirst = processStateFirst;
    } else if (Object.hasOwn(statusConfig, "preferProcessState")) {
      status.preferProcessState = preferProcessState;
    } else if (Object.hasOwn(statusConfig, "prefer_process_state")) {
      status.prefer_process_state = preferProcessStateSnake;
    } else if (Object.hasOwn(statusConfig, "process_state_first")) {
      status.process_state_first = processStateFirstSnake;
    } else {
      status.processStateFirst = isProcessStatePreferred;
    }
  } else if (hasStatusConfig) {
    status.process_state_first = true;
  }

  if (Object.keys(status).length === 0) return undefined;
  return status;
}

function resolveRuntimeIdentitySlotField(
  context: ResolutionContext,
  statusConfig: JsonRecord,
): string | undefined {
  const fieldCode = readString(statusConfig, "field");
  if (!fieldCode) return undefined;
  return resolveEntityFieldName(context.fields, fieldCode);
}

function resolveHeaderPresentation(
  context: ResolutionContext,
): MetaEntityHeaderPresentation | undefined {
  const headerConfig = asRecord(context.displayConfig["header"]);
  if (Object.keys(headerConfig).length === 0) return undefined;

  const presentation: JsonRecord = { ...headerConfig };
  const amount = resolveHeaderAmount(context, headerConfig["amount"]);
  const subtitleRows = resolveHeaderSubtitleRows(
    context,
    headerConfig["subtitle_rows"] ?? headerConfig["subtitleRows"],
  );
  const facts = resolveHeaderFacts(context, headerConfig["facts"]);
  const statusBadges = resolveHeaderStatusBadges(
    context,
    headerConfig["status_badges"] ?? headerConfig["statusBadges"],
  );
  const tabs = resolveHeaderTabsConfig(context, headerConfig["tabs"]);

  if (amount) presentation["amount"] = amount;
  if (subtitleRows) presentation["subtitle_rows"] = subtitleRows;
  if (facts) presentation["facts"] = facts;
  if (statusBadges) presentation["status_badges"] = statusBadges;
  if (tabs) presentation["tabs"] = tabs;

  return presentation as MetaEntityHeaderPresentation;
}

function resolveHeaderAmount(context: ResolutionContext, raw: unknown): JsonRecord | undefined {
  const amount = asRecord(raw);
  if (Object.keys(amount).length === 0) return undefined;
  const resolved: JsonRecord = { ...amount };
  const headline = resolveHeaderFieldObject(context, amount["headline"]);
  const secondary = resolveHeaderFieldObject(context, amount["secondary"]);
  if (headline) resolved["headline"] = headline;
  if (secondary) resolved["secondary"] = secondary;
  return resolved;
}

function resolveHeaderSubtitleRows(context: ResolutionContext, raw: unknown): JsonRecord[] | undefined {
  const rows = readArray(raw)
    .map((item) => {
      const row = asRecord(item);
      if (Object.keys(row).length === 0) return undefined;
      const fields = resolveHeaderFieldArray(context, row["fields"]);
      const resolvedRow: JsonRecord = {
        ...row,
        fields,
      };
      return resolvedRow;
    })
    .filter((item): item is JsonRecord => Boolean(item));
  return rows.length > 0 ? rows : undefined;
}

function resolveHeaderFacts(context: ResolutionContext, raw: unknown): JsonRecord[] | undefined {
  const facts = readArray(raw)
    .map((item) => resolveHeaderFieldObject(context, item))
    .filter((item): item is JsonRecord => Boolean(item?.["field"]));
  return facts.length > 0 ? facts : undefined;
}

function resolveHeaderStatusBadges(context: ResolutionContext, raw: unknown): JsonRecord[] | undefined {
  const badges = readArray(raw)
    .map((item) => resolveHeaderFieldObject(context, item))
    .filter((item): item is JsonRecord => Boolean(item));
  return badges.length > 0 ? badges : undefined;
}

function resolveHeaderTabsConfig(context: ResolutionContext, raw: unknown): JsonRecord | undefined {
  const tabs = asRecord(raw);
  if (Object.keys(tabs).length === 0) return undefined;
  const resolved: JsonRecord = { ...tabs };
  const visibilityRules = resolveHeaderVisibilityRuleMap(
    context,
    tabs["visibility_rules"] ?? tabs["visibilityRules"],
  );
  if (visibilityRules) resolved["visibility_rules"] = visibilityRules;
  return resolved;
}

function resolveHeaderVisibilityRuleMap(context: ResolutionContext, raw: unknown): JsonRecord | undefined {
  const rules = asRecord(raw);
  if (Object.keys(rules).length === 0) return undefined;
  const resolved: JsonRecord = {};
  for (const [key, value] of Object.entries(rules)) {
    resolved[key] = resolveHeaderVisibilityRule(context, value);
  }
  return resolved;
}

function resolveHeaderVisibilityRule(context: ResolutionContext, raw: unknown): JsonRecord {
  const rule = asRecord(raw);
  const resolved: JsonRecord = { ...rule };
  for (const key of ["field", "fieldField"] as const) {
    const fieldName = resolveHeaderFieldCode(context, rule[key]);
    if (fieldName) resolved[key] = fieldName;
  }
  const fieldEquals = rule["field_equals"] ?? rule["fieldEquals"];
  if (Array.isArray(fieldEquals) && typeof fieldEquals[0] === "string") {
    const resolvedField = resolveHeaderFieldCode(context, fieldEquals[0]);
    if (resolvedField) resolved["field_equals"] = [resolvedField, fieldEquals[1]];
  }
  return resolved;
}

function resolveHeaderFieldObject(context: ResolutionContext, raw: unknown): JsonRecord | undefined {
  const object = asRecord(raw);
  if (Object.keys(object).length === 0) return undefined;
  const resolved: JsonRecord = { ...object };
  for (const key of HEADER_FIELD_REF_KEYS) {
    const fieldName = resolveHeaderFieldCode(context, object[key]);
    if (fieldName) resolved[key] = fieldName;
  }
  const baseAmount = resolveHeaderFieldObject(context, object["base_amount"] ?? object["baseAmount"]);
  if (baseAmount) resolved["base_amount"] = baseAmount;
  const visibleWhen = resolveHeaderVisibilityRule(context, object["visible_when"] ?? object["visibleWhen"]);
  if (Object.keys(visibleWhen).length > 0) resolved["visible_when"] = visibleWhen;
  return resolved;
}

const HEADER_FIELD_REF_KEYS = [
  "field",
  "currency_field",
  "currencyField",
  "base_amount_field",
  "baseAmountField",
  "base_currency_field",
  "baseCurrencyField",
  "exchange_rate_field",
  "exchangeRateField",
  "type_field",
  "typeField",
  "status_field",
  "statusField",
] as const;

function resolveHeaderFieldArray(context: ResolutionContext, raw: unknown): string[] {
  return readStringArray(raw)
    .map((fieldCode) => resolveEntityFieldName(context.fields, fieldCode))
    .filter(isPresent);
}

function resolveHeaderFieldCode(context: ResolutionContext, raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return resolveEntityFieldName(context.fields, raw.trim());
}

function resolveEntityFieldName(fields: MetaEntityField[], fieldCode: string): string | undefined {
  const exact = fields.find((item) => item.name === fieldCode);
  if (exact) return exact.name;

  const byColumn = fields.find((item) => item.columnName === fieldCode);
  if (byColumn) return byColumn.name;

  const normalized = fieldCode.toLowerCase();
  const fallback = fields.find((item) => (
    item.name.toLowerCase() === normalized || item.columnName.toLowerCase() === normalized
  ));
  return fallback?.name;
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

function resolveCollectionConfig(uiBehavior: JsonRecord): MetaEntityCollectionConfig | undefined {
  const raw = readRecordAlias(uiBehavior, "collection", "collection_config", "collectionConfig");
  if (!raw) return undefined;

  const title = resolveCollectionTitleConfig(raw);
  const toolbar = resolveCollectionToolbarConfig(raw);
  const table = resolveCollectionTableConfig(raw);
  const row = resolveCollectionRowConfig(raw);
  const config: MetaEntityCollectionConfig = {};
  if (title) config.title = title;
  if (toolbar) config.toolbar = toolbar;
  if (table) config.table = table;
  if (row) config.row = row;
  return hasOwnKeys(config) ? config : undefined;
}

function resolveCollectionTitleConfig(raw: JsonRecord): MetaEntityCollectionConfig["title"] | undefined {
  const title = readRecordAlias(raw, "title") ?? raw;
  const showCount = readOptionalBooleanAlias(title, "showCount", "show_count");
  return showCount === undefined ? undefined : { showCount };
}

function resolveCollectionToolbarConfig(raw: JsonRecord): MetaEntityCollectionConfig["toolbar"] | undefined {
  const toolbar = readRecordAlias(raw, "toolbar");
  if (!toolbar) return undefined;

  const config: NonNullable<MetaEntityCollectionConfig["toolbar"]> = {};
  const search = resolveCollectionSearchConfig(toolbar);
  if (search !== undefined) config.search = search;

  const columns = readOptionalBooleanAlias(toolbar, "columns", "showColumns", "show_columns");
  if (columns !== undefined) config.columns = columns;

  const primaryAction = normalizeCollectionPrimaryAction(
    readStringAlias(toolbar, "primaryAction", "primary_action"),
  );
  if (primaryAction) config.primaryAction = primaryAction;

  return hasOwnKeys(config) ? config : undefined;
}

function resolveCollectionSearchConfig(toolbar: JsonRecord): NonNullable<MetaEntityCollectionConfig["toolbar"]>["search"] | undefined {
  const explicit = toolbar["search"];
  if (typeof explicit === "boolean") return explicit;

  const search = asRecordOrUndefined(explicit) ?? readRecordAlias(toolbar, "searchConfig", "search_config");
  if (search) {
    const config: Exclude<NonNullable<MetaEntityCollectionConfig["toolbar"]>["search"], boolean> = {};
    const placeholder = readStringAlias(search, "placeholder");
    const keys = readStringArrayAlias(search, "keys", "fields");
    if (placeholder) config.placeholder = placeholder;
    if (keys.length > 0) config.keys = keys;
    return hasOwnKeys(config) ? config : true;
  }

  const enabled = readOptionalBooleanAlias(toolbar, "searchEnabled", "search_enabled");
  if (enabled !== undefined) return enabled;

  const keys = readStringArrayAlias(toolbar, "searchKeys", "search_keys");
  const placeholder = readStringAlias(toolbar, "searchPlaceholder", "search_placeholder");
  if (keys.length > 0 || placeholder) {
    return {
      ...(placeholder ? { placeholder } : {}),
      ...(keys.length > 0 ? { keys } : {}),
    };
  }

  return undefined;
}

function resolveCollectionTableConfig(raw: JsonRecord): MetaEntityCollectionConfig["table"] | undefined {
  const table = readRecordAlias(raw, "table", "grid");
  if (!table) return undefined;

  const config: NonNullable<MetaEntityCollectionConfig["table"]> = {};
  const visibleColumns = readStringArrayAlias(table, "visibleColumns", "visible_columns", "columns");
  const pinnedColumns = readStringArrayAlias(table, "pinnedColumns", "pinned_columns");
  const mobileColumns = readStringArrayAlias(table, "mobileColumns", "mobile_columns");
  const virtualized = readOptionalBooleanAlias(table, "virtualized");
  const disableHeaderSort = readOptionalBooleanAlias(table, "disableHeaderSort", "disable_header_sort");
  const pagination = normalizeCollectionPagination(readStringAlias(table, "pagination", "paginationMode", "pagination_mode"));
  const pageSize = readNumberAlias(table, "pageSize", "page_size");

  if (visibleColumns.length > 0) config.visibleColumns = visibleColumns;
  if (pinnedColumns.length > 0) config.pinnedColumns = pinnedColumns;
  if (mobileColumns.length > 0) config.mobileColumns = mobileColumns;
  if (virtualized !== undefined) config.virtualized = virtualized;
  if (disableHeaderSort !== undefined) config.disableHeaderSort = disableHeaderSort;
  if (pagination) config.pagination = pagination;
  if (pageSize !== undefined && pageSize > 0) config.pageSize = Math.floor(pageSize);

  return hasOwnKeys(config) ? config : undefined;
}

function resolveCollectionRowConfig(raw: JsonRecord): MetaEntityCollectionConfig["row"] | undefined {
  const row = readRecordAlias(raw, "row");
  if (!row) return undefined;

  const config: NonNullable<MetaEntityCollectionConfig["row"]> = {};
  const selection = readOptionalBooleanAlias(row, "selection", "selectable");
  const clickAction = normalizeCollectionRowClickAction(readStringAlias(row, "clickAction", "click_action"));
  const expansionKey = readStringAlias(row, "expansionKey", "expansion_key");

  if (selection !== undefined) config.selection = selection;
  if (clickAction) config.clickAction = clickAction;
  if (expansionKey) config.expansionKey = expansionKey;

  return hasOwnKeys(config) ? config : undefined;
}

function resolveLineItemsExtras(
  context: ResolutionContext,
  uiBehavior: JsonRecord,
): MetaEntityLineItemsExtras | undefined {
  const raw = readRecordAlias(uiBehavior, "line", "line_items", "lineItems") ?? {};
  const config: MetaEntityLineItemsExtras = {};

  const variant = readStringAlias(raw, "variant", "lineUiVariant", "line_ui_variant")
    ?? readString(context.displayConfig, "line_ui_variant");
  const sourceAdapters = readStringArrayAlias(raw, "sourceAdapters", "source_adapters");
  const summaryProvider = readStringAlias(raw, "summaryProvider", "summary_provider");
  const composerKey = readStringAlias(raw, "composerKey", "composer_key");
  const editorKey = readStringAlias(raw, "editorKey", "editor_key");
  const mobileRowRendererKey = readStringAlias(raw, "mobileRowRendererKey", "mobile_row_renderer_key");
  const totals = resolveLineTotalsConfig(raw);

  if (variant) config.variant = variant;
  if (sourceAdapters.length > 0) config.sourceAdapters = sourceAdapters;
  if (summaryProvider) config.summaryProvider = summaryProvider;
  if (totals) config.totals = totals;
  if (composerKey) config.composerKey = composerKey;
  if (editorKey) config.editorKey = editorKey;
  if (mobileRowRendererKey) config.mobileRowRendererKey = mobileRowRendererKey;

  return hasOwnKeys(config) ? config : undefined;
}

function resolveLineTotalsConfig(raw: JsonRecord): MetaEntityLineItemsExtras["totals"] | undefined {
  const totals = readRecordAlias(raw, "totals");
  if (!totals) return undefined;

  const config: NonNullable<MetaEntityLineItemsExtras["totals"]> = {};
  const enabled = readOptionalBooleanAlias(totals, "enabled");
  const mode = normalizeLineTotalsMode(readStringAlias(totals, "mode"));
  const fields = readStringArrayAlias(totals, "fields");

  if (enabled !== undefined) config.enabled = enabled;
  if (mode) config.mode = mode;
  if (fields.length > 0) config.fields = fields;

  return hasOwnKeys(config) ? config : undefined;
}

function normalizeCollectionPrimaryAction(value: string | undefined): NonNullable<NonNullable<MetaEntityCollectionConfig["toolbar"]>["primaryAction"]> | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "create" || normalized === "add_item" || normalized === "none") return normalized;
  return undefined;
}

function normalizeCollectionPagination(value: string | undefined): NonNullable<NonNullable<MetaEntityCollectionConfig["table"]>["pagination"]> | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "none" || normalized === "server") return normalized;
  return undefined;
}

function normalizeCollectionRowClickAction(value: string | undefined): NonNullable<NonNullable<MetaEntityCollectionConfig["row"]>["clickAction"]> | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "edit" || normalized === "expand" || normalized === "none") return normalized;
  return undefined;
}

function normalizeLineTotalsMode(value: string | undefined): NonNullable<NonNullable<MetaEntityLineItemsExtras["totals"]>["mode"]> | undefined {
  const normalized = normalizeLowerEnumToken(value);
  if (normalized === "visible_numeric_columns" || normalized === "configured_fields") return normalized;
  return undefined;
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

function normalizeRelationResolutionKind(value: string | null | undefined): MetaEntityRelation["resolutionKind"] {
  const normalized = normalizeLowerEnumToken(value ?? undefined);
  if (
    normalized === "fk" ||
    normalized === "polymorphic" ||
    normalized === "join" ||
    normalized === "array_fk"
  ) {
    return normalized;
  }
  return "fk";
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

function normalizeListCachePolicy(value: unknown): MetaEntityListCachePolicy {
  const raw = asRecord(value);
  return MetaEntityListCachePolicySchema.parse({
    mode: readStringAlias(raw, "mode") ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.mode,
    freshForSeconds: readNumberAlias(raw, "freshForSeconds", "fresh_for_seconds")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.freshForSeconds,
    retainForSeconds: readNumberAlias(raw, "retainForSeconds", "retain_for_seconds")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.retainForSeconds,
    prefetch: readStringAlias(raw, "prefetch") ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.prefetch,
    restoreScroll: readOptionalBooleanAlias(raw, "restoreScroll", "restore_scroll")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.restoreScroll,
    invalidateOnMutation: readOptionalBooleanAlias(raw, "invalidateOnMutation", "invalidate_on_mutation")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.invalidateOnMutation,
    maxQueriesPerEntity: readNumberAlias(raw, "maxQueriesPerEntity", "max_queries_per_entity")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.maxQueriesPerEntity,
    maxRowsPerQuery: readNumberAlias(raw, "maxRowsPerQuery", "max_rows_per_query")
      ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.maxRowsPerQuery,
    storage: readStringAlias(raw, "storage") ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.storage,
    source: readStringAlias(raw, "source") ?? DEFAULT_META_ENTITY_LIST_CACHE_POLICY.source,
  });
}

function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  const item = asRecord(value)[key];
  return typeof item === "boolean" ? item : undefined;
}

function readOptionalBooleanAlias(value: unknown, ...keys: string[]): boolean | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "boolean") return item;
  }
  return undefined;
}

function readNumber(record: unknown, key: string): number | undefined {
  const value = asRecord(record)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumberAlias(record: unknown, ...keys: string[]): number | undefined {
  const source = asRecord(record);
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function readString(record: unknown, key: string): string | undefined {
  const value = asRecord(record)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringAlias(record: unknown, ...keys: string[]): string | undefined {
  const source = asRecord(record);
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return readArray(value).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readStringArrayAlias(record: unknown, ...keys: string[]): string[] {
  const source = asRecord(record);
  for (const key of keys) {
    const values = readStringArray(source[key]);
    if (values.length > 0) return values;
  }
  return [];
}

function readStringArrayFromObjects(value: unknown, key: string): string[] {
  return readArray(value)
    .map((item) => readString(item, key))
    .filter(isPresent);
}

function readRecordAlias(record: unknown, ...keys: string[]): JsonRecord | undefined {
  const source = asRecord(record);
  for (const key of keys) {
    const value = asRecordOrUndefined(source[key]);
    if (value) return value;
  }
  return undefined;
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

function hasOwnKeys(value: object): boolean {
  return Object.keys(value).length > 0;
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
