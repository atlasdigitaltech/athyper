/**
 * RenderDocumentService — durable PDF rendering orchestrator for the Neon plane.
 *
 * Manages the document.render_output lifecycle (QUEUED → RENDERING → RENDERED/FAILED),
 * delegates HTML→PDF conversion to the injected SyncPdfRenderer port, and uploads
 * the resulting artifact to object storage.
 *
 * Ownership: Neon plane — render_output is a Neon document-schema table.
 * Other planes that only need HTML→PDF can use the SyncPdfRenderer port directly
 * without inheriting Neon persistence.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import type { SyncPdfRenderer } from "@athyper/platform-rendering";
import type { RenderDocumentInput, RenderDocumentResult } from "@athyper/platform-rendering";

const SYSTEM_ACTOR = "00000000-0000-7000-a000-000000000001";

export class RenderDocumentService {
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

  async renderDocument(input: RenderDocumentInput): Promise<RenderDocumentResult> {
    const outputId = await this.createOutputRecord(input);

    if (!this.renderer) {
      await this.failOutput(outputId, input.tenantId, "RENDERER_UNAVAILABLE", "permanent", "Renderer not configured");
      return { outputId, storageKey: null, status: "FAILED", error: "Renderer not configured" };
    }

    try {
      await this.updateOutputStatus(outputId, input.tenantId, "RENDERING");

      const pdfBuffer = await this.renderer.renderSync(input.html, input.renderOptions);

      let storageKey: string | null = null;
      if (this.storage) {
        const now   = new Date();
        const year  = now.getUTCFullYear();
        const mon   = String(now.getUTCMonth() + 1).padStart(2, "0");
        const rType = input.entityType.replace(/\./g, "/");
        const tCode = input.tenantCode  ?? input.tenantId;
        const cCode = input.companyCode ?? input.tenantId;
        storageKey  = `${tCode}/${cCode}/${year}/${mon}/renders/${rType}/${input.entityId}/${outputId}.pdf`;
        await this.storage.put(storageKey, pdfBuffer, { contentType: "application/pdf" });
      }

      await this.db
        .updateTable("document.render_output" as never)
        .set({
          status:           "RENDERED" as never,
          storage_key:      storageKey as never,
          storage_bucket:   process.env["S3_BUCKET"] ?? null as never,
          size_bytes:       pdfBuffer.byteLength as never,
          mime_type:        "application/pdf" as never,
          rendered_at:      new Date().toISOString() as never,
          error_code:       null as never,
          error_message:    null as never,
          failure_category: null as never,
          updated_at:       new Date().toISOString() as never,
          updated_by:       SYSTEM_ACTOR as never,
        } as never)
        .where("id" as never, "=", outputId as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .execute();

      return { outputId, storageKey, status: "RENDERED" };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failOutput(outputId, input.tenantId, "RENDER_ERROR", "crash", message);
      return { outputId, storageKey: null, status: "FAILED", error: message };
    }
  }

  async getDownloadUrl(outputId: string, tenantId: string, ttlSeconds = 900): Promise<string | null> {
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

  async isRendererAvailable(): Promise<boolean> {
    if (!this.renderer) return false;
    return this.renderer.isAvailable();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async createOutputRecord(input: RenderDocumentInput): Promise<string> {
    const row = await this.db
      .insertInto("document.render_output" as never)
      .values({
        tenant_id:           input.tenantId,
        entity_name:         input.entityType,
        entity_id:           input.entityId,
        operation:           input.operation,
        variant:             input.variant ?? "default",
        locale:              input.locale  ?? "en",
        status:              "QUEUED",
        template_version_id: input.templateVersionId ?? null,
        manifest_json:       JSON.stringify({ entity_name: input.entityType }),
        created_by:          input.requestedBy,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow() as { id: string };

    return row.id;
  }

  private async updateOutputStatus(outputId: string, tenantId: string, status: string): Promise<void> {
    await this.db
      .updateTable("document.render_output" as never)
      .set({
        status: status as never,
        ...(status === "RENDERING" ? {
          attempt_count:   sql`attempt_count + 1` as never,
          last_attempt_at: new Date().toISOString() as never,
        } : {}),
        updated_at: new Date().toISOString() as never,
        updated_by: SYSTEM_ACTOR as never,
      } as never)
      .where("id" as never, "=", outputId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();
  }

  private async failOutput(
    outputId: string,
    tenantId: string,
    errorCode: string,
    failureCategory: "transient" | "permanent" | "validation" | "crash",
    errorMessage: string,
  ): Promise<void> {
    await this.db
      .updateTable("document.render_output" as never)
      .set({
        status:           "FAILED" as never,
        error_code:       errorCode as never,
        error_message:    errorMessage.substring(0, 2048) as never,
        failure_category: failureCategory as never,
        updated_at:       new Date().toISOString() as never,
        updated_by:       SYSTEM_ACTOR as never,
      } as never)
      .where("id" as never, "=", outputId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute()
      .catch(() => undefined);
  }
}

export function createRenderDocumentService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:       Kysely<any>,
  renderer: SyncPdfRenderer | null,
  storage:  ObjectStorageAdapter | null,
): RenderDocumentService {
  return new RenderDocumentService(db, renderer, storage);
}
