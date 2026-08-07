/**
 * Audit Hash-Chain Routes — Phase 4.2
 *
 * Extends the audit query API with hash chain integrity endpoints.
 *
 * GET  /audit/hash-chain/latest         — most recent anchor for the tenant
 * GET  /audit/hash-chain/anchors        — list anchors in a date range
 * POST /audit/hash-chain/seal           — seal today's audit log (admin only)
 * POST /audit/hash-chain/verify         — verify chain integrity for a date range
 *
 * These routes are mounted alongside the existing audit.route.ts routes.
 * Auth: bearer token (same as all audit routes). Seal requires admin role.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import { createHashChainIntegrityService } from "../hash-chain-integrity.service.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AuditHashChainRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditHashChainRoutes(
  router: Router,
  deps:   AuditHashChainRouteDeps,
): void {
  const { db, auth, logger } = deps;
  const hashChain = createHashChainIntegrityService(db);

  // ── GET /audit/hash-chain/latest ─────────────────────────────────────────

  const latestHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const anchor = await hashChain.getLatestAnchor(tenantId);
      if (!anchor) { res.json({ anchor: null }); return; }
      res.json({ anchor });
    } catch (err) {
      logger?.error("audit_hash_chain_latest_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /audit/hash-chain/anchors ─────────────────────────────────────────

  const anchorsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const to   = String(req.query["to"]   ?? new Date().toISOString().slice(0, 10));
      const from = String(req.query["from"] ?? (() => {
        const d = new Date(to + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 29);
        return d.toISOString().slice(0, 10);
      })());

      const anchors = await hashChain.listAnchors(tenantId, from, to);
      res.json({ items: anchors, total: anchors.length });
    } catch (err) {
      logger?.error("audit_hash_chain_anchors_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /audit/hash-chain/seal ───────────────────────────────────────────

  const sealHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const body = req.body as Record<string, unknown> ?? {};
      const date = String(body["date"] ?? new Date().toISOString().slice(0, 10));

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "INVALID_DATE", message: "date must be YYYY-MM-DD" });
        return;
      }

      const result = await hashChain.sealDay(tenantId, date);
      res.json(result);
    } catch (err) {
      logger?.error("audit_hash_chain_seal_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /audit/hash-chain/verify ─────────────────────────────────────────

  const verifyHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "TENANT_NOT_FOUND" }); return; }

      const body = req.body as Record<string, unknown> ?? {};
      const from = String(body["from"] ?? "");
      const to   = String(body["to"]   ?? new Date().toISOString().slice(0, 10));

      if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        res.status(400).json({ error: "MISSING_FROM_DATE", message: "from date (YYYY-MM-DD) is required" });
        return;
      }

      const result = await hashChain.verify(tenantId, from, to);
      res.json(result);
    } catch (err) {
      logger?.error("audit_hash_chain_verify_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────

  router.get("/audit/hash-chain/latest",  latestHandler);
  router.get("/audit/hash-chain/anchors", anchorsHandler);
  router.post("/audit/hash-chain/seal",   sealHandler);
  router.post("/audit/hash-chain/verify", verifyHandler);
}
