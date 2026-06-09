/**
 * Report Pack Routes — Phase 4.4
 *
 * GET  /governance/report-packs             — list packs for a cycle run
 * POST /governance/report-packs             — create + generate a report pack
 * GET  /governance/report-packs/:id         — get pack status
 * GET  /governance/report-packs/:id/download — redirect to presigned S3 URL
 *
 * A12 delivery contract:
 *   GET /governance/report-packs/:id/download → 302 redirect to time-limited presigned URL.
 *   Rendered as a "Download Report" button in the governance cycle UI.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import { createReportPackService } from "../report-pack.service.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface ReportPackRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:      Kysely<any>;
  storage: ObjectStorageAdapter | null;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createReportPackRoutes(
  router: Router,
  deps:   ReportPackRouteDeps,
): void {
  const { db, storage, auth, logger } = deps;
  const service = createReportPackService(db, storage);

  // ── GET /governance/report-packs?cycleRunId=... ────────────────────────────

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const cycleRunId = String(req.query["cycleRunId"] ?? "");
      if (!cycleRunId || !isUuid(cycleRunId)) {
        res.status(400).json({ error: "MISSING_CYCLE_RUN_ID", message: "cycleRunId query param required" });
        return;
      }

      const items = await service.listForCycleRun(cycleRunId, tenantId);
      res.json({ items });
    } catch (err) {
      logger?.error("report_pack_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /governance/report-packs ────────────────────────────────────────

  const createHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" });
        return;
      }

      const body       = req.body as Record<string, unknown> ?? {};
      const cycleRunId = String(body["cycleRunId"] ?? "");
      const reportType = String(body["reportType"] ?? "cycle_summary") as "cycle_summary";
      const format     = String(body["format"] ?? "html") as "html";

      if (!cycleRunId || !isUuid(cycleRunId)) {
        res.status(400).json({ error: "MISSING_CYCLE_RUN_ID" });
        return;
      }

      const VALID_TYPES = new Set(["cycle_summary", "deviation_summary", "certification_summary", "task_status", "compliance_dashboard"]);
      if (!VALID_TYPES.has(reportType)) {
        res.status(400).json({ error: "INVALID_REPORT_TYPE", message: `reportType must be one of: ${[...VALID_TYPES].join(", ")}` });
        return;
      }

      const VALID_FORMATS = new Set(["html", "pdf", "xlsx"]);
      if (!VALID_FORMATS.has(format)) {
        res.status(400).json({ error: "INVALID_FORMAT", message: "format must be html, pdf, or xlsx" });
        return;
      }

      const pack = await service.createPack(tenantId, { cycleRunId, reportType, format, requestedBy: principalId });

      // Generate HTML inline for Phase 4.4 (synchronous — small reports only)
      if (format === "html") {
        service.generateHtmlPack(pack.id, tenantId, principalId).catch((err: unknown) => {
          logger?.error("report_pack_generate_error", { packId: pack.id, err: String(err) });
          service.markFailed(pack.id, tenantId, String(err), principalId).catch(() => undefined);
        });
      }

      res.status(202).json(pack);
    } catch (err) {
      logger?.error("report_pack_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /governance/report-packs/:id ────────────────────────────────────

  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const id = (req.params["id"] as string | undefined)?.trim();
      if (!id || !isUuid(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
      }

      const pack = await service.getPack(id, tenantId);
      if (!pack) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      res.json(pack);
    } catch (err) {
      logger?.error("report_pack_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /governance/report-packs/:id/download ────────────────────────────
  // A12: redirect to presigned S3 URL

  const downloadHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const id = (req.params["id"] as string | undefined)?.trim();
      if (!id || !isUuid(id)) {
        res.status(400).json({ error: "INVALID_ID" });
        return;
      }

      if (!storage) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage not configured" });
        return;
      }

      const result = await service.getDownloadUrl(id, tenantId);
      if (!result) {
        const pack = await service.getPack(id, tenantId);
        if (!pack) { res.status(404).json({ error: "NOT_FOUND" }); return; }
        if (pack.status === "pending" || pack.status === "generating") {
          res.status(202).json({ error: "NOT_READY", status: pack.status, message: "Report is still being generated" });
        } else if (pack.status === "failed") {
          res.status(422).json({ error: "GENERATION_FAILED", message: pack.errorMessage });
        } else {
          res.status(404).json({ error: "NOT_FOUND" });
        }
        return;
      }

      // 302 redirect to presigned URL (A12 delivery contract)
      res.redirect(302, result.url);
    } catch (err) {
      logger?.error("report_pack_download_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/governance/report-packs",             listHandler);
  router.post("/governance/report-packs",            createHandler);
  router.get("/governance/report-packs/:id",         getHandler);
  router.get("/governance/report-packs/:id/download", downloadHandler);
}
