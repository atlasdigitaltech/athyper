/**
 * SavedView Repository — Kysely-based database queries for ui.saved_view.
 *
 * Provides CRUD operations with tenant isolation, soft-delete filtering,
 * and optimistic concurrency via version column.
 */

import { HttpError } from "./http-error";

import type { Kysely } from "kysely";

// ─────────────────────────────────────────────
// Types (aligned with ui.saved_view DDL)
// ─────────────────────────────────────────────

export interface SavedViewRow {
  id: string;
  tenant_id: string;
  entity_key: string;
  scope: string;
  owner_user_id: string | null;
  name: string;
  is_pinned: boolean;
  is_default: boolean;
  state_json: unknown;
  state_hash: string;
  version: number;
  created_at: Date;
  created_by: string;
  updated_at: Date | null;
  updated_by: string | null;
  deleted_at: Date | null;
}

/** Metadata-only projection for list endpoint (excludes state_json). */
export interface SavedViewMeta {
  id: string;
  entity_key: string;
  scope: string;
  owner_user_id: string | null;
  name: string;
  is_pinned: boolean;
  is_default: boolean;
  state_hash: string;
  version: number;
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export class SavedViewRepository {
  constructor(private db: Kysely<any>) {}

  /**
   * List views accessible to a user for a given entity key.
   * Returns SYSTEM + SHARED + user's own USER-scope views.
   * Excludes soft-deleted rows. Does NOT include state_json (metadata only).
   */
  async listByEntity(
    tenantId: string,
    entityKey: string,
    userId: string,
  ): Promise<SavedViewMeta[]> {
    const rows = await this.db
      .selectFrom("ui.saved_view")
      .select([
        "id",
        "entity_key",
        "scope",
        "owner_user_id",
        "name",
        "is_pinned",
        "is_default",
        "state_hash",
        "version",
      ])
      .where("tenant_id", "=", tenantId)
      .where("entity_key", "=", entityKey)
      .where("deleted_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("scope", "=", "SYSTEM"),
          eb("scope", "=", "SHARED"),
          eb.and([eb("scope", "=", "USER"), eb("owner_user_id", "=", userId)]),
        ]),
      )
      .orderBy("is_default", "desc")
      .orderBy("is_pinned", "desc")
      .orderBy("name", "asc")
      .execute();

    return rows as SavedViewMeta[];
  }

  /**
   * Get a single view by ID (full payload including state_json).
   */
  async getById(
    tenantId: string,
    viewId: string,
  ): Promise<SavedViewRow | null> {
    const row = await this.db
      .selectFrom("ui.saved_view")
      .selectAll()
      .where("id", "=", viewId)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return (row as SavedViewRow) ?? null;
  }

  /**
   * Create a new saved view.
   */
  async create(params: {
    tenantId: string;
    entityKey: string;
    scope: string;
    ownerUserId: string | null;
    name: string;
    isPinned: boolean;
    isDefault: boolean;
    stateJson: unknown;
    stateHash: string;
    createdBy: string;
  }): Promise<{ id: string; version: number }> {
    const [row] = await this.db
      .insertInto("ui.saved_view")
      .values({
        tenant_id: params.tenantId,
        entity_key: params.entityKey,
        scope: params.scope,
        owner_user_id: params.ownerUserId,
        name: params.name,
        is_pinned: params.isPinned,
        is_default: params.isDefault,
        state_json: JSON.stringify(params.stateJson),
        state_hash: params.stateHash,
        version: 1,
        created_by: params.createdBy,
      })
      .returning(["id", "version"])
      .execute();

    return { id: row.id as string, version: row.version as number };
  }

  /**
   * Update a saved view with optimistic concurrency.
   * Throws HttpError(409) if version doesn't match.
   */
  async update(
    tenantId: string,
    viewId: string,
    params: {
      name?: string;
      isPinned?: boolean;
      isDefault?: boolean;
      stateJson?: unknown;
      stateHash?: string;
      updatedBy: string;
    },
    expectedVersion: number,
  ): Promise<SavedViewRow> {
    const values: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: params.updatedBy,
      version: expectedVersion + 1,
    };

    if (params.name !== undefined) values.name = params.name;
    if (params.isPinned !== undefined) values.is_pinned = params.isPinned;
    if (params.isDefault !== undefined) values.is_default = params.isDefault;
    if (params.stateJson !== undefined)
      values.state_json = JSON.stringify(params.stateJson);
    if (params.stateHash !== undefined) values.state_hash = params.stateHash;

    const row = await this.db
      .updateTable("ui.saved_view")
      .set(values)
      .where("id", "=", viewId)
      .where("tenant_id", "=", tenantId)
      .where("version", "=", expectedVersion)
      .where("deleted_at", "is", null)
      .returningAll()
      .executeTakeFirst();

    if (!row) {
      throw new HttpError(
        409,
        "VERSION_CONFLICT",
        `View "${viewId}" was modified by another request. Refresh and try again.`,
      );
    }

    return row as SavedViewRow;
  }

  /**
   * Soft-delete a saved view.
   */
  async softDelete(
    tenantId: string,
    viewId: string,
    deletedBy: string,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable("ui.saved_view")
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
        updated_by: deletedBy,
      })
      .where("id", "=", viewId)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }
}
