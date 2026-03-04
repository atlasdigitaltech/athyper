/**
 * DocRenderJobRepo — Kysely repo for core.doc_render_job
 */

import type { DocRenderJob } from "../domain/models/DocRenderJob.js";
import type {
  RenderJobId,
  OutputId,
  RenderJobStatus,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.render_job" as keyof DB & string;

export interface CreateRenderJobInput {
  outputId: OutputId;
  tenantId: string;
  jobQueueId?: string;
  maxAttempts?: number;
  traceId?: string;
}

export class DocRenderJobRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: RenderJobId): Promise<DocRenderJob | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getByOutputId(outputId: OutputId): Promise<DocRenderJob | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("output_id", "=", outputId)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async create(input: CreateRenderJobInput): Promise<DocRenderJob> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        output_id: input.outputId,
        tenant_id: input.tenantId,
        job_queue_id: input.jobQueueId ?? null,
        status: "PENDING",
        attempts: 0,
        max_attempts: input.maxAttempts ?? 3,
        trace_id: input.traceId ?? null,
        created_at: now,
      })
      .execute();

    return {
      id: id as RenderJobId,
      outputId: input.outputId,
      tenantId: input.tenantId,
      jobQueueId: input.jobQueueId ?? null,
      status: "PENDING",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      errorCode: null,
      errorDetail: null,
      traceId: input.traceId ?? null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      createdAt: now,
    };
  }

  async updateStatus(
    id: RenderJobId,
    status: RenderJobStatus,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const data: Record<string, unknown> = { status };

    if (extra) {
      Object.assign(data, extra);
    }

    if (status === "PROCESSING") data.started_at = new Date();
    if (status === "COMPLETED" || status === "FAILED")
      data.completed_at = new Date();

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("id", "=", id)
      .execute();
  }

  async incrementAttempts(id: RenderJobId): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set((eb: any) => ({
        attempts: eb("attempts", "+", 1),
      }))
      .where("id", "=", id)
      .execute();
  }

  async listPending(limit: number = 50): Promise<DocRenderJob[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("status", "in", ["PENDING", "RETRYING"])
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async listFailed(tenantId: string): Promise<DocRenderJob[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "FAILED")
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async list(
    tenantId: string,
    filters?: { status?: RenderJobStatus; limit?: number; offset?: number },
  ): Promise<DocRenderJob[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (filters?.status) {
      query = query.where("status", "=", filters.status);
    }

    query = query
      .orderBy("created_at", "desc")
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  private mapRow(row: any): DocRenderJob {
    return {
      id: row.id as RenderJobId,
      outputId: row.output_id as OutputId,
      tenantId: row.tenant_id,
      jobQueueId: row.job_queue_id,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      errorCode: row.error_code,
      errorDetail: row.error_detail,
      traceId: row.trace_id,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    };
  }
}
