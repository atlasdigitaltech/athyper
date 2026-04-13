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
import { type FinanceRouteDeps, parseScopeParams, resolveCompanyIds } from "./finance.route.js";
import { verifyBearer, resolveTenantId, resolvePrincipalIdOrNull } from "@athyper/svc-shared";

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
          "ctsk.failure_reason as failureReason",
          "tpl.task_name as taskName", "tpl.description",
          "tpl.completion_mode as completionMode",
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

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const body = req.body as Record<string, unknown>;
      const { scopeId, fiscalYear, periodNumber, cycleTypeCode = "MONTHLY_CLOSE" } = body as {
        scopeId: string; fiscalYear: number; periodNumber: number; cycleTypeCode?: string;
      };

      if (!scopeId || !fiscalYear || !periodNumber) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "scopeId, fiscalYear, and periodNumber are required" });
        return;
      }

      // Resolve company_code from scopeId
      const companies = await resolveCompanyIds(db, tenantId, { scopeType: "company", scopeId, fiscalYear, period: periodNumber });
      if (companies.length === 0) { res.status(404).json({ error: "COMPANY_NOT_FOUND" }); return; }
      const companyCode = companies[0]!.company_code as string;

      // Find the cycle type for FINANCE domain
      const cycleType = await db
        .selectFrom("governance.cycle_type as ct")
        .select(["ct.id", "ct.type_code"])
        .where("ct.tenant_id", "=", tenantId)
        .where("ct.domain",    "=", "FINANCE")
        .where("ct.type_code", "=", String(cycleTypeCode))
        .where("ct.is_active", "=", true)
        .executeTakeFirst() as { id: string; type_code: string } | undefined;

      if (!cycleType) {
        res.status(422).json({ error: "CYCLE_TYPE_NOT_FOUND", cycleTypeCode });
        return;
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

      // Calculate period_end_date (last day of month for this period in fiscal year)
      // Assumes calendar-year fiscal year; period N = month N.
      const periodEndDate = new Date(fiscalYear, periodNumber, 0); // day 0 = last day of month N

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
          period_end_date:   periodEndDate.toISOString().slice(0, 10),
          cycle_start_date:  today.toISOString().slice(0, 10),
          cycle_target_date: targetDate.toISOString().slice(0, 10),
          started_at:        new Date(),
          started_by:        principalId,
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

      logger?.info("period_close_run_started", { runId: newRun.id, companyCode, fiscalYear, periodNumber });
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

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) { res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" }); return; }

      const runId  = req.params["runId"]  as string;
      const taskId = req.params["taskId"] as string;
      const { action, remarks } = req.body as { action: "complete" | "reopen"; remarks?: string };

      if (action !== "complete" && action !== "reopen") {
        res.status(400).json({ error: "INVALID_ACTION", message: "action must be 'complete' or 'reopen'" });
        return;
      }

      // Verify the task belongs to the run and tenant
      const task = await db
        .selectFrom("governance.cycle_task as ctsk")
        .innerJoin("governance.cycle_run as cr", (jb) =>
          jb.onRef("cr.id", "=", "ctsk.cycle_run_id")
            .on("cr.tenant_id", "=", tenantId),
        )
        .select(["ctsk.id", "ctsk.status", "ctsk.is_mandatory"])
        .where("ctsk.id",          "=", taskId)
        .where("ctsk.cycle_run_id","=", runId)
        .where("ctsk.tenant_id",   "=", tenantId)
        .executeTakeFirst() as { id: string; status: string; is_mandatory: boolean } | undefined;

      if (!task) { res.status(404).json({ error: "TASK_NOT_FOUND" }); return; }

      if (action === "complete") {
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

      logger?.info("period_close_task_action", { taskId, runId, action, principalId });
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

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
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
        .select(["cr.id", "cr.status", "cr.cycle_type_id", "ct.id as ctId"])
        .where("cr.id",        "=", runId)
        .where("cr.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; status: string; cycle_type_id: string; ctId: string } | undefined;

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

        logger?.info("period_close_phase_signed_off", { runId, phaseCode, nextPhaseCode: nextPhase.phase_code });
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

        logger?.info("period_close_run_completed", { runId, phaseCode, principalId });
        res.json({
          runId,
          runStatus: "COMPLETED",
          message:   `Final phase '${phaseCode}' signed off. Close run is now COMPLETED.`,
        });
      }
    } catch (err) { logger?.error("period_close_sign_off_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  return router;
}
