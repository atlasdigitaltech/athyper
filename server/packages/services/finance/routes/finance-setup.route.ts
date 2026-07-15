/**
 * Finance Setup Workbench — read-only endpoints (Phase 1).
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

import type { RequestHandler, Router } from "express";
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
  setPrimaryBook,
  toggleHouseBank,
} from "../services/finance-setup-mutations.service.js";

export function createFinanceSetupRoutes(router: Router, deps: FinanceRouteDeps): void {
  const { db, auth, logger } = deps;

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
    "/finance/setup/configure/book-assignments",
    createScopedGetHandler(deps, async (db, tenantId, scopeCode) => {
      const rows = await loadBookAssignments(db, tenantId, scopeCode);
      return { status: 200, body: rows };
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
  // All mutations require permission `FINANCE_SETUP.CONFIGURE` on the tenant.
  // Actor is resolved via resolvePrincipalIdWithJit (canonical pattern).
  // On success we return 200 with the mutation result body.

  router.post("/finance/setup/mutations/gl-control/assign",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const body = ctx.body as {
        companyCode:          string;
        glAccountCode:        string;
        postingAllowed?:      boolean;
        blockedForManual?:    boolean;
        blockedForAuto?:      boolean;
        requiresCostCenter?:  boolean;
        requiresProfitCenter?:boolean;
        requiresProject?:     boolean;
        reconciliationType?:  string | null;
        taxCategory?:         string | null;
      };
      if (!body.companyCode || !body.glAccountCode) {
        return { status: 400, body: { error: "MISSING_PARAMS", message: "companyCode and glAccountCode are required." } };
      }
      const result = await assignGlControl(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        companyCode:          body.companyCode,
        glAccountCode:        body.glAccountCode,
        postingAllowed:       body.postingAllowed,
        blockedForManual:     body.blockedForManual,
        blockedForAuto:       body.blockedForAuto,
        requiresCostCenter:   body.requiresCostCenter,
        requiresProfitCenter: body.requiresProfitCenter,
        requiresProject:      body.requiresProject,
        reconciliationType:   body.reconciliationType,
        taxCategory:          body.taxCategory,
      });
      return { status: 200, body: result };
    }),
  );

  router.patch("/finance/setup/mutations/gl-control/:controlId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const controlId = ctx.params["controlId"] as string;
      if (!controlId) return { status: 400, body: { error: "MISSING_PARAMS", message: "controlId is required." } };
      const body = ctx.body as Record<string, unknown>;
      const result = await updateGlControl(db, {
        tenantId:              ctx.tenantId,
        actorId:               ctx.principalId,
        controlId,
        postingAllowed:        body["postingAllowed"]        as boolean | undefined,
        blockedForManual:      body["blockedForManual"]      as boolean | undefined,
        blockedForAuto:        body["blockedForAuto"]        as boolean | undefined,
        requiresCostCenter:    body["requiresCostCenter"]    as boolean | undefined,
        requiresProfitCenter:  body["requiresProfitCenter"]  as boolean | undefined,
        requiresProject:       body["requiresProject"]       as boolean | undefined,
        reconciliationType:    body["reconciliationType"]    as string | null | undefined,
        taxCategory:           body["taxCategory"]           as string | null | undefined,
      });
      return { status: 200, body: result };
    }),
  );

  router.delete("/finance/setup/mutations/gl-control/:controlId",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const controlId = ctx.params["controlId"] as string;
      if (!controlId) return { status: 400, body: { error: "MISSING_PARAMS", message: "controlId is required." } };
      const result = await deactivateGlControl(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        controlId,
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

  router.post("/finance/setup/mutations/book/:bookId/set-primary",
    createMutationHandler(deps, "FINANCE_SETUP.CONFIGURE", async (db, ctx) => {
      const bookId = ctx.params["bookId"] as string;
      if (!bookId) return { status: 400, body: { error: "MISSING_PARAMS", message: "bookId is required." } };
      const result = await setPrimaryBook(db, {
        tenantId:  ctx.tenantId,
        actorId:   ctx.principalId,
        bookId,
      });
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
}

/**
 * Factory for mutation handlers with:
 *   - Bearer + tenant resolution
 *   - Principal resolution (resolvePrincipalIdWithJit — canonical)
 *   - Permission check
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

      // Permission gate — fail closed.
      const decision = await checkPermission(deps.db, tenantId, principalId, permissionCode);
      if (decision.decision !== "allow") {
        res.status(403).json({
          error:   "PERMISSION_DENIED",
          message: `Missing permission ${permissionCode}.`,
          details: { decision: decision.decision, reason: decision.reason },
        });
        return;
      }

      try {
        const result = await runner(deps.db, {
          tenantId,
          principalId,
          params: (req.params as Record<string, unknown>) ?? {},
          body:   req.body ?? {},
        });
        res.status(result.status).json(result.body);
      } catch (err) {
        const anyErr = err as Error & { status?: number; code?: string };
        if (typeof anyErr.status === "number") {
          res.status(anyErr.status).json({
            error:   anyErr.code ?? "MUTATION_FAILED",
            message: anyErr.message,
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

      const result = await runner(deps.db, tenantId, scopeCode);
      res.status(result.status).json(result.body);
    } catch (err) {
      deps.logger?.error("finance_setup_workspace_error", { err: String(err) });
      next(err);
    }
  };
}
