/**
 * Audit Export Admin Handlers
 *
 * API handlers for triggering and listing audit exports.
 * Requires "security_admin" role for all operations.
 */

import type { AuditExportService, AuditExportResult } from "../../domain/audit-export.service.js";

// ============================================================================
// Types
// ============================================================================

export interface HandlerContext {
  container: {
    resolve<T>(token: string): Promise<T>;
  };
  tenant: { id: string };
  auth: { userId: string; roles: string[] };
}

export interface HandlerRequest {
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export interface HandlerResponse {
  status(code: number): HandlerResponse;
  json(data: unknown): void;
}

// ============================================================================
// Export Audit Handler (POST)
// ============================================================================

export class ExportAuditHandler {
  constructor(private readonly exportService: AuditExportService) {}

  async handle(req: HandlerRequest, res: HandlerResponse, ctx: HandlerContext): Promise<void> {
    // Auth check
    if (!ctx.auth.roles.includes("security_admin")) {
      res.status(403).json({ error: "Requires security_admin role" });
      return;
    }

    const body = req.body as {
      startDate?: string;
      endDate?: string;
      limit?: number;
    } | undefined;

    if (!body?.startDate || !body?.endDate) {
      res.status(400).json({ error: "startDate and endDate are required" });
      return;
    }

    const result: AuditExportResult = await this.exportService.export({
      tenantId: ctx.tenant.id,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      limit: body.limit,
      exportedBy: ctx.auth.userId,
    });

    res.status(200).json({
      exportId: result.manifest.exportId,
      eventCount: result.manifest.eventCount,
      sha256: result.manifest.sha256,
      ndjsonKey: result.ndjsonKey,
      manifestKey: result.manifestKey,
    });
  }
}

// ============================================================================
// List Exports Handler (GET)
// ============================================================================

export class ListAuditExportsHandler {
  constructor(
    private readonly objectStorage: {
      list(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
    } | null,
  ) {}

  async handle(req: HandlerRequest, res: HandlerResponse, ctx: HandlerContext): Promise<void> {
    // Auth check
    if (!ctx.auth.roles.includes("security_admin")) {
      res.status(403).json({ error: "Requires security_admin role" });
      return;
    }

    if (!this.objectStorage) {
      res.status(503).json({ error: "Object storage not configured" });
      return;
    }

    const date = req.query?.date; // Optional: filter by YYYY-MM-DD
    const prefix = date
      ? `audit-exports/${ctx.tenant.id}/${date}/`
      : `audit-exports/${ctx.tenant.id}/`;

    const objects = await this.objectStorage.list(prefix);
    const manifests = objects.filter((o) => o.key.endsWith(".manifest.json"));

    res.status(200).json({
      exports: manifests.map((m) => ({
        key: m.key,
        size: m.size,
        lastModified: m.lastModified.toISOString(),
      })),
      total: manifests.length,
    });
  }
}
