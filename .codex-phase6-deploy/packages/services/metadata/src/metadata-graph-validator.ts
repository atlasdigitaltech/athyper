/**
 * Runtime metadata graph preflight.
 *
 * This validator intentionally operates below the compiler. Metadata rows may
 * be registered for UI, discovery, coverage, and internal purposes, but only
 * the explicit runtime contract is admitted to descriptor compilation.
 */

export interface MetadataGraphQuery {
  query<T extends object>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export type MetadataGraphDiagnosticCode =
  | "GRAPH_QUERY_FAILED"
  | "EFFECTIVE_VERSION_MISSING"
  | "EFFECTIVE_VERSION_MULTIPLE"
  | "PHYSICAL_RELATION_DRIFT"
  | "RUNTIME_PRIMARY_KEY_MISSING"
  | "RUNTIME_PRIMARY_KEY_COLUMN_MISSING"
  | "RUNTIME_PRIMARY_KEY_COMPOSITE_UNSUPPORTED"
  | "RUNTIME_PRIMARY_KEY_MISMATCH"
  | "RUNTIME_TENANT_COLUMN_MISSING"
  | "RUNTIME_FIELD_COLUMN_MISSING"
  | "RUNTIME_FIELD_COLUMN_DRIFT"
  | "DUPLICATE_LOGICAL_FIELD"
  | "DUPLICATE_PHYSICAL_COLUMN"
  | "VIEW_PRIMARY_KEY_MISSING"
  | "VIEW_ALIAS_INVALID"
  | "VIEW_ALIAS_TARGET_MISSING"
  | "VIEW_ALIAS_TARGET_MISMATCH"
  | "REFERENCE_TARGET_UNRESOLVED"
  | "REFERENCE_FIELD_UNRESOLVED"
  | "RELATION_TARGET_UNRESOLVED"
  | "RELATION_SOURCE_FIELD_UNRESOLVED"
  | "RELATION_TARGET_FIELD_UNRESOLVED"
  | "RUNTIME_READ_CAPABILITY_INVALID"
  | "RUNTIME_WRITE_CAPABILITY_INVALID"
  | "RUNTIME_WRITE_FACADE_MISSING"
  | "RUNTIME_VIEW_WRITE_MODE_INVALID"
  | "RUNTIME_READ_ONLY_WRITE_MODE_INVALID"
  | "RUNTIME_APPEND_ONLY_WRITE_MODE_INVALID";

export interface MetadataGraphDiagnostic {
  entityCode: string;
  code: MetadataGraphDiagnosticCode;
  path: string;
  message: string;
}

export interface MetadataGraphValidationResult {
  passed: boolean;
  eligibleEntityCodes: string[];
  diagnostics: MetadataGraphDiagnostic[];
}

export interface MetadataGraphValidationOptions {
  /** Restrict diagnostics to the named runtime entity codes. */
  entityCodes?: readonly string[];
}

interface RegistryEntity {
  entity_id: string;
  entity_code: string;
  name: string;
  slug: string | null;
  entity_class: string;
  table_schema: string;
  table_name: string;
  backing_type: string;
  runtime_enabled: boolean;
  status: string;
  is_active: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  feature_flags: unknown;
  mutability: string;
  effective_version_count: number | string;
  effective_version_id: string | null;
}

interface FieldRow {
  entity_version_id: string;
  name: string;
  column_name: string;
  projection_alias_of: string | null;
  is_computed: boolean;
  reference_config: unknown;
  validation: unknown;
  runtime_enabled?: boolean;
}

interface RelationRow {
  entity_version_id: string;
  name: string;
  target_entity: string;
  fk_field: string | null;
  target_key: string;
  resolution_kind: string;
  source_type_field: string | null;
  source_id_field: string | null;
  source_line_field: string | null;
  relation_kind: string | null;
}

interface PhysicalRelationRow {
  relation_kind: string | null;
}

interface PhysicalColumnRow {
  column_name: string;
}

interface PrimaryKeyRow {
  column_name: string;
  ordinal_position: number | string;
}

interface OperationRow {
  entity_name: string;
  permission_code: string;
}

const READ_CAPABILITIES = new Set(["none", "generic", "facade", "projection"]);
const WRITE_CAPABILITIES = new Set(["none", "generic", "facade", "append_only"]);
const WRITE_TOKENS = new Set(["create", "new", "insert", "add", "edit", "update", "write", "save", "patch", "delete", "remove", "destroy"]);

export async function validateMetadataGraph(
  query: MetadataGraphQuery,
  options: MetadataGraphValidationOptions = {},
): Promise<MetadataGraphValidationResult> {
  const registry = await query.query<RegistryEntity>(`
    SELECT
      e.id::text AS entity_id,
      COALESCE(NULLIF(e.entity_code, ''), e.name) AS entity_code,
      e.name,
      e.slug,
      e.entity_class,
      e.table_schema,
      e.table_name,
      e.backing_type,
      e.runtime_enabled,
      e.status,
      e.is_active,
      e.primary_key,
      e.tenant_column,
      e.read_capability,
      e.write_capability,
      e.feature_flags,
      e.mutability,
      COUNT(ev.id) FILTER (
        WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL
      )::int AS effective_version_count,
      MAX(ev.id::text) FILTER (
        WHERE ev.status = 'EFFECTIVE' AND ev.tenant_id IS NULL
      ) AS effective_version_id
    FROM control.entity e
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.tenant_id IS NULL
    WHERE e.tenant_id IS NULL
    GROUP BY
      e.id, e.entity_code, e.name, e.slug, e.entity_class,
      e.table_schema, e.table_name, e.backing_type, e.runtime_enabled,
      e.status, e.is_active, e.primary_key, e.tenant_column,
      e.read_capability, e.write_capability, e.feature_flags, e.mutability
    ORDER BY COALESCE(NULLIF(e.entity_code, ''), e.name)
  `);

  const allEntities = registry.rows;
  const requested = options.entityCodes ? new Set(options.entityCodes.map(normalize)) : undefined;
  const runtimeEntities = allEntities.filter((entity) =>
    entity.runtime_enabled === true
    && entity.status === "ACTIVE"
    && entity.is_active === true,
  ).filter((entity) => !requested || requested.has(normalize(entity.entity_code)));
  const eligibleEntityCodes = runtimeEntities.map((entity) => entity.entity_code);
  const diagnostics: MetadataGraphDiagnostic[] = [];
  const registryByKey = new Map<string, RegistryEntity>();
  for (const entity of allEntities) {
    for (const key of [entity.entity_code, entity.name, entity.slug]) {
      if (key) registryByKey.set(normalize(key), entity);
    }
  }

  const versionIds = allEntities
    .filter((entity) => number(entity.effective_version_count) === 1 && entity.effective_version_id)
    .map((entity) => entity.effective_version_id!);
  const fieldsByVersion = new Map<string, FieldRow[]>();
  if (versionIds.length > 0) {
    const fields = await query.query<FieldRow>(`
      SELECT
        ef.entity_version_id::text,
        ef.name,
        ef.column_name,
        ef.projection_alias_of,
        ef.is_computed,
        ef.reference_config,
        ef.validation,
        COALESCE(ef.runtime_enabled, true) AS runtime_enabled
      FROM control.entity_field ef
      WHERE ef.entity_version_id = ANY($1::uuid[])
        AND ef.is_active = true
        AND COALESCE(ef.runtime_enabled, true) = true
      ORDER BY ef.entity_version_id, ef.sort_order, ef.name
    `, [versionIds]);
    for (const field of fields.rows) {
      const list = fieldsByVersion.get(field.entity_version_id) ?? [];
      list.push(field);
      fieldsByVersion.set(field.entity_version_id, list);
    }
  }

  const runtimeVersionIds = runtimeEntities
    .filter((entity) => number(entity.effective_version_count) === 1 && entity.effective_version_id)
    .map((entity) => entity.effective_version_id!);
  const relationsByVersion = new Map<string, RelationRow[]>();
  if (runtimeVersionIds.length > 0) {
    const relations = await query.query<RelationRow>(`
      SELECT
        er.entity_version_id::text,
        er.name,
        er.target_entity,
        er.fk_field,
        er.target_key,
        er.resolution_kind,
        er.source_type_field,
        er.source_id_field,
        er.source_line_field,
        er.relation_kind
      FROM control.entity_relation er
      WHERE er.entity_version_id = ANY($1::uuid[])
        AND er.tenant_id IS NULL
      ORDER BY er.entity_version_id, er.name
    `, [runtimeVersionIds]);
    for (const relation of relations.rows) {
      const list = relationsByVersion.get(relation.entity_version_id) ?? [];
      list.push(relation);
      relationsByVersion.set(relation.entity_version_id, list);
    }
  }

  const operationsByEntity = new Map<string, OperationRow[]>();
  if (eligibleEntityCodes.length > 0) {
    const operations = await query.query<OperationRow>(`
      SELECT entity_name, permission_code
      FROM control.entity_operation
      WHERE tenant_id IS NULL
        AND is_enabled = true
        AND entity_name = ANY($1::text[])
    `, [eligibleEntityCodes]);
    for (const operation of operations.rows) {
      const list = operationsByEntity.get(normalize(operation.entity_name)) ?? [];
      list.push(operation);
      operationsByEntity.set(normalize(operation.entity_name), list);
    }
  }

  for (const entity of runtimeEntities) {
    const entityCode = entity.entity_code;
    const error = (code: MetadataGraphDiagnosticCode, path: string, message: string) => {
      diagnostics.push({ entityCode, code, path, message });
    };
    const effectiveCount = number(entity.effective_version_count);
    if (effectiveCount === 0) {
      error("EFFECTIVE_VERSION_MISSING", "entity_version", "No active platform version has status EFFECTIVE.");
      continue;
    }
    if (effectiveCount > 1) {
      error("EFFECTIVE_VERSION_MULTIPLE", "entity_version", `Expected one EFFECTIVE version, found ${effectiveCount}.`);
      continue;
    }

    validateCapabilities(entity, error, operationsByEntity.get(normalize(entityCode)) ?? []);

    const physical = await query.query<PhysicalRelationRow>(`
      SELECT CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        ELSE c.relkind::text
      END AS relation_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
      LIMIT 1
    `, [entity.table_schema, entity.table_name]);
    const actualRelation = physical.rows[0]?.relation_kind ?? null;
    if (actualRelation !== entity.backing_type) {
      error(
        "PHYSICAL_RELATION_DRIFT",
        "storage",
        `Metadata declares ${entity.backing_type} ${entity.table_schema}.${entity.table_name}, physical relation is ${actualRelation ?? "missing"}.`,
      );
    }

    const columns = await query.query<PhysicalColumnRow>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [entity.table_schema, entity.table_name]);
    const physicalColumns = new Set(columns.rows.map((column) => column.column_name));
    const primaryKeyRows = entity.backing_type === "table"
      ? await query.query<PrimaryKeyRow>(`
          SELECT kcu.column_name, kcu.ordinal_position
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name
          WHERE tc.constraint_schema = $1
            AND tc.table_name = $2
            AND tc.constraint_type = 'PRIMARY KEY'
          ORDER BY kcu.ordinal_position
        `, [entity.table_schema, entity.table_name])
      : { rows: [] as PrimaryKeyRow[] };

    if (!entity.primary_key) {
      error("RUNTIME_PRIMARY_KEY_MISSING", "primary_key", "Runtime entities require an explicit primary_key.");
    } else if (!physicalColumns.has(entity.primary_key)) {
      error("RUNTIME_PRIMARY_KEY_COLUMN_MISSING", "primary_key", `Primary key column '${entity.primary_key}' is not present on the physical relation.`);
    }
    if (entity.backing_type === "table") {
      if (primaryKeyRows.rows.length > 1) {
        error("RUNTIME_PRIMARY_KEY_COMPOSITE_UNSUPPORTED", "primary_key", `Composite primary key has ${primaryKeyRows.rows.length} columns; runtime descriptors support one column.`);
      } else if (primaryKeyRows.rows.length === 0) {
        error("RUNTIME_PRIMARY_KEY_MISMATCH", "primary_key", "Table-backed runtime entities must have a physical primary key.");
      } else if (entity.primary_key !== primaryKeyRows.rows[0]?.column_name) {
        error("RUNTIME_PRIMARY_KEY_MISMATCH", "primary_key", `Metadata key '${entity.primary_key ?? ""}' does not match physical primary key '${primaryKeyRows.rows[0]?.column_name ?? ""}'.`);
      }
    } else if (!entity.primary_key) {
      error("VIEW_PRIMARY_KEY_MISSING", "primary_key", "View/projection runtime entities require an explicit projection key.");
    }
    if (entity.tenant_column && !physicalColumns.has(entity.tenant_column)) {
      error("RUNTIME_TENANT_COLUMN_MISSING", "tenant_column", `Tenant column '${entity.tenant_column}' is not present on the physical relation.`);
    }

    const versionId = entity.effective_version_id!;
    const fields = fieldsByVersion.get(versionId) ?? [];
    const fieldsByName = new Map<string, FieldRow[]>();
    const fieldsByColumn = new Map<string, FieldRow[]>();
    for (const field of fields) {
      const byName = fieldsByName.get(field.name) ?? [];
      byName.push(field);
      fieldsByName.set(field.name, byName);
      if (field.column_name) {
        const byColumn = fieldsByColumn.get(field.column_name) ?? [];
        byColumn.push(field);
        fieldsByColumn.set(field.column_name, byColumn);
        if (!physicalColumns.has(field.column_name)) {
          error("RUNTIME_FIELD_COLUMN_DRIFT", `fields.${field.name}`, `Field column '${field.column_name}' is not present on the physical relation.`);
        }
      } else {
        error("RUNTIME_FIELD_COLUMN_MISSING", `fields.${field.name}`, "Runtime descriptor fields require a physical column.");
      }
    }
    for (const [name, group] of fieldsByName) {
      if (group.length > 1) error("DUPLICATE_LOGICAL_FIELD", `fields.${name}`, `Found ${group.length} active fields with logical name '${name}'.`);
    }
    for (const [column, group] of fieldsByColumn) {
      if (group.length <= 1) continue;
      if (entity.backing_type === "table") {
        error("DUPLICATE_PHYSICAL_COLUMN", `fields.${column}`, `Found ${group.length} active fields mapped to physical column '${column}'.`);
      } else {
        for (const field of group) {
          if (!field.projection_alias_of) {
            error("VIEW_ALIAS_INVALID", `fields.${field.name}`, `Projection column '${column}' is shared without an explicit projection_alias_of.`);
          }
        }
      }
    }
    for (const field of fields) {
      if (!field.projection_alias_of) continue;
      if (entity.backing_type === "table") {
        error("VIEW_ALIAS_INVALID", `fields.${field.name}.projection_alias_of`, "Projection aliases are only valid for views and materialized views.");
        continue;
      }
      if (field.projection_alias_of === field.name) {
        error("VIEW_ALIAS_INVALID", `fields.${field.name}.projection_alias_of`, "A projection alias cannot target itself.");
        continue;
      }
      const target = fieldsByName.get(field.projection_alias_of)?.[0];
      if (!target) {
        error("VIEW_ALIAS_TARGET_MISSING", `fields.${field.name}.projection_alias_of`, `Alias target '${field.projection_alias_of}' is not an active field in this version.`);
      } else if (target.column_name !== field.column_name) {
        error("VIEW_ALIAS_TARGET_MISMATCH", `fields.${field.name}.projection_alias_of`, `Alias target '${field.projection_alias_of}' maps to '${target.column_name}', not '${field.column_name}'.`);
      }
    }
    if (entity.primary_key && !fieldsByColumn.has(entity.primary_key)) {
      error("RUNTIME_PRIMARY_KEY_COLUMN_MISSING", "primary_key", `Primary key '${entity.primary_key}' has no active entity_field mapping.`);
    }

    for (const field of fields) {
      const reference = object(field.reference_config);
      const validation = object(field.validation);
      const targetName = text(reference["target_entity"]) ?? text(reference["ref_entity"]) ?? text(validation["ref_entity"]);
      if (!targetName) continue;
      const target = registryByKey.get(normalize(targetName));
      if (!target) {
        error("REFERENCE_TARGET_UNRESOLVED", `fields.${field.name}.reference_config`, `Reference target '${targetName}' is not registered.`);
        continue;
      }
      const targetVersion = validEffectiveVersion(target);
      if (!targetVersion) {
        error("REFERENCE_TARGET_UNRESOLVED", `fields.${field.name}.reference_config`, `Reference target '${targetName}' has no unique EFFECTIVE platform version.`);
        continue;
      }
      const targetField = text(reference["target_field"]) ?? "id";
      const targetFields = fieldsByVersion.get(targetVersion) ?? [];
      if (!targetFields.some((item) => item.name === targetField || item.column_name === targetField)
        && target.primary_key !== targetField) {
        error("REFERENCE_FIELD_UNRESOLVED", `fields.${field.name}.reference_config`, `Reference target field '${targetField}' is not compiled on '${targetName}'.`);
      }
    }

    for (const relation of relationsByVersion.get(versionId) ?? []) {
      const target = registryByKey.get(normalize(relation.target_entity));
      if (!target) {
        error("RELATION_TARGET_UNRESOLVED", `relations.${relation.name}.target_entity`, `Relation target '${relation.target_entity}' is not registered.`);
        continue;
      }
      const targetVersion = validEffectiveVersion(target);
      if (!targetVersion) {
        error("RELATION_TARGET_UNRESOLVED", `relations.${relation.name}.target_entity`, `Relation target '${relation.target_entity}' has no unique EFFECTIVE platform version.`);
        continue;
      }
      const targetFields = fieldsByVersion.get(targetVersion) ?? [];
      const relationKind = (relation.relation_kind ?? "belongs_to").toLowerCase();
      const fkFields = relationKind === "has_many" ? targetFields : fields;
      const fieldLabel = relationKind === "has_many" ? "target" : "source";
      if (relation.fk_field && !fkFields.some((field) => field.name === relation.fk_field || field.column_name === relation.fk_field)) {
        error(
          relationKind === "has_many" ? "RELATION_TARGET_FIELD_UNRESOLVED" : "RELATION_SOURCE_FIELD_UNRESOLVED",
          `relations.${relation.name}.fk_field`,
          `${fieldLabel.charAt(0).toUpperCase()}${fieldLabel.slice(1)} relation field '${relation.fk_field}' is not active on the ${fieldLabel} entity.`,
        );
      }
      for (const [property, value] of [
        ["source_type_field", relation.source_type_field],
        ["source_id_field", relation.source_id_field],
        ["source_line_field", relation.source_line_field],
      ] as const) {
        if (value && !fkFields.some((field) => field.name === value || field.column_name === value)) {
          error(
            relationKind === "has_many" ? "RELATION_TARGET_FIELD_UNRESOLVED" : "RELATION_SOURCE_FIELD_UNRESOLVED",
            `relations.${relation.name}.${property}`,
            `Polymorphic relation field '${value}' is not active on the ${fieldLabel} entity.`,
          );
        }
      }
      if (!targetFields.some((field) => field.name === relation.target_key || field.column_name === relation.target_key)
        && registryByKey.get(normalize(relation.target_entity))?.primary_key !== relation.target_key) {
        error("RELATION_TARGET_FIELD_UNRESOLVED", `relations.${relation.name}.target_key`, `Target field '${relation.target_key}' is not compiled on '${relation.target_entity}'.`);
      }
    }
  }

  return { passed: diagnostics.length === 0, eligibleEntityCodes, diagnostics };
}

function validateCapabilities(
  entity: RegistryEntity,
  error: (code: MetadataGraphDiagnosticCode, path: string, message: string) => void,
  operations: OperationRow[],
): void {
  if (!READ_CAPABILITIES.has(entity.read_capability) || entity.read_capability === "none") {
    error("RUNTIME_READ_CAPABILITY_INVALID", "read_capability", `Runtime read capability '${entity.read_capability}' is not executable.`);
  }
  if (!WRITE_CAPABILITIES.has(entity.write_capability)) {
    error("RUNTIME_WRITE_CAPABILITY_INVALID", "write_capability", `Unknown runtime write capability '${entity.write_capability}'.`);
  }
  const flags = object(entity.feature_flags);
  const hasFacade = typeof flags["write_facade"] === "string" || flags["write_facade"] === true;
  const writes = operations.filter((operation) => tokenize(operation.permission_code).some((token) => WRITE_TOKENS.has(token)));
  if (entity.write_capability === "facade" && !hasFacade) {
    error("RUNTIME_WRITE_FACADE_MISSING", "write_capability", "Facade write capability requires feature_flags.write_facade.");
  }
  if (entity.backing_type !== "table" && entity.write_capability !== "none" && entity.write_capability !== "facade") {
    error("RUNTIME_VIEW_WRITE_MODE_INVALID", "write_capability", "View/projection writes must be none or facade.");
  }
  if (["locked", "readonly", "read_only", "immutable"].includes(entity.mutability.toLowerCase()) && entity.write_capability !== "none") {
    error("RUNTIME_READ_ONLY_WRITE_MODE_INVALID", "write_capability", `Mutability '${entity.mutability}' requires write_capability = none.`);
  }
  if (entity.write_capability === "none" && writes.length > 0) {
    error("RUNTIME_READ_ONLY_WRITE_MODE_INVALID", "write_capability", `Read-only runtime entity declares enabled write operations: ${writes.map((operation) => operation.permission_code).join(", ")}.`);
  }
  if (entity.write_capability === "append_only") {
    const destructive = writes.filter((operation) => tokenize(operation.permission_code).some((token) =>
      ["edit", "update", "write", "save", "patch", "delete", "remove", "destroy"].includes(token),
    ));
    if (destructive.length > 0) {
      error("RUNTIME_APPEND_ONLY_WRITE_MODE_INVALID", "write_capability", `Append-only runtime entity declares update/delete operations: ${destructive.map((operation) => operation.permission_code).join(", ")}.`);
    }
  }
}

function validEffectiveVersion(entity: RegistryEntity): string | null {
  return number(entity.effective_version_count) === 1 ? entity.effective_version_id : null;
}

function number(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function tokenize(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_").filter(Boolean);
}
