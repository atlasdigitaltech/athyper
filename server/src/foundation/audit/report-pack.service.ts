/**
 * ReportPackService — Phase 4.4
 *
 * Manages governance cycle report pack generation and delivery.
 *
 * Phase 4.4 delivery contract (A12):
 *   - HTML stub format (format='html') — rendered from cycle data inline.
 *   - S3 presigned URL via GET /governance/report-packs/:id/download.
 *   - Upgrades to PDF via Phase 5.1 athyper-renderer container.
 *
 * Storage key format:
 *   reports/{tenantId}/{cycleRunId}/{id}.{format}
 *
 * Presigned URL TTL: 15 minutes (configurable).
 */

import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "../../../framework/adapters/objectstorage/src/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportPack {
  id:            string;
  tenantId:      string;
  cycleRunId:    string;
  reportType:    string;
  format:        string;
  status:        "pending" | "generating" | "ready" | "failed";
  storageKey:    string | null;
  fileSizeBytes: number | null;
  contentType:   string;
  generatedAt:   string | null;
  errorMessage:  string | null;
  createdAt:     string;
  updatedAt:     string | null;
}

export interface CreateReportPackInput {
  cycleRunId:  string;
  reportType:  "cycle_summary" | "deviation_summary" | "certification_summary" | "task_status" | "compliance_dashboard";
  format:      "html" | "pdf" | "xlsx";
  requestedBy: string;
}

// ── ReportPackService ─────────────────────────────────────────────────────────

export class ReportPackService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:      Kysely<any>;
  private readonly storage: ObjectStorageAdapter | null;
  private readonly presignedTtlSeconds: number;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:      Kysely<any>,
    storage: ObjectStorageAdapter | null,
    presignedTtlSeconds = 900, // 15 minutes
  ) {
    this.db                   = db;
    this.storage              = storage;
    this.presignedTtlSeconds  = presignedTtlSeconds;
  }

  /**
   * Create a new report pack request.
   * Initial status is 'pending' — generation is async.
   */
  async createPack(
    tenantId: string,
    input: CreateReportPackInput,
  ): Promise<ReportPack> {
    const row = await this.db
      .insertInto("governance.report_pack" as never)
      .values({
        tenant_id:   tenantId,
        cycle_run_id: input.cycleRunId,
        report_type: input.reportType,
        format:      input.format,
        status:      "pending",
        content_type: input.format === "pdf"   ? "application/pdf"
                    : input.format === "xlsx"  ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    : "text/html",
        created_by:  input.requestedBy,
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    return this.mapRow(row);
  }

  /**
   * Generate an HTML report pack for a cycle run (Phase 4.4 stub).
   * Builds an HTML document from cycle data and uploads to S3.
   */
  async generateHtmlPack(
    packId:   string,
    tenantId: string,
    updatedBy: string,
  ): Promise<ReportPack> {
    // Mark as generating
    await this.db
      .updateTable("governance.report_pack" as never)
      .set({ status: "generating" as never, updated_at: new Date().toISOString() as never, updated_by: updatedBy as never } as never)
      .where("id" as never, "=", packId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();

    // Load pack + cycle run data
    const packRow = await this.db
      .selectFrom("governance.report_pack as rp" as never)
      .selectAll("rp" as never)
      .where("rp.id" as never, "=", packId as never)
      .where("rp.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!packRow) {
      throw Object.assign(new Error("Report pack not found"), { code: 404 });
    }

    const cycleRunId = packRow["cycle_run_id"] as string;

    // Load cycle run
    const cycleRun = await this.db
      .selectFrom("governance.cycle_run as cr" as never)
      .selectAll("cr" as never)
      .where("cr.id" as never, "=", cycleRunId as never)
      .where("cr.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    // Load tasks
    const tasks = await this.db
      .selectFrom("governance.cycle_task as ct" as never)
      .selectAll("ct" as never)
      .where("ct.cycle_run_id" as never, "=", cycleRunId as never)
      .where("ct.tenant_id" as never, "=", tenantId as never)
      .orderBy("ct.created_at" as never, "asc")
      .execute() as Record<string, unknown>[];

    // Build HTML stub
    const html = buildHtmlReport(cycleRun, tasks, packRow);
    const buffer = Buffer.from(html, "utf-8");
    const storageKey = `reports/${tenantId}/${cycleRunId}/${packId}.html`;

    if (this.storage) {
      await this.storage.put(storageKey, buffer, { contentType: "text/html" });
    }

    // Update pack as ready
    const updated = await this.db
      .updateTable("governance.report_pack" as never)
      .set({
        status:           "ready" as never,
        storage_key:      storageKey as never,
        file_size_bytes:  buffer.byteLength as never,
        generated_at:     new Date().toISOString() as never,
        updated_at:       new Date().toISOString() as never,
        updated_by:       updatedBy as never,
      } as never)
      .where("id" as never, "=", packId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    return this.mapRow(updated);
  }

  /**
   * Generate a presigned download URL for a ready report pack.
   * Returns null if storage is not configured or the pack is not ready.
   */
  async getDownloadUrl(
    packId:   string,
    tenantId: string,
  ): Promise<{ url: string; expiresIn: number; contentType: string } | null> {
    const pack = await this.getPack(packId, tenantId);
    if (!pack || pack.status !== "ready" || !pack.storageKey) return null;
    if (!this.storage) return null;

    const url = await this.storage.getPresignedUrl(pack.storageKey, this.presignedTtlSeconds);
    return {
      url,
      expiresIn:   this.presignedTtlSeconds,
      contentType: pack.contentType,
    };
  }

  /**
   * Get a single report pack.
   */
  async getPack(packId: string, tenantId: string): Promise<ReportPack | null> {
    const row = await this.db
      .selectFrom("governance.report_pack as rp" as never)
      .selectAll("rp" as never)
      .where("rp.id" as never, "=", packId as never)
      .where("rp.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    return row ? this.mapRow(row) : null;
  }

  /**
   * List report packs for a cycle run.
   */
  async listForCycleRun(
    cycleRunId: string,
    tenantId:   string,
  ): Promise<ReportPack[]> {
    const rows = await this.db
      .selectFrom("governance.report_pack as rp" as never)
      .selectAll("rp" as never)
      .where("rp.cycle_run_id" as never, "=", cycleRunId as never)
      .where("rp.tenant_id" as never, "=", tenantId as never)
      .orderBy("rp.created_at" as never, "desc")
      .execute() as Record<string, unknown>[];

    return rows.map(this.mapRow.bind(this));
  }

  /**
   * Mark a pack as failed with an error message.
   */
  async markFailed(
    packId:       string,
    tenantId:     string,
    errorMessage: string,
    updatedBy:    string,
  ): Promise<void> {
    await this.db
      .updateTable("governance.report_pack" as never)
      .set({
        status:        "failed" as never,
        error_message: errorMessage.substring(0, 2048) as never,
        updated_at:    new Date().toISOString() as never,
        updated_by:    updatedBy as never,
      } as never)
      .where("id" as never, "=", packId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): ReportPack {
    return {
      id:            row["id"] as string,
      tenantId:      row["tenant_id"] as string,
      cycleRunId:    row["cycle_run_id"] as string,
      reportType:    row["report_type"] as string,
      format:        row["format"] as string,
      status:        row["status"] as ReportPack["status"],
      storageKey:    row["storage_key"] as string | null,
      fileSizeBytes: row["file_size_bytes"] as number | null,
      contentType:   row["content_type"] as string,
      generatedAt:   row["generated_at"] as string | null,
      errorMessage:  row["error_message"] as string | null,
      createdAt:     row["created_at"] as string,
      updatedAt:     row["updated_at"] as string | null,
    };
  }
}

// ── HTML stub builder ─────────────────────────────────────────────────────────

function buildHtmlReport(
  cycleRun: Record<string, unknown> | undefined,
  tasks:    Record<string, unknown>[],
  pack:     Record<string, unknown>,
): string {
  const runId    = cycleRun?.["id"] ?? "N/A";
  const runCode  = cycleRun?.["run_code"] ?? "N/A";
  const status   = cycleRun?.["status"] ?? "N/A";
  const generatedAt = new Date().toISOString();

  const taskRows = tasks.map((t) => `
    <tr>
      <td>${String(t["task_code"] ?? "")}</td>
      <td>${String(t["task_name"] ?? "")}</td>
      <td>${String(t["status"] ?? "")}</td>
      <td>${String(t["assigned_to"] ?? "")}</td>
      <td>${String(t["due_date"] ?? "")}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Governance Cycle Report — ${String(runCode)}</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; color: #333; }
    h1 { color: #1a1a2e; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f4f4f4; font-weight: 600; }
    .meta { background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .meta dt { font-weight: 600; }
    .meta dd { margin-left: 0; margin-bottom: 0.25rem; }
    footer { margin-top: 2rem; font-size: 0.8rem; color: #888; }
  </style>
</head>
<body>
  <h1>Governance Cycle Report</h1>
  <div class="meta">
    <dl>
      <dt>Cycle Run ID</dt>     <dd>${String(runId)}</dd>
      <dt>Run Code</dt>         <dd>${String(runCode)}</dd>
      <dt>Status</dt>           <dd>${String(status)}</dd>
      <dt>Report Type</dt>      <dd>${String(pack["report_type"] ?? "")}</dd>
      <dt>Generated At</dt>     <dd>${generatedAt}</dd>
    </dl>
  </div>
  <h2>Tasks (${tasks.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Code</th><th>Name</th><th>Status</th><th>Assigned To</th><th>Due Date</th>
      </tr>
    </thead>
    <tbody>${taskRows || "<tr><td colspan='5'>No tasks</td></tr>"}</tbody>
  </table>
  <footer>
    Generated by Athyper Governance · Phase 4.4 HTML stub
    · <a href="https://athyper.com">athyper.com</a>
  </footer>
</body>
</html>`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createReportPackService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:      Kysely<any>,
  storage: ObjectStorageAdapter | null,
  presignedTtlSeconds?: number,
): ReportPackService {
  return new ReportPackService(db, storage, presignedTtlSeconds);
}
