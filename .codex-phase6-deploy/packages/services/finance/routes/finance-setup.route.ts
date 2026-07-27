/**
 * Finance Setup Workbench — scoped reads and tenant-isolated setup mutations.
 *
 *   GET  /finance/setup/readiness
 *          ?scopeType=company&scopeCode=ACFB
 *          [&fiscalYear=2025&period=6&bookId=<uuid>]
 *          → CompanyHubPayload
 *
 *   GET  /finance/setup/conflicts
 *          ?scopeType=company&scopeCode=ACFB
 *          → FinanceSetupConflict[]
 *
 *   GET  /finance/setup/posting-preview
 *          ?scopeType=company&scopeCode=ACFB&fiscalYear=2025&period=6
 *          [&bookId=<uuid>&glAccountCode=1100]
 *          → PostingPreviewPayload
 *
 * Scope contract:
 *   All query params use `scopeCode` (readable code, e.g. "ACFB").
 *   Server resolves scopeCode → UUID internally.
 */

import type { Request, RequestHandler, Router } from "express";
import { verifyBearer, resolveTenantId, resolvePrincipalIdWithJit } from "@athyper/svc-shared";
import { checkPermission } from "@athyper/svc-iam";
import type { FinanceRouteDeps } from "./finance.route.js";
import {
  buildCompanyHubPayload,
  buildCompanyConflicts,
  buildPostingPreview,
} from "../services/finance-readiness.service.js";
import {
  loadChartTree,
  loadGlAccountsList,
  loadBooksList,
  loadHouseBanksList,
} from "../services/finance-explore.service.js";
import {
  loadGlControlsGrid,
  loadChartAssignments,
  loadBookAssignments,
  loadChartOptions,
  loadBookOptions,
} from "../services/finance-configure.service.js";
import {
  loadBlockersGrouped,
  loadReconciliationSignals,
} from "../services/finance-operate.service.js";
import { buildRollupPayload } from "../services/finance-rollup.service.js";
import {
  assignGlControl,
  updateGlControl,
  deactivateGlControl,
  setPrimaryChartAssignment,
  createChartAssignment,
  updateChartAssignment,
  deactivateChartAssignment,
  bulkUpdateGlControls,
  createBookAssignment,
  updateBookAssignment,
  deactivateBookAssignment,
  setCompanyDefaultBook,
  toggleHouseBank,
} from "../services/finance-setup-mutations.service.js";
import {
  assignFiscalCalendar,
  generateFiscalPeriods,
  loadFiscalCalendarDesigner,
  loadFiscalPeriodMatrix,
  previewFiscalCalendar,
  retireFiscalCalendar,
  saveFiscalCalendar,
  type SaveFiscalCalendarInput,
} from "../services/fiscal-calendar.service.js";
import {
  loadPostingRoleCoverage,
  retirePostingRoleAccountMap,
  savePostingRoleAccountMap,
  tracePostingRoleResolution,
} from "../services/posting-role.service.js";
import { loadCompanyFoundation } from "../services/finance-foundation.service.js";
import {
  loadCertificationReadinessRollup,
  loadCompanyCertificationReadiness,
} from "../services/finance-certification-readiness.service.js";

// Phase 1/2: authenticated users in the resolved tenant can use Finance Setup.
// Phase 3 turns this on together with tenant/legal-entity/company scope policy.
const ENFORCE_PHASE3_FINANCE_SETUP_PERMISSION = false;

export function createFinanceSetupRoutes(router: Router, deps: FinanceRouteDeps): void {
  const { db, auth, logger } = deps;

  router.get("/finance/setup/certification-readiness", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const tenantId = await resolveTenantId(db,(req.headers["x-org"] as string) ?? "",(req.headers["x-realm"] as string) ?? "athyper");
      if (!tenantId) { res.status(400).json({error:"MISSING_TENANT"}); return; }
      const scopeType=String(req.query["scopeType"]??"");
      const scopeCode=String(req.query["scopeCode"]??"").trim();
      const asOfDate=req.query["asOfDate"]?String(req.query["asOfDate"]):undefined;
      if (!scopeCode) { res.status(400).json({error:"MISSING_SCOPE",message:"scopeCode is required."}); return; }
      if (scopeType==="company") {
        const payload=await loadCompanyCertificationReadiness(db,tenantId,scopeCode,asOfDate);
        if (!payload) { res.status(404).json({error:"COMPANY_NOT_FOUND"}); return; }
        const fxDomain=payload.domains.find((item)=>item.domain==="currency_fx");
        logger?.info?.("finance_certification_readiness_evaluated",{
          tenantId,
          scopeType,
          scopeCode,
          status:payload.status,
          readyForCertification:payload.summary.readyForCertification,
          setupBlockerCount:payload.summary.blockerCount,
          operationalFxAttentionCount:fxDomain?.operationalHealth?.attentionCount??0,
        });
        res.status(200).json(payload); return;
      }
      if (scopeType==="tenant"||scopeType==="legal_entity") {
        const payload=await loadCertificationReadinessRollup(db,tenantId,scopeType,scopeCode,asOfDate);
        logger?.info?.("finance_certification_readiness_rollup_evaluated",{
          tenantId,
          scopeType,
          scopeCode,
          ...payload.summary,
        });
        res.status(200).json(payload); return;
      }
      res.status(400).json({error:"INVALID_SCOPE",message:"scopeType must be company, legal_entity, or tenant."});
    } catch (err) {
      logger?.error("finance_certification_readiness_error",{err:String(err)}); next(err);
    }
  }) as RequestHandler);

  router.get("/finance/setup/company/:companyCode/foundation", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const tenantId = await resolveTenantId(
        db,
        (req.headers["x-org"] as string) ?? "",
        (req.headers["x-realm"] as string) ?? "athyper",
      );
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved from x-org/x-realm." });
        return;
      }
      const companyCode = String(req.params["companyCode"] ?? "").trim();
      const activeLegalEntityId = String(req.headers["x-legal-entity-id"] ?? "").trim() || null;
      if (!companyCode) {
        res.status(400).json({ error: "MISSING_COMPANY", message: "companyCode is required." });
        return;
      }
      const payload = await loadCompanyFoundation(db, tenantId, companyCode, activeLegalEntityId);
      if (!payload) {
        res.status(404).json({ error: "COMPANY_NOT_FOUND", message: `No company with code=${companyCode} in the active tenant and Legal Entity.` });
        return;
      }
      res.status(200).json(payload);
    } catch (err) {
      logger?.error("finance_setup_foundation_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ─── GET /finance/setup/readiness ────────────────────────────────────
  const readinessHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved from x-org/x-realm." });
        return;
      }

      const scopeType = String(req.query["scopeType"] ?? "");
      const scopeCode = String(req.query["scopeCode"] ?? "");
      if (!scopeCode) {
        res.status(400).json({ error: "MISSING_SCOPE", message: "scopeCode is required." });
        return;
      }

      // ── Phase 1.6: tenant / legal_entity rollup ─────────────────────────
      if (scopeType === "tenant" || scopeType === "legal_entity") {
        const rollup = await buildRollupPayload(db, {
          scopeType,
          scopeCode,
          tenantId,
        });
        if (!rollup) {
          res.status(404).json({
            error:   "SCOPE_NOT_FOUND",
            message: `No ${scopeType.replace("_", " ")} with code=${scopeCode} in tenant.`,
          });
          return;
        }
        res.status(200).json(rollup);
        return;
      }

      if (scopeType !== "company") {
        res.status(400).json({ error: "INVALID_SCOPE", message: `Unsupported scopeType=${scopeType}.` });
        return;
      }

      const fiscalYear = req.query["fiscalYear"] ? Number(req.query["fiscalYear"]) : undefined;
      const period     = req.query["period"]     ? Number(req.query["period"])     : undefined;
      const bookId     = req.query["bookId"]     ? String(req.query["bookId"])     : undefined;

      const payload = await buildCompanyHubPayload(db, {
        tenantId,
        companyCode: scopeCode,
        fiscalYear:  Number.isFinite(fiscalYear) ? fiscalYear : undefined,
        period:      Number.isFinite(period) ? period : undefined,
        bookId,
      });
      if (!payload) {
        res.status(404).json({ error: "COMPANY_NOT_FOUND", message: `No company with code=${scopeCode} in tenant.` });
        return;
      }
      res.status(200).json(payload);
    } catch (err) {
      logger?.error("finance_setup_readiness_error", { err: String(err) });
      next(err);
    }
  };

  // ─── GET /finance/setup/conflicts ────────────────────────────────────
  const conflictsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved from x-org/x-realm." });
        return;
      }

      const scopeType = String(req.query["scopeType"] ?? "");
      const scopeCode = String(req.query["scopeCode"] ?? "");
      if (!scopeCode) {
        res.status(400).json({ error: "MISSING_SCOPE", message: "scopeCode is required." });
        return;
      }

      if (scopeType === "tenant" || scopeType === "legal_entity") {
        // Rollup conflicts = full inbox from the rollup payload (no truncation).
        const rollup = await buildRollupPayload(db, { scopeType, scopeCode, tenantId });
        if (!rollup) {
          res.status(404).json({
            error:   "SCOPE_NOT_FOUND",
            message: `No ${scopeType.replace("_", " ")} with code=${scopeCode} in tenant.`,
          });
          return;
        }
        res.status(200).json(rollup.inbox);
        return;
      }

      if (scopeType !== "company") {
        res.status(400).json({ error: "INVALID_SCOPE", message: `Unsupported scopeType=${scopeType}.` });
        return;
      }

      const conflicts = await buildCompanyConflicts(db, { tenantId, companyCode: scopeCode });
      res.status(200).json(conflicts);
    } catch (err) {
      logger?.error("finance_setup_conflicts_error", { err: String(err) });
      next(err);
    }
  };

  // ─── GET /finance/setup/posting-preview ──────────────────────────────
  const postingPreviewHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved from x-org/x-realm." });
        return;
      }

      const scopeType     = String(req.query["scopeType"] ?? "");
      const scopeCode     = String(req.query["scopeCode"] ?? "");
      const fiscalYear    = Number(req.query["fiscalYear"]);
      const period        = Number(req.query["period"]);
      const bookId        = req.query["bookId"]        ? String(req.query["bookId"])        : undefined;
      const glAccountCode = req.query["glAccountCode"] ? String(req.query["glAccountCode"]) : undefined;

      if (scopeType !== "company") {
        res.status(400).json({ error: "INVALID_SCOPE", message: "posting-preview supports scopeType=company only." });
        return;
      }
      if (!scopeCode || !Number.isFinite(fiscalYear) || !Number.isFinite(period)) {
        res.status(400).json({ error: "MISSING_PARAMS", message: "scopeCode, fiscalYear, period are required." });
        return;
      }

      const payload = await buildPostingPreview(db, {
        tenantId,
        companyCode: scopeCode,
        fiscalYear,
        period,
        bookId,
        glAccountCode,
      });
      if (!payload) {
        res.status(404).json({ error: "COMPANY_NOT_FOUND", message: `No company with code=${scopeCode} in tenant.` });
        return;
      }
      res.status(200).json(payload);
    } catch (err) {
      logger?.error("finance_setup_posting_preview_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/finance/setup/readiness",        readinessHandler);
  router.get("/finance/setup/conflicts",        conflictsHandler);
  router.get("/finance/setup/posting-preview",  postingPreviewHandler);

  // ─── Explore workspace ───────────────────────────────────────────────────
  router.get(
    "/finance/setup/explore/chart-tree",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const payload = await loadChartTree(db, tenantId, scopeCode);
      if (!payload) return { status: 404, body: { error: "NOT_FOUND", message: "No operating chart assigned." } };
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/explore/gl-accounts",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadGlAccountsList(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/explore/books",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadBooksList(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/explore/house-banks",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadHouseBanksList(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );

  // ─── Configure workspace ─────────────────────────────────────────────────
  router.get(
    "/finance/setup/configure/gl-controls",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const payload = await loadGlControlsGrid(db, tenantId, scopeCode);
      if (!payload) return { status: 404, body: { error: "NOT_FOUND", message: "No operating chart assigned." } };
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/configure/chart-assignments",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadChartAssignments(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/configure/chart-options",
    createScopedGetHandler(deps, async (db, tenantId) => {
      const rows = await loadChartOptions(db, tenantId);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/configure/book-assignments",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadBookAssignments(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/configure/book-options",
    createScopedGetHandler(deps, async (db, tenantId) => {
      const rows = await loadBookOptions(db, tenantId);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/configure/fiscal-calendar",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const payload = await loadFiscalCalendarDesigner(db, tenantId, scopeCode);
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/configure/fiscal-calendar/period-matrix",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode, req) => {
      const fiscalYear = Number(req.query["fiscalYear"]);
      if (!Number.isInteger(fiscalYear)) return { status: 400, body: { error: "MISSING_PARAMS", message: "fiscalYear is required." } };
      const payload = await loadFiscalPeriodMatrix(db, tenantId, scopeCode, fiscalYear);
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/configure/fiscal-calendar/:calendarId/preview",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode, req) => {
      const calendarId = String(req.params["calendarId"] ?? "");
      const fiscalYear = Number(req.query["fiscalYear"]);
      if (!calendarId || !Number.isInteger(fiscalYear)) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "calendarId and fiscalYear are required." } };
      }
      const payload = await previewFiscalCalendar(db, tenantId, scopeCode, calendarId, fiscalYear);
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/configure/posting-role-coverage",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode, req) => {
      const asOfDate = String(req.query["asOfDate"] ?? new Date().toISOString().slice(0, 10));
      if (!isIsoDate(asOfDate)) return { status: 400, body: { error: "INVALID_DATE", message: "asOfDate must be YYYY-MM-DD." } };
      const payload = await loadPostingRoleCoverage(db, tenantId, scopeCode, asOfDate);
      return { status: 200, body: payload };
    }),
  );
  router.get(
    "/finance/setup/configure/posting-role-resolution-trace",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode, req) => {
      const roleCode = String(req.query["roleCode"] ?? "");
      const bookCode = String(req.query["bookCode"] ?? "");
      const asOfDate = String(req.query["asOfDate"] ?? new Date().toISOString().slice(0, 10));
      if (!roleCode || !bookCode) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "roleCode and bookCode are required." } };
      }
      if (!isIsoDate(asOfDate)) return { status: 400, body: { error: "INVALID_DATE", message: "asOfDate must be YYYY-MM-DD." } };
      const trace = await tracePostingRoleResolution(db, {
        tenantId, companyCode: scopeCode, roleCode, bookCode, asOfDate,
      });
      return { status: 200, body: trace };
    }),
  );

  // ─── Operate workspace ───────────────────────────────────────────────────
  router.get(
    "/finance/setup/operate/blockers",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadBlockersGrouped(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );
  router.get(
    "/finance/setup/operate/reconciliation-signals",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadReconciliationSignals(db, tenantId, scopeCode);
      return { status: 200, body: rows };
    }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2 — mutation endpoints
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // The permission code is retained in every route for the Phase 3 switch-on.
  // Actor is resolved via resolvePrincipalIdWithJit (canonical pattern).
  // On success we return 200 with the mutation result body.

  router.post("/finance/setup/company/:companyCode/gl-controls",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const body = ctx.body as {
        glAccountCode:        string;
        glAccountId?:         string;
        postingAllowed?:      boolean;
        blockedForManual?:    boolean;
        blockedForAuto?:      boolean;
        requiresCostCenter?:  boolean;
        requiresProfitCenter?:boolean;
        requiresProject?:     boolean;
        reconciliationType?:  string | null;
        taxCategory?:         string | null;
        defaultCostCenterId?: string | null;
        defaultSiteId?:       string | null;
      };
      const companyCode = String(ctx.params["companyCode"] ?? "");
      if (!companyCode || !body.glAccountCode) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode and glAccountCode are required." } };
      }
      const result = await assignGlControl(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        companyCode,
        glAccountCode:        body.glAccountCode,
        glAccountId:          body.glAccountId,
        postingAllowed:       body.postingAllowed,
        blockedForManual:     body.blockedForManual,
        blockedForAuto:       body.blockedForAuto,
        requiresCostCenter:   body.requiresCostCenter,
        requiresProfitCenter: body.requiresProfitCenter,
        requiresProject:      body.requiresProject,
        reconciliationType:   body.reconciliationType,
        taxCategory:          body.taxCategory,
        defaultCostCenterId:  body.defaultCostCenterId,
        defaultSiteId:        body.defaultSiteId,
        correlationId:        ctx.correlationId,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/gl-controls/bulk",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const body = ctx.body as {
        glAccountIds?: string[]; postingAllowed?: boolean; blockedForManual?: boolean; blockedForAuto?: boolean;
        requiresCostCenter?: boolean; requiresProfitCenter?: boolean; requiresProject?: boolean;
      };
      if (!companyCode || !Array.isArray(body.glAccountIds)) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode and glAccountIds are required." } };
      }
      const result = await bulkUpdateGlControls(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, correlationId: ctx.correlationId,
        companyCode, glAccountIds: body.glAccountIds, postingAllowed: body.postingAllowed,
        blockedForManual: body.blockedForManual, blockedForAuto: body.blockedForAuto,
        requiresCostCenter: body.requiresCostCenter, requiresProfitCenter: body.requiresProfitCenter,
        requiresProject: body.requiresProject,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/chart-assignments",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const body = ctx.body as {
        chartId?: string; assignmentType?: string; effectiveFrom?: string | null; effectiveTo?: string | null;
        isPrimary?: boolean; status?: "active" | "inactive";
      };
      if (!companyCode || !body.chartId || !body.assignmentType) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode, chartId, and assignmentType are required." } };
      }
      if ((body.effectiveFrom && !isIsoDate(body.effectiveFrom)) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Effective dates must be YYYY-MM-DD." } };
      }
      const result = await createChartAssignment(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, correlationId: ctx.correlationId, companyCode,
        chartId: body.chartId, assignmentType: body.assignmentType, effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo, isPrimary: body.isPrimary, status: body.status,
      });
      return { status: 201, body: result };
    }),
  );

  router.put("/finance/setup/company/:companyCode/chart-assignments/:assignmentId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const assignmentId = String(ctx.params["assignmentId"] ?? "");
      const body = ctx.body as {
        chartId?: string; assignmentType?: string; effectiveFrom?: string | null; effectiveTo?: string | null;
        isPrimary?: boolean; status?: "active" | "inactive"; expectedUpdatedAt?: string | null;
      };
      if (!companyCode || !assignmentId || !body.chartId || !body.assignmentType || body.expectedUpdatedAt === undefined) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "Complete assignment fields and expectedUpdatedAt are required." } };
      }
      if ((body.effectiveFrom && !isIsoDate(body.effectiveFrom)) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Effective dates must be YYYY-MM-DD." } };
      }
      const result = await updateChartAssignment(db, assignmentId, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, correlationId: ctx.correlationId, companyCode,
        chartId: body.chartId, assignmentType: body.assignmentType, effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo, isPrimary: body.isPrimary, status: body.status,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/company/:companyCode/chart-assignments/:assignmentId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const assignmentId = String(ctx.params["assignmentId"] ?? "");
      const body = ctx.body as { expectedUpdatedAt?: string | null };
      if (!companyCode || !assignmentId || body.expectedUpdatedAt === undefined) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode, assignmentId, and expectedUpdatedAt are required." } };
      }
      const result = await deactivateChartAssignment(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, correlationId: ctx.correlationId,
        companyCode, assignmentId, expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/chart-assignments/:assignmentId/set-primary",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const assignmentId = String(ctx.params["assignmentId"] ?? "");
      const body = ctx.body as { expectedUpdatedAt?: string | null };
      if (!assignmentId || body.expectedUpdatedAt === undefined) return { status: 400, body: { error: "MISSING_PARAMS", message: "assignmentId and expectedUpdatedAt are required." } };
      const result = await setPrimaryChartAssignment(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, assignmentId, correlationId: ctx.correlationId,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return { status: 200, body: result };
    }),
  );

  router.patch("/finance/setup/company/:companyCode/gl-controls/:controlId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const controlId = ctx.params["controlId"] as string;
      const companyCode = String(ctx.params["companyCode"] ?? "");
      if (!controlId || !companyCode) return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode and controlId are required." } };
      const body = ctx.body as Record<string, unknown>;
      if (!("expectedUpdatedAt" in body)) return { status: 400, body: { error: "MISSING_PARAMS", message: "expectedUpdatedAt is required." } };
      const result = await updateGlControl(db, {
        tenantId:              ctx.tenantId,
        actorId:               ctx.principalId,
        controlId,
        companyCode,
        expectedUpdatedAt:       body["expectedUpdatedAt"] as string | null,
        postingAllowed:        body["postingAllowed"]        as boolean | undefined,
        blockedForManual:      body["blockedForManual"]      as boolean | undefined,
        blockedForAuto:        body["blockedForAuto"]        as boolean | undefined,
        requiresCostCenter:    body["requiresCostCenter"]    as boolean | undefined,
        requiresProfitCenter:  body["requiresProfitCenter"]  as boolean | undefined,
        requiresProject:       body["requiresProject"]       as boolean | undefined,
        reconciliationType:    body["reconciliationType"]    as string | null | undefined,
        taxCategory:           body["taxCategory"]           as string | null | undefined,
        defaultCostCenterId:   body["defaultCostCenterId"]   as string | null | undefined,
        defaultSiteId:         body["defaultSiteId"]         as string | null | undefined,
        correlationId:         ctx.correlationId,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/company/:companyCode/gl-controls/:controlId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const controlId = ctx.params["controlId"] as string;
      const companyCode = String(ctx.params["companyCode"] ?? "");
      if (!controlId || !companyCode) return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode and controlId are required." } };
      const body = ctx.body as { expectedUpdatedAt?: string | null };
      if (body.expectedUpdatedAt === undefined) return { status: 400, body: { error: "MISSING_PARAMS", message: "expectedUpdatedAt is required." } };
      const result = await deactivateGlControl(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        controlId,
        companyCode,
        expectedUpdatedAt: body.expectedUpdatedAt,
        correlationId: ctx.correlationId,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/mutations/chart-assignment/:assignmentId/set-primary",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const assignmentId = ctx.params["assignmentId"] as string;
      if (!assignmentId) return { status: 400, body: { error: "MISSING_PARAMS", message: "assignmentId is required." } };
      const result = await setPrimaryChartAssignment(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        assignmentId,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/book-assignments",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const body = ctx.body as { bookId?: string; effectiveFrom?: string; effectiveTo?: string | null; overrideCurrencyCode?: string | null;
        alternateCoaPrefix?: string | null; priority?: number; conflictStrategy?: string; status?: "active" | "inactive"; setAsDefault?: boolean };
      if (!companyCode || !body.bookId || !body.effectiveFrom || typeof body.priority !== "number" || !body.conflictStrategy) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "bookId, effectiveFrom, priority, and conflictStrategy are required." } };
      }
      if (!isIsoDate(body.effectiveFrom) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Book assignment dates must be YYYY-MM-DD." } };
      }
      const result = await createBookAssignment(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, companyCode, bookId: body.bookId,
        effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo, overrideCurrencyCode: body.overrideCurrencyCode,
        alternateCoaPrefix: body.alternateCoaPrefix, priority: body.priority, conflictStrategy: body.conflictStrategy,
        status: body.status, setAsDefault: body.setAsDefault, correlationId: ctx.correlationId,
      });
      return { status: 200, body: result };
    }),
  );

  router.put("/finance/setup/company/:companyCode/book-assignments/:assignmentId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const assignmentId = String(ctx.params["assignmentId"] ?? "");
      const body = ctx.body as { bookId?: string; effectiveFrom?: string; effectiveTo?: string | null; overrideCurrencyCode?: string | null;
        alternateCoaPrefix?: string | null; priority?: number; conflictStrategy?: string; status?: "active" | "inactive";
        setAsDefault?: boolean; expectedUpdatedAt?: string | null };
      if (!companyCode || !assignmentId || !body.bookId || !body.effectiveFrom || typeof body.priority !== "number" || !body.conflictStrategy || !("expectedUpdatedAt" in body)) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "Complete Book assignment data and expectedUpdatedAt are required." } };
      }
      if (!isIsoDate(body.effectiveFrom) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Book assignment dates must be YYYY-MM-DD." } };
      }
      const result = await updateBookAssignment(db, assignmentId, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, companyCode, bookId: body.bookId,
        effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo, overrideCurrencyCode: body.overrideCurrencyCode,
        alternateCoaPrefix: body.alternateCoaPrefix, priority: body.priority, conflictStrategy: body.conflictStrategy,
        status: body.status, setAsDefault: body.setAsDefault, expectedUpdatedAt: body.expectedUpdatedAt, correlationId: ctx.correlationId,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/company/:companyCode/book-assignments/:assignmentId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const assignmentId = String(ctx.params["assignmentId"] ?? "");
      const body = ctx.body as { expectedUpdatedAt?: string | null };
      if (!companyCode || !assignmentId || body.expectedUpdatedAt === undefined) return { status: 400, body: { error: "MISSING_PARAMS", message: "assignmentId and expectedUpdatedAt are required." } };
      const result = await deactivateBookAssignment(db, { tenantId: ctx.tenantId, actorId: ctx.principalId, companyCode,
        assignmentId, expectedUpdatedAt: body.expectedUpdatedAt, correlationId: ctx.correlationId });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/book-assignments/:bookId/set-default",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const bookId = String(ctx.params["bookId"] ?? "");
      const body = ctx.body as { expectedUpdatedAt?: string | null };
      if (!companyCode || !bookId || body.expectedUpdatedAt === undefined) return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode, bookId, and expectedUpdatedAt are required." } };
      const result = await setCompanyDefaultBook(db, { tenantId: ctx.tenantId, actorId: ctx.principalId,
        companyCode, bookId, expectedUpdatedAt: body.expectedUpdatedAt, correlationId: ctx.correlationId });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/mutations/house-bank/:configId/toggle",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const configId = ctx.params["configId"] as string;
      if (!configId) return { status: 400, body: { error: "MISSING_PARAMS", message: "configId is required." } };
      const body = ctx.body as { activate?: boolean };
      if (typeof body.activate !== "boolean") {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "activate boolean is required." } };
      }
      const result = await toggleHouseBank(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        configId,
        activate:  body.activate,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/mutations/fiscal-calendar",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const body = ctx.body as Omit<SaveFiscalCalendarInput, "tenantId" | "actorId" | "calendarId">;
      const result = await saveFiscalCalendar(db, {
        ...body,
        tenantId: ctx.tenantId,
        actorId: ctx.principalId,
      });
      return { status: 201, body: result };
    }),
  );

  router.post("/finance/setup/mutations/posting-role-account-map",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const body = ctx.body as {
        companyCode?: string; roleCode?: string; ledgerBookId?: string; glAccountId?: string;
        effectiveFrom?: string; effectiveTo?: string | null; priority?: number;
      };
      if (!body.companyCode || !body.roleCode || !body.ledgerBookId || !body.glAccountId || !body.effectiveFrom) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode, roleCode, ledgerBookId, glAccountId, and effectiveFrom are required." } };
      }
      if (!isIsoDate(body.effectiveFrom) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Effective dates must be YYYY-MM-DD." } };
      }
      const result = await savePostingRoleAccountMap(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId,
        companyCode: body.companyCode, roleCode: body.roleCode,
        ledgerBookId: body.ledgerBookId, glAccountId: body.glAccountId,
        effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
        priority: body.priority,
      });
      return { status: 201, body: result };
    }),
  );

  router.put("/finance/setup/mutations/posting-role-account-map/:mappingId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const mappingId = String(ctx.params["mappingId"] ?? "");
      const body = ctx.body as {
        companyCode?: string; roleCode?: string; ledgerBookId?: string; glAccountId?: string;
        effectiveFrom?: string; effectiveTo?: string | null; priority?: number;
      };
      if (!mappingId || !body.companyCode || !body.roleCode || !body.ledgerBookId || !body.glAccountId || !body.effectiveFrom) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "mappingId and complete assignment fields are required." } };
      }
      if (!isIsoDate(body.effectiveFrom) || (body.effectiveTo && !isIsoDate(body.effectiveTo))) {
        return { status: 400, body: { error: "INVALID_DATE", message: "Effective dates must be YYYY-MM-DD." } };
      }
      const result = await savePostingRoleAccountMap(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, mappingId,
        companyCode: body.companyCode, roleCode: body.roleCode,
        ledgerBookId: body.ledgerBookId, glAccountId: body.glAccountId,
        effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
        priority: body.priority,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/mutations/posting-role-account-map/:mappingId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const mappingId = String(ctx.params["mappingId"] ?? "");
      const body = ctx.body as { companyCode?: string };
      if (!mappingId || !body.companyCode) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "mappingId and companyCode are required." } };
      }
      const result = await retirePostingRoleAccountMap(db, {
        tenantId: ctx.tenantId, actorId: ctx.principalId, mappingId, companyCode: body.companyCode,
      });
      return { status: 200, body: result };
    }),
  );

  router.put("/finance/setup/mutations/fiscal-calendar/:calendarId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const calendarId = String(ctx.params["calendarId"] ?? "");
      if (!calendarId) return { status: 400, body: { error: "MISSING_PARAMS", message: "calendarId is required." } };
      const body = ctx.body as Omit<SaveFiscalCalendarInput, "tenantId" | "actorId" | "calendarId">;
      const result = await saveFiscalCalendar(db, {
        ...body,
        tenantId: ctx.tenantId,
        actorId: ctx.principalId,
        calendarId,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/mutations/fiscal-calendar/:calendarId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const calendarId = String(ctx.params["calendarId"] ?? "");
      if (!calendarId) return { status: 400, body: { error: "MISSING_PARAMS", message: "calendarId is required." } };
      const result = await retireFiscalCalendar(db, ctx.tenantId, ctx.principalId, calendarId);
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/fiscal-calendar-assignments/:calendarId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const calendarId = String(ctx.params["calendarId"] ?? "");
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const body = ctx.body as { fiscalYearFrom?: number };
      if (!calendarId || !companyCode || !Number.isInteger(body.fiscalYearFrom)) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "calendarId, companyCode, and fiscalYearFrom are required." } };
      }
      const result = await assignFiscalCalendar(db, {
        tenantId: ctx.tenantId,
        actorId: ctx.principalId,
        companyCode,
        calendarId,
        fiscalYearFrom: body.fiscalYearFrom!,
      });
      return { status: 200, body: result };
    }),
  );

  router.post("/finance/setup/company/:companyCode/fiscal-periods/:fiscalYear/generate",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const companyCode = String(ctx.params["companyCode"] ?? "");
      const fiscalYear = Number(ctx.params["fiscalYear"]);
      const body = ctx.body as { calendarId?: string };
      if (!companyCode || !body.calendarId || !Number.isInteger(fiscalYear)) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "calendarId, companyCode, and fiscalYear are required." } };
      }
      const result = await generateFiscalPeriods(db, {
        tenantId: ctx.tenantId,
        actorId: ctx.principalId,
        companyCode,
        calendarId: body.calendarId,
        fiscalYear,
      });
      return { status: 200, body: result };
    }),
  );
}

/**
 * Factory for mutation handlers with:
 *   - Bearer + tenant resolution
 *   - Principal resolution (resolvePrincipalIdWithJit — canonical)
 *   - Optional Phase 3 permission check
 *   - Typed error mapping (Service errors carry .status + .code)
 */
function createMutationHandler(
  deps: FinanceRouteDeps,
  permissionCode: string,
  runner: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    ctx: {
      tenantId:    string;
      principalId: string;
      params:      Record<string, unknown>;
      body:        unknown;
      correlationId?: string;
    },
  ) => Promise<{ status: number; body: unknown }>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(deps.db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved." });
        return;
      }

      // Company-scoped command routes must remain inside the session's active
      // Legal Entity even before detailed Phase 3 permission enforcement lands.
      const routeCompanyCode = String(req.params["companyCode"] ?? "").trim();
      const activeLegalEntityId = String(req.headers["x-legal-entity-id"] ?? "").trim();
      if (routeCompanyCode) {
        const scopedCompany = await deps.db
          .selectFrom("master.company_code as cc")
          .select("cc.id")
          .where("cc.tenant_id", "=", tenantId)
          .where("cc.code", "=", routeCompanyCode)
          .$if(Boolean(activeLegalEntityId), (query) => query.where("cc.legal_entity_id", "=", activeLegalEntityId))
          .executeTakeFirst();
        if (!scopedCompany) {
          res.status(404).json({ error: "COMPANY_NOT_FOUND", message: "Company is not available in the active tenant and Legal Entity." });
          return;
        }
      }

      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(deps.db, sub, tenantId, xRealm, claims)
        : null;
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_RESOLVED", message: "Actor principal could not be resolved." });
        return;
      }

      if (ENFORCE_PHASE3_FINANCE_SETUP_PERMISSION) {
        const decision = await checkPermission(deps.db, tenantId, principalId, permissionCode);
        if (decision.decision !== "allow") {
          res.status(403).json({
            error:   "PERMISSION_DENIED",
            message: `Missing permission ${permissionCode}.`,
            details: { decision: decision.decision, reason: decision.reason },
          });
          return;
        }
      }

      try {
        const result = await runner(deps.db, {
          tenantId,
          principalId,
          params: (req.params as Record<string, unknown>) ?? {},
          body:   req.body ?? {},
          correlationId: String(req.headers["x-trace-id"] ?? req.headers["x-request-id"] ?? "") || undefined,
        });
        res.status(result.status).json(result.body);
      } catch (err) {
        const anyErr = err as Error & { status?: number; code?: string; details?: Record<string, unknown> };
        if (typeof anyErr.status === "number") {
          res.status(anyErr.status).json({
            error:   anyErr.code ?? "MUTATION_FAILED",
            message: anyErr.message,
            details: anyErr.details,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      deps.logger?.error("finance_setup_mutation_error", { err: String(err) });
      next(err);
    }
  };
}

/**
 * Factory for the common scoped GET pattern: verify bearer → resolve tenant →
 * require scopeType=company + scopeCode → call the handler → JSON response.
 */
function createScopedGetHandler(
  deps: FinanceRouteDeps,
  runner: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    tenantId: string,
    scopeCode: string,
    req: Request,
  ) => Promise<{ status: number; body: unknown }>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(deps.db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Tenant could not be resolved from x-org/x-realm." });
        return;
      }

      const scopeType = String(req.query["scopeType"] ?? "");
      const scopeCode = String(req.query["scopeCode"] ?? "");
      if (scopeType !== "company") {
        res.status(501).json({ error: "NOT_IMPLEMENTED", message: `scopeType=${scopeType} not supported until Phase 1.6.` });
        return;
      }
      if (!scopeCode) {
        res.status(400).json({ error: "MISSING_SCOPE", message: "scopeCode is required." });
        return;
      }

      const result = await runner(deps.db, tenantId, scopeCode, req);
      res.status(result.status).json(result.body);
    } catch (err) {
      deps.logger?.error("finance_setup_workspace_error", { err: String(err) });
      next(err);
    }
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
