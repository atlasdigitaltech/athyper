/**
 * Entity Classification Service
 *
 * Resolves EntityClass and EntityFeatureFlags from meta.entity table.
 * Maps DB kind column: ref/mdm → MASTER, ent → CONTROL, doc → DOCUMENT.
 * Entities without classification return undefined class and all-false default flags.
 */

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  EntityClass,
  EntityClassificationService,
  EntityFeatureFlags,
} from "@athyper/core/meta";

/**
 * Default feature flags (inlined to avoid cross-workspace value import issues)
 */
const FEATURE_FLAG_DEFAULTS: EntityFeatureFlags = {
  entity_class: undefined,
  approval_required: false,
  numbering_enabled: false,
  effective_dating_enabled: false,
  versioning_mode: "none",
};

/**
 * Map DB kind values to EntityClass
 */
function mapKindToClass(kind: string | null | undefined): EntityClass | undefined {
  switch (kind) {
    case "ref":
    case "mdm":
      return "MASTER";
    case "ent":
      return "CONTROL";
    case "doc":
      return "DOCUMENT";
    default:
      return undefined;
  }
}

/**
 * Parse feature flags JSONB with safe defaults
 */
function parseFeatureFlags(
  raw: unknown,
  entityClass: EntityClass | undefined
): EntityFeatureFlags {
  const defaults = { ...FEATURE_FLAG_DEFAULTS };
  if (!raw || typeof raw !== "object") {
    return { ...defaults, entity_class: entityClass };
  }

  const flags = raw as Record<string, unknown>;
  return {
    entity_class: entityClass,
    approval_required:
      typeof flags.approval_required === "boolean"
        ? flags.approval_required
        : defaults.approval_required,
    numbering_enabled:
      typeof flags.numbering_enabled === "boolean"
        ? flags.numbering_enabled
        : defaults.numbering_enabled,
    effective_dating_enabled:
      typeof flags.effective_dating_enabled === "boolean"
        ? flags.effective_dating_enabled
        : defaults.effective_dating_enabled,
    versioning_mode:
      flags.versioning_mode === "none" ||
      flags.versioning_mode === "sequential" ||
      flags.versioning_mode === "major_minor"
        ? flags.versioning_mode
        : defaults.versioning_mode,
  };
}

/**
 * Entity Classification Service Implementation
 */
export class EntityClassificationServiceImpl
  implements EntityClassificationService
{
  constructor(private readonly db: LifecycleDB_Type) {}

  async resolveClass(
    entityName: string,
    tenantId: string
  ): Promise<EntityClass | undefined> {
    const row = await this.db
      .selectFrom("meta.entity")
      .select(["kind"])
      .where("tenant_id", "=", tenantId)
      .where("name", "=", entityName)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!row) return undefined;
    return mapKindToClass(row.kind);
  }

  async resolveFeatureFlags(
    entityName: string,
    tenantId: string
  ): Promise<EntityFeatureFlags> {
    const { featureFlags } = await this.getClassification(entityName, tenantId);
    return featureFlags;
  }

  async getClassification(
    entityName: string,
    tenantId: string
  ): Promise<{
    entityClass: EntityClass | undefined;
    featureFlags: EntityFeatureFlags;
  }> {
    const row = await this.db
      .selectFrom("meta.entity")
      .select(["kind", "feature_flags"])
      .where("tenant_id", "=", tenantId)
      .where("name", "=", entityName)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!row) {
      return {
        entityClass: undefined,
        featureFlags: parseFeatureFlags(null, undefined),
      };
    }

    const entityClass = mapKindToClass(row.kind);
    const featureFlags = parseFeatureFlags(row.feature_flags, entityClass);

    return { entityClass, featureFlags };
  }
}
