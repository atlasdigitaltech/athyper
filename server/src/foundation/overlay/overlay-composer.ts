/**
 * Overlay Composition Engine — Phase 1.2
 *
 * Merges base entity definition, tenant overlay, and user overlay into a single
 * "compiled" view. Reads from:
 *   control.overlay            — overlay definitions (system/tenant/user)
 *   control.overlay_change     — field-level change records per overlay
 *   snapshot.entity_compiled_overlay — cached merge result (written by this service)
 *
 * Merge precedence (lowest to highest):
 *   base (system defaults from control.entity_field)
 *   → tenant overlay  (control.overlay WHERE source_type='tenant')
 *   → user overlay    (control.overlay WHERE source_type='user')
 *
 * Target: <5ms p99 overlay composition (after cache lookup).
 *
 * Cache strategy:
 *   In-memory Map keyed by cacheKey(entityCode, tenantId, userId?)
 *   TTL: 5 minutes. Invalidated by invalidateOverlay().
 *   DB snapshot written asynchronously after compute (non-blocking).
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverlayField {
  fieldName:    string;
  columnName:   string;
  label?:       string | null;
  placeholder?: string | null;
  isRequired?:  boolean;
  isVisible?:   boolean;
  isReadOnly?:  boolean;
  sortOrder?:   number | null;
  validation?:  Record<string, unknown> | null;
  metadata?:    Record<string, unknown> | null;
}

export interface ComposedEntity {
  entityCode:   string;
  tenantId:     string;
  userId?:      string;
  fields:       OverlayField[];
  computedAt:   number;
  version:      string;
}

interface OverlayCacheLine {
  composed:   ComposedEntity;
  fetchedAt:  number;
}

interface OverlayRow {
  id:          string;
  source_type: string;  // 'system' | 'tenant' | 'user'
  sort_order:  number;
  metadata:    string | null;
}

interface OverlayChangeRow {
  field_name:   string;
  column_name?: string;
  label?:       string | null;
  placeholder?: string | null;
  is_required?: boolean | null;
  is_visible?:  boolean | null;
  is_read_only?: boolean | null;
  sort_order?:  number | null;
  validation?:  string | null;
  metadata?:    string | null;
  op:           string; // 'set' | 'unset' | 'reorder'
}

const CACHE_TTL_MS = 5 * 60_000;

// ── OverlayComposer ───────────────────────────────────────────────────────────

export class OverlayComposer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly cache = new Map<string, OverlayCacheLine>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Compose the effective entity definition for a tenant (and optional user).
   * Returns cached result if fresh; otherwise recomputes from DB.
   */
  async compose(
    entityCode: string,
    tenantId: string,
    userId?: string,
  ): Promise<ComposedEntity> {
    const key = cacheKey(entityCode, tenantId, userId);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      return cached.composed;
    }

    const composed = await this.compute(entityCode, tenantId, userId);
    this.cache.set(key, { composed, fetchedAt: now });

    // Write snapshot asynchronously — do not block the caller
    void this.writeSnapshot(composed, tenantId).catch(() => { /* best effort */ });

    return composed;
  }

  /**
   * Invalidate cache for the given entity/tenant/user combination.
   * Pass only entityCode to flush all tenants for that entity.
   */
  invalidate(entityCode: string, tenantId?: string, userId?: string): void {
    if (!tenantId) {
      // Flush all entries for this entity
      for (const k of [...this.cache.keys()]) {
        if (k.startsWith(`${entityCode}:`)) this.cache.delete(k);
      }
      return;
    }
    this.cache.delete(cacheKey(entityCode, tenantId, userId));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async compute(
    entityCode: string,
    tenantId: string,
    userId?: string,
  ): Promise<ComposedEntity> {
    // 1. Load base fields from control.entity_field
    const baseFields = await this.loadBaseFields(entityCode);

    // 2. Load overlays ordered by sort_order (system < tenant < user)
    const overlays = await this.loadOverlays(entityCode, tenantId, userId);

    // 3. Apply overlay changes in order — higher sort_order wins
    const fieldMap = new Map<string, OverlayField>(
      baseFields.map((f) => [f.fieldName, { ...f }])
    );

    for (const overlay of overlays) {
      const changes = await this.loadOverlayChanges(overlay.id);
      for (const change of changes) {
        if (change.op === "unset") {
          fieldMap.delete(change.field_name);
          continue;
        }
        const existing = fieldMap.get(change.field_name) ?? {
          fieldName:  change.field_name,
          columnName: change.column_name ?? change.field_name,
        };
        const merged: OverlayField = {
          ...existing,
          fieldName:  change.field_name,
          columnName: change.column_name ?? existing.columnName,
        };
        if (change.label        !== undefined) merged.label       = change.label;
        if (change.placeholder  !== undefined) merged.placeholder = change.placeholder;
        if (change.is_required  !== undefined && change.is_required  !== null) merged.isRequired  = change.is_required;
        if (change.is_visible   !== undefined && change.is_visible   !== null) merged.isVisible   = change.is_visible;
        if (change.is_read_only !== undefined && change.is_read_only !== null) merged.isReadOnly  = change.is_read_only;
        if (change.sort_order   !== undefined) merged.sortOrder   = change.sort_order;
        if (change.validation   !== undefined) {
          merged.validation = change.validation ? JSON.parse(change.validation) as Record<string, unknown> : null;
        }
        if (change.metadata     !== undefined) {
          merged.metadata = change.metadata ? JSON.parse(change.metadata) as Record<string, unknown> : null;
        }
        fieldMap.set(change.field_name, merged);
      }
    }

    const fields = [...fieldMap.values()].sort((a, b) =>
      (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
    );

    return {
      entityCode,
      tenantId,
      userId,
      fields,
      computedAt: Date.now(),
      version:    computeVersion(fields),
    };
  }

  private async loadBaseFields(entityCode: string): Promise<OverlayField[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db as any)
      .selectFrom("control.entity_field as ef")
      .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
      .innerJoin("control.entity as e", "e.id", "ev.entity_id")
      .select([
        "ef.name as field_name",
        "ef.column_name",
        "ef.label",
        "ef.placeholder",
        "ef.is_required",
        "ef.is_visible",
        "ef.is_read_only",
        "ef.sort_order",
        "ef.validation_rules",
        "ef.metadata",
      ])
      .where("e.name", "=", entityCode)
      .where("ev.status", "=", "EFFECTIVE")
      .where("ef.is_active", "=", true)
      .orderBy("ef.sort_order", "asc")
      .execute() as Array<{
        field_name: string;
        column_name: string;
        label: string | null;
        placeholder: string | null;
        is_required: boolean;
        is_visible: boolean;
        is_read_only: boolean;
        sort_order: number | null;
        validation_rules: string | null;
        metadata: string | null;
      }>;

    return rows.map((r) => ({
      fieldName:   r.field_name,
      columnName:  r.column_name,
      label:       r.label,
      placeholder: r.placeholder,
      isRequired:  r.is_required,
      isVisible:   r.is_visible,
      isReadOnly:  r.is_read_only,
      sortOrder:   r.sort_order,
      validation:  r.validation_rules ? JSON.parse(r.validation_rules) as Record<string, unknown> : null,
      metadata:    r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : null,
    }));
  }

  private async loadOverlays(
    entityCode: string,
    tenantId: string,
    userId?: string,
  ): Promise<OverlayRow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db
      .selectFrom("control.overlay as ov" as never)
      .select(["ov.id", "ov.source_type", "ov.sort_order", "ov.metadata"] as never[])
      .where("ov.entity_code" as never, "=", entityCode as never)
      .where("ov.is_active" as never, "=", true as never)
      .where((eb: any) => eb.or([
        eb("ov.tenant_id", "=", tenantId),
        eb("ov.tenant_id", "is", null),
      ]))
      .orderBy("ov.sort_order" as never, "asc");

    if (userId) {
      q = q.where((eb: any) => eb.or([
        eb("ov.user_id", "=", userId),
        eb("ov.user_id", "is", null),
      ]));
    } else {
      q = q.where("ov.user_id" as never, "is", null as never);
    }

    return q.execute() as Promise<OverlayRow[]>;
  }

  private async loadOverlayChanges(overlayId: string): Promise<OverlayChangeRow[]> {
    return this.db
      .selectFrom("control.overlay_change as oc" as never)
      .select([
        "oc.field_name",
        "oc.column_name",
        "oc.label",
        "oc.placeholder",
        "oc.is_required",
        "oc.is_visible",
        "oc.is_read_only",
        "oc.sort_order",
        "oc.validation",
        "oc.metadata",
        "oc.op",
      ] as never[])
      .where("oc.overlay_id" as never, "=", overlayId as never)
      .orderBy("oc.sort_order" as never, "asc")
      .execute() as Promise<OverlayChangeRow[]>;
  }

  private async writeSnapshot(composed: ComposedEntity, tenantId: string): Promise<void> {
    await this.db
      .insertInto("snapshot.entity_compiled_overlay" as never)
      .values({
        tenant_id:    tenantId,
        entity_code:  composed.entityCode,
        user_id:      composed.userId ?? null,
        payload:      JSON.stringify(composed),
        version:      composed.version,
        computed_at:  new Date(composed.computedAt),
        created_by:   "00000000-0000-0000-0000-000000000000",
      } as never)
      .onConflict((oc: any) =>
        oc.columns(["tenant_id", "entity_code", "user_id"] as never[])
          .doUpdateSet({
            payload:     JSON.stringify(composed),
            version:     composed.version,
            computed_at: new Date(composed.computedAt),
          } as never)
      )
      .execute()
      .catch(() => { /* snapshot write is best-effort */ });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cacheKey(entityCode: string, tenantId: string, userId?: string): string {
  return userId ? `${entityCode}:${tenantId}:${userId}` : `${entityCode}:${tenantId}`;
}

function computeVersion(fields: OverlayField[]): string {
  // Deterministic version hash from field names + sort orders
  const sig = fields.map((f) => `${f.fieldName}:${f.sortOrder ?? 0}`).join("|");
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) & 0x7fffffff;
  }
  return hash.toString(16);
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createOverlayComposer(db: Kysely<any>): OverlayComposer {
  return new OverlayComposer(db);
}
