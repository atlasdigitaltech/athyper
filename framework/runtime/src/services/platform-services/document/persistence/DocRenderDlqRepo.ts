/**
 * DocRenderDlqRepo — Kysely repo for core.doc_render_dlq
 */

import { type Kysely, sql } from "kysely";

import type {
  DocRenderDlqEntry,
  CreateDlqEntryInput,
} from "../domain/models/DocRenderDlqEntry.js";
import type { DB } from "@athyper/adapter-db";

const TABLE = "doc.render_dlq" as keyof DB & string;

export class DocRenderDlqRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async create(input: CreateDlqEntryInput): Promise<DocRenderDlqEntry> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        output_id: input.outputId,
        render_job_id: input.renderJobId ?? null,
        error_code: input.errorCode,
        error_detail: input.errorDetail ?? null,
        error_category: input.errorCategory,
        attempt_count: input.attemptCount,
        payload: JSON.stringify(input.payload),
        dead_at: now,
        created_at: now,
      })
      .execute();

    const row = await this.getById(input.tenantId, id);
    return row!;
  }

  async getById(
    tenantId: string,
    id: string,
  ): Promise<DocRenderDlqEntry | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(
    tenantId: string,
    options?: { unreplayedOnly?: boolean; limit?: number; offset?: number },
  ): Promise<DocRenderDlqEntry[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.unreplayedOnly) {
      query = query.where("replayed_at", "is", null);
    }

    query = query
      .orderBy("created_at", "desc")
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async markReplayed(
    tenantId: string,
    id: string,
    replayedBy: string,
  ): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        replayed_at: new Date(),
        replayed_by: replayedBy,
        replay_count: sql`replay_count + 1` as any,
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  private mapRow(row: any): DocRenderDlqEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      outputId: row.output_id,
      renderJobId: row.render_job_id,
      errorCode: row.error_code,
      errorDetail: row.error_detail,
      errorCategory: row.error_category,
      attemptCount: row.attempt_count,
      payload: this.parseJson(row.payload) ?? {},
      replayedAt: row.replayed_at ? new Date(row.replayed_at) : null,
      replayedBy: row.replayed_by,
      replayCount: row.replay_count ?? 0,
      deadAt: new Date(row.dead_at),
      createdAt: new Date(row.created_at),
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value as Record<string, unknown>;
  }
}
