/**
 * EntityMetaService — cached lookup of control.entity registrations.
 *
 * The generic search outbox handler uses this to resolve an entity_type
 * (e.g. "invoice", "journal_entry") to the backing table it should read
 * from. Cache TTL is deliberately modest — entity registrations change
 * rarely but adding a new entity should take effect without a reboot.
 *
 * Cache is keyed by entity name (matches control.entity.name / the
 * canonical entity_type used in event.outbox.entity_type).
 *
 * Scope: platform entities only (tenant_id IS NULL). Per-tenant custom
 * entities are out of scope for this iteration — add when the product
 * supports them.
 */

import type { Kysely } from "kysely";

export interface EntityMeta {
  schema: string;
  table:  string;
  primaryKey: string;
  tenantColumn: string | null;
}

export interface EntityMetaService {
  resolve(entityType: string): Promise<EntityMeta | null>;
  invalidate(entityType?: string): void;
}

interface CacheEntry {
  meta:      EntityMeta | null;   // null = confirmed absent (negative cache)
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createEntityMetaService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  opts: { ttlMs?: number } = {},
): EntityMetaService {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  return {
    async resolve(entityType: string): Promise<EntityMeta | null> {
      const hit = cache.get(entityType);
      if (hit && hit.expiresAt > Date.now()) return hit.meta;

      const normalised = entityType.replace(/-/g, "_");
      const row = await db
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
        .select(["e.table_schema", "e.table_name", "e.primary_key", "e.tenant_column"] as never[])
        .where("e.name" as never, "=", normalised as never)
        .where("e.tenant_id" as never, "is", null as never)
        .where("e.runtime_enabled" as never, "=", true as never)
        .where("e.status" as never, "=", "ACTIVE" as never)
        .where("e.is_active" as never, "=", true as never)
        .where("e.read_capability" as never, "<>", "none" as never)
        .where("e.primary_key" as never, "is not", null as never)
        .where("ev.status" as never, "=", "EFFECTIVE" as never)
        .executeTakeFirst() as {
          table_schema: string;
          table_name: string;
          primary_key: string;
          tenant_column: string | null;
        } | undefined;

      const meta: EntityMeta | null = row
        ? {
            schema: String(row.table_schema),
            table: String(row.table_name),
            primaryKey: String(row.primary_key),
            tenantColumn: row.tenant_column == null ? null : String(row.tenant_column),
          }
        : null;

      cache.set(entityType, { meta, expiresAt: Date.now() + ttlMs });
      return meta;
    },

    invalidate(entityType?: string): void {
      if (entityType) cache.delete(entityType);
      else cache.clear();
    },
  };
}
