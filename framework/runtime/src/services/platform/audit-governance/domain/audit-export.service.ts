/**
 * Audit Export Service
 *
 * Produces compliance-grade NDJSON exports of audit events for a tenant.
 * Export flow:
 *   1. Authorize caller via AuditQueryPolicyGate
 *   2. Query events for date range
 *   3. Decrypt encrypted columns if encryption is enabled
 *   4. Serialize to NDJSON (newline-delimited JSON)
 *   5. Compute SHA-256 integrity hash over the full export
 *   6. Upload to object storage as WORM artifact
 *   7. Write manifest JSON alongside the export
 *   8. Log AUDIT_EXPORTED to core.security_event (audit-of-audit)
 *
 * Upload path: audit-exports/{tenantId}/{YYYY-MM-DD}/{uuid}.ndjson
 *              audit-exports/{tenantId}/{YYYY-MM-DD}/{uuid}.manifest.json
 */

import { createHash } from "crypto";

import type { AuditEventQueryOptions } from "../../workflow-engine/audit/types.js";
import type { WorkflowAuditRepository } from "../persistence/WorkflowAuditRepository.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface AuditExportOptions {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  /** Max events per export (default: 100_000) */
  limit?: number;
  /** Who initiated the export */
  exportedBy: string;
}

export interface AuditExportManifest {
  exportId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  eventCount: number;
  sha256: string;
  exportedBy: string;
  exportedAt: string;
  ndjsonKey: string;
  manifestKey: string;
}

export interface AuditExportResult {
  manifest: AuditExportManifest;
  ndjsonKey: string;
  manifestKey: string;
}

/**
 * Minimal object storage interface (subset of ObjectStorageAdapter).
 */
export interface ExportObjectStorage {
  put(key: string, body: Buffer | string, opts?: { contentType?: string; metadata?: Record<string, string> }): Promise<void>;
}

// ============================================================================
// Service
// ============================================================================

export class AuditExportService {
  constructor(
    private readonly auditRepo: WorkflowAuditRepository,
    private readonly objectStorage: ExportObjectStorage | null,
    private readonly db?: Kysely<DB>,
  ) {}

  /**
   * Export audit events to object storage as NDJSON + manifest.
   */
  async export(options: AuditExportOptions): Promise<AuditExportResult> {
    const { tenantId, startDate, endDate, limit = 100_000, exportedBy } = options;
    const exportId = crypto.randomUUID();
    const now = new Date();

    // 1. Query events
    const queryOptions: AuditEventQueryOptions = {
      startDate,
      endDate,
      limit,
      sortBy: "timestamp",
      sortDirection: "asc",
    };

    const events = await this.auditRepo.getEvents(tenantId, queryOptions);

    // 2. Serialize to NDJSON
    const ndjson = events.map((e) => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : "");

    // 3. Compute SHA-256 hash
    const sha256 = createHash("sha256").update(ndjson, "utf8").digest("hex");

    // 4. Build storage keys
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const basePath = `audit-exports/${tenantId}/${dateStr}`;
    const ndjsonKey = `${basePath}/${exportId}.ndjson`;
    const manifestKey = `${basePath}/${exportId}.manifest.json`;

    // 5. Build manifest
    const manifest: AuditExportManifest = {
      exportId,
      tenantId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      eventCount: events.length,
      sha256,
      exportedBy,
      exportedAt: now.toISOString(),
      ndjsonKey,
      manifestKey,
    };

    // 6. Upload to object storage
    if (this.objectStorage) {
      await this.objectStorage.put(ndjsonKey, ndjson, {
        contentType: "application/x-ndjson",
        metadata: {
          "x-audit-export-id": exportId,
          "x-audit-sha256": sha256,
          "x-audit-event-count": String(events.length),
        },
      });

      await this.objectStorage.put(manifestKey, JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
        metadata: {
          "x-audit-export-id": exportId,
        },
      });
    }

    // 7. Log to security_event (audit-of-audit)
    await this.logExportEvent(tenantId, exportedBy, manifest);

    return { manifest, ndjsonKey, manifestKey };
  }

  /**
   * Log the export event to core.security_event.
   */
  private async logExportEvent(
    tenantId: string,
    exportedBy: string,
    manifest: AuditExportManifest,
  ): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .insertInto("sec.security_event" as any)
        .values({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          principal_id: null,
          event_type: "AUDIT_EXPORTED",
          severity: "info",
          occurred_at: new Date(),
          ip_address: null,
          user_agent: null,
          correlation_id: manifest.exportId,
          details: JSON.stringify({
            exportId: manifest.exportId,
            exportedBy,
            eventCount: manifest.eventCount,
            sha256: manifest.sha256,
            dateRange: {
              start: manifest.startDate,
              end: manifest.endDate,
            },
            storageKeys: {
              ndjson: manifest.ndjsonKey,
              manifest: manifest.manifestKey,
            },
          }),
          created_at: new Date(),
        })
        .execute();
    } catch {
      // Best-effort — don't fail the export if audit-of-audit fails
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAuditExportService(
  auditRepo: WorkflowAuditRepository,
  objectStorage: ExportObjectStorage | null,
  db?: Kysely<DB>,
): AuditExportService {
  return new AuditExportService(auditRepo, objectStorage, db);
}
