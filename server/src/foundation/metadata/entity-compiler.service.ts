/**
 * EntityCompilerService
 *
 * Compiles current control.entity metadata into the snapshot.entity_compiled
 * cache used by runtime compliance checks. The HTTP metadata route still
 * builds descriptors on demand for request serving, but this service keeps the
 * append-only snapshot table populated for every active system entity.
 */

import { createHash } from "node:crypto";
import type { Kysely } from "kysely";

export interface CompiledField {
  id: string;
  name: string;
  column_name: string;
  label: string | null;
  description: string | null;
  data_type: string;
  ui_type: string | null;
  format: string | null;
  unit: string | null;
  cardinality: string;
  origin: string;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable: boolean;
  is_aggregatable: boolean;
  is_pii: boolean;
  default_value: unknown;
  validation_rules: Record<string, unknown> | null;
  enum_domain_code: string | null;
  reference_config: Record<string, unknown> | null;
  money_config: Record<string, unknown> | null;
  sort_order: number;
  group_key: string | null;
  ui_hint: Record<string, unknown> | null;
  lookup_config: Record<string, unknown> | null;
  filter_config: Record<string, unknown> | null;
  i18n_key: string | null;
}

export interface CompiledEntity {
  entity_id: string;
  entity_code: string;
  entity_name: string;
  entity_class: string;
  table_schema: string;
  table_name: string;
  version_id: string;
  version_no: number;
  version_hash: string;
  fields: CompiledField[];
  field_groups: Array<{
    group_key: string;
    label: string;
    description: string | null;
    sort_order: number;
    fields: string[];
  }>;
  display_config: Record<string, unknown>;
  feature_flags: Record<string, unknown>;
  governance_level: string;
  security_tier: string;
  mutability: string;
  class_profile: Record<string, unknown> | null;
  compiled_at: string;
  compiled_hash: string;
}

export interface CompileAllSummary {
  total: number;
  compiled: number;
  failed: number;
}

interface EntityRow {
  id: string;
  name: string;
  entity_code: string;
  label_singular: string | null;
  label_plural: string | null;
  entity_class: string;
  table_schema: string;
  table_name: string;
  display_config: unknown;
  feature_flags: unknown;
  governance_level: string;
  security_tier: string;
  mutability: string;
  icon_key: string | null;
  color_token: string | null;
}

interface EntityVersionRow {
  id: string;
  version_no: number;
  version_hash: string | null;
}

interface EntityFieldRow {
  id: string;
  name: string;
  column_name: string;
  label: string | null;
  description: string | null;
  data_type: string;
  ui_type: string | null;
  format: string | null;
  unit: string | null;
  cardinality: string;
  origin: string;
  is_required: boolean;
  is_unique: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable: boolean;
  is_aggregatable: boolean;
  is_read_only: boolean;
  sort_order: number;
  default_value: unknown | null;
  validation: unknown | null;
  enum_domain_code: string | null;
  reference_config: unknown | null;
  money_config: unknown | null;
  ui_hint: unknown | null;
  lookup_config: unknown | null;
}

interface ClassProfileRow {
  class_key: string;
  label: string;
  description: string;
  valid_governance_levels: string[];
  default_governance_level: string;
  valid_mutability: string[];
  default_mutability: string;
  default_security_tier: string;
  expected_system_columns: string[];
  field_flag_rules: unknown;
  security_tiers: unknown;
  compliance_profile: unknown;
}

interface Logger {
  warn(event: string, fields?: Record<string, unknown>): void;
  info?(event: string, fields?: Record<string, unknown>): void;
  error?(event: string, fields?: Record<string, unknown>): void;
}

const CACHE_TTL_MS = 5 * 60_000;
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

function coerceJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  const parsed = coerceJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function withDefinedValues(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function normalizeFeatureFlags(raw: Record<string, unknown>): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...raw };

  if (!("is_approvable" in canonical) && "approval_workflow" in raw) {
    canonical["is_approvable"] = Boolean(raw["approval_workflow"]);
  }
  if (!("has_attachments" in canonical) && "allow_attachments" in raw) {
    canonical["has_attachments"] = Boolean(raw["allow_attachments"]);
  }
  if (!("is_exportable" in canonical) && "allow_export" in raw) {
    canonical["is_exportable"] = Boolean(raw["allow_export"]);
  }

  return canonical;
}

function normalizeReferenceConfig(row: EntityFieldRow): Record<string, unknown> | null {
  const rawConfig = coerceRecord(row.reference_config);
  if (rawConfig) {
    return withDefinedValues({
      ...rawConfig,
      target_entity: rawConfig["target_entity"] ?? rawConfig["ref_entity"] ?? "",
      target_field: rawConfig["target_field"],
      display_field: rawConfig["display_field"],
    });
  }

  const validation = coerceRecord(row.validation);
  if (validation?.["ref_entity"]) {
    return withDefinedValues({
      target_entity: validation["ref_entity"],
      target_field: validation["target_field"],
      display_field: validation["display_field"],
    });
  }

  return null;
}

function mapField(row: EntityFieldRow): CompiledField {
  const uiHint = coerceRecord(row.ui_hint);
  const validation = coerceRecord(row.validation);

  return {
    id: row.id,
    name: row.name,
    column_name: row.column_name,
    label: row.label,
    description: row.description,
    data_type: row.data_type,
    ui_type: row.ui_type,
    format: row.format,
    unit: row.unit,
    cardinality: row.cardinality,
    origin: row.origin,
    is_required: row.is_required,
    is_readonly: row.is_read_only,
    is_unique: row.is_unique,
    is_searchable: row.is_searchable,
    is_filterable: row.is_filterable,
    is_sortable: row.is_sortable,
    is_groupable: row.is_groupable,
    is_aggregatable: row.is_aggregatable,
    is_pii: false,
    default_value: coerceJson(row.default_value),
    validation_rules: validation && !validation["ref_entity"] ? validation : null,
    enum_domain_code: row.enum_domain_code,
    reference_config: normalizeReferenceConfig(row),
    money_config: coerceRecord(row.money_config),
    sort_order: row.sort_order,
    group_key: stringValue(uiHint?.["group_key"]),
    ui_hint: uiHint,
    lookup_config: coerceRecord(row.lookup_config),
    filter_config: coerceRecord(uiHint?.["filter"]),
    i18n_key: stringValue(uiHint?.["i18n_key"]),
  };
}

export class EntityCompilerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly logger?: Logger;
  private readonly cache = new Map<string, { compiled: CompiledEntity; fetchedAt: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>, logger?: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Compile a single entity and persist its snapshot row.
   */
  async compile(entityCode: string, tenantId?: string): Promise<CompiledEntity | null> {
    void tenantId;

    const now = Date.now();
    const cached = this.cache.get(entityCode);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      return cached.compiled;
    }

    const compiled = await this.fullCompile(entityCode);
    if (!compiled) return null;

    await this.writeSnapshot(compiled);
    this.cache.set(entityCode, { compiled, fetchedAt: now });
    return compiled;
  }

  /**
   * Compile every active system entity. This is best-effort by entity: one bad
   * row is logged and the warm-up continues so the remaining snapshots are
   * still generated before the compliance suite runs.
   */
  async compileAllSystemEntities(): Promise<CompileAllSummary> {
    let total = 0;
    let compiled = 0;
    let failed = 0;

    try {
      const rows = await this.db
        .selectFrom("control.entity as e" as never)
        .select("e.name" as never)
        .where("e.tenant_id" as never, "is" as never, null as never)
        .where("e.status" as never, "=" as never, "ACTIVE" as never)
        .execute() as Array<{ name: string }>;

      total = rows.length;

      for (const row of rows) {
        const entityCode = String(row.name);
        try {
          const result = await this.compile(entityCode);
          if (result) {
            compiled++;
          } else {
            failed++;
            this.logger?.warn("entity_compile_skipped", {
              entityCode,
              reason: "No effective active entity metadata found",
            });
          }
        } catch (err) {
          failed++;
          this.logger?.warn("entity_compile_failed", {
            entityCode,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { total, compiled, failed };
    } catch (err) {
      this.logger?.warn("entity_compile_warmup_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { total, compiled, failed: failed || 1 };
    }
  }

  invalidate(entityCode?: string): void {
    if (entityCode) {
      this.cache.delete(entityCode);
    } else {
      this.cache.clear();
    }
  }

  async listEntityCodes(): Promise<string[]> {
    const rows = await this.db
      .selectFrom("control.entity as e" as never)
      .select("e.name" as never)
      .where("e.is_active" as never, "=", true as never)
      .execute() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  private async fullCompile(entityCode: string): Promise<CompiledEntity | null> {
    const entityRow = await this.db
      .selectFrom("control.entity as e" as never)
      .select([
        "e.id",
        "e.name",
        "e.entity_code",
        "e.label_singular",
        "e.label_plural",
        "e.entity_class",
        "e.table_schema",
        "e.table_name",
        "e.display_config",
        "e.feature_flags",
        "e.governance_level",
        "e.security_tier",
        "e.mutability",
        "e.icon_key",
        "e.color_token",
      ] as never[])
      .where((eb: any) => eb.or([
        eb("e.name", "=", entityCode),
        eb("e.entity_code", "=", entityCode),
      ]))
      .where("e.tenant_id" as never, "is" as never, null as never)
      .where("e.is_active" as never, "=" as never, true as never)
      .executeTakeFirst() as EntityRow | undefined;

    if (!entityRow) return null;

    const versionRow = await this.db
      .selectFrom("control.entity_version as ev" as never)
      .select(["ev.id", "ev.version_no", "ev.version_hash"] as never[])
      .where("ev.entity_id" as never, "=" as never, entityRow.id as never)
      .where("ev.status" as never, "=" as never, "EFFECTIVE" as never)
      .executeTakeFirst() as EntityVersionRow | undefined;

    if (!versionRow) return null;

    const fieldRows = await this.db
      .selectFrom("control.entity_field as ef" as never)
      .selectAll("ef" as never)
      .where("ef.entity_version_id" as never, "=" as never, versionRow.id as never)
      .where("ef.is_active" as never, "=" as never, true as never)
      .orderBy("ef.sort_order" as never, "asc")
      .execute() as EntityFieldRow[];

    const classProfile = await this.loadClassProfile(entityRow.entity_class);
    const fields = fieldRows.map(mapField);
    const displayConfig = coerceRecord(entityRow.display_config) ?? {};
    const featureFlags = normalizeFeatureFlags(coerceRecord(entityRow.feature_flags) ?? {});
    const versionHash = versionRow.version_hash ?? sha256(`${entityRow.id}:v${versionRow.version_no}`);

    const payloadWithoutHash = {
      entity_id: entityRow.id,
      entity_code: entityRow.entity_code ?? entityRow.name,
      entity_name: entityRow.label_singular ?? entityRow.name,
      entity_class: entityRow.entity_class,
      table_schema: entityRow.table_schema,
      table_name: entityRow.table_name,
      version_id: versionRow.id,
      version_no: Number(versionRow.version_no),
      version_hash: versionHash,
      fields,
      field_groups: [],
      display_config: withDefinedValues({
        ...displayConfig,
        icon: displayConfig["icon"] ?? entityRow.icon_key ?? undefined,
        color: displayConfig["color"] ?? entityRow.color_token ?? undefined,
      }),
      feature_flags: featureFlags,
      governance_level: entityRow.governance_level,
      security_tier: entityRow.security_tier,
      mutability: entityRow.mutability,
      class_profile: classProfile,
      compiled_at: new Date().toISOString(),
    };

    return {
      ...payloadWithoutHash,
      compiled_hash: sha256(JSON.stringify(payloadWithoutHash)),
    };
  }

  private async loadClassProfile(entityClass: string): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom("control.entity_class_profile as ecp" as never)
      .select([
        "ecp.class_key",
        "ecp.label",
        "ecp.description",
        "ecp.valid_governance_levels",
        "ecp.default_governance_level",
        "ecp.valid_mutability",
        "ecp.default_mutability",
        "ecp.default_security_tier",
        "ecp.expected_system_columns",
        "ecp.field_flag_rules",
        "ecp.security_tiers",
        "ecp.compliance_profile",
      ] as never[])
      .where("ecp.class_key" as never, "=" as never, entityClass as never)
      .executeTakeFirst() as ClassProfileRow | undefined;

    if (!row) return null;

    return {
      class_key: row.class_key,
      label: row.label,
      description: row.description,
      valid_governance_levels: row.valid_governance_levels,
      default_governance_level: row.default_governance_level,
      valid_mutability: row.valid_mutability,
      default_mutability: row.default_mutability,
      default_security_tier: row.default_security_tier,
      expected_system_columns: row.expected_system_columns,
      field_flag_rules: coerceJson(row.field_flag_rules),
      security_tiers: coerceJson(row.security_tiers),
      compliance_profile: coerceJson(row.compliance_profile),
    };
  }

  private async writeSnapshot(compiled: CompiledEntity): Promise<void> {
    await this.db
      .insertInto("snapshot.entity_compiled" as never)
      .values({
        tenant_id: SYSTEM_ACTOR_ID,
        entity_version_id: compiled.version_id,
        compiled_json: compiled as never,
        compiled_hash: compiled.compiled_hash,
        compliance_report: {},
        created_by: SYSTEM_ACTOR_ID,
      } as never)
      .onConflict((oc: any) =>
        oc.columns(["entity_version_id"] as never[])
          .doNothing()
      )
      .execute();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEntityCompilerService(db: Kysely<any>, logger?: Logger): EntityCompilerService {
  return new EntityCompilerService(db, logger);
}
