/**
 * Tenant overlay presentation composer.
 *
 * Runtime identity, physical fields, relations, operations, and capabilities
 * are resolved by metadata's canonical tenant-overlay resolver. This adapter
 * exists for legacy presentation callers only; it deliberately ignores
 * structural overlay operations and never creates user-specific metadata.
 */

import type { Kysely } from "kysely";

export interface OverlayField {
  fieldName: string;
  columnName: string;
  label?: string | null;
  isRequired?: boolean;
  isVisible?: boolean;
  isReadOnly?: boolean;
  sortOrder?: number | null;
  validation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ComposedEntity {
  entityCode: string;
  tenantId: string;
  userId?: string;
  fields: OverlayField[];
  computedAt: number;
  version: string;
}

interface OverlayRow { id: string; priority: number; version: number; }
interface OverlayChangeRow { path: string; kind: string; value: Record<string, unknown> | null; }

const CACHE_TTL_MS = 5 * 60_000;

export class OverlayComposer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly cache = new Map<string, { composed: ComposedEntity; fetchedAt: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) { this.db = db; }

  async compose(entityCode: string, tenantId: string, userId?: string): Promise<ComposedEntity> {
    const key = cacheKey(entityCode, tenantId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.composed;
    const base = await this.loadBaseFields(entityCode);
    const overlays = await this.loadOverlays(entityCode, tenantId);
    const fields = new Map(base.map((field) => [field.fieldName, { ...field }]));
    for (const overlay of overlays) {
      const changes = await this.loadOverlayChanges(overlay.id);
      for (const change of changes) {
        if (change.kind !== "modify_field" && change.kind !== "override_ui") continue;
        const target = /^field\.([a-z_][a-z0-9_]*)$/.exec(change.path)?.[1];
        if (!target || !change.value || !fields.has(target)) continue;
        const current = fields.get(target)!;
        const value = change.value;
        fields.set(target, {
          ...current,
          ...(typeof value.label === "string" ? { label: value.label } : {}),
          ...(typeof value.isRequired === "boolean" ? { isRequired: value.isRequired } : {}),
          ...(typeof value.isVisible === "boolean" ? { isVisible: value.isVisible } : {}),
          ...(typeof value.isReadOnly === "boolean" ? { isReadOnly: value.isReadOnly } : {}),
          ...(typeof value.sortOrder === "number" ? { sortOrder: value.sortOrder } : {}),
        });
      }
    }
    const composed: ComposedEntity = {
      entityCode,
      tenantId,
      userId,
      fields: [...fields.values()].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)),
      computedAt: Date.now(),
      version: computeVersion([...fields.values()]),
    };
    this.cache.set(key, { composed, fetchedAt: Date.now() });
    return composed;
  }

  invalidate(entityCode: string, tenantId?: string): void {
    if (!tenantId) {
      for (const key of this.cache.keys()) if (key.startsWith(`${entityCode}:`)) this.cache.delete(key);
      return;
    }
    this.cache.delete(cacheKey(entityCode, tenantId));
  }

  private async loadBaseFields(entityCode: string): Promise<OverlayField[]> {
    const rows = await (this.db as any)
      .selectFrom("control.entity_field as ef")
      .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
      .innerJoin("control.entity as e", "e.id", "ev.entity_id")
      .select([
        "ef.name as field_name", "ef.column_name", "ef.label", "ef.description",
        "ef.is_required", "ef.is_read_only", "ef.sort_order", "ef.validation", "ef.visibility",
      ])
      .where((eb: any) => eb.or([eb("e.name", "=", entityCode), eb("e.entity_code", "=", entityCode)]))
      .where("ev.status", "=", "EFFECTIVE")
      .where("ev.tenant_id", "is", null)
      .where("ef.tenant_id", "is", null)
      .where("ef.is_active", "=", true)
      .orderBy("ef.sort_order", "asc")
      .execute() as Array<Record<string, any>>;
    return rows.map((row) => ({
      fieldName: row.field_name,
      columnName: row.column_name,
      label: row.label,
      isRequired: row.is_required,
      isVisible: true,
      isReadOnly: row.is_read_only,
      sortOrder: row.sort_order,
      validation: row.validation,
      metadata: { ...(row.visibility ?? {}), ...(row.description ? { description: row.description } : {}) },
    }));
  }

  private async loadOverlays(entityCode: string, tenantId: string): Promise<OverlayRow[]> {
    return (this.db as any)
      .selectFrom("control.overlay as ov")
      .innerJoin("control.entity as e", "e.id", "ov.base_entity_id")
      .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
      .select(["ov.id", "ov.priority", "ov.version"])
      .where((eb: any) => eb.or([eb("e.name", "=", entityCode), eb("e.entity_code", "=", entityCode)]))
      .where("ev.status", "=", "EFFECTIVE")
      .where("ev.tenant_id", "is", null)
      .where((eb: any) => eb.or([eb("ov.base_version_id", "is", null), eb("ov.base_version_id", "=", eb.ref("ev.id"))]))
      .where("ov.tenant_id", "=", tenantId)
      .where("ov.is_active", "=", true)
      .orderBy("ov.priority", "asc")
      .orderBy("ov.version", "asc")
      .orderBy("ov.id", "asc")
      .execute() as Promise<OverlayRow[]>;
  }

  private async loadOverlayChanges(overlayId: string): Promise<OverlayChangeRow[]> {
    return (this.db as any)
      .selectFrom("control.overlay_change as oc")
      .select(["oc.path", "oc.kind", "oc.value"])
      .where("oc.overlay_id", "=", overlayId)
      .orderBy("oc.change_order", "asc")
      .execute() as Promise<OverlayChangeRow[]>;
  }
}

function cacheKey(entityCode: string, tenantId: string): string { return `${entityCode}:${tenantId}`; }

function computeVersion(fields: OverlayField[]): string {
  const signature = fields.map((field) => `${field.fieldName}:${field.sortOrder ?? 0}:${field.label ?? ""}`).join("|");
  let hash = 5381;
  for (let index = 0; index < signature.length; index++) hash = ((hash << 5) + hash + signature.charCodeAt(index)) & 0x7fffffff;
  return hash.toString(16);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createOverlayComposer(db: Kysely<any>): OverlayComposer { return new OverlayComposer(db); }
