import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import {
  createCanonicalGraphLoader,
  type CanonicalEntity,
  type CanonicalMetadataGraph,
} from "./canonical-metadata-graph.js";

export interface CatalogCompilationDiagnostic {
  entityCode: string;
  path: string;
  message: string;
}

export interface CatalogEntityArtifact {
  artifact_kind: "catalog";
  entity_id: string;
  entity_code: string;
  name: string;
  slug: string | null;
  entity_class: string;
  ownership_model: string;
  kind: string;
  table_schema: string;
  table_name: string;
  backing_type: string;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  status: string;
  module_id: string | null;
  governance_level: string;
  security_tier: string;
  mutability: string;
  display_config: unknown;
  identity_config: unknown;
  search_config: unknown;
  data_policy: unknown;
  feature_flags: unknown;
  class_profile: Record<string, unknown> | null;
  effective_version: CanonicalEntity["effective_version"];
  physical_columns: string[];
  physical_primary_key: string[];
  fields: CanonicalEntity["fields"];
  relations: CanonicalEntity["relations"];
  operations: CanonicalEntity["operations"];
  diagnostics: CatalogCompilationDiagnostic[];
  compiled_at: string;
  compiled_hash: string;
}

export interface CatalogCompileSummary {
  total: number;
  compiled: number;
  persisted: number;
  failed: number;
  entityCodes: string[];
  diagnostics: CatalogCompilationDiagnostic[];
  graph: CanonicalMetadataGraph;
}

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function compileEntity(entity: CanonicalEntity): CatalogEntityArtifact {
  const diagnostics: CatalogCompilationDiagnostic[] = [];
  if (entity.effective_version_count === 0) {
    diagnostics.push({ entityCode: entity.entity_code, path: "effective_version", message: "No EFFECTIVE platform version exists." });
  } else if (entity.effective_version_count > 1) {
    diagnostics.push({ entityCode: entity.entity_code, path: "effective_version", message: `Expected one EFFECTIVE version, found ${entity.effective_version_count}.` });
  }
  const seenLogical = new Set<string>();
  for (const field of entity.fields.filter((field) => field.is_active)) {
    if (seenLogical.has(field.name)) {
      diagnostics.push({ entityCode: entity.entity_code, path: `fields.${field.name}`, message: "Duplicate active logical field name." });
    }
    seenLogical.add(field.name);
    if (entity.backing_type === "table" && field.column_name && !entity.physical_columns.includes(field.column_name)) {
      diagnostics.push({ entityCode: entity.entity_code, path: `fields.${field.name}.column_name`, message: `Physical column '${field.column_name}' is not present.` });
    }
  }
  if (entity.backing_type === "table") {
    const physicalNames = new Set<string>();
    for (const field of entity.fields.filter((field) => field.is_active && field.column_name)) {
      if (physicalNames.has(field.column_name) && !field.projection_alias_of) {
        diagnostics.push({ entityCode: entity.entity_code, path: `fields.${field.name}.column_name`, message: `Duplicate active physical column '${field.column_name}'.` });
      }
      physicalNames.add(field.column_name);
    }
  }
  const payload = {
    artifact_kind: "catalog" as const,
    entity_id: entity.id,
    entity_code: entity.entity_code,
    name: entity.name,
    slug: entity.slug,
    entity_class: entity.entity_class,
    ownership_model: entity.ownership_model,
    kind: entity.kind,
    table_schema: entity.table_schema,
    table_name: entity.table_name,
    backing_type: entity.backing_type,
    runtime_enabled: entity.runtime_enabled,
    primary_key: entity.primary_key,
    tenant_column: entity.tenant_column,
    read_capability: entity.read_capability,
    write_capability: entity.write_capability,
    status: entity.status,
    module_id: entity.module_id,
    governance_level: entity.governance_level,
    security_tier: entity.security_tier,
    mutability: entity.mutability,
    display_config: entity.display_config,
    identity_config: entity.identity_config,
    search_config: entity.search_config,
    data_policy: entity.data_policy,
    feature_flags: entity.feature_flags,
    class_profile: entity.class_profile,
    effective_version: entity.effective_version,
    physical_columns: entity.physical_columns,
    physical_primary_key: entity.physical_primary_key,
    fields: entity.fields,
    relations: entity.relations,
    operations: entity.operations,
    diagnostics,
    compiled_at: new Date().toISOString(),
  };
  return { ...payload, compiled_hash: hash(payload) };
}

export class CatalogCompiler {
  constructor(
    private readonly db: Kysely<any>,
    private readonly logger?: { info?(event: string, fields?: Record<string, unknown>): void; warn?(event: string, fields?: Record<string, unknown>): void },
  ) {}

  async compileAll(): Promise<CatalogCompileSummary> {
    const graph = await createCanonicalGraphLoader(this.db)();
    const diagnostics: CatalogCompilationDiagnostic[] = [];
    let compiled = 0;
    let persisted = 0;
    for (const entity of graph.entities) {
      const artifact = compileEntity(entity);
      diagnostics.push(...artifact.diagnostics);
      if (artifact.diagnostics.length > 0) continue;
      compiled++;
      try {
        if (!entity.effective_version) continue;
        await this.db.insertInto("snapshot.entity_compiled" as never).values({
          tenant_id: null,
          entity_version_id: entity.effective_version.id,
          artifact_kind: "catalog",
          compiled_json: artifact as never,
          compiled_hash: artifact.compiled_hash,
          compliance_report: { diagnostic_count: 0, artifact_kind: "catalog" },
          created_by: "00000000-0000-0000-0000-000000000000",
        } as never).onConflict((oc: any) => oc.columns(["tenant_id", "entity_version_id", "artifact_kind"] as never[]).doNothing()).execute();
        persisted++;
      } catch (error) {
        diagnostics.push({ entityCode: entity.entity_code, path: "snapshot.entity_compiled", message: error instanceof Error ? error.message : String(error) });
        this.logger?.warn?.("catalog_snapshot_persistence_failed", { entityCode: entity.entity_code, error: String(error) });
      }
    }
    const summary = { total: graph.entities.length, compiled, persisted, failed: graph.entities.length - compiled, entityCodes: graph.entities.map((entity) => entity.entity_code), diagnostics, graph };
    this.logger?.info?.("entity_catalog_compile_complete", { total: summary.total, compiled, persisted, failed: summary.failed, diagnostics: diagnostics.length });
    return summary;
  }
}

export function createCatalogCompiler(db: Kysely<any>, logger?: CatalogCompiler["logger"]): CatalogCompiler {
  return new CatalogCompiler(db, logger);
}
