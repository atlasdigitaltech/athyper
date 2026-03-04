/**
 * Persistence — CRUD for collab.call_recording.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "collab.call_recording" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface CallRecording {
  id: string;
  tenantId: string;
  sessionId: string;
  recordingRef: string;
  storageKey: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  status: "pending" | "stored" | "failed" | "deleted";
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
}

export interface CreateRecordingInput {
  tenantId: string;
  sessionId: string;
  recordingRef: string;
  durationSeconds?: number;
  createdBy: string;
}

// ── Repository ───────────────────────────────────────────────────────

export class RecordingRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    tenantId: string,
    id: string,
  ): Promise<CallRecording | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getByRef(
    tenantId: string,
    recordingRef: string,
  ): Promise<CallRecording | undefined> {
    const row = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("recording_ref", "=", recordingRef)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async listBySession(
    tenantId: string,
    sessionId: string,
  ): Promise<CallRecording[]> {
    const rows = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("session_id", "=", sessionId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateRecordingInput): Promise<CallRecording> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: input.tenantId,
        session_id: input.sessionId,
        recording_ref: input.recordingRef,
        duration_seconds: input.durationSeconds ?? null,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async markStored(
    tenantId: string,
    id: string,
    storageKey: string,
    fileSizeBytes: number,
  ): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({
        status: "stored",
        storage_key: storageKey,
        file_size_bytes: fileSizeBytes,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  async markFailed(tenantId: string, id: string): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({
        status: "failed",
        updated_at: new Date(),
      })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): CallRecording {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      sessionId: row.session_id,
      recordingRef: row.recording_ref,
      storageKey: row.storage_key ?? null,
      durationSeconds: row.duration_seconds ?? null,
      fileSizeBytes:
        row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
      status: row.status,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
  }
}
