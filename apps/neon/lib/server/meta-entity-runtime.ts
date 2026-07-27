import "server-only";

import { cache } from "react";
import type { V4Session } from "@athyper/auth-bff";
import {
  CompiledEntitySchema,
  EntityOperationSchema,
  type CompiledEntity,
  type EntityOperation,
} from "@athyper/api-contracts/metadata";
import {
  MetaEntityContractV2Schema,
  type MetaEntityContractV2,
} from "@athyper/api-contracts/meta-entity-contract-v2";
import {
  MetaEntityContractV21Schema,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";
import {
  compileMetaEntityRuntimeDescriptor,
  MetaEntityRecordOperationOverlayV1Schema,
  MetaEntityRuntimeBootstrapV1Schema,
  MetaEntityLifecycleStateMaskSchema,
  type EntityRelationInput,
  type CompiledMetaEntityFieldInput,
  type CompiledMetaEntityInput,
  type MetaEntityField,
  type MetaEntityLifecycleSummary,
  type MetaEntityNumberingSummary,
  type MetaEntityLifecycleStateMask,
  type MetaEntityRuntimeDescriptor,
  type MetaEntityRuntimeBootstrapV1,
} from "@athyper/runtime-contracts";
import type { RuntimeCanvasFlags } from "@athyper/runtime-canvas/surfaces";
import { logDescriptorHealthInDev } from "@/lib/server/meta-entity-descriptor-health";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { isDocumentSaveAndTransitionEnabled } from "@/lib/server/document-edit-submit-policy";
import { buildDocumentEditPermissionStamp } from "@/lib/server/document-edit-coordinator-identity";
import {
  buildSessionConfigurationIdentity,
  getSessionConfiguration,
} from "@/lib/server/session-configuration-cache";
import { resolveDocumentOpenRollout } from "@/lib/server/document-runtime-feature-flags";
import { runtimeDescriptorParity } from "@/lib/server/runtime-descriptor-parity";
import {
  ensureMetaEntityRuntimeInvalidationSubscriber,
  type MetaEntityRuntimeInvalidationEvent,
} from "@/lib/server/meta-entity-runtime-cache-events";
import {
  ScopedRuntimeCache,
  type RuntimeCacheIdentity,
  type RuntimeCacheInvalidationScope,
} from "@/lib/server/scoped-runtime-cache";

// Runtime metadata already has server-side cache validation keyed by descriptor
// fingerprints, including entity_field.defaults. A second Next fetch cache here
// can serve stale descriptors after metadata reseeds, which makes client-side
// field dependency triggers disappear until the 300s window expires.
const warnedRuntimeMetadata = new Set<string>();
const DESCRIPTOR_CACHE_LIMIT = 200;
const DESCRIPTOR_CACHE_TTL_MS = 60_000;
const BOOTSTRAP_CACHE_LIMIT = 300;
const BOOTSTRAP_CACHE_TTL_MS = 60_000;
const COMPILED_CACHE_LIMIT = 300;
const COMPILED_CACHE_TTL_MS = 30_000;
const childRuntimeProjections = new WeakMap<MetaEntityRuntimeDescriptor, ReadonlyMap<string, ChildRuntimeProjection>>();
const descriptorCacheStates = new WeakMap<MetaEntityRuntimeDescriptor, "cold" | "warm" | "bypass">();
const descriptorSharedCache = new ScopedRuntimeCache<MetaEntityRuntimeDescriptor>({
  limit: DESCRIPTOR_CACHE_LIMIT,
  ttlMs: DESCRIPTOR_CACHE_TTL_MS,
  onEvict: (descriptor) => {
    childRuntimeProjections.delete(descriptor);
    descriptorCacheStates.delete(descriptor);
  },
});
const compiledSharedCache = new ScopedRuntimeCache<CompiledEntity>({
  limit: COMPILED_CACHE_LIMIT,
  ttlMs: COMPILED_CACHE_TTL_MS,
});
const bootstrapSharedCache = new ScopedRuntimeCache<MetaEntityRuntimeBootstrapV1>({
  limit: BOOTSTRAP_CACHE_LIMIT,
  ttlMs: BOOTSTRAP_CACHE_TTL_MS,
});

export interface ChildRuntimeProjection {
  compiled: CompiledEntity;
  descriptor: MetaEntityRuntimeDescriptor;
}
const ENTITY_CODE_ALIASES: Record<string, string> = {
  unit_of_measure: "uom",
};

/**
 * Rollout registry for descriptor-driven canvas features.
 *
 * Add an entity code here to opt it into the new surface shell and/or grouped
 * forms. This is the single place to control the progressive rollout — no DB
 * migration or feature-flag service needed.
 *
 * Flags:
 *   descriptorSurfaceShell — enables the DescriptorSurfaceShell tab system
 *                            (replaces the legacy flat RuntimeDetailShell)
 *   groupedForms           — enables grouped WorkPanel sections in create/edit forms
 *                            (requires fieldGroups in the compiled descriptor)
 */
type PrototypeReferenceExpectation = {
  entity: string;
  valueField: string;
  labelField?: string;
  codeField?: string;
  scopeMode?: "tenant" | "legal_entity" | "company_code" | "unscoped";
};

type PrototypeContractExpectation = {
  titleField: string;
  subtitleField: string;
  listColumns: string[];
  fields: string[];
  referenceFields: Record<string, PrototypeReferenceExpectation>;
  lookupFields: Record<string, string>;
  groupKeys: Record<string, string>;
};

type RuntimeEntityPolicy = {
  access_mode?: string;
  company_scope_mode?: string;
  audit_mode?: string;
  field_scope_eval_order?: string;
};

const PROTOTYPE_ENTITY_CONTRACTS: Record<string, PrototypeContractExpectation> = {
  site: {
    titleField: "name",
    subtitleField: "code",
    listColumns: ["id", "code", "name", "company_code_id", "site_type", "country_code", "status"],
    fields: [
      "id",
      "tenant_id",
      "code",
      "name",
      "company_code_id",
      "description",
      "site_type",
      "parent_site_id",
      "level_no",
      "sort_order",
      "country_code",
      "timezone_code",
      "manager_id",
      "capacity_uom",
      "capacity_value",
      "metadata",
      "status",
      "is_active",
      "status_changed_at",
      "status_changed_by",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ],
    referenceFields: {
      company_code_id: { entity: "company_code", valueField: "id", scopeMode: "legal_entity" },
      parent_site_id: { entity: "site", valueField: "id", scopeMode: "legal_entity" },
      country_code: { entity: "country", valueField: "code", scopeMode: "unscoped" },
      timezone_code: { entity: "timezone", valueField: "code", scopeMode: "unscoped" },
      manager_id: { entity: "principal", valueField: "id", codeField: "login_email", scopeMode: "tenant" },
      capacity_uom: { entity: "uom", valueField: "code", scopeMode: "unscoped" },
    },
    lookupFields: {
      site_type: "master.site_type",
      status: "status",
    },
    groupKeys: {
      site_type: "profile",
      description: "profile",
      level_no: "profile",
      capacity_value: "profile",
      company_code_id: "reference",
      parent_site_id: "reference",
      country_code: "reference",
      timezone_code: "reference",
      manager_id: "reference",
      capacity_uom: "reference",
    },
  },
  warehouse: {
    titleField: "name",
    subtitleField: "code",
    listColumns: ["id", "code", "name", "site_id", "warehouse_type", "status"],
    fields: [
      "id",
      "tenant_id",
      "code",
      "name",
      "site_id",
      "description",
      "warehouse_type",
      "manager_id",
      "is_negative_stock_allowed",
      "metadata",
      "status",
      "is_active",
      "status_changed_at",
      "status_changed_by",
      "created_at",
      "created_by",
      "updated_at",
      "updated_by",
    ],
    referenceFields: {
      site_id: { entity: "site", valueField: "id", scopeMode: "legal_entity" },
      manager_id: { entity: "principal", valueField: "id", codeField: "login_email", scopeMode: "tenant" },
    },
    lookupFields: {
      warehouse_type: "master.warehouse_type",
      status: "status",
    },
    groupKeys: {
      warehouse_type: "profile",
      description: "profile",
      is_negative_stock_allowed: "config",
      site_id: "reference",
      manager_id: "reference",
    },
  },
};

export const getMetaEntityRuntimeDescriptor = cache(
  async (
    routeEntity: string,
    recordId?: string,
  ): Promise<MetaEntityRuntimeDescriptor | undefined> => {
    // recordId is the optional record-context hint. When provided, the
    // entity-operations fetch passes it through so the server's
    // active-approver gate (server/packages/services/workflow/
    // active-approver.service.ts) emits workflow_task ops only when the
    // caller can actually act on the record's current workflow step.
    // React `cache()` dedupes by argument tuple — list-page callers with no
    // recordId share one entry; each record page gets its own.
    const entityCode = normalizeEntityCode(routeEntity);
    if (!entityCode) return undefined;

    const session = await getNeonServerSession();
    if (!session) return undefined;
    ensureMetaEntityRuntimeInvalidationSubscriber(handleMetaEntityRuntimeInvalidationEvent);

    const headers = buildRuntimeHeaders(session);
    const cacheIdentity = buildRuntimeCacheIdentity(session, entityCode);
    const cacheGeneration = currentRuntimeCacheGeneration();
    const rollout = resolveDocumentOpenRollout({ session, entityCode });
    if (rollout.openDescriptorCacheV2) {
      const projected = await loadBootstrapRuntimeDescriptor({
        entityCode, recordId, session, headers, cacheIdentity, cacheGeneration,
      });
      if (!projected) {
        return loadLegacyRuntimeDescriptor({
          entityCode, recordId, session, headers, cacheIdentity, cacheGeneration,
          cacheEnabled: false,
        });
      }
      if (rollout.shadowRuntimeBootstrap === true) {
        const legacy = await loadLegacyRuntimeDescriptor({
          entityCode, recordId, session, headers, cacheIdentity, cacheGeneration,
          cacheEnabled: false,
        });
        if (!legacy || !runtimeDescriptorParity(projected, legacy)) {
          reportRuntimeBootstrapParity(entityCode, projected, legacy);
          return legacy;
        }
      }
      return projected;
    }
    return loadLegacyRuntimeDescriptor({
      entityCode, recordId, session, headers, cacheIdentity, cacheGeneration,
      cacheEnabled: false,
    });
  },
);

type RuntimeLoadInput = {
  entityCode: string;
  recordId?: string;
  session: V4Session;
  headers: Record<string, string>;
  cacheIdentity: RuntimeCacheIdentity;
  cacheGeneration: number;
};

async function loadBootstrapRuntimeDescriptor(input: RuntimeLoadInput): Promise<MetaEntityRuntimeDescriptor | undefined> {
  const bootstrapKey = buildSecurityScopeKey(input.session, input.entityCode);
  let bootstrap = bootstrapSharedCache.get(bootstrapKey);
  if (!bootstrap) {
    const response = await fetchMetadata(
      `/api/metadata/entities/${encodeURIComponent(input.entityCode)}/runtime-bootstrap`,
      input.headers,
    );
    const parsed = MetaEntityRuntimeBootstrapV1Schema.safeParse(response ? await readJson(response) : null);
    if (!parsed.success) return undefined;
    bootstrap = parsed.data as MetaEntityRuntimeBootstrapV1;
    bootstrapSharedCache.set(
      bootstrapKey,
      bootstrap,
      input.cacheIdentity,
      input.cacheGeneration,
    );
  }
  const compiledResult = CompiledEntitySchema.safeParse(bootstrap.compiledEntity);
  const operationResult = EntityOperationSchema.array().safeParse(bootstrap.operations);
  if (!compiledResult.success || !operationResult.success) return undefined;

  const descriptorKey = buildDescriptorCacheKey(
    input.session,
    input.entityCode,
    input.recordId,
    compiledResult.data.version_id,
    bootstrap.bootstrapHash,
  );
  const cached = descriptorSharedCache.get(descriptorKey);
  if (cached) {
    descriptorCacheStates.set(cached, "warm");
    return cached;
  }

  let operations = operationResult.data;
  if (input.recordId) {
    const overlayResponse = await fetchMetadata(
      `/api/metadata/entities/${encodeURIComponent(input.entityCode)}/record-operations?recordId=${encodeURIComponent(input.recordId)}`,
      input.headers,
    );
    const overlay = MetaEntityRecordOperationOverlayV1Schema.safeParse(overlayResponse ? await readJson(overlayResponse) : null);
    if (overlay.success) {
      const overlayOperations = EntityOperationSchema.array().safeParse(overlay.data.operations);
      if (overlayOperations.success) operations = [...operations, ...overlayOperations.data];
    }
  }

  const relationProjections = projectBootstrapChildren(bootstrap);
  const descriptor = compileProjectedDescriptor({
    entityCode: input.entityCode,
    session: input.session,
    compiled: compiledResult.data,
    operations,
    entityPolicy: (bootstrap.policy ?? undefined) as RuntimeEntityPolicy | undefined,
    lifecycleStateMasks: bootstrap.lifecycleStateMasks,
    permissionAliasMap: bootstrap.permissionAliases,
    relationProjections,
  });
  if (!descriptor) return undefined;
  childRuntimeProjections.set(descriptor, relationProjections);
  descriptorCacheStates.set(descriptor, "cold");
  descriptorSharedCache.set(descriptorKey, descriptor, input.cacheIdentity, input.cacheGeneration);
  return descriptor;
}

async function loadLegacyRuntimeDescriptor(
  input: RuntimeLoadInput & { cacheEnabled: boolean },
): Promise<MetaEntityRuntimeDescriptor | undefined> {
  const compiled = await fetchCompiledEntityCached(
    input.entityCode, input.session, input.headers, input.cacheIdentity, input.cacheGeneration,
  );
  if (!compiled) return undefined;
  const descriptorKey = buildDescriptorCacheKey(
    input.session, input.entityCode, input.recordId, compiled.version_id,
    compiled.compiled_hash ?? compiled.version_hash,
  );
  const cached = input.cacheEnabled ? descriptorSharedCache.get(descriptorKey) : undefined;
  if (cached) { descriptorCacheStates.set(cached, "warm"); return cached; }
  const [operations, entityPolicy, lifecycleStateMasks, permissionAliasMap, relationProjections] = await Promise.all([
    fetchEntityOperations(input.entityCode, input.headers, input.recordId),
    fetchEntityPolicy(input.entityCode, input.headers),
    fetchLifecycleStateMasks(input.entityCode, input.headers),
    fetchPermissionAliasMap(input.session, input.headers),
    fetchRelationRuntimeProjections(compiled.relations, input.headers),
  ]);
  const descriptor = compileProjectedDescriptor({
    entityCode: input.entityCode,
    session: input.session,
    compiled,
    operations,
    entityPolicy,
    lifecycleStateMasks,
    permissionAliasMap,
    relationProjections,
  });
  if (!descriptor) return undefined;
  childRuntimeProjections.set(descriptor, relationProjections);
  descriptorCacheStates.set(descriptor, input.cacheEnabled ? "cold" : "bypass");
  if (input.cacheEnabled) descriptorSharedCache.set(descriptorKey, descriptor, input.cacheIdentity, input.cacheGeneration);
  return descriptor;
}

type CanonicalRuntimeInput = Omit<CompiledMetaEntityInput, "fields"> & {
  fields: CompiledMetaEntityFieldInput[];
  relations: EntityRelationInput[];
  phaseBContract: MetaEntityContractV2;
  publishedContract?: MetaEntityContractV21;
};

/**
 * Adapt the canonical v2 contract to the shared runtime compiler's historic
 * input vocabulary.  The adapter is deliberately local to this boundary:
 * runtime consumers never choose between legacy DB columns and v2 fields.
 */
function projectCanonicalRuntimeInput(compiled: CompiledEntity): CanonicalRuntimeInput {
  const contract = MetaEntityContractV2Schema.parse(compiled.contract_v2);
  const publishedResult = MetaEntityContractV21Schema.safeParse(compiled.contract_v21);
  const fieldsByName = new Map(contract.fields.map((field) => [field.name, field]));
  const relationsByCode = new Map(contract.relations.map((relation) => [relation.relation_code, relation]));
  const fieldNamesById = new Map(contract.fields.map((field) => [field.id, field.name]));

  const fields = compiled.fields.map((field) => {
    const canonical = fieldsByName.get(field.name);
    if (!canonical) return field;

    const typeConfig = canonical.type_config;
    const referenceConfig = typeConfig.kind === "reference"
      ? {
          ...(isRecord(field.reference_config) ? field.reference_config : {}),
          relation: typeConfig.relation,
          target_entity: relationsByCode.get(typeConfig.relation)?.target_entity_code,
          target_field: relationsByCode.get(typeConfig.relation)?.target_field ?? "id",
          display_field: typeConfig.display.label_field,
          ...(typeConfig.display.code_field ? { code_field: typeConfig.display.code_field } : {}),
          ...(typeConfig.display.description_field ? { description_field: typeConfig.display.description_field } : {}),
        }
      : field.reference_config;
    const moneyConfig = typeConfig.kind === "money"
      ? {
          ...(isRecord(field.money_config) ? field.money_config : {}),
          minor_units: typeConfig.minor_units,
          ...(typeConfig.currency.source === "field" && typeConfig.currency.field
            ? { currency_field: typeConfig.currency.field }
            : {}),
          ...(typeConfig.currency.source === "constant" && typeConfig.currency.code
            ? { currency_code: typeConfig.currency.code }
            : {}),
        }
      : field.money_config;

    return {
      ...field,
      label: canonical.label,
      description: canonical.description ?? field.description,
      data_type: canonical.data_type,
      is_required: canonical.is_required,
      is_readonly: canonical.is_read_only,
      is_computed: canonical.is_computed,
      is_write_once: canonical.is_write_once,
      reference_config: referenceConfig,
      money_config: moneyConfig,
      type_config: typeConfig,
    };
  });

  const listColumns = contract.surfaces
    .filter((surface) => surface.surface.is_enabled && ["list", "spreadsheet", "compact_card"].includes(surface.surface.mode))
    .sort((left, right) => left.surface.surface_key.localeCompare(right.surface.surface_key))
    .flatMap((surface) => surface.fields
      .filter((binding) => binding.visible)
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((binding) => fieldNamesById.get(binding.entity_field_id)))
    .filter((name): name is string => Boolean(name));
  const identity = contract.version_contract.identity_config.display_identity;
  const listSurface = contract.surfaces.find((surface) => surface.surface.mode === "list" && surface.surface.is_enabled);
  const lifecycleStages = contract.lifecycle
    ? Object.entries(contract.lifecycle.states).map(([key, state]) => ({ key, label: state.label }))
    : undefined;

  const displayConfig: Record<string, unknown> = {
    ...compiled.display_config,
    title_field: identity.title_field,
    subtitle_field: identity.subtitle_field ?? undefined,
    ...(listColumns.length > 0 ? { list_columns: [...new Set(listColumns)] } : {}),
    ...(listSurface?.surface.config.features ? { list_features: listSurface.surface.config.features } : {}),
    ...(lifecycleStages ? { lifecycle_stages: lifecycleStages } : {}),
  };

  const documentRuntimeSurfaces = projectContractDocumentRuntimeSurfaces(contract);
  if (documentRuntimeSurfaces.length > 0) {
    const existingDocumentRuntime = isRecord(displayConfig["document_runtime"])
      ? displayConfig["document_runtime"]
      : {};
    const existingSurfaces = Array.isArray(existingDocumentRuntime["surfaces"])
      ? existingDocumentRuntime["surfaces"]
      : [];
    const projectedKeys = new Set(documentRuntimeSurfaces.map((surface) => surface.key));
    const preservedSurfaces = existingSurfaces.filter((surface) =>
      !isRecord(surface) || typeof surface["key"] !== "string" || !projectedKeys.has(surface["key"]),
    );
    displayConfig["document_runtime"] = {
      ...existingDocumentRuntime,
      surfaces: [...preservedSurfaces, ...documentRuntimeSurfaces],
    };
  }

  const runtimeIdentityConfig = projectContractIdentityConfig(
    contract.version_contract.identity_config,
    compiled.identity_config,
    fields,
    contract.lifecycle?.status_field,
  );

  const relations: EntityRelationInput[] = contract.relations.map((relation) => ({
    id: relation.id,
    name: relation.relation_code,
    relation_kind: relation.relation_kind,
    target_entity: relation.target_entity_code,
    resolution_kind: relation.resolution_kind,
    fk_field: relation.source_field,
    target_key: relation.target_field,
    source_type_field: relation.polymorphic_type_field,
    source_type_value: relation.polymorphic_type_value,
    source_id_field: relation.polymorphic_id_field,
    source_line_field: relation.source_line_field,
    runtime_role: relation.runtime_role,
    on_delete: relation.on_delete,
    record_filter: relation.record_filter,
  }));

  return {
    ...compiled,
    fields,
    relations,
    display_config: displayConfig,
    identity_config: runtimeIdentityConfig,
    search_config: contract.version_contract.search_config,
    data_policy: contract.version_contract.data_policy,
    concurrency_policy: contract.version_contract.concurrency_config,
    numbering_strategy: contract.numbering?.status === "active" ? "auto" : "none",
    feature_flags: {
      ...compiled.feature_flags,
      ...(contract.lifecycle ? { has_lifecycle: true } : {}),
    },
    phaseBContract: contract,
    ...(publishedResult.success ? { publishedContract: publishedResult.data } : {}),
  };
}

function projectPublishedLifecycle(contract: MetaEntityContractV21): MetaEntityLifecycleSummary | null {
  if (!contract.lifecycle) return null;
  return {
    enabled: true,
    lifecycleId: contract.lifecycle.binding.code,
    states: contract.lifecycle.states.map((state) => state.code),
    terminalStates: contract.lifecycle.states.filter((state) => state.terminal).map((state) => state.code),
    transitions: contract.lifecycle.transitions.map((transition) => `${transition.from}->${transition.to}`),
  };
}

function projectPublishedNumbering(contract: MetaEntityContractV21): MetaEntityNumberingSummary | null {
  const configuration = contract.numbering.configurations.find((candidate) => candidate.enabled);
  if (!configuration) return null;
  return {
    enabled: true,
    numberField: configuration.field_scope.field_name,
    resetStrategy: configuration.reset_policy,
    uniquenessScope: configuration.field_scope.uniqueness,
    segments: configuration.segments,
  };
}

function projectPublishedFlows(contract: MetaEntityContractV21) {
  return contract.flows.map((flow) => ({
    id: flow.id,
    flow_code: flow.flow_code,
    label: flow.label,
    trigger_context: flow.trigger_context,
    is_default: flow.default,
    status: "ACTIVE",
  }));
}

function projectLegacyLifecycle(contract: MetaEntityContractV2): MetaEntityLifecycleSummary | null {
  if (!contract.lifecycle) return null;
  return {
    enabled: true,
    lifecycleId: contract.lifecycle.status_field,
    states: Object.keys(contract.lifecycle.states),
    terminalStates: Object.entries(contract.lifecycle.states)
      .filter(([, state]) => state.is_terminal)
      .map(([key]) => key),
    transitions: Object.entries(contract.lifecycle.allowed_transitions)
      .flatMap(([from, targets]) => targets.map((target) => `${from}->${target}`)),
  };
}

function projectLegacyNumbering(contract: MetaEntityContractV2): MetaEntityNumberingSummary | null {
  if (!contract.numbering) return null;
  return {
    enabled: contract.numbering.status === "active",
    numberField: contract.numbering.number_field,
    resetStrategy: contract.numbering.reset_strategy,
    uniquenessScope: contract.numbering.uniqueness_scope,
    segments: contract.numbering.segments,
  };
}

function projectRuntimeLifecycle(input: CanonicalRuntimeInput): MetaEntityLifecycleSummary | null {
  return input.publishedContract
    ? projectPublishedLifecycle(input.publishedContract)
    : projectLegacyLifecycle(input.phaseBContract);
}

function projectRuntimeNumbering(input: CanonicalRuntimeInput): MetaEntityNumberingSummary | null {
  return input.publishedContract
    ? projectPublishedNumbering(input.publishedContract)
    : projectLegacyNumbering(input.phaseBContract);
}

function projectRuntimeFlows(input: CanonicalRuntimeInput) {
  return input.publishedContract ? projectPublishedFlows(input.publishedContract) : undefined;
}

function projectBootstrapChildren(
  bootstrap: MetaEntityRuntimeBootstrapV1,
): ReadonlyMap<string, ChildRuntimeProjection> {
  const entries: Array<readonly [string, ChildRuntimeProjection]> = [];
  for (const child of bootstrap.childProjections) {
    const compiled = CompiledEntitySchema.safeParse(child.compiledEntity);
    const operations = EntityOperationSchema.array().safeParse(child.operations);
    if (!compiled.success || !operations.success) continue;
    try {
      const runtimeInput = projectCanonicalRuntimeInput(compiled.data);
      const descriptor = compileMetaEntityRuntimeDescriptor(runtimeInput, {
        operations: operations.data,
        entityPolicy: (child.policy ?? undefined) as RuntimeEntityPolicy | undefined,
        lifecycleStateMasks: child.lifecycleStateMasks,
        permissionAliasMap: bootstrap.permissionAliases,
        relations: [],
        lifecycle: projectRuntimeLifecycle(runtimeInput),
        numbering: projectRuntimeNumbering(runtimeInput),
        concurrencyPolicy: runtimeInput.publishedContract?.runtime.concurrency
          ?? runtimeInput.phaseBContract.version_contract.concurrency_config,
        flows: projectRuntimeFlows(runtimeInput),
        compiledAt: runtimeInput.compiled_at,
      });
      entries.push([normalizeEntityCode(child.entityCode), { compiled: compiled.data, descriptor }]);
    } catch { /* a malformed optional child is fetched lazily when opened */ }
  }
  return new Map(entries);
}

function compileProjectedDescriptor(input: {
  entityCode: string;
  session: V4Session;
  compiled: CompiledEntity;
  operations: EntityOperation[];
  entityPolicy?: RuntimeEntityPolicy;
  lifecycleStateMasks: MetaEntityLifecycleStateMask[];
  permissionAliasMap: Record<string, string>;
  relationProjections: ReadonlyMap<string, ChildRuntimeProjection>;
}): MetaEntityRuntimeDescriptor | undefined {
  const relationCapabilities = Object.fromEntries([...input.relationProjections].map(([code, projection]) => [code, {
    canCreate: projection.descriptor.capabilities.canCreate,
    canEdit: projection.descriptor.capabilities.canEdit,
    canDelete: projection.descriptor.capabilities.canDelete,
  }]));
  try {
    const tenantId = input.session.activeOrg
      ? input.session.organizations[input.session.activeOrg]?.tenantId : undefined;
    const runtimeInput = projectCanonicalRuntimeInput(input.compiled);
    const descriptor = compileMetaEntityRuntimeDescriptor(runtimeInput, {
      operations: input.operations,
      relations: runtimeInput.relations,
      relationCapabilities,
      entityPolicy: input.entityPolicy,
      lifecycle: projectRuntimeLifecycle(runtimeInput),
      numbering: projectRuntimeNumbering(runtimeInput),
      concurrencyPolicy: runtimeInput.publishedContract?.runtime.concurrency
        ?? runtimeInput.phaseBContract.version_contract.concurrency_config,
      flows: projectRuntimeFlows(runtimeInput),
      ...(runtimeInput.publishedContract
        ? {
            extensions: {
              contractV21: runtimeInput.publishedContract,
              publishedVersionId: input.compiled.version_id,
              compiledHash: input.compiled.compiled_hash,
            },
          }
        : {}),
      lifecycleStateMasks: input.lifecycleStateMasks,
      permissionAliasMap: input.permissionAliasMap,
      documentSaveAndTransitionEnabled: isDocumentSaveAndTransitionEnabled({ tenantId, entityCode: input.entityCode }),
      compiledAt: runtimeInput.compiled_at,
    });
    const canvasFlags = (descriptor.extensions?.["runtimeCanvasFlags"] ?? {}) as RuntimeCanvasFlags;
    warnIfPrototypeContractDriftInDev(input.entityCode, runtimeInput, descriptor);
    logDescriptorHealthInDev(descriptor, canvasFlags, input.compiled.capability_manifest);
    return descriptor;
  } catch (error) {
    warnIfDescriptorCompileFailedInDev(input.entityCode, error);
    return undefined;
  }
}

function reportRuntimeBootstrapParity(
  entityCode: string,
  projected: MetaEntityRuntimeDescriptor,
  legacy: MetaEntityRuntimeDescriptor | undefined,
): void {
  console.error("meta_entity_runtime_bootstrap_parity_mismatch", {
    entityCode,
    projectedHash: projected.audit.descriptorHash,
    legacyHash: legacy?.audit.descriptorHash ?? null,
  });
}

async function fetchCompiledEntity(
  entityCode: string,
  headers: Record<string, string>,
): Promise<CompiledEntity | null> {
  const response = await fetchMetadata(`/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`, headers);
  if (!response) return null;

  const json = await readJson(response);
  if (!json) return null;

  const parsed = CompiledEntitySchema.safeParse(json);
  if (!parsed.success) {
    warnIfCompiledEntityParseFailedInDev(entityCode, parsed.error);
    return null;
  }

  const entity = parsed.data;
  warnIfMisconfiguredInDev(entityCode, entity);
  return entity;
}

export async function getCompiledEntityRuntimeMetadata(
  entityCode: string,
  session: V4Session,
): Promise<CompiledEntity | null> {
  const normalized = normalizeEntityCode(entityCode);
  ensureMetaEntityRuntimeInvalidationSubscriber(handleMetaEntityRuntimeInvalidationEvent);
  const identity = buildRuntimeCacheIdentity(session, normalized);
  return fetchCompiledEntityCached(
    normalized,
    session,
    buildRuntimeHeaders(session),
    identity,
    currentRuntimeCacheGeneration(),
  );
}

async function fetchRelationRuntimeProjections(
  relations: EntityRelationInput[],
  headers: Record<string, string>,
): Promise<ReadonlyMap<string, ChildRuntimeProjection>> {
  const targets = [...new Set(relations.map((relation) =>
    relation.target_entity ?? relation.targetEntity,
  ).filter((value): value is string => typeof value === "string" && value.length > 0))];
  const entries = await Promise.all(targets.map(async (targetEntity) => {
    // The relation graph contains catalog references as well as executable
    // runtime entities. Resolve the execution artifact first; only executable
    // targets may request operation/policy descriptors. This prevents the
    // Neon server from turning every metadata relation into a descriptor
    // lookup for catalog-only entities.
    const compiled = await fetchCompiledEntity(targetEntity, headers);
    if (!compiled) return null;
    const [operations, entityPolicy] = await Promise.all([
      fetchEntityOperations(targetEntity, headers),
      fetchEntityPolicy(targetEntity, headers),
    ]);
    try {
      const runtimeInput = projectCanonicalRuntimeInput(compiled);
      const child = compileMetaEntityRuntimeDescriptor(runtimeInput, {
        operations,
        entityPolicy,
        relations: [],
        lifecycle: projectRuntimeLifecycle(runtimeInput),
        numbering: projectRuntimeNumbering(runtimeInput),
        concurrencyPolicy: runtimeInput.publishedContract?.runtime.concurrency
          ?? runtimeInput.phaseBContract.version_contract.concurrency_config,
        flows: projectRuntimeFlows(runtimeInput),
        compiledAt: runtimeInput.compiled_at,
      });
      return [targetEntity, { compiled, descriptor: child }] as const;
    } catch {
      return null;
    }
  }));
  return new Map(entries.filter((entry): entry is readonly [string, ChildRuntimeProjection] => entry !== null));
}

export function getChildRuntimeProjection(
  parentDescriptor: MetaEntityRuntimeDescriptor,
  childEntityCode: string,
): ChildRuntimeProjection | undefined {
  return childRuntimeProjections.get(parentDescriptor)?.get(normalizeEntityCode(childEntityCode));
}

export function getMetaEntityRuntimeDescriptorCacheState(
  descriptor: MetaEntityRuntimeDescriptor,
): "cold" | "warm" | "bypass" {
  return descriptorCacheStates.get(descriptor) ?? "bypass";
}

export function invalidateMetaEntityRuntimeCaches(
  scope: RuntimeCacheInvalidationScope,
  generation?: number,
): { descriptors: number; bootstrap: number; compiled: number } {
  return {
    descriptors: descriptorSharedCache.invalidate(scope, generation),
    bootstrap: bootstrapSharedCache.invalidate(scope, generation),
    compiled: compiledSharedCache.invalidate(scope, generation),
  };
}

function handleMetaEntityRuntimeInvalidationEvent(event: MetaEntityRuntimeInvalidationEvent): void {
  invalidateMetaEntityRuntimeCaches(event, event.generation);
}

async function fetchCompiledEntityCached(
  entityCode: string,
  session: V4Session,
  headers: Record<string, string>,
  identity: RuntimeCacheIdentity,
  generation: number,
): Promise<CompiledEntity | null> {
  const key = buildSecurityScopeKey(session, entityCode);
  const cached = compiledSharedCache.get(key);
  if (cached) return cached;
  const compiled = await fetchCompiledEntity(entityCode, headers);
  if (compiled) compiledSharedCache.set(key, compiled, identity, generation);
  return compiled;
}

function buildDescriptorCacheKey(
  session: V4Session,
  entityCode: string,
  recordId: string | undefined,
  publishedVersionId: string,
  compiledHash: string,
): string {
  const identity = buildRuntimeCacheIdentity(session, entityCode);
  return [
    identity.tenant,
    entityCode,
    publishedVersionId,
    compiledHash,
    identity.plane,
    identity.realm,
    identity.principal,
    identity.permissionStamp,
    recordId ?? "entity",
  ].join("\u0000");
}

function buildSecurityScopeKey(session: V4Session, entityCode: string): string {
  const identity = buildRuntimeCacheIdentity(session, entityCode);
  return [
    identity.tenant,
    identity.plane,
    identity.realm,
    identity.principal,
    identity.permissionStamp,
    identity.entity,
  ].join("\u0000");
}

function buildRuntimeCacheIdentity(session: V4Session, entityCode: string): RuntimeCacheIdentity {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  return {
    tenant: membership?.tenantId ?? "",
    plane: session.planeKey ?? "",
    realm: session.realmKey ?? "",
    entity: entityCode,
    principal: session.userId,
    permissionStamp: buildDocumentEditPermissionStamp(session),
  };
}

function currentRuntimeCacheGeneration(): number {
  return Math.max(
    descriptorSharedCache.generation,
    bootstrapSharedCache.generation,
    compiledSharedCache.generation,
  );
}

async function fetchEntityOperations(
  entityCode: string,
  headers: Record<string, string>,
  recordId?: string,
): Promise<EntityOperation[]> {
  // recordId is an optional record-context hint. When provided, the server
  // emits workflow_task ops (approve / deny / request_info) only if the
  // caller is the active approver for that specific record. When absent,
  // workflow_task ops are dropped — entity-level callers (list views, bulk
  // pages) have no record to gate against.
  const query = recordId ? `?recordId=${encodeURIComponent(recordId)}` : "";
  const response = await fetchMetadata(
    `/api/metadata/entities/${encodeURIComponent(entityCode)}/operations${query}`,
    headers,
  );
  if (!response) return [];

  const json = await readJson(response);
  if (!json) return [];

  const parsed = EntityOperationSchema.array().safeParse(json);
  return parsed.success ? parsed.data : [];
}

async function fetchEntityPolicy(
  entityCode: string,
  headers: Record<string, string>,
): Promise<RuntimeEntityPolicy> {
  const response = await fetchMetadata(`/api/metadata/entities/${encodeURIComponent(entityCode)}/policy`, headers);
  // A missing policy row (404) means the entity is unconfigured — treat as open.
  // Actual security enforcement happens in the records API; this only affects capability
  // flags (canCreate, canEdit, etc.) in the compiled descriptor.
  if (!response) return { audit_mode: "enabled" };

  const json = await readJson(response);
  if (!isRecord(json)) return { audit_mode: "enabled" };

  return {
    access_mode: stringValue(json["access_mode"]),
    company_scope_mode: stringValue(json["company_scope_mode"]),
    audit_mode: stringValue(json["audit_mode"]) ?? "enabled",
    field_scope_eval_order: stringValue(json["field_scope_eval_order"]),
  };
}

async function fetchLifecycleStateMasks(
  entityCode: string,
  headers: Record<string, string>,
): Promise<MetaEntityLifecycleStateMask[]> {
  const response = await fetchMetadata(
    `/api/metadata/entities/${encodeURIComponent(entityCode)}/lifecycle-masks`,
    headers,
  );
  if (!response) return [];

  const json = await readJson(response);
  if (!Array.isArray(json)) return [];

  const parsed = MetaEntityLifecycleStateMaskSchema.array().safeParse(json);
  return parsed.success ? parsed.data : [];
}

async function fetchPermissionAliasMap(
  session: V4Session,
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const sessionIdentity = buildSessionConfigurationIdentity(session);
  if (!sessionIdentity) return {};

  try {
    return await getSessionConfiguration({
      namespace: "permission_aliases",
      sessionIdentity,
      policy: {
        freshForMs: 5 * 60_000,
        staleForMs: 30 * 60_000,
      },
      loader: async () => {
        const response = await fetchMetadata(`/api/metadata/permission-aliases`, headers);
        if (!response) throw new Error("Permission aliases are unavailable.");

        const json = await readJson(response);
        if (!isRecord(json)) throw new Error("Permission aliases response was malformed.");

        const out: Record<string, string> = {};
        for (const [alias, canonical] of Object.entries(json)) {
          if (typeof canonical === "string") out[alias] = canonical;
        }
        return out;
      },
    });
  } catch {
    return {};
  }
}

async function fetchMetadata(
  pathname: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  try {
    const response = await fetch(buildRuntimeUrl(pathname), {
      headers,
      cache: "no-store",
    });

    return response.ok ? response : null;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function projectContractIdentityConfig(
  canonical: MetaEntityContractV2["version_contract"]["identity_config"],
  existingValue: unknown,
  fields: ReadonlyArray<CompiledMetaEntityFieldInput>,
  lifecycleStatusField?: string,
): Record<string, unknown> {
  const existing = isRecord(existingValue) ? existingValue : {};
  const existingHeader = isRecord(existing["header"]) ? existing["header"] : {};
  const { primary: _primary, secondary: _secondary, ...headerRest } = existingHeader;
  const statusField = lifecycleStatusField
    ?? (fields.some((field) => field.name === "status") ? "status" : undefined);

  return {
    ...existing,
    primary_key_field: canonical.primary_key_field,
    business_key_fields: canonical.business_key_fields,
    natural_key_fields: canonical.natural_key_fields,
    header: {
      ...headerRest,
      primary: { field: canonical.display_identity.title_field },
      ...(canonical.display_identity.subtitle_field
        ? { secondary: { field: canonical.display_identity.subtitle_field } }
        : {}),
      ...(statusField && !isRecord(existingHeader["status"])
        ? { status: { field: statusField, processStateFirst: true } }
        : {}),
    },
  };
}

function projectContractDocumentRuntimeSurfaces(
  contract: MetaEntityContractV2,
): Array<{
  kind: "document_lines";
  key: string;
  label: string;
  order: number;
  placement: "main";
  enabled: boolean;
  config: Record<string, unknown>;
}> {
  return contract.surfaces.flatMap((entry, index) => {
    const surface = entry.surface;
    if (!surface.is_enabled || surface.mode !== "detail" || surface.renderer_key !== "line_items") return [];

    const rendererConfig = isRecord(surface.config.renderer_config)
      ? surface.config.renderer_config
      : {};
    const configuredRelation = stringValue(rendererConfig["relation"]);
    const relation = contract.relations.find((candidate) =>
      candidate.relation_code === configuredRelation
      || candidate.runtime_role === configuredRelation,
    );
    if (!relation || relation.relation_kind !== "has_many") return [];

    const { relation: _relation, ...surfaceConfig } = rendererConfig;
    return [{
      kind: "document_lines" as const,
      key: surface.surface_key,
      label: surface.label ?? "Line Items",
      order: 20 + index,
      placement: "main" as const,
      enabled: true,
      config: {
        ...surfaceConfig,
        relations: { lines: relation.relation_code },
      },
    }];
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEntityCode(routeEntity: string): string {
  const entityCode = routeEntity.trim().replace(/-/g, "_");
  return ENTITY_CODE_ALIASES[entityCode] ?? entityCode;
}

function warnIfPrototypeContractDriftInDev(
  entityCode: string,
  entity: { display_config?: unknown },
  descriptor: MetaEntityRuntimeDescriptor,
): void {
  if (process.env.NODE_ENV !== "development") return;

  const expected = PROTOTYPE_ENTITY_CONTRACTS[entityCode];
  if (!expected) return;

  const warnings: string[] = [];
  const displayConfig = isRecord(entity.display_config) ? entity.display_config : {};
  if (displayConfig.title_field !== expected.titleField) {
    warnings.push(`title_field expected ${expected.titleField}, got ${displayConfig.title_field ?? "<empty>"}`);
  }
  if (displayConfig.subtitle_field !== expected.subtitleField) {
    warnings.push(`subtitle_field expected ${expected.subtitleField}, got ${displayConfig.subtitle_field ?? "<empty>"}`);
  }

  const listColumns = new Set(Array.isArray(displayConfig.list_columns) ? displayConfig.list_columns : []);
  const missingListColumns = expected.listColumns.filter((fieldName) => !listColumns.has(fieldName));
  if (missingListColumns.length > 0) {
    warnings.push(`list_columns missing ${missingListColumns.join(", ")}`);
  }

  const fieldsByName = new Map(descriptor.fields.map((fieldItem) => [fieldItem.name, fieldItem]));
  const missingFields = expected.fields.filter((fieldName) => !fieldsByName.has(fieldName));
  if (missingFields.length > 0) {
    warnings.push(`compiled fields missing ${missingFields.join(", ")}`);
  }

  for (const [fieldName, groupKey] of Object.entries(expected.groupKeys)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (fieldItem && fieldItem.groupKey !== groupKey) {
      warnings.push(`${fieldName} group_key expected ${groupKey}, got ${fieldItem.groupKey ?? "<empty>"}`);
    }
  }

  for (const [fieldName, domainCode] of Object.entries(expected.lookupFields)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (!fieldItem) continue;
    if (fieldItem.optionSource?.kind !== "lookup") {
      warnings.push(`${fieldName} expected lookup optionSource`);
      continue;
    }
    if (fieldItem.optionSource.domainCode !== domainCode) {
      warnings.push(`${fieldName} lookup domain expected ${domainCode}, got ${fieldItem.optionSource.domainCode}`);
    }
  }

  for (const [fieldName, referenceExpectation] of Object.entries(expected.referenceFields)) {
    const fieldItem = fieldsByName.get(fieldName);
    if (!fieldItem) continue;
    warnings.push(...referenceContractWarnings(fieldName, fieldItem, referenceExpectation));
  }

  warnRuntimeMetadataOnce(entityCode, warnings);
}

function referenceContractWarnings(
  fieldName: string,
  fieldItem: MetaEntityField,
  expected: PrototypeReferenceExpectation,
): string[] {
  const warnings: string[] = [];
  const source = fieldItem.optionSource;
  if (source?.kind !== "reference") {
    return [`${fieldName} expected reference optionSource`];
  }

  if (source.entity !== expected.entity) {
    warnings.push(`${fieldName} reference entity expected ${expected.entity}, got ${source.entity}`);
  }
  if (source.valueField !== expected.valueField) {
    warnings.push(`${fieldName} value_field expected ${expected.valueField}, got ${source.valueField}`);
  }
  if (source.labelField !== (expected.labelField ?? "name")) {
    warnings.push(`${fieldName} label_field expected ${expected.labelField ?? "name"}, got ${source.labelField}`);
  }
  if (source.codeField !== (expected.codeField ?? "code")) {
    warnings.push(`${fieldName} code_field expected ${expected.codeField ?? "code"}, got ${source.codeField ?? "<empty>"}`);
  }
  if (source.scopeMode !== expected.scopeMode) {
    warnings.push(`${fieldName} scope_mode expected ${expected.scopeMode ?? "<empty>"}, got ${source.scopeMode ?? "<empty>"}`);
  }
  if (fieldItem.display?.renderer !== "reference_label") {
    warnings.push(`${fieldName} display renderer expected reference_label, got ${fieldItem.display?.renderer ?? "<empty>"}`);
  }
  if (fieldItem.display?.format !== "label") {
    warnings.push(`${fieldName} display format expected label, got ${fieldItem.display?.format ?? "<empty>"}`);
  }

  return warnings;
}

function warnIfMisconfiguredInDev(entityCode: string, entity: CompiledEntity): void {
  if (process.env.NODE_ENV !== "development") return;

  const warnings: string[] = [];
  if (entity.fields.length === 0) {
    warnings.push("no compiled fields");
  }
  if (!entity.display_config.list_columns?.length) {
    warnings.push("display_config.list_columns is empty");
  }
  if (!entity.display_config.title_field) {
    warnings.push("display_config.title_field is empty");
  }
  if (entity.feature_flags.has_lines === true && !entity.display_config.line_entity_code) {
    warnings.push("feature_flags.has_lines is true but display_config.line_entity_code is empty");
  }

  warnRuntimeMetadataOnce(entityCode, warnings);
}

function warnRuntimeMetadataOnce(entityCode: string, warnings: string[]): void {
  if (warnings.length === 0) return;

  const warningKey = `${entityCode}:${warnings.join(";")}`;
  if (warnedRuntimeMetadata.has(warningKey)) return;
  warnedRuntimeMetadata.add(warningKey);
  console.warn(`[neon-meta-entity-runtime] ${entityCode}: ${warnings.join("; ")}`);
}

function warnIfDescriptorCompileFailedInDev(entityCode: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(
    `[neon-meta-entity-runtime] ${entityCode}: descriptor compile failed`,
    error,
  );
}

function warnIfCompiledEntityParseFailedInDev(entityCode: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(
    `[neon-meta-entity-runtime] ${entityCode}: compiled metadata contract parse failed`,
    error,
  );
}
