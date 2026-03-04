/**
 * Entity Capabilities Service
 *
 * Resolves the full capabilities manifest for entity types by composing:
 *   1. meta.entity metadata (name, kind, governance, entity_short)
 *   2. meta.entity_operation rows (system defaults + tenant overrides)
 *   3. core.operation + core.operation_category (display metadata)
 *
 * Two-tier overlay resolution:
 *   - System defaults: tenant_id IS NULL
 *   - Tenant overrides: tenant_id = X (overlays system defaults)
 *   - Tenant can suppress a system op via is_enabled = false
 *
 * Caching: 30-minute TTL per (tenantId, entityKey), explicit invalidation.
 */

import { VERB_MAP } from "./types";

import type {
  EntityCapabilities,
  EntityOperationDescriptor,
  EntityRoutes,
  HandlerType,
  OperationPlacement,
  OperationSurface,
  TabHint,
} from "./types";
import type { Kysely } from "kysely";

// ============================================================================
// Types for DB row shapes
// ============================================================================

interface EntityRow {
  name: string;
  kind: string;
  governance_level: string;
  entity_short: string | null;
  feature_flags: unknown;
}

interface EntityOperationRow {
  id: string;
  tenant_id: string | null;
  entity_name: string;
  operation_code: string;
  surface: string;
  placement: string;
  handler_type: string;
  handler_target: string | null;
  requires_record: boolean;
  sort_order: number;
  label_override: string | null;
  icon_override: string | null;
  tcode_alias: string | null;
  is_enabled: boolean;
}

interface OperationMetaRow {
  code: string;
  name: string;
  description: string | null;
  category_code: string;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Service
// ============================================================================

export class EntityCapabilitiesService {
  private cache = new Map<string, CacheEntry<EntityCapabilities>>();
  private allCache = new Map<string, CacheEntry<EntityCapabilities[]>>();

  constructor(private readonly db: Kysely<any>) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Get capabilities for a single entity type.
   */
  async getEntityCapabilities(
    entityKey: string,
    tenantId: string,
  ): Promise<EntityCapabilities | null> {
    const cacheKey = `${tenantId}:${entityKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const result = await this.resolveCapabilities(entityKey, tenantId);
    if (result) {
      this.cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }
    return result;
  }

  /**
   * Get capabilities for all active entities (for command palette).
   */
  async getAllEntityCapabilities(
    tenantId: string,
  ): Promise<EntityCapabilities[]> {
    const cached = this.allCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Get all active entity names
    const entities = await this.db
      .selectFrom("meta.entity")
      .select(["name"])
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .execute();

    // Resolve each (cached individually)
    const results: EntityCapabilities[] = [];
    for (const entity of entities) {
      const caps = await this.getEntityCapabilities(entity.name, tenantId);
      if (caps && caps.operations.length > 0) {
        results.push(caps);
      }
    }

    this.allCache.set(tenantId, {
      data: results,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return results;
  }

  /**
   * Clear cache. Called when meta.entity_operation rows are modified.
   */
  clearCache(tenantId?: string, entityKey?: string): void {
    if (tenantId && entityKey) {
      this.cache.delete(`${tenantId}:${entityKey}`);
      this.allCache.delete(tenantId);
    } else if (tenantId) {
      // Clear all entries for this tenant
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          this.cache.delete(key);
        }
      }
      this.allCache.delete(tenantId);
    } else {
      // Clear everything
      this.cache.clear();
      this.allCache.clear();
    }
  }

  // --------------------------------------------------------------------------
  // Private: Resolution
  // --------------------------------------------------------------------------

  private async resolveCapabilities(
    entityKey: string,
    tenantId: string,
  ): Promise<EntityCapabilities | null> {
    // 1. Load entity metadata
    const entity = (await this.db
      .selectFrom("meta.entity")
      .select([
        "name",
        "kind",
        "governance_level",
        "entity_short",
        "feature_flags",
      ])
      .where("name", "=", entityKey)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst()) as EntityRow | undefined;

    if (!entity) return null;

    // 2. Load system defaults + tenant overrides (two queries)
    const [systemRows, tenantRows] = await Promise.all([
      this.db
        .selectFrom("meta.entity_operation")
        .selectAll()
        .where("entity_name", "=", entityKey)
        .where("tenant_id", "is", null)
        .orderBy("sort_order", "asc")
        .execute() as Promise<EntityOperationRow[]>,
      this.db
        .selectFrom("meta.entity_operation")
        .selectAll()
        .where("entity_name", "=", entityKey)
        .where("tenant_id", "=", tenantId)
        .execute() as Promise<EntityOperationRow[]>,
    ]);

    // 3. Merge: tenant overrides overlay system defaults
    const merged = this.mergeOperationRows(systemRows, tenantRows);

    // 4. Filter: only enabled
    const enabled = merged.filter((row) => row.isEnabled);

    // 5. Load operation display metadata
    const opCodes = enabled.map((r) => r.operationCode);
    const operationMeta =
      opCodes.length > 0
        ? ((await this.db
            .selectFrom("core.operation as o")
            .innerJoin("core.operation_category as c", "c.id", "o.category_id")
            .select([
              "o.code",
              "o.name",
              "o.description",
              "c.code as category_code",
            ])
            .where("o.code", "in", opCodes)
            .execute()) as OperationMetaRow[])
        : [];

    const opMetaMap = new Map(operationMeta.map((o) => [o.code, o]));

    // 6. Build operation descriptors
    const operations: EntityOperationDescriptor[] = enabled.map((row) => {
      const meta = opMetaMap.get(row.operationCode);
      const label = row.labelOverride ?? meta?.name ?? row.operationCode;
      const categoryCode = meta?.category_code ?? "entity";

      return {
        code: row.operationCode,
        categoryCode,
        label,
        icon: row.iconOverride,
        canonicalCode: `${entityKey}.${row.operationCode}`,
        aliases: this.generateAliases(
          row.operationCode,
          entity.entity_short,
          row.tcodeAlias,
        ),
        tcode: row.tcodeAlias,
        surface: row.surface as OperationSurface,
        placement: row.placement as OperationPlacement,
        handlerType: row.handlerType as HandlerType,
        handlerTarget: row.handlerTarget,
        requiresRecord: row.requiresRecord,
        permissionKey: `${entityKey}:${row.operationCode}`,
        route: row.handlerType === "NAVIGATE" ? row.handlerTarget : null,
        isTenantOverride: row.isTenantOverride,
      };
    });

    // 7. Derive routes
    const slug = this.toKebabCase(entityKey);
    const routes: EntityRoutes = {
      list: `/app/${slug}/view/list`,
      create: `/app/${slug}/new`,
      detail: `/app/${slug}/{id}`,
    };

    // 8. Derive permissions
    const permissions: Record<string, string> = {};
    for (const op of operations) {
      permissions[op.code] = op.permissionKey;
    }

    // 9. Derive tab hints
    const tabs = this.deriveTabHints(entity);

    // 10. Build display name
    const entityName = this.toDisplayName(entityKey);

    return {
      entityKey,
      entityName,
      entityShort: entity.entity_short,
      entityKind: entity.kind,
      governanceLevel: entity.governance_level,
      operations,
      routes,
      permissions,
      tabs,
    };
  }

  // --------------------------------------------------------------------------
  // Private: Overlay Merge
  // --------------------------------------------------------------------------

  private mergeOperationRows(
    systemRows: EntityOperationRow[],
    tenantRows: EntityOperationRow[],
  ): MergedRow[] {
    // Index tenant rows by operation_code for O(1) lookup
    const tenantIndex = new Map(tenantRows.map((r) => [r.operation_code, r]));

    return systemRows.map((sys) => {
      const override = tenantIndex.get(sys.operation_code);
      if (override) {
        return {
          operationCode: sys.operation_code,
          surface: override.surface ?? sys.surface,
          placement: override.placement ?? sys.placement,
          handlerType: override.handler_type ?? sys.handler_type,
          handlerTarget: override.handler_target ?? sys.handler_target,
          requiresRecord: override.requires_record ?? sys.requires_record,
          sortOrder: override.sort_order ?? sys.sort_order,
          labelOverride: override.label_override ?? sys.label_override,
          iconOverride: override.icon_override ?? sys.icon_override,
          tcodeAlias: override.tcode_alias ?? sys.tcode_alias,
          isEnabled: override.is_enabled,
          isTenantOverride: true,
        };
      }
      return {
        operationCode: sys.operation_code,
        surface: sys.surface,
        placement: sys.placement,
        handlerType: sys.handler_type,
        handlerTarget: sys.handler_target,
        requiresRecord: sys.requires_record,
        sortOrder: sys.sort_order,
        labelOverride: sys.label_override,
        iconOverride: sys.icon_override,
        tcodeAlias: sys.tcode_alias,
        isEnabled: sys.is_enabled,
        isTenantOverride: false,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Private: Alias Generation
  // --------------------------------------------------------------------------

  private generateAliases(
    opCode: string,
    entityShort: string | null,
    tcodeAlias: string | null,
  ): string[] {
    const aliases: string[] = [];

    if (entityShort) {
      const verb = VERB_MAP[opCode];
      if (verb) {
        // "NEW PO" and "PO NEW"
        aliases.push(`${verb} ${entityShort}`);
        aliases.push(`${entityShort} ${verb}`);
      }
    }

    if (tcodeAlias) {
      aliases.push(tcodeAlias);
    }

    return aliases;
  }

  // --------------------------------------------------------------------------
  // Private: Tab Hint Derivation
  // --------------------------------------------------------------------------

  private deriveTabHints(entity: EntityRow): TabHint[] {
    const gov = entity.governance_level;
    const flags = (entity.feature_flags ?? {}) as Record<string, unknown>;

    const tabs: TabHint[] = [
      { code: "details", label: "Details", isEnabled: true },
    ];

    if (gov === "full" || gov === "light") {
      tabs.push({
        code: "lifecycle",
        label: "Lifecycle",
        isEnabled: gov === "full",
      });
    }

    if (gov === "full" && flags.approval_required) {
      tabs.push({ code: "approvals", label: "Approvals", isEnabled: true });
    }

    // Audit tab: available for all governance levels
    tabs.push({
      code: "audit",
      label: "Audit Log",
      isEnabled: gov !== "audit_only" || true, // always enabled
    });

    return tabs;
  }

  // --------------------------------------------------------------------------
  // Private: String Helpers
  // --------------------------------------------------------------------------

  /** "ChartOfAccounts" → "chart-of-accounts" */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
      .toLowerCase();
  }

  /** "ChartOfAccounts" → "Chart Of Accounts" */
  private toDisplayName(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface MergedRow {
  operationCode: string;
  surface: string;
  placement: string;
  handlerType: string;
  handlerTarget: string | null;
  requiresRecord: boolean;
  sortOrder: number;
  labelOverride: string | null;
  iconOverride: string | null;
  tcodeAlias: string | null;
  isEnabled: boolean;
  isTenantOverride: boolean;
}
