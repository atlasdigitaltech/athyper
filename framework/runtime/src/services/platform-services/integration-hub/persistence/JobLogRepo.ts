/**
 * Persistence — step-level execution log for wf.job_log.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.job_log" as keyof DB & string;

export interface JobLogEntry {
  id: string;
  tenantId: string;
  flowId: string | null;
  runId: string;
  stepIndex: number;
  stepType: string;
  status: "running" | "completed" | "failed" | "skipped";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
}

export class JobLogRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async startStep(input: {
    tenantId: string;
    flowId: string;
    runId: string;
    stepIndex: number;
    stepType: string;
    input: Record<string, unknown> | null;
  }): Promise<{ id: string }> {
    const row = await (this.db as any)
      .insertInto(TABLE)
      .values({
        tenant_id: input.tenantId,
        flow_id: input.flowId,
        run_id: input.runId,
        step_index: input.stepIndex,
        step_type: input.stepType,
        input: input.input != null ? JSON.stringify(input.input) : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return { id: row.id };
  }

  async completeStep(
    id: string,
    output: Record<string, unknown> | null,
    durationMs: number,
  ): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({
        status: "completed",
        output: output != null ? JSON.stringify(output) : null,
        duration_ms: durationMs,
        completed_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async failStep(id: string, error: string, durationMs: number): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({
        status: "failed",
        error,
        duration_ms: durationMs,
        completed_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async skipStep(id: string): Promise<void> {
    await (this.db as any)
      .updateTable(TABLE)
      .set({ status: "skipped", duration_ms: 0, completed_at: new Date() })
      .where("id", "=", id)
      .execute();
  }

  async listByRun(
    tenantId: string,
    flowId: string,
    runId: string,
  ): Promise<JobLogEntry[]> {
    const rows = await (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("flow_id", "=", flowId)
      .where("run_id", "=", runId)
      .orderBy("step_index", "asc")
      .execute();

    return rows.map((r: any) => this.mapRow(r));
  }

  async listByFlow(
    tenantId: string,
    flowId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<JobLogEntry[]> {
    let q = (this.db as any)
      .selectFrom(TABLE)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("flow_id", "=", flowId)
      .orderBy("started_at", "desc");

    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);

    const rows = await q.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  private mapRow(row: any): JobLogEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      flowId: row.flow_id ?? null,
      runId: row.run_id,
      stepIndex: row.step_index,
      stepType: row.step_type,
      status: row.status,
      input: this.parseJson(row.input),
      output: this.parseJson(row.output),
      error: row.error ?? null,
      durationMs: row.duration_ms ?? null,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
