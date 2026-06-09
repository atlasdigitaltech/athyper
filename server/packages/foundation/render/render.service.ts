/**
 * RenderService — Phase 5.1
 *
 * Orchestrates PDF rendering via the athyper-renderer container.
 * Manages document.render_output + document.render_job lifecycle.
 *
 * Wiring:
 *   - Calls PdfRendererClient for synchronous (<5MB) or async (large) renders
 *   - Uploads resulting PDF to object storage
 *   - Updates render_output status through QUEUED → RENDERING → RENDERED
 *   - On failure: status → FAILED, logs error_message
 *
 * Usage:
 *   await renderService.renderDocument({
 *     tenantId:    "uuid",
 *     entityType:  "document.invoice",
 *     entityId:    "uuid",
 *     operation:   "print",
 *     html:        "<html>...</html>",
 *     requestedBy: "actor-uuid",
 *   });
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import type { PdfRenderOptions, SyncPdfRenderer } from "./pdf-renderer-client.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RenderDocumentInput {
  tenantId:          string;
  /** Tenant code (e.g. "athyper") for storage path partitioning. */
  tenantCode?:       string;
  /** Company code (e.g. "ACFB") for storage path partitioning. */
  companyCode?:      string;
  entityType:        string;
  entityId:          string;
  operation:         string;
  variant?:          string;
  locale?:           string;
  html:              string;
  renderOptions?:    PdfRenderOptions;
  requestedBy:       string;
  templateVersionId?: string;
}

export interface RenderDocumentResult {
  outputId:    string;
  storageKey:  string | null;
  status:      "RENDERED" | "FAILED";
  error?:      string;
}

const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

// ── RenderService ─────────────────────────────────────────────────────────────

export class RenderService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:       Kysely<any>;
  private readonly renderer: SyncPdfRenderer | null;
  private readonly storage:  ObjectStorageAdapter | null;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:       Kysely<any>,
    renderer: SyncPdfRenderer | null,
    storage:  ObjectStorageAdapter | null,
  ) {
    this.db       = db;
    this.renderer = renderer;
    this.storage  = storage;
  }

  /**
   * Synchronous render flow:
   *   1. Create render_output (QUEUED) + render_job (PENDING)
   *   2. Call renderer /render endpoint
   *   3. Upload PDF to object storage
   *   4. Update render_output (RENDERED) + render_job (COMPLETED)
   */
  async renderDocument(input: RenderDocumentInput): Promise<RenderDocumentResult> {
    // Create output + job rows
    const outputId = await this.createOutputRecord(input);
    const jobId    = await this.createJobRecord(outputId, input.tenantId);

    if (!this.renderer) {
      await this.failOutput(outputId, input.tenantId, jobId, "RENDERER_UNAVAILABLE", "Renderer not configured");
      return { outputId, storageKey: null, status: "FAILED", error: "Renderer not configured" };
    }

    const startMs = Date.now();

    try {
      // Mark as RENDERING
      await this.updateOutputStatus(outputId, input.tenantId, "RENDERING");
      await this.updateJobStatus(jobId, input.tenantId, "PROCESSING");

      // Call renderer
      const pdfBuffer = await this.renderer.renderSync(input.html, input.renderOptions);

      // Upload to object storage
      let storageKey: string | null = null;
      if (this.storage) {
        const rNow   = new Date();
        const rYear  = rNow.getUTCFullYear();
        const rMon   = String(rNow.getUTCMonth() + 1).padStart(2, "0");
        const rType  = input.entityType.replace(/\./g, "/");
        const tCode  = input.tenantCode  ?? input.tenantId;
        const cCode  = input.companyCode ?? input.tenantId;
        storageKey = `${tCode}/${cCode}/${rYear}/${rMon}/renders/${rType}/${input.entityId}/${outputId}.pdf`;
        await this.storage.put(storageKey, pdfBuffer, { contentType: "application/pdf" });
      }

      const durationMs = Date.now() - startMs;

      // Mark as RENDERED
      await this.db
        .updateTable("document.render_output" as never)
        .set({
          status:       "RENDERED" as never,
          storage_key:  storageKey as never,
          storage_bucket: process.env["S3_BUCKET"] ?? null as never,
          size_bytes:   pdfBuffer.byteLength as never,
          mime_type:    "application/pdf" as never,
          rendered_at:  new Date().toISOString() as never,
          updated_at:   new Date().toISOString() as never,
          updated_by:   SYSTEM_ACTOR as never,
        } as never)
        .where("id" as never, "=", outputId as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .execute();

      await this.db
        .updateTable("document.render_job" as never)
        .set({
          status:       "COMPLETED" as never,
          completed_at: new Date().toISOString() as never,
          duration_ms:  durationMs as never,
          updated_at:   new Date().toISOString() as never,
        } as never)
        .where("id" as never, "=", jobId as never)
        .execute();

      return { outputId, storageKey, status: "RENDERED" };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failOutput(outputId, input.tenantId, jobId, "RENDER_ERROR", message);
      return { outputId, storageKey: null, status: "FAILED", error: message };
    }
  }

  /**
   * Get a presigned URL for a completed render output.
   */
  async getDownloadUrl(
    outputId:  string,
    tenantId:  string,
    ttlSeconds = 900,
  ): Promise<string | null> {
    const row = await this.db
      .selectFrom("document.render_output as ro" as never)
      .select(["ro.storage_key", "ro.status"] as never[])
      .where("ro.id" as never, "=", outputId as never)
      .where("ro.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { storage_key: string | null; status: string } | undefined;

    if (!row || row.status !== "RENDERED" || !row.storage_key) return null;
    if (!this.storage) return null;

    return this.storage.getPresignedUrl(row.storage_key, ttlSeconds);
  }

  /**
   * Check if renderer is available (for health endpoint contribution).
   */
  async isRendererAvailable(): Promise<boolean> {
    if (!this.renderer) return false;
    return this.renderer.isAvailable();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async createOutputRecord(input: RenderDocumentInput): Promise<string> {
    const row = await this.db
      .insertInto("document.render_output" as never)
      .values({
        tenant_id:           input.tenantId,
        entity_name:         input.entityType,
        entity_id:           input.entityId,
        operation:           input.operation,
        variant:             input.variant ?? "default",
        locale:              input.locale ?? "en",
        status:              "QUEUED",
        template_version_id: input.templateVersionId ?? null,
        manifest_json:       JSON.stringify({ entity_name: input.entityType }),
        created_by:          input.requestedBy,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow() as { id: string };

    return row.id;
  }

  private async createJobRecord(outputId: string, tenantId: string): Promise<string> {
    const row = await this.db
      .insertInto("document.render_job" as never)
      .values({
        tenant_id:   tenantId,
        output_id:   outputId,
        status:      "PENDING",
        attempts:    0,
        max_attempts: 3,
        created_by:  SYSTEM_ACTOR,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow() as { id: string };

    return row.id;
  }

  private async updateOutputStatus(
    outputId: string,
    tenantId: string,
    status:   string,
  ): Promise<void> {
    await this.db
      .updateTable("document.render_output" as never)
      .set({ status: status as never, updated_at: new Date().toISOString() as never } as never)
      .where("id" as never, "=", outputId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();
  }

  private async updateJobStatus(
    jobId:    string,
    tenantId: string,
    status:   string,
  ): Promise<void> {
    await this.db
      .updateTable("document.render_job" as never)
      .set({
        status:     status as never,
        started_at: status === "PROCESSING" ? new Date().toISOString() as never : undefined as never,
        attempts:   sql`attempts + 1` as never,
        updated_at: new Date().toISOString() as never,
      } as never)
      .where("id" as never, "=", jobId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();
  }

  private async failOutput(
    outputId:    string,
    tenantId:    string,
    jobId:       string,
    errorCode:   string,
    errorMessage: string,
  ): Promise<void> {
    await Promise.all([
      this.db
        .updateTable("document.render_output" as never)
        .set({
          status:        "FAILED" as never,
          error_code:    errorCode as never,
          error_message: errorMessage.substring(0, 2048) as never,
          updated_at:    new Date().toISOString() as never,
          updated_by:    SYSTEM_ACTOR as never,
        } as never)
        .where("id" as never, "=", outputId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .execute()
        .catch(() => undefined),

      this.db
        .updateTable("document.render_job" as never)
        .set({
          status:       "FAILED" as never,
          error_code:   errorCode as never,
          error_detail: errorMessage.substring(0, 2048) as never,
          updated_at:   new Date().toISOString() as never,
        } as never)
        .where("id" as never, "=", jobId as never)
        .execute()
        .catch(() => undefined),
    ]);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRenderService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:       Kysely<any>,
  renderer: SyncPdfRenderer | null,
  storage:  ObjectStorageAdapter | null,
): RenderService {
  return new RenderService(db, renderer, storage);
}
