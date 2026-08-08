/**
 * Audit Integrity Check Route — POST /api/audit/integrity-check
 *
 * Admin endpoint that triggers a tamper-detection SHA-256 hash-chain
 * verification for a tenant's audit log over a requested date range.
 *
 * Delegates to HashChainIntegrityService.verify() which re-derives each
 * day's anchor hash from the raw log.audit_log rows and compares it to
 * the stored log.hash_anchor value. Any modification to historical rows
 * (including inserts, deletes, or field edits) breaks the chain.
 *
 * POST body:
 *   { fromDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD" }
 *   toDate defaults to today if omitted.
 *
 * Response:
 *   {
 *     tenantId:        string,
 *     fromDate:        string,
 *     toDate:          string,
 *     anchorsChecked:  number,
 *     intact:          boolean,
 *     brokenAt:        string | null,   // anchor_date of first broken link
 *     gaps:            string[],        // dates with no anchor (never sealed)
 *     verifiedAt:      string,          // ISO timestamp of this run
 *   }
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import { createHashChainIntegrityService } from "../hash-chain-integrity.service.js";
import { appendAuditEvent } from "../append-event.js";
import { Audit } from "../event-codes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrityCheckRouteDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string,  fields?: Record<string, unknown>): void;
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Route factory ─────────────────────────────────────────────────────────────

export function createIntegrityCheckRoute(router: Router, deps: IntegrityCheckRouteDeps): void {
  const { db, auth, logger } = deps;
  const hashChain = createHashChainIntegrityService(db);

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      // ── Parse body ────────────────────────────────────────────────────────────
      const body     = (req.body as Record<string, unknown>) ?? {};
      const fromDate = String(body["fromDate"] ?? "");
      const toDate   = String(body["toDate"] ?? new Date().toISOString().slice(0, 10));

      if (!fromDate || !DATE_RE.test(fromDate)) {
        res.status(400).json({
          error:   "MISSING_FROM_DATE",
          message: "fromDate (YYYY-MM-DD) is required",
        });
        return;
      }
      if (!DATE_RE.test(toDate)) {
        res.status(400).json({
          error:   "INVALID_TO_DATE",
          message: "toDate must be YYYY-MM-DD",
        });
        return;
      }
      if (fromDate > toDate) {
        res.status(400).json({
          error:   "DATE_RANGE_INVERTED",
          message: "fromDate must be on or before toDate",
        });
        return;
      }

      // ── Run verification ──────────────────────────────────────────────────────
      logger?.warn("audit_integrity_check_started", { tenantId, fromDate, toDate });

      const result = await hashChain.verify(tenantId, fromDate, toDate);

      void appendAuditEvent(db, {
        event_code:  Audit.INTEGRITY_CHECKED,
        operation:   "execute",
        entity_type: "audit.audit_log",
        outcome:     result.intact ? "success" : "failure",
        context:     { fromDate, toDate, intact: result.intact, brokenAt: result.brokenAt ?? null },
      });

      if (!result.intact) {
        logger?.warn("audit_integrity_chain_broken", {
          tenantId,
          fromDate,
          toDate,
          brokenAt: result.brokenAt,
          gaps:     result.gaps,
        });
      }

      res.json({
        ...result,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger?.error("audit_integrity_check_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/audit/integrity-check", handler);
}
