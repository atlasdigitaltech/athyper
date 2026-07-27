import "server-only";

import { cache } from "react";
import { CompiledEntitySchema } from "@athyper/api-contracts/metadata";
import { MetaEntityContractV21Schema, type MetaEntityContractV21 } from "@athyper/api-contracts/meta-entity-contract-v21";
import {
  compileMetaEntityRuntimeDescriptor,
  MetaEntityRuntimeBootstrapV1Schema,
  type CompiledMetaEntityInput,
  type MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";
import type { RuntimeListPagination, RuntimeRecordRow } from "@athyper/runtime-shared/core";

import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getMeshServerSession } from "@/lib/server/session";

export interface MeshRuntimeCatalogItem {
  entityCode: string;
  label: string;
  labelPlural: string;
  description: string | null;
  iconKey: string | null;
  list: boolean;
  detail: boolean;
  create: false;
  mutationMode: "delegated-submit";
  publishedVersionId: string;
  compiledHash: string;
}

interface MeshRuntimeCatalogPayload {
  schemaVersion: 1;
  accountGrantId: string;
  profileHash: string;
  items: MeshRuntimeCatalogItem[];
}

export const getMeshRuntimeCatalog = cache(async (): Promise<MeshRuntimeCatalogItem[]> => {
  const session = await getMeshServerSession();
  if (!session) return [];
  const response = await fetch(buildRuntimeUrl("/api/metadata/mesh/runtime-catalog"), {
    headers: buildRuntimeHeaders(session),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return [];
  const body = await response.json().catch(() => null) as Partial<MeshRuntimeCatalogPayload> | null;
  return Array.isArray(body?.items) ? body.items.filter(isCatalogItem) : [];
});

export const getMeshRuntimeDescriptor = cache(async (
  routeEntity: string,
): Promise<MetaEntityRuntimeDescriptor | undefined> => {
  const entityCode = normalizeEntityCode(routeEntity);
  const session = await getMeshServerSession();
  if (!entityCode || !session) return undefined;
  const response = await fetch(
    buildRuntimeUrl(`/api/metadata/entities/${encodeURIComponent(entityCode)}/runtime-bootstrap`),
    { headers: buildRuntimeHeaders(session), cache: "no-store" },
  ).catch(() => null);
  if (!response?.ok) return undefined;

  const parsed = MetaEntityRuntimeBootstrapV1Schema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) return undefined;
  const compiled = CompiledEntitySchema.safeParse(parsed.data.compiledEntity);
  const contract = MetaEntityContractV21Schema.safeParse(parsed.data.compiledEntity["contract_v21"]);
  if (!compiled.success || !contract.success) return undefined;

  const canonical = contract.data;
  if (!canonical.catalog.plane_eligibility.includes("mesh")
      || !canonical.catalog.enabled
      || !canonical.runtime.runtime_enabled
      || canonical.runtime.api_exposure !== "API") return undefined;
  if ((parsed.data.effectiveSurfaceIds?.length ?? 0) === 0) return undefined;

  const input = projectMeshRuntimeInput(
    compiled.data,
    canonical,
    new Set(parsed.data.effectiveSurfaceIds ?? []),
    new Set(parsed.data.effectiveFieldIds ?? []),
  );
  try {
    return compileMetaEntityRuntimeDescriptor(input, {
      operations: parsed.data.operations,
      relations: projectRelations(canonical),
      entityPolicy: parsed.data.policy,
      lifecycleStateMasks: parsed.data.lifecycleStateMasks,
      permissionAliasMap: parsed.data.permissionAliases,
      lifecycle: canonical.lifecycle ? {
        enabled: true,
        lifecycleId: canonical.lifecycle.binding.code,
        states: canonical.lifecycle.states.map((state) => state.code),
        terminalStates: canonical.lifecycle.states.filter((state) => state.terminal).map((state) => state.code),
        transitions: canonical.lifecycle.transitions.map((transition) => `${transition.from}->${transition.to}`),
      } : null,
      numbering: projectNumbering(canonical),
      concurrencyPolicy: canonical.runtime.concurrency,
      flows: canonical.flows.map((flow) => ({
        id: flow.id,
        flow_code: flow.flow_code,
        label: flow.label,
        trigger_context: flow.trigger_context,
        is_default: flow.default,
        status: "ACTIVE",
      })),
      extensions: {
        contractV21: canonical,
        publishedVersionId: compiled.data.version_id,
        compiledHash: compiled.data.compiled_hash,
        meshReadOnly: true,
      },
      documentSaveAndTransitionEnabled: false,
      compiledAt: compiled.data.compiled_at,
    });
  } catch {
    return undefined;
  }
});

export async function getMeshRuntimeRecords(
  entityCode: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{
  records: RuntimeRecordRow[];
  pagination?: RuntimeListPagination;
  isFullyLoaded: boolean;
}> {
  const session = await getMeshServerSession();
  if (!session) return { records: [], isFullyLoaded: true };
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams)) {
    for (const value of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) {
      query.append(key, value);
    }
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(
    buildRuntimeUrl(`/api/mesh/runtime/entities/${encodeURIComponent(normalizeEntityCode(entityCode))}${suffix}`),
    { headers: buildRuntimeHeaders(session), cache: "no-store" },
  ).catch(() => null);
  if (!response?.ok) return { records: [], isFullyLoaded: true };
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const records = Array.isArray(body?.["data"])
    ? body["data"].filter(isRecord) as RuntimeRecordRow[]
    : [];
  const pagination = readPagination(body?.["pagination"]);
  return { records, pagination, isFullyLoaded: records.length < (pagination?.pageSize ?? 20) };
}

export async function getMeshRuntimeRecord(
  entityCode: string,
  recordId: string,
): Promise<RuntimeRecordRow | undefined> {
  const session = await getMeshServerSession();
  if (!session) return undefined;
  const response = await fetch(buildRuntimeUrl(
    `/api/mesh/runtime/entities/${encodeURIComponent(normalizeEntityCode(entityCode))}/${encodeURIComponent(recordId)}`,
  ), {
    headers: buildRuntimeHeaders(session),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return undefined;
  const body = await response.json().catch(() => null);
  return isRecord(body) && isRecord(body["data"])
    ? body["data"] as RuntimeRecordRow
    : undefined;
}

function projectMeshRuntimeInput(
  compiled: typeof CompiledEntitySchema._output,
  contract: MetaEntityContractV21,
  effectiveSurfaceIds: ReadonlySet<string>,
  effectiveFieldIds: ReadonlySet<string>,
): CompiledMetaEntityInput {
  const canonicalFields = new Map(contract.fields.map((field) => [field.name, field]));
  const fieldNames = new Map(contract.fields.map((field) => [field.id, field.name]));
  const listColumns = contract.surfaces
    .filter((surface) => effectiveSurfaceIds.has(surface.id)
      && surface.enabled
      && ["list", "compact_card", "spreadsheet"].includes(surface.mode))
    .sort((left, right) => left.order - right.order)
    .flatMap((surface) => surface.bindings
      .filter((binding) => binding.visible)
      .sort((left, right) => left.order - right.order)
      .map((binding) => fieldNames.get(binding.field_id)))
    .filter((name): name is string => Boolean(name));

  return {
    ...compiled,
    primary_key: contract.runtime.storage.primary_key,
    tenant_column: contract.runtime.storage.tenant_column,
    table_schema: contract.runtime.storage.table_schema,
    table_name: contract.runtime.storage.table_name,
    backing_type: contract.runtime.storage.backing_type,
    // Mesh may dispatch explicitly allowlisted partner operations, but the
    // generic runtime must never infer direct CRUD authority.
    mutability: "immutable",
    fields: compiled.fields
      .filter((field) => {
        const canonical = canonicalFields.get(field.name);
        return canonical?.runtime_enabled === true
          && (effectiveFieldIds.has(canonical.id)
            || canonical.column_name === contract.runtime.storage.primary_key);
      })
      .map((field) => {
        const canonical = canonicalFields.get(field.name);
        return canonical ? {
          ...field,
          label: canonical.label,
          description: canonical.description,
          data_type: canonical.data_type,
          is_required: canonical.required,
          is_unique: canonical.unique,
          is_read_only: canonical.read_only,
          is_computed: canonical.computed,
          is_write_once: canonical.write_once,
        } : field;
      }),
    display_config: {
      ...compiled.display_config,
      list_columns: [...new Set(listColumns)],
    },
    search_config: contract.runtime.search,
    data_policy: contract.runtime.data_policy,
    concurrency_policy: contract.runtime.concurrency,
    feature_flags: {
      ...compiled.feature_flags,
      has_lifecycle: contract.lifecycle !== null,
      mesh_read_only: true,
    },
  };
}

function projectRelations(contract: MetaEntityContractV21) {
  return contract.relations.map((relation) => ({
    id: relation.id,
    name: relation.code,
    relation_kind: relation.kind,
    target_entity: relation.target_entity_code,
    resolution_kind: relation.resolution,
    fk_field: relation.source_field,
    target_key: relation.target_field,
    source_type_field: relation.polymorphic?.type_field,
    source_type_value: relation.polymorphic?.type_value,
    source_id_field: relation.polymorphic?.id_field,
    source_line_field: relation.source_line_field,
    runtime_role: relation.runtime_role,
    on_delete: relation.on_delete,
    record_filter: relation.record_filter,
    ui_behavior: {
      mutation_owner: "workspace",
      can_create: false,
      can_edit: false,
      can_delete: false,
    },
  }));
}

function projectNumbering(contract: MetaEntityContractV21) {
  const configuration = contract.numbering.configurations.find((item) => item.enabled);
  return configuration ? {
    enabled: true,
    numberField: configuration.field_scope.field_name,
    resetStrategy: configuration.reset_policy,
    uniquenessScope: configuration.field_scope.uniqueness,
    segments: configuration.segments,
  } : null;
}

function readPagination(value: unknown): RuntimeListPagination | undefined {
  if (!isRecord(value)) return undefined;
  const page = Number(value["page"]);
  const pageSize = Number(value["page_size"]);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize)) return undefined;
  return {
    page,
    pageSize,
    total: Number(value["total"] ?? 0),
    totalPages: Number(value["total_pages"] ?? 0),
  };
}

function isCatalogItem(value: unknown): value is MeshRuntimeCatalogItem {
  return isRecord(value)
    && typeof value["entityCode"] === "string"
    && typeof value["label"] === "string"
    && typeof value["publishedVersionId"] === "string"
    && typeof value["compiledHash"] === "string";
}

function normalizeEntityCode(value: string): string {
  return value.trim().replace(/-/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
