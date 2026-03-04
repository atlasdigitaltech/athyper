/**
 * AuditArchiveMarkerRepo — Kysely repo for core.archive_marker
 *
 * Tracks which partitions have been archived to cold storage.
 * Used by the storage tiering service and archive worker.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface AuditArchiveMarker {
  id: string;
  partitionName: string;
  partitionMonth: Date;
  ndjsonKey: string;
  sha256: string;
  rowCount: number;
  archivedAt: Date;
  archivedBy: string;
  detachedAt: Date | null;
  createdAt: Date;
}

export interface CreateArchiveMarkerInput {
  partitionName: string;
  partitionMonth: Date;
  ndjsonKey: string;
  sha256: string;
  rowCount: number;
  archivedBy: string;
}

// ============================================================================
// Repository
// ============================================================================

const TABLE = "audit.archive_marker" as keyof DB & string;

export class AuditArchiveMarkerRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async create(input: CreateArchiveMarkerInput): Promise<AuditArchiveMarker> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        partition_name: input.partitionName,
        partition_month: input.partitionMonth,
        ndjson_key: input.ndjsonKey,
        sha256: input.sha256,
        row_count: input.rowCount,
        archived_at: now,
        archived_by: input.archivedBy,
        created_at: now,
      })
      .execute();

    return {
      id,
      partitionName: input.partitionName,
      partitionMonth: input.partitionMonth,
      ndjsonKey: input.ndjsonKey,
      sha256: input.sha256,
      rowCount: input.rowCount,
      archivedAt: now,
      archivedBy: input.archivedBy,
      detachedAt: null,
      createdAt: now,
    };
  }

  async getByMonth(month: Date): Promise<AuditArchiveMarker | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("partition_month", "=", month)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  async isMonthArchived(month: Date): Promise<boolean> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("partition_month", "=", month)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0) > 0;
  }

  async listArchived(limit = 50): Promise<AuditArchiveMarker[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .orderBy("partition_month", "desc")
      .limit(limit)
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async getArchivedMonthsInRange(
    startMonth: Date,
    endMonth: Date,
  ): Promise<AuditArchiveMarker[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("partition_month", ">=", startMonth)
      .where("partition_month", "<=", endMonth)
      .orderBy("partition_month", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async markDetached(partitionName: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({ detached_at: new Date() })
      .where("partition_name", "=", partitionName)
      .execute();
  }

  // --------------------------------------------------------------------------
  // Row mapping
  // --------------------------------------------------------------------------

  private mapRow(row: any): AuditArchiveMarker {
    return {
      id: row.id,
      partitionName: row.partition_name,
      partitionMonth: new Date(row.partition_month),
      ndjsonKey: row.ndjson_key,
      sha256: row.sha256,
      rowCount: Number(row.row_count),
      archivedAt: new Date(row.archived_at),
      archivedBy: row.archived_by,
      detachedAt: row.detached_at ? new Date(row.detached_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
