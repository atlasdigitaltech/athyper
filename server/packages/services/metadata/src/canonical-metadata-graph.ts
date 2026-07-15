/**
 * Canonical metadata graph loader.
 *
 * This is intentionally catalog-oriented: it loads every registered platform
 * entity with its effective version, fields, relations, operations, class
 * profile, and physical binding. Runtime eligibility is evaluated separately
 * by the API compiler.
 */

import { CompiledQuery, type Kysely } from "kysely";

export interface MetadataGraphQuery {
  query<T extends object>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface CanonicalEntity {
  id: string;
  entity_code: string;
  name: string;
  slug: string | null;
  entity_class: string;
  ownership_model: string;
  kind: string;
  backing_type: string;
  table_schema: string;
  table_name: string;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  status: string;
  is_active: boolean;
  module_id: string | null;
  display_config: unknown;
  identity_config: unknown;
  search_config: unknown;
  data_policy: unknown;
  feature_flags: unknown;
  governance_level: string;
  security_tier: string;
  mutability: string;
  effective_version: CanonicalVersion | null;
  effective_version_count: number;
  physical_columns: string[];
  physical_primary_key: string[];
  fields: CanonicalField[];
  relations: CanonicalRelation[];
  operations: CanonicalOperation[];
  class_profile: Record<string, unknown> | null;
}

export interface CanonicalVersion {
  id: string;
  version_no: number;
  version_hash: string | null;
  status: string;
  effective_from: string | null;
}

export interface CanonicalField {
  id: string;
  entity_version_id: string;
  name: string;
  column_name: string;
  projection_alias_of: string | null;
  label: string | null;
  data_type: string;
  ui_type: string | null;
  is_active: boolean;
  runtime_enabled: boolean;
  is_computed: boolean;
  is_read_only: boolean;
  group_key: string | null;
  sort_order: number;
  reference_config: unknown;
  validation: unknown;
  defaults: unknown;
  raw: Record<string, unknown>;
}

export interface CanonicalRelation {
  id: string;
  entity_version_id: string;
  name: string;
  target_entity: string;
  fk_field: string | null;
  target_key: string;
  resolution_kind: string;
  relation_kind: string | null;
  raw: Record<string, unknown>;
}

export interface CanonicalOperation {
  entity_code: string;
  permission_code: string;
  is_enabled: boolean;
  handler_type: string | null;
  handler_target: string | null;
  execution_target: string | null;
}

export interface CanonicalMetadataGraph {
  loadedAt: string;
  entities: CanonicalEntity[];
}

interface RawEntity extends Record<string, unknown> {
  id: string;
  entity_code: string | null;
  name: string;
  slug: string | null;
  entity_class: string;
  ownership_model: string;
  kind: string;
  backing_type: string;
  table_schema: string;
  table_name: string;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  status: string;
  is_active: boolean;
  module_id: string | null;
  effective_version_count: number | string;
  effective_version_id: string | null;
  effective_version_no: number | string | null;
  effective_version_hash: string | null;
  effective_from: string | null;
  display_config: unknown;
  identity_config: unknown;
  search_config: unknown;
  data_policy: unknown;
  feature_flags: unknown;
  governance_level: string;
  security_tier: string;
  mutability: string;
  class_profile: unknown;
}

const asNumber = (value: unknown): number => Number(value ?? 0);
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export async function loadCanonicalMetadataGraph(query: MetadataGraphQuery): Promise<CanonicalMetadataGraph> {
  const registry = await query.query<RawEntity>(`
    SELECT
      e.id::text,
      COALESCE(NULLIF(e.entity_code, ''), e.name) AS entity_code,
      e.name, e.slug, e.entity_class, e.ownership_model, e.kind,
      e.backing_type, e.table_schema, e.table_name, e.runtime_enabled,
      e.primary_key, e.tenant_column, e.read_capability, e.write_capability,
      e.status, e.is_active, e.module_id::text,
      e.display_config, e.identity_config, e.search_config, e.data_policy,
      e.feature_flags, e.governance_level, e.security_tier, e.mutability,
      COUNT(ev.id) FILTER (WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL)::int AS effective_version_count,
      MAX(ev.id::text) FILTER (WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL) AS effective_version_id,
      MAX(ev.version_no) FILTER (WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL) AS effective_version_no,
      MAX(ev.version_hash) FILTER (WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL) AS effective_version_hash,
      MAX(ev.effective_from) FILTER (WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL)::text AS effective_from,
      to_jsonb(ecp) AS class_profile
    FROM control.entity e
    LEFT JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.tenant_id IS NULL
    LEFT JOIN control.entity_class_profile ecp ON ecp.class_key = e.entity_class
    WHERE e.tenant_id IS NULL
      AND e.is_active = true
    GROUP BY e.id, e.entity_code, e.name, e.slug, e.entity_class,
      e.ownership_model, e.kind, e.backing_type, e.table_schema, e.table_name,
      e.runtime_enabled, e.primary_key, e.tenant_column, e.read_capability,
      e.write_capability, e.status, e.is_active, e.module_id, e.display_config,
      e.identity_config, e.search_config, e.data_policy, e.feature_flags,
      e.governance_level, e.security_tier, e.mutability, ecp.id
    ORDER BY COALESCE(NULLIF(e.entity_code, ''), e.name)
  `);

  const entities: CanonicalEntity[] = registry.rows.map((row): CanonicalEntity => ({
    ...row,
    entity_code: row.entity_code ?? row.name,
    effective_version_count: asNumber(row.effective_version_count),
    effective_version: row.effective_version_id ? {
      id: row.effective_version_id,
      version_no: asNumber(row.effective_version_no),
      version_hash: row.effective_version_hash,
      status: "EFFECTIVE",
      effective_from: row.effective_from,
    } : null,
    physical_columns: [],
    physical_primary_key: [],
    fields: [],
    relations: [],
    operations: [],
    class_profile: asRecord(row.class_profile),
  }));

  if (entities.length === 0) return { loadedAt: new Date().toISOString(), entities };

  const versionIds = entities.flatMap((entity) => entity.effective_version ? [entity.effective_version.id] : []);
  const codes = entities.map((entity) => entity.entity_code);
  const [fields, relations, operations, physical, primaryKeys] = await Promise.all([
    versionIds.length === 0 ? Promise.resolve({ rows: [] as CanonicalField[] }) : query.query<CanonicalField>(`
      SELECT ef.id::text, ef.entity_version_id::text, ef.name, ef.column_name,
        ef.projection_alias_of, ef.label, ef.data_type, ef.ui_type, ef.is_active,
        COALESCE(ef.runtime_enabled, true) AS runtime_enabled, ef.is_computed,
        ef.is_read_only, ef.group_key, ef.sort_order, ef.reference_config,
        ef.validation, ef.defaults, to_jsonb(ef) AS raw
      FROM control.entity_field ef
      WHERE ef.entity_version_id = ANY($1::uuid[])
      ORDER BY ef.entity_version_id, ef.sort_order, ef.name
    `, [versionIds]),
    versionIds.length === 0 ? Promise.resolve({ rows: [] as CanonicalRelation[] }) : query.query<CanonicalRelation>(`
      SELECT er.id::text, er.entity_version_id::text, er.name, er.target_entity,
        er.fk_field, er.target_key, er.resolution_kind, er.relation_kind,
        to_jsonb(er) AS raw
      FROM control.entity_relation er
      WHERE er.entity_version_id = ANY($1::uuid[]) AND er.tenant_id IS NULL
      ORDER BY er.entity_version_id, er.name
    `, [versionIds]),
    query.query<CanonicalOperation>(`
      SELECT eo.entity_name AS entity_code, eo.permission_code, eo.is_enabled,
        eo.handler_type, eo.handler_target, eo.execution_target
      FROM control.entity_operation eo
      WHERE eo.tenant_id IS NULL AND eo.entity_name = ANY($1::text[])
    `, [codes]),
    query.query<{ entity_id: string; column_name: string }>(`
      SELECT e.id::text AS entity_id, c.column_name
      FROM control.entity e
      JOIN information_schema.columns c ON c.table_schema = e.table_schema AND c.table_name = e.table_name
      WHERE e.tenant_id IS NULL
    `),
    query.query<{ entity_id: string; column_name: string; ordinal_position: number | string }>(`
      SELECT e.id::text AS entity_id, a.attname AS column_name, k.ord AS ordinal_position
      FROM control.entity e
      JOIN pg_namespace n ON n.nspname = e.table_schema
      JOIN pg_class t ON t.relnamespace = n.oid AND t.relname = e.table_name
      JOIN pg_index i ON i.indrelid = t.oid AND i.indisprimary
      JOIN unnest(i.indkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE e.tenant_id IS NULL
      ORDER BY e.id, k.ord
    `),
  ]);

  const fieldsByVersion = new Map<string, CanonicalField[]>();
  for (const field of fields.rows) {
    const list = fieldsByVersion.get(field.entity_version_id) ?? [];
    list.push(field);
    fieldsByVersion.set(field.entity_version_id, list);
  }
  const relationsByVersion = new Map<string, CanonicalRelation[]>();
  for (const relation of relations.rows) {
    const list = relationsByVersion.get(relation.entity_version_id) ?? [];
    list.push(relation);
    relationsByVersion.set(relation.entity_version_id, list);
  }
  const operationsByCode = new Map<string, CanonicalOperation[]>();
  for (const operation of operations.rows) {
    const list = operationsByCode.get(operation.entity_code) ?? [];
    list.push(operation);
    operationsByCode.set(operation.entity_code, list);
  }
  const columnsByEntity = new Map<string, string[]>();
  for (const column of physical.rows) {
    const list = columnsByEntity.get(column.entity_id) ?? [];
    list.push(column.column_name);
    columnsByEntity.set(column.entity_id, list);
  }
  const primaryByEntity = new Map<string, string[]>();
  for (const key of primaryKeys.rows) {
    const list = primaryByEntity.get(key.entity_id) ?? [];
    list.push(key.column_name);
    primaryByEntity.set(key.entity_id, list);
  }

  for (const entity of entities) {
    const versionId = entity.effective_version?.id;
    entity.fields = versionId ? fieldsByVersion.get(versionId) ?? [] : [];
    entity.relations = versionId ? relationsByVersion.get(versionId) ?? [] : [];
    entity.operations = operationsByCode.get(entity.entity_code) ?? [];
    entity.physical_columns = columnsByEntity.get(entity.id) ?? [];
    entity.physical_primary_key = primaryByEntity.get(entity.id) ?? [];
  }

  return { loadedAt: new Date().toISOString(), entities };
}

export function createCanonicalGraphLoader(db: Kysely<any>): () => Promise<CanonicalMetadataGraph> {
  return () => loadCanonicalMetadataGraph({
    query: <T extends object>(text: string, values?: readonly unknown[]) =>
      db.executeQuery<T>(CompiledQuery.raw(text, values ? [...values] : [])),
  });
}
