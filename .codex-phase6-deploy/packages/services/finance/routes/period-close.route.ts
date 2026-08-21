/**
 * Period Close Dashboard Routes
 *
 * GET  /api/finance/period-close/runs                       — FINANCE cycle runs for a scope + period
 * POST /api/finance/period-close/runs                       — Start a new close run
 * GET  /api/finance/period-close/runs/:runId/tasks          — tasks within a cycle run
 * POST /api/finance/period-close/runs/:runId/tasks/:taskId/action — complete/reopen a task
 * POST /api/finance/period-close/runs/:runId/sign-off       — sign off a phase, advance/complete run
 * GET  /api/finance/period-close/checklist                  — aggregated task checklist across runs
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { type FinanceRouteDeps, parseScopeParams, resolveCompanyIds } from "./finance.route.js";
import { verifyBearer, resolveTenantId, resolvePrincipalIdOrNull } from "@athyper/svc-shared";
import {
  evaluateFinanceGovernanceTask,
  hashCertificationSnapshot,
} from "../services/finance-governance.service.js";
import { loadCompanyCertificationReadiness } from "../services/finance-certification-readiness.service.js";

export function createPeriodCloseRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/finance/period-close/runs ────────────────────────────────────
  // Lists FINANCE domain cycle runs for company codes in scope + fiscal year/period.
  // governance.cycle_run.entity_code = master.company_code.code (varchar(20))
  router.get("/finance/period-close/runs", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json([]); return; }
      const companyCodes = companies.map((c) => c.company_code);
      const cycleTypeCode = typeof req.query["cycleTypeCode"] === "string"
        ? req.query["cycleTypeCode"].trim()
        : "";

      let q = db
        .selectFrom("governance.cycle_run as cr")
        .innerJoin("governance.cycle_type as ct", (jb) =>
          jb.onRef("ct.id", "=", "cr.cycle_type_id").on("ct.tenant_id", "=", tenantId),
        )
        .leftJoin("governance.cycle_phase as cp", (jb) =>
          jb.onRef("cp.id", "=", "cr.current_phase_id")
            .onRef("cp.cycle_type_id", "=", "ct.id")
            .on("cp.tenant_id", "=", tenantId),
        )
        .select([
          "cr.id", "cr.entity_code as entityCode",
          "cr.fiscal_year as fiscalYear", "cr.period_number as periodNumber",
          "cr.run_number as runNumber", "cr.status",
          "cr.period_end_date as periodEndDate",
          "cr.cycle_start_date as cycleStartDate",
          "cr.cycle_target_date as cycleTargetDate",
          "cr.started_at as startedAt", "cr.completed_at as completedAt",
          "cr.certified_at as certifiedAt",
          "ct.type_code as cycleTypeCode", "ct.type_name as cycleTypeName",
          "ct.frequency",
          "cp.phase_code as currentPhaseCode", "cp.phase_name as currentPhaseName",
        ])
        .where("cr.tenant_id", "=", tenantId)
        .where("ct.domain", "=", "FINANCE")
        .where("cr.entity_code", "in", companyCodes)
        .where("cr.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("cr.period_number", "=", parsed.period) as typeof q;
      if (cycleTypeCode) {
        const acceptedCodes = cycleTypeCode === "OPENING_BALANCE_MIGRATION"
          ? ["OPENING_BALANCE_MIGRATION", "OPENING_BALANCE"]
          : [cycleTypeCode];
        q = q.where("ct.type_code", "in", acceptedCodes) as typeof q;
      }

      const runs = await q
        .orderBy("cr.fiscal_year", "desc")
        .orderBy("cr.period_number", "desc")
        .orderBy("cr.run_number", "desc")
        .execute();

      // Enrich each run with task summary counts
      const runIds = runs.map((r) => (r as Record<string, unknown>)["id"] as string);
      const taskCounts = runIds.length > 0
        ? await db
            .selectFrom("governance.cycle_task as ctsk")
            .select([
              "ctsk.cycle_run_id as runId",
              db.fn.countAll().as("total"),
              db.fn.count("ctsk.id").filterWhere("ctsk.status", "=", "COMPLETED").as("completed"),
              db.fn.count("ctsk.id").filterWhere("ctsk.status", "=", "FAILED").as("failed"),
              db.fn.count("ctsk.id").filterWhere("ctsk.status", "=", "BLOCKED").as("blocked"),
              db.fn.count("ctsk.id").filterWhere("ctsk.status", "=", "IN_PROGRESS").as("inProgress"),
            ])
            .where("ctsk.tenant_id", "=", tenantId)
            .where("ctsk.cycle_run_id", "in", runIds)
            .groupBy("ctsk.cycle_run_id")
            .execute() as Array<{ runId: string; total: string; completed: string; failed: string; blocked: string; inProgress: string }>
        : [];

      const countMap = new Map(taskCounts.map((tc) => [tc.runId, tc]));

      const result = runs.map((run) => {
        const runId = (run as Record<string, unknown>)["id"] as string;
        const tc = countMap.get(runId);
        const total = Number(tc?.total ?? 0);
        const completed = Number(tc?.completed ?? 0);
        return {
          ...run,
          taskSummary: {
            total,
            completed,
            failed:     Number(tc?.failed ?? 0),
            blocked:    Number(tc?.blocked ?? 0),
            inProgress: Number(tc?.inProgress ?? 0),
            pending:    total - completed,
            completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
          },
        };
      });

      res.json(result);
    } catch (err) { logger?.error("finance_period_close_runs_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/period-close/runs/:runId/tasks ───────────────────────
  // Returns all tasks for a cycle run, grouped by phase.
  router.get("/finance/period-close/runs/:runId/tasks", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json([]); return; }

      const runId = req.params["runId"] as string;

      // Verify tenant owns the run
      const run = await db
        .selectFrom("governance.cycle_run as cr")
        .select(["cr.id", "cr.entity_code as entityCode", "cr.status",
          "cr.fiscal_year as fiscalYear", "cr.period_number as periodNumber"])
        .where("cr.tenant_id", "=", tenantId)
        .where("cr.id", "=", runId)
        .executeTakeFirst();
      if (!run) { res.status(404).json({ error: "Cycle run not found" }); return; }

      const tasks = await db
        .selectFrom("governance.cycle_task as ctsk")
        .innerJoin("governance.cycle_task_template as tpl", "tpl.id", "ctsk.template_id")
        .innerJoin("governance.cycle_phase as cph", (jb) =>
          jb.onRef("cph.id", "=", "ctsk.phase_id").on("cph.tenant_id", "=", tenantId),
        )
        .innerJoin("governance.cycle_task_category as ctcat", (jb) =>
          jb.onRef("ctcat.id", "=", "ctsk.category_id").on("ctcat.tenant_id", "=", tenantId),
        )
        .select([
          "ctsk.id", "ctsk.task_code as taskCode",
          "ctsk.status", "ctsk.is_mandatory as isMandatory",
          "ctsk.assigned_to as assignedTo", "ctsk.assigned_role as assignedRole",
          "ctsk.due_at as dueAt",
          "ctsk.completed_by as completedBy", "ctsk.completed_at as completedAt",
          "ctsk.completion_notes as completionNotes",
          "ctsk.evidence_payload as evidencePayload",
          "ctsk.failure_reason as failureReason",
          "tpl.task_name as taskName", "tpl.description",
          "tpl.completion_mode as completionMode",
          "tpl.system_check_handler as systemCheckHandler",
          "tpl.severity", "tpl.sla_hours as slaHours",
          "tpl.sort_order as sortOrder",
          "cph.phase_code as phaseCode", "cph.phase_name as phaseName",
          "cph.sort_order as phaseOrder",
          "ctcat.category_code as categoryCode", "ctcat.category_name as categoryName",
        ])
        .where("ctsk.tenant_id", "=", tenantId)
        .where("ctsk.cycle_run_id", "=", runId)
        .orderBy("cph.sort_order", "asc")
        .orderBy("tpl.sort_order", "asc")
        .execute() as Array<Record<string, unknown>>;

      // Group by phase for structured rendering
      const byPhase = new Map<string, { phaseCode: string; phaseName: string; phaseOrder: number; tasks: typeof tasks }>();
      for (const task of tasks) {
        const phaseCode = task["phaseCode"] as string;
        if (!byPhase.has(phaseCode)) {
          byPhase.set(phaseCode, {
            phaseCode,
            phaseName: task["phaseName"] as string,
            phaseOrder: task["phaseOrder"] as number,
            tasks: [],
          });
        }
        byPhase.get(phaseCode)!.tasks.push(task);
      }

      const phases = [...byPhase.values()].sort((a, b) => a.phaseOrder - b.phaseOrder);

      res.json({ run, phases, totalTasks: tasks.length });
    } catch (err) { logger?.error("finance_period_close_tasks_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /api/finance/period-close/checklist ───────────────────────────────
  // Flat task checklist across all FINANCE runs for a company + period (quick dashboard view).
  router.get("/finance/period-close/checklist", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ tasks: [] }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }
      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ tasks: [] }); return; }
      const companyCodes = companies.map((c) => c.company_code);

      // Find the latest run for the period
      const latestRuns = await db
        .selectFrom("governance.cycle_run as cr")
        .innerJoin("governance.cycle_type as ct", (jb) =>
          jb.onRef("ct.id", "=", "cr.cycle_type_id").on("ct.tenant_id", "=", tenantId),
        )
        .select([
          "cr.id", "cr.entity_code as entityCode",
          "cr.status", "cr.run_number as runNumber",
        ])
        .where("cr.tenant_id", "=", tenantId)
        .where("ct.domain", "=", "FINANCE")
        .where("cr.entity_code", "in", companyCodes)
        .where("cr.fiscal_year", "=", parsed.fiscalYear)
        .$if(parsed.period !== null, (qb) => qb.where("cr.period_number", "=", parsed.period as number))
        .orderBy("cr.run_number", "desc")
        .execute() as Array<{ id: string; entityCode: string; status: string; runNumber: number }>;

      if (latestRuns.length === 0) { res.json({ tasks: [] }); return; }

      // Get tasks for the first (latest) run
      const primaryRunId = latestRuns[0]!.id;
      const tasks = await db
        .selectFrom("governance.cycle_task as ctsk")
        .innerJoin("governance.cycle_task_template as tpl", "tpl.id", "ctsk.template_id")
        .innerJoin("governance.cycle_phase as cph", (jb) =>
          jb.onRef("cph.id", "=", "ctsk.phase_id").on("cph.tenant_id", "=", tenantId),
        )
        .innerJoin("governance.cycle_task_category as ctcat", (jb) =>
          jb.onRef("ctcat.id", "=", "ctsk.category_id").on("ctcat.tenant_id", "=", tenantId),
        )
        .select([
          "ctsk.id", "ctsk.task_code as taskCode", "ctsk.status",
          "ctsk.is_mandatory as isMandatory", "ctsk.due_at as dueAt",
          "ctsk.completed_at as completedAt",
          "tpl.task_name as taskName", "tpl.severity",
          "cph.phase_code as phaseCode", "cph.phase_name as phaseName",
          "ctcat.category_code as categoryCode", "ctcat.category_name as categoryName",
        ])
        .where("ctsk.tenant_id", "=", tenantId)
        .where("ctsk.cycle_run_id", "=", primaryRunId)
        .orderBy("cph.sort_order", "asc")
        .orderBy("tpl.sort_order", "asc")
        .execute();

      const total     = tasks.length;
      const completed = tasks.filter((t) => (t as Record<string, unknown>)["status"] === "COMPLETED").length;
      res.json({
        runId: primaryRunId,
        runStatus: latestRuns[0]!.status,
        tasks,
        summary: {
          total, completed,
          completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
          open: tasks.filter((t) => ["PENDING", "IN_PROGRESS"].includes((t as Record<string, unknown>)["status"] as string)).length,
          blocked: tasks.filter((t) => (t as Record<string, unknown>)["status"] === "BLOCKED").length,
          failed: tasks.filter((t) => (t as Record<string, unknown>)["status"] === "FAILED").length,
        },
      });
    } catch (err) { logger?.error("finance_checklist_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/period-close/runs ──────────────────────────────────────
  // Start a new close run for a company + period. Materialises tasks from templates.
  router.post("/finance/period-close/runs", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const sub    = claims["sub"] as string ?? "";
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const body = req.body as Record<string, unknown>;
      const { scopeId, fiscalYear, periodNumber, cycleTypeCode = "MONTHLY_CLOSE", runData = {} } = body as {
        scopeId: string; fiscalYear: number; periodNumber: number; cycleTypeCode?: string; runData?: Record<string, unknown>;
      };

      if (!scopeId || !fiscalYear || periodNumber === undefined || periodNumber === null) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "scopeId, fiscalYear, and periodNumber are required" });
        return;
      }

      // Resolve company_code from scopeId
      const companies = await resolveCompanyIds(db, tenantId, { scopeType: "company", scopeId });
      if (companies.length === 0) { res.status(404).json({ error: "COMPANY_NOT_FOUND" }); return; }
      const companyCode = companies[0]!.company_code as string;
      const companyCodeId = companies[0]!.company_code_id as string;

      // Find the cycle type for FINANCE domain
      const cycleType = await db
        .selectFrom("governance.cycle_type as ct")
        .select(["ct.id", "ct.type_code"])
        .where("ct.tenant_id", "=", tenantId)
        .where("ct.domain",    "=", "FINANCE")
        .where("ct.type_code", "in", String(cycleTypeCode) === "OPENING_BALANCE_MIGRATION"
          ? ["OPENING_BALANCE_MIGRATION", "OPENING_BALANCE"]
          : [String(cycleTypeCode)])
        .where("ct.is_active", "=", true)
        .executeTakeFirst() as { id: string; type_code: string } | undefined;

      if (!cycleType) {
        res.status(422).json({ error: "CYCLE_TYPE_NOT_FOUND", cycleTypeCode });
        return;
      }

      if (["OPENING_BALANCE_MIGRATION", "OPENING_BALANCE"].includes(cycleType.type_code) && periodNumber !== 0) {
        res.status(422).json({
          error: "OPENING_BALANCE_REQUIRES_PERIOD_0",
          message: "Opening-balance cycles can only be started for fiscal period 0.",
        });
        return;
      }
      if (["OPENING_BALANCE_MIGRATION", "OPENING_BALANCE"].includes(cycleType.type_code)) {
        const requiredRunData = ["migration_strategy", "source_system", "source_cutoff_date"];
        const missingRunData = requiredRunData.filter((key) => {
          const value = runData[key];
          return typeof value !== "string" || value.trim().length === 0;
        });
        if (missingRunData.length > 0) {
          res.status(400).json({
            error: "OPENING_BALANCE_CONTEXT_REQUIRED",
            message: "Opening-balance cycles require migration_strategy, source_system, and source_cutoff_date.",
            missing: missingRunData,
          });
          return;
        }
      }

      // Determine next run_number
      const lastRun = await db
        .selectFrom("governance.cycle_run as cr")
        .select(db.fn.max("cr.run_number").as("maxRun"))
        .where("cr.tenant_id",    "=", tenantId)
        .where("cr.entity_code",  "=", companyCode)
        .where("cr.cycle_type_id","=", cycleType.id)
        .where("cr.fiscal_year",  "=", fiscalYear)
        .where("cr.period_number","=", periodNumber)
        .executeTakeFirst() as { maxRun: number | null } | undefined;

      const runNumber = (lastRun?.maxRun ?? 0) + 1;

      // Resolve the generated fiscal period. This supports non-calendar-year,
      // 4-4-5, 13-period, and custom calendars without duplicating date math.
      const fiscalPeriod = await db
        .selectFrom("master.fiscal_period as fp")
        .select(["fp.id", "fp.end_date as endDate", "fp.period_type as periodType"])
        .where("fp.tenant_id", "=", tenantId)
        .where("fp.company_code_id", "=", companyCodeId)
        .where("fp.fiscal_year", "=", fiscalYear)
        .where("fp.period_number", "=", periodNumber)
        .executeTakeFirst() as { id: string; endDate: string | Date; periodType: string } | undefined;

      if (!fiscalPeriod) {
        res.status(422).json({
          error: "FISCAL_PERIOD_NOT_GENERATED",
          message: `Generate FY ${fiscalYear} period ${periodNumber} before starting its close cycle.`,
        });
        return;
      }
      const periodEndDate = fiscalPeriod.endDate instanceof Date
        ? fiscalPeriod.endDate.toISOString().slice(0, 10)
        : String(fiscalPeriod.endDate).slice(0, 10);

      // Get the first phase for this cycle type
      const firstPhase = await db
        .selectFrom("governance.cycle_phase as cp")
        .select(["cp.id"])
        .where("cp.tenant_id",    "=", tenantId)
        .where("cp.cycle_type_id","=", cycleType.id)
        .where("cp.is_active",    "=", true)
        .orderBy("cp.sort_order", "asc")
        .executeTakeFirst() as { id: string } | undefined;

      // Create the cycle run
      const today = new Date();
      const targetDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // default +7 days

      const [newRun] = await db
        .insertInto("governance.cycle_run")
        .values({
          tenant_id:         tenantId,
          entity_code:       companyCode,
          cycle_type_id:     cycleType.id,
          fiscal_year:       fiscalYear,
          period_number:     periodNumber,
          run_number:        runNumber,
          status:            "OPEN",
          current_phase_id:  firstPhase?.id ?? null,
          period_end_date:   periodEndDate,
          cycle_start_date:  today.toISOString().slice(0, 10),
          cycle_target_date: targetDate.toISOString().slice(0, 10),
          started_at:        new Date(),
          started_by:        principalId,
          domain_data:       { ...runData, company_code: companyCode },
          created_by:        principalId,
        })
        .returning(["id"])
        .execute() as Array<{ id: string }>;

      if (!newRun) { res.status(500).json({ error: "RUN_CREATE_FAILED" }); return; }

      // Materialise tasks from templates
      const templates = await db
        .selectFrom("governance.cycle_task_template as tpl")
        .select([
          "tpl.id", "tpl.phase_id", "tpl.category_id", "tpl.task_code",
          "tpl.is_mandatory", "tpl.default_owner_role", "tpl.default_owner_user_id", "tpl.sla_hours",
        ])
        .where("tpl.tenant_id",    "=", tenantId)
        .where("tpl.cycle_type_id","=", cycleType.id)
        .where("tpl.entity_code",  "=", companyCode)
        .where("tpl.is_active",    "=", true)
        .execute() as Array<{
          id: string; phase_id: string; category_id: string; task_code: string;
          is_mandatory: boolean; default_owner_role: string | null;
          default_owner_user_id: string | null; sla_hours: number | null;
        }>;

      if (templates.length > 0) {
        const now = new Date();
        await db
          .insertInto("governance.cycle_task")
          .values(templates.map((tpl) => ({
            tenant_id:    tenantId,
            entity_code:  companyCode,
            cycle_run_id: newRun.id,
            template_id:  tpl.id,
            phase_id:     tpl.phase_id,
            category_id:  tpl.category_id,
            task_code:    tpl.task_code,
            is_mandatory: tpl.is_mandatory,
            assigned_to:  tpl.default_owner_user_id,
            assigned_role:tpl.default_owner_role,
            status:       "PENDING",
            due_at:       tpl.sla_hours
              ? new Date(now.getTime() + tpl.sla_hours * 60 * 60 * 1000)
              : null,
            created_by:   principalId,
          })))
          .execute();
      }

      res.status(201).json({ id: newRun.id, runNumber, taskCount: templates.length });
    } catch (err) { logger?.error("period_close_start_run_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/period-close/runs/:runId/tasks/:taskId/action ──────────
  // Complete or reopen a cycle task.
  router.post("/finance/period-close/runs/:runId/tasks/:taskId/action", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const sub    = claims["sub"] as string ?? "";
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const runId  = req.params["runId"]  as string;
      const taskId = req.params["taskId"] as string;
      const { action, remarks, evidencePayload } = req.body as {
        action: "complete" | "reopen" | "evaluate";
        remarks?: string;
        evidencePayload?: Record<string, unknown>;
      };

      if (!['complete', 'reopen', 'evaluate'].includes(action)) {
        res.status(400).json({ error: "INVALID_ACTION", message: "action must be 'complete', 'reopen', or 'evaluate'" });
        return;
      }

      // Verify the task belongs to the run and tenant
      const task = await db
        .selectFrom("governance.cycle_task as ctsk")
        .innerJoin("governance.cycle_run as cr", (jb) =>
          jb.onRef("cr.id", "=", "ctsk.cycle_run_id")
            .on("cr.tenant_id", "=", tenantId),
        )
        .innerJoin("governance.cycle_task_template as tpl", (jb) =>
          jb.onRef("tpl.id", "=", "ctsk.template_id").on("tpl.tenant_id", "=", tenantId),
        )
        .select([
          "ctsk.id", "ctsk.status", "ctsk.is_mandatory", "ctsk.phase_id as phaseId",
          "cr.current_phase_id as currentPhaseId", "tpl.completion_mode as completionMode",
          "tpl.system_check_handler as systemCheckHandler",
        ])
        .where("ctsk.id",          "=", taskId)
        .where("ctsk.cycle_run_id","=", runId)
        .where("ctsk.tenant_id",   "=", tenantId)
        .executeTakeFirst() as {
          id: string; status: string; is_mandatory: boolean; phaseId: string;
          currentPhaseId: string | null; completionMode: string; systemCheckHandler: string | null;
        } | undefined;

      if (!task) { res.status(404).json({ error: "TASK_NOT_FOUND" }); return; }

      if (action !== "reopen" && task.phaseId !== task.currentPhaseId) {
        res.status(422).json({ error: "TASK_PHASE_NOT_ACTIVE", message: "Only tasks in the run's current phase can be executed." });
        return;
      }

      if (action !== "reopen") {
        const { rows: dependencyRows } = await sql<{
          can_start: boolean; blocking_count: number; blocking_tasks: string[];
        }>`SELECT * FROM governance.check_task_dependencies(${runId}::uuid, ${taskId}::uuid)`.execute(db);
        const dependency = dependencyRows[0];
        if (dependency && !dependency.can_start) {
          res.status(422).json({
            error: "TASK_DEPENDENCY_BLOCKED",
            blockers: dependency.blocking_tasks,
          });
          return;
        }
      }

      if (action === "evaluate") {
        if (task.completionMode === "MANUAL" || !task.systemCheckHandler) {
          res.status(422).json({ error: "TASK_NOT_EXECUTABLE", message: "This task has no system-check handler." });
          return;
        }
        const result = await evaluateFinanceGovernanceTask(db, { tenantId, runId, taskId });
        if (!result) { res.status(422).json({ error: "TASK_NOT_EXECUTABLE" }); return; }
        const now = new Date();
        await db.updateTable("governance.cycle_task").set(result.passed ? {
          status: "COMPLETED", completed_at: now, completed_by: principalId,
          completion_notes: result.summary, evidence_payload: result,
          failure_reason: null, failed_at: null, updated_at: now, updated_by: principalId,
          execution_meta: { last_handler: result.handler, last_checked_at: result.checkedAt },
        } : {
          status: "FAILED", completed_at: null, completed_by: null,
          completion_notes: null, evidence_payload: result,
          failure_reason: result.summary, failed_at: now, updated_at: now, updated_by: principalId,
          execution_meta: { last_handler: result.handler, last_checked_at: result.checkedAt },
        }).where("id", "=", taskId).where("tenant_id", "=", tenantId).execute();
        res.json({ taskId, action, status: result.passed ? "COMPLETED" : "FAILED", result });
        return;
      }

      if (action === "complete") {
        if (task.completionMode === "SYSTEM") {
          res.status(422).json({ error: "SYSTEM_TASK_REQUIRES_EVALUATION", message: "Run the system check; system tasks cannot be manually completed." });
          return;
        }
        if (!["PENDING", "IN_PROGRESS", "FAILED"].includes(task.status)) {
          res.status(422).json({ error: "INVALID_STATUS", message: `Task is ${task.status}, cannot complete` });
          return;
        }
        await db
          .updateTable("governance.cycle_task")
          .set({
            status:           "COMPLETED",
            completed_at:     new Date(),
            completed_by:     principalId,
            completion_notes: remarks ?? null,
            evidence_payload: evidencePayload ?? {},
            failure_reason:   null,
            updated_at:       new Date(),
            updated_by:       principalId,
          })
          .where("id",         "=", taskId)
          .where("tenant_id",  "=", tenantId)
          .execute();

        // Transition run to IN_PROGRESS if it was OPEN
        await db
          .updateTable("governance.cycle_run")
          .set({ status: "IN_PROGRESS", updated_at: new Date(), updated_by: principalId })
          .where("id",        "=", runId)
          .where("tenant_id", "=", tenantId)
          .where("status",    "=", "OPEN")
          .execute();
      } else {
        if (task.status !== "COMPLETED") {
          res.status(422).json({ error: "INVALID_STATUS", message: "Only completed tasks can be reopened" });
          return;
        }
        await db
          .updateTable("governance.cycle_task")
          .set({
            status:           "PENDING",
            completed_at:     null,
            completed_by:     null,
            completion_notes: null,
            updated_at:       new Date(),
            updated_by:       principalId,
          })
          .where("id",         "=", taskId)
          .where("tenant_id",  "=", tenantId)
          .execute();
      }

      res.json({ taskId, action, status: action === "complete" ? "COMPLETED" : "PENDING" });
    } catch (err) { logger?.error("period_close_task_action_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /api/finance/period-close/runs/:runId/sign-off ───────────────────────
  // Sign off a phase: validates blockers, advances current_phase_id (or completes run).
  router.post("/finance/period-close/runs/:runId/sign-off", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const sub    = claims["sub"] as string ?? "";
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const runId = req.params["runId"] as string;
      const { phaseCode, remarks } = req.body as { phaseCode: string; remarks?: string };

      if (!phaseCode) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "phaseCode is required" });
        return;
      }

      // Load the run and verify ownership
      const run = await db
        .selectFrom("governance.cycle_run as cr")
        .innerJoin("governance.cycle_type as ct", (jb) =>
          jb.onRef("ct.id", "=", "cr.cycle_type_id").on("ct.tenant_id", "=", tenantId),
        )
        .select(["cr.id", "cr.status", "cr.cycle_type_id", "cr.current_phase_id as currentPhaseId", "ct.id as ctId"])
        .where("cr.id",        "=", runId)
        .where("cr.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; status: string; cycle_type_id: string; currentPhaseId: string | null; ctId: string } | undefined;

      if (!run) { res.status(404).json({ error: "RUN_NOT_FOUND" }); return; }
      if (["COMPLETED", "CERTIFIED", "CLOSED"].includes(run.status)) {
        res.status(422).json({ error: "RUN_ALREADY_CLOSED" }); return;
      }

      // Resolve the phase being signed off
      const phase = await db
        .selectFrom("governance.cycle_phase as cp")
        .select(["cp.id", "cp.sort_order"])
        .where("cp.tenant_id",    "=", tenantId)
        .where("cp.cycle_type_id","=", run.cycle_type_id)
        .where("cp.phase_code",   "=", phaseCode)
        .where("cp.is_active",    "=", true)
        .executeTakeFirst() as { id: string; sort_order: number } | undefined;

      if (!phase) { res.status(404).json({ error: "PHASE_NOT_FOUND", phaseCode }); return; }
      if (run.currentPhaseId !== phase.id) {
        res.status(422).json({ error: "PHASE_NOT_ACTIVE", message: "Only the run's current phase can be signed off." });
        return;
      }

      // Blocker check — mandatory incomplete / failed / blocked tasks in this phase
      const tasks = await db
        .selectFrom("governance.cycle_task as ctsk")
        .select(["ctsk.id", "ctsk.status", "ctsk.is_mandatory"])
        .where("ctsk.tenant_id",   "=", tenantId)
        .where("ctsk.cycle_run_id","=", runId)
        .where("ctsk.phase_id",    "=", phase.id)
        .execute() as Array<{ id: string; status: string; is_mandatory: boolean }>;

      const blockers = tasks.filter(
        (t) => t.is_mandatory && !["COMPLETED"].includes(t.status)
      ).concat(tasks.filter((t) => ["FAILED", "BLOCKED"].includes(t.status)));

      if (blockers.length > 0) {
        res.status(422).json({
          error: "SIGN_OFF_BLOCKED",
          blockers: blockers.map((b) => ({ taskId: b.id, status: b.status })),
        });
        return;
      }

      // Find the next phase
      const nextPhase = await db
        .selectFrom("governance.cycle_phase as cp")
        .select(["cp.id", "cp.phase_code", "cp.sort_order"])
        .where("cp.tenant_id",    "=", tenantId)
        .where("cp.cycle_type_id","=", run.cycle_type_id)
        .where("cp.sort_order",   ">", phase.sort_order)
        .where("cp.is_active",    "=", true)
        .orderBy("cp.sort_order", "asc")
        .executeTakeFirst() as { id: string; phase_code: string; sort_order: number } | undefined;

      const now = new Date();

      if (nextPhase) {
        const { rows: crossGateRows } = await sql<{
          gate_passed: boolean;
          blocking_count: number;
          blocking_cycles: unknown;
        }>`
          SELECT gate_passed, blocking_count, blocking_cycles
            FROM governance.check_cross_cycle_gate(${runId}::uuid, ${nextPhase.id}::uuid)
        `.execute(db);
        const crossGate = crossGateRows[0];
        if (crossGate && !crossGate.gate_passed) {
          res.status(422).json({
            error: "CROSS_CYCLE_GATE_BLOCKED",
            targetPhaseCode: nextPhase.phase_code,
            blockers: crossGate.blocking_cycles,
          });
          return;
        }

        // Advance to next phase
        await db
          .updateTable("governance.cycle_run")
          .set({
            current_phase_id: nextPhase.id,
            status:           "IN_PROGRESS",
            updated_at:       now,
            updated_by:       principalId,
          })
          .where("id",        "=", runId)
          .where("tenant_id", "=", tenantId)
          .execute();

        res.json({
          runId,
          runStatus:     "IN_PROGRESS",
          nextPhaseCode: nextPhase.phase_code,
          message:       `Phase '${phaseCode}' signed off. Advancing to '${nextPhase.phase_code}'.`,
        });
      } else {
        // All phases complete — mark run as COMPLETED
        await db
          .updateTable("governance.cycle_run")
          .set({
            status:       "COMPLETED",
            completed_at: now,
            completed_by: principalId,
            updated_at:   now,
            updated_by:   principalId,
          })
          .where("id",        "=", runId)
          .where("tenant_id", "=", tenantId)
          .execute();

        res.json({
          runId,
          runStatus: "COMPLETED",
          message:   `Final phase '${phaseCode}' signed off. Close run is now COMPLETED.`,
        });
      }
    } catch (err) { logger?.error("period_close_sign_off_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // Consolidated evidence lens used by Opening Balance, Readiness, Monthly,
  // and Year-End workbenches. Accounting documents remain in their domains.
  router.get("/finance/period-close/runs/:runId/governance", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const tenantId = await resolveTenantId(
        db,
        (req.headers["x-org"] as string) ?? "",
        (req.headers["x-realm"] as string) ?? "athyper",
      );
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }
      const runId = req.params["runId"] as string;
      const { rows } = await sql<{
        run: Record<string, unknown>;
        certifications: unknown;
        deviations: unknown;
        report_packs: unknown;
        import_requests: unknown;
        journals: unknown;
      }>`
        WITH selected_run AS (
          SELECT cr.*, ct.type_code
            FROM governance.cycle_run cr
            JOIN governance.cycle_type ct ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
           WHERE cr.tenant_id = ${tenantId}::uuid AND cr.id = ${runId}::uuid
        ), import_ids AS (
          SELECT value::uuid AS id
            FROM selected_run, jsonb_array_elements_text(coalesce(domain_data->'import_request_ids', '[]'::jsonb))
        )
        SELECT to_jsonb(sr) AS run,
               coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.cert_code, c.cert_version DESC)
                           FROM governance.cycle_certification c WHERE c.tenant_id = ${tenantId}::uuid AND c.cycle_run_id = sr.id), '[]'::jsonb) AS certifications,
               coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC)
                           FROM governance.cycle_deviation d WHERE d.tenant_id = ${tenantId}::uuid AND d.cycle_run_id = sr.id), '[]'::jsonb) AS deviations,
               coalesce((SELECT jsonb_agg(to_jsonb(rp) ORDER BY rp.created_at DESC)
                           FROM governance.report_pack rp WHERE rp.tenant_id = ${tenantId}::uuid AND rp.cycle_run_id = sr.id), '[]'::jsonb) AS report_packs,
               coalesce((SELECT jsonb_agg(to_jsonb(ir) ORDER BY ir.created_at DESC)
                           FROM document.import_request ir WHERE ir.tenant_id = ${tenantId}::uuid AND ir.id IN (SELECT id FROM import_ids)), '[]'::jsonb) AS import_requests,
               coalesce((SELECT jsonb_agg(to_jsonb(je) ORDER BY je.created_at DESC)
                           FROM document.journal_entry je JOIN master.company_code cc ON cc.id = je.company_code_id
                          WHERE je.tenant_id = ${tenantId}::uuid AND cc.code = sr.entity_code
                            AND je.fiscal_year = sr.fiscal_year AND je.period_number = sr.period_number
                            AND (je.source_doc_type IN ('opening_balance','year_end_close') OR je.source_doc_id IN (SELECT id FROM import_ids))), '[]'::jsonb) AS journals
          FROM selected_run sr
      `.execute(db);
      if (!rows[0]) { res.status(404).json({ error: "RUN_NOT_FOUND" }); return; }
      res.json({
        run: rows[0].run,
        certifications: rows[0].certifications,
        deviations: rows[0].deviations,
        reportPacks: rows[0].report_packs,
        importRequests: rows[0].import_requests,
        journals: rows[0].journals,
      });
    } catch (err) { logger?.error("finance_governance_evidence_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  router.post("/finance/period-close/runs/:runId/certifications", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const sub = (claims["sub"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, (req.headers["x-org"] as string) ?? "", xRealm);
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }
      const runId = req.params["runId"] as string;
      const { certCode, action, notes, snapshot = {} } = req.body as {
        certCode: string; action: "certify" | "attest"; notes?: string; snapshot?: Record<string, unknown>;
      };
      if (!certCode || !["certify", "attest"].includes(action)) {
        res.status(400).json({ error: "INVALID_CERTIFICATION_COMMAND" }); return;
      }
      const { rows: runRows } = await sql<{ entity_code: string; type_code: string; incomplete_codes: string[]; critical: number }>`
        SELECT cr.entity_code, ct.type_code,
               coalesce(array_agg(DISTINCT task.task_code) FILTER
                 (WHERE task.is_mandatory AND task.status <> 'COMPLETED'), '{}') AS incomplete_codes,
               count(DISTINCT dev.id) FILTER (WHERE dev.severity = 'CRITICAL' AND dev.status NOT IN ('RESOLVED','REJECTED','EXPIRED','REVOKED'))::int AS critical
          FROM governance.cycle_run cr
          JOIN governance.cycle_type ct ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
          LEFT JOIN governance.cycle_task task ON task.tenant_id = cr.tenant_id AND task.cycle_run_id = cr.id
          LEFT JOIN governance.cycle_deviation dev ON dev.tenant_id = cr.tenant_id AND dev.cycle_run_id = cr.id
         WHERE cr.tenant_id = ${tenantId}::uuid AND cr.id = ${runId}::uuid
         GROUP BY cr.entity_code, ct.type_code
      `.execute(db);
      const run = runRows[0];
      if (!run) { res.status(404).json({ error: "RUN_NOT_FOUND" }); return; }
      const protectedFinal = certCode === "FINANCE_POSTING_READY" || certCode === "OPEN_BAL_FINAL";
      const certificationTaskCodes: Record<string, string[]> = {
        FINANCE_POSTING_READY: ["FSR_FINAL_CERTIFICATION"],
        OPEN_BAL_FINAL: ["OB_FINAL_CERTIFICATION"],
        MONTHLY_CLOSE_FINAL: ["CONTROLLER_CERTIFICATION"],
        YEAR_END_FINAL: ["YE_CONTROLLER_CERTIFICATION", "YE_CFO_ATTESTATION"],
      };
      const allowedIncomplete = new Set(certificationTaskCodes[certCode] ?? []);
      const blockingIncomplete = run.incomplete_codes.filter((code) => !allowedIncomplete.has(code));
      if ((protectedFinal || allowedIncomplete.size > 0) && (blockingIncomplete.length > 0 || run.critical > 0)) {
        res.status(422).json({ error: "CERTIFICATION_BLOCKED", incompleteMandatoryTasks: blockingIncomplete, criticalDeviations: run.critical });
        return;
      }
      const fourDomainReadiness = certCode === "FINANCE_POSTING_READY"
        ? await loadCompanyCertificationReadiness(db,tenantId,run.entity_code)
        : null;
      if (certCode === "FINANCE_POSTING_READY" && !fourDomainReadiness?.summary.readyForCertification) {
        res.status(422).json({
          error:"FOUR_DOMAIN_READINESS_BLOCKED",
          message:"Currency/FX, Tax, Payments/Settlement, and Banking/Treasury must all be ready before certification.",
          domains:fourDomainReadiness?.domains??[],
          blockerCount:fourDomainReadiness?.summary.blockerCount??0,
        });
        return;
      }
      const { rows: existingRows } = await sql<{
        id: string; cert_version: number; status: string; snapshot_payload: Record<string, unknown> | null;
      }>`
        SELECT id, cert_version, status, snapshot_payload
          FROM governance.cycle_certification
         WHERE tenant_id = ${tenantId}::uuid AND cycle_run_id = ${runId}::uuid AND cert_code = ${certCode}
         ORDER BY cert_version DESC LIMIT 1
      `.execute(db);
      const existing = existingRows[0];
      if (action === "attest" && existing?.status !== "CERTIFIED") {
        res.status(422).json({ error: "CERTIFICATION_NOT_CERTIFIED", currentStatus: existing?.status ?? null }); return;
      }
      const now = new Date();
      const fullSnapshot = {
        ...(existing?.snapshot_payload ?? {}), ...snapshot,
        cycleRunId: runId, cycleTypeCode: run.type_code, entityCode: run.entity_code,
        ...(fourDomainReadiness ? { fourDomainReadiness: {
          asOfDate:fourDomainReadiness.asOfDate,
          domains:fourDomainReadiness.domains,
          summary:fourDomainReadiness.summary,
          computedAt:fourDomainReadiness.computedAt,
        }} : {}),
        certCode, certifiedAt: action === "certify" ? now.toISOString() : undefined,
        attestedAt: action === "attest" ? now.toISOString() : undefined,
      };
      const contentHash = hashCertificationSnapshot(fullSnapshot);
      let certificationId = existing?.id;
      if (!existing) {
        const inserted = await db.insertInto("governance.cycle_certification").values({
          tenant_id: tenantId, entity_code: run.entity_code, cycle_run_id: runId,
          cert_code: certCode, cert_version: 1, cert_type: "STANDARD",
          status: "CERTIFIED", content_hash: contentHash, snapshot_payload: fullSnapshot,
          controller_notes: notes ?? null, certified_by: principalId, certified_at: now,
          created_by: principalId,
        }).returning("id").executeTakeFirst();
        certificationId = (inserted as { id: string } | undefined)?.id;
      } else {
        await db.updateTable("governance.cycle_certification").set(action === "certify" ? {
          status: "CERTIFIED", content_hash: contentHash, snapshot_payload: fullSnapshot,
          controller_notes: notes ?? null, certified_by: principalId, certified_at: now,
          updated_at: now, updated_by: principalId,
        } : {
          status: "ATTESTED", content_hash: contentHash, snapshot_payload: fullSnapshot,
          attestation_notes: notes ?? null, attested_by: principalId, attested_at: now,
          updated_at: now, updated_by: principalId,
        }).where("tenant_id", "=", tenantId).where("id", "=", existing.id).execute();
      }
      const completedTaskCodes = action === "attest"
        ? certCode === "YEAR_END_FINAL" ? ["YE_CFO_ATTESTATION"] : certificationTaskCodes[certCode] ?? []
        : certCode === "MONTHLY_CLOSE_FINAL" ? ["CONTROLLER_CERTIFICATION"]
          : certCode === "YEAR_END_FINAL" ? ["YE_CONTROLLER_CERTIFICATION"] : [];
      if (completedTaskCodes.length > 0) {
        await db.updateTable("governance.cycle_task").set({
          status: "COMPLETED", completed_by: principalId, completed_at: now,
          completion_notes: notes ?? `${certCode} ${action}`,
          evidence_payload: { certificationId, certCode, action, contentHash },
          updated_at: now, updated_by: principalId,
        }).where("tenant_id", "=", tenantId).where("cycle_run_id", "=", runId)
          .where("task_code", "in", completedTaskCodes).execute();
      }
      res.json({ certificationId, certCode, status: action === "certify" ? "CERTIFIED" : "ATTESTED", contentHash });
    } catch (err) { logger?.error("finance_certification_command_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  router.post("/finance/period-close/runs/:runId/period-command", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const sub = (claims["sub"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, (req.headers["x-org"] as string) ?? "", xRealm);
      if (!tenantId) { res.status(403).json({ error: "TENANT_NOT_FOUND" }); return; }
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }
      const runId = req.params["runId"] as string;
      const { targetStatus, bookIds, reason } = req.body as { targetStatus: "open" | "soft_close" | "hard_close"; bookIds?: string[]; reason?: string };
      if (!["open", "soft_close", "hard_close"].includes(targetStatus)) { res.status(400).json({ error: "INVALID_PERIOD_STATUS" }); return; }
      const { rows: runRows } = await sql<{ company_code_id: string; fiscal_year: number; period_number: number; type_code: string }>`
        SELECT cc.id AS company_code_id, cr.fiscal_year, cr.period_number, ct.type_code
          FROM governance.cycle_run cr
          JOIN governance.cycle_type ct ON ct.tenant_id = cr.tenant_id AND ct.id = cr.cycle_type_id
          JOIN master.company_code cc ON cc.tenant_id = cr.tenant_id AND cc.code = cr.entity_code
         WHERE cr.tenant_id = ${tenantId}::uuid AND cr.id = ${runId}::uuid
      `.execute(db);
      const run = runRows[0];
      if (!run) { res.status(404).json({ error: "RUN_NOT_FOUND" }); return; }
      const selectedBookIds = Array.isArray(bookIds) ? bookIds : [];
      const { rows: periodRows } = await sql<{ book_id: string; status: string }>`
        SELECT book_id, status FROM governance.book_period_status
         WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${run.company_code_id}::uuid
           AND fiscal_year = ${run.fiscal_year} AND period_number = ${run.period_number}
           AND (${sql.val(selectedBookIds)}::uuid[] = '{}'::uuid[] OR book_id = ANY(${sql.val(selectedBookIds)}::uuid[]))
      `.execute(db);
      if (periodRows.length === 0) { res.status(422).json({ error: "BOOK_PERIOD_STATUS_NOT_FOUND" }); return; }
      const invalidTransitions = periodRows.filter((row) => {
        if (row.status === targetStatus) return false;
        if (targetStatus === "soft_close") return row.status !== "open";
        if (targetStatus === "hard_close") return row.status !== "soft_close";
        return !["future", "soft_close", "hard_close"].includes(row.status);
      });
      if (invalidTransitions.length > 0) {
        res.status(422).json({ error: "INVALID_PERIOD_TRANSITION", targetStatus, currentStatuses: invalidTransitions }); return;
      }
      const isReopen = targetStatus === "open" && periodRows.some((row) => ["soft_close", "hard_close"].includes(row.status));
      if (isReopen && !reason?.trim()) {
        res.status(422).json({ error: "PERIOD_REOPEN_REASON_REQUIRED" }); return;
      }
      if (targetStatus === "hard_close") {
        const requiredCert = run.period_number === 0 ? "OPEN_BAL_FINAL" : run.type_code === "YEAR_END_CLOSE" ? "YEAR_END_FINAL" : "MONTHLY_CLOSE_FINAL";
        const { rows: certRows } = await sql<{ count: number }>`
          SELECT count(*)::int AS count FROM governance.cycle_certification
           WHERE tenant_id = ${tenantId}::uuid AND cycle_run_id = ${runId}::uuid
             AND cert_code = ${requiredCert} AND status = 'ATTESTED'
        `.execute(db);
        if ((certRows[0]?.count ?? 0) === 0) {
          res.status(422).json({ error: "PERIOD_COMMAND_CERTIFICATION_REQUIRED", requiredCert }); return;
        }
      }
      await db.transaction().execute(async (trx) => {
        const now = new Date();
        let q = trx.updateTable("governance.book_period_status").set({
          status: targetStatus,
          opened_at: targetStatus === "open" ? now : undefined,
          opened_by: targetStatus === "open" ? principalId : undefined,
          soft_closed_at: targetStatus === "soft_close" ? now : undefined,
          soft_closed_by: targetStatus === "soft_close" ? principalId : undefined,
          hard_closed_at: targetStatus === "hard_close" ? now : undefined,
          hard_closed_by: targetStatus === "hard_close" ? principalId : undefined,
          reopen_count: isReopen ? sql`reopen_count + 1` : undefined,
          last_reopen_reason: targetStatus === "open" ? reason ?? null : undefined,
          status_changed_at: now, status_changed_by: principalId, updated_at: now, updated_by: principalId,
        }).where("tenant_id", "=", tenantId).where("company_code_id", "=", run.company_code_id)
          .where("fiscal_year", "=", run.fiscal_year).where("period_number", "=", run.period_number);
        if (selectedBookIds.length > 0) q = q.where("book_id", "in", selectedBookIds);
        await q.execute();
        const { rows: aggregateRows } = await sql<{ fiscal_status: "future" | "open" | "soft_close" | "hard_close" }>`
          SELECT CASE
                   WHEN bool_and(status = 'hard_close') THEN 'hard_close'
                   WHEN bool_and(status IN ('soft_close','hard_close')) THEN 'soft_close'
                   WHEN bool_or(status = 'open') THEN 'open'
                   ELSE 'future'
                 END AS fiscal_status
            FROM governance.book_period_status
           WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${run.company_code_id}::uuid
             AND fiscal_year = ${run.fiscal_year} AND period_number = ${run.period_number}
        `.execute(trx);
        const fiscalStatus = aggregateRows[0]?.fiscal_status ?? targetStatus;
        await trx.updateTable("master.fiscal_period").set({
          status: fiscalStatus,
          opened_at: fiscalStatus === "open" ? now : undefined,
          opened_by: fiscalStatus === "open" ? principalId : undefined,
          soft_closed_at: fiscalStatus === "soft_close" ? now : undefined,
          soft_closed_by: fiscalStatus === "soft_close" ? principalId : undefined,
          hard_closed_at: fiscalStatus === "hard_close" ? now : undefined,
          hard_closed_by: fiscalStatus === "hard_close" ? principalId : undefined,
          status_changed_at: now, status_changed_by: principalId, updated_at: now, updated_by: principalId,
        }).where("tenant_id", "=", tenantId).where("company_code_id", "=", run.company_code_id)
          .where("fiscal_year", "=", run.fiscal_year).where("period_number", "=", run.period_number).execute();
        await sql`
          INSERT INTO event.outbox
            (tenant_id, topic, event_type, event_key, entity_type, entity_id,
             aggregate_type, aggregate_id, actor_id, source, payload, created_by)
          VALUES (
            ${tenantId}::uuid, 'fin', 'finance.period.status_changed',
            ${`cross-book-period:${runId}:${targetStatus}:${now.toISOString()}`}, 'cycle_run', ${runId}::uuid,
            'cycle_run', ${runId}::uuid, ${principalId}::uuid, 'finance.period-command',
            ${JSON.stringify({
              runId, companyCodeId: run.company_code_id, fiscalYear: run.fiscal_year,
              periodNumber: run.period_number, targetStatus, bookIds: selectedBookIds,
            })}::jsonb, ${principalId}::uuid
          )
          ON CONFLICT (tenant_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
        `.execute(trx);
      });
      res.json({ runId, targetStatus, fiscalYear: run.fiscal_year, periodNumber: run.period_number, bookIds: selectedBookIds });
    } catch (err) { logger?.error("finance_period_command_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  return router;
}
