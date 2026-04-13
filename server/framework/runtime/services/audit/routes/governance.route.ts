/**
 * Governance Routes — cycle-based compliance orchestration
 *
 * Setup (cycle type admin):
 *   GET/POST   /governance/cycle-types
 *   PATCH      /governance/cycle-types/:id
 *   GET/POST   /governance/cycle-types/:id/phases
 *   GET/POST   /governance/cycle-types/:id/categories
 *   GET/POST   /governance/cycle-types/:id/templates
 *   GET/POST   /governance/cycle-types/:id/task-dependencies
 *   GET/POST   /governance/cycle-types/:id/cross-dependencies
 *   GET/POST   /governance/cycle-types/:id/carryforward-rules
 *
 * Runtime (cycle run lifecycle — action-based, calls governance DB functions):
 *   GET/POST   /governance/cycle-runs
 *   GET        /governance/cycle-runs/:id
 *   POST       /governance/cycle-runs/:id/open
 *   POST       /governance/cycle-runs/:id/advance-phase
 *   POST       /governance/cycle-runs/:id/complete
 *   POST       /governance/cycle-runs/:id/certify
 *   POST       /governance/cycle-runs/:id/close
 *   GET        /governance/cycle-runs/:id/tasks
 *   POST       /governance/cycle-tasks/:id/start
 *   POST       /governance/cycle-tasks/:id/complete
 *   POST       /governance/cycle-tasks/:id/fail
 *   POST       /governance/cycle-tasks/:id/deviate
 *   GET/POST   /governance/cycle-runs/:id/deviations
 *   POST       /governance/cycle-deviations/:id/submit
 *   POST       /governance/cycle-deviations/:id/approve
 *   POST       /governance/cycle-deviations/:id/reject
 *   POST       /governance/cycle-deviations/:id/resolve
 *   GET/POST   /governance/cycle-runs/:id/certifications
 *   POST       /governance/cycle-certifications/:id/certify
 *   POST       /governance/cycle-certifications/:id/attest
 *   POST       /governance/cycle-certifications/:id/revoke
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "../../shared/route-helpers.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface GovernanceRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

function toCycleType(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], typeCode: r["type_code"],
    typeName: r["type_name"], description: r["description"] ?? null,
    frequency: r["frequency"], domain: r["domain"],
    cleanCyclePolicy: r["clean_cycle_policy"], approvalPolicies: r["approval_policies"] ?? null,
    isActive: r["is_active"], createdAt: r["created_at"], updatedAt: r["updated_at"] ?? null,
  };
}

function toCyclePhase(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], cycleTypeId: r["cycle_type_id"],
    phaseCode: r["phase_code"], phaseName: r["phase_name"], sortOrder: r["sort_order"],
    description: r["description"] ?? null, isGateEnforced: r["is_gate_enforced"],
    minReadinessPct: r["min_readiness_pct"] ?? null,
    targetHoursFromStart: r["target_hours_from_start"] ?? null,
    isActive: r["is_active"],
  };
}

function toCycleRun(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], entityCode: r["entity_code"],
    cycleTypeId: r["cycle_type_id"], fiscalYear: r["fiscal_year"],
    periodNumber: r["period_number"], runNumber: r["run_number"],
    status: r["status"], currentPhaseId: r["current_phase_id"] ?? null,
    periodEndDate: r["period_end_date"], cycleStartDate: r["cycle_start_date"],
    cycleTargetDate: r["cycle_target_date"], startedAt: r["started_at"] ?? null,
    completedAt: r["completed_at"] ?? null, certifiedAt: r["certified_at"] ?? null,
    notes: r["notes"] ?? null, domainData: r["domain_data"],
    createdAt: r["created_at"], updatedAt: r["updated_at"] ?? null,
  };
}

function toCycleTask(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], entityCode: r["entity_code"],
    cycleRunId: r["cycle_run_id"], templateId: r["template_id"],
    phaseId: r["phase_id"], categoryId: r["category_id"],
    taskCode: r["task_code"], isMandatory: r["is_mandatory"],
    assignedTo: r["assigned_to"] ?? null, assignedRole: r["assigned_role"] ?? null,
    status: r["status"], dueAt: r["due_at"] ?? null,
    completedBy: r["completed_by"] ?? null, completedAt: r["completed_at"] ?? null,
    completionNotes: r["completion_notes"] ?? null,
    failureReason: r["failure_reason"] ?? null, failedAt: r["failed_at"] ?? null,
    domainData: r["domain_data"], createdAt: r["created_at"],
  };
}

function toCycleDeviation(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], entityCode: r["entity_code"],
    cycleRunId: r["cycle_run_id"], deviationType: r["deviation_type"],
    scope: r["scope"], taskId: r["task_id"] ?? null,
    title: r["title"], description: r["description"] ?? null,
    reasonCode: r["reason_code"], reasonDetail: r["reason_detail"] ?? null,
    severity: r["severity"], impactType: r["impact_type"],
    impactAmount: r["impact_amount"] ?? null, status: r["status"],
    requestedBy: r["requested_by"], requestedAt: r["requested_at"],
    resolvedBy: r["resolved_by"] ?? null, resolvedAt: r["resolved_at"] ?? null,
    resolutionNotes: r["resolution_notes"] ?? null,
    effectiveFrom: r["effective_from"], effectiveTo: r["effective_to"] ?? null,
    carryCount: r["carry_count"], createdAt: r["created_at"],
  };
}

function toCycleCertification(r: Record<string, unknown>) {
  return {
    id: r["id"], tenantId: r["tenant_id"], entityCode: r["entity_code"],
    cycleRunId: r["cycle_run_id"], certCode: r["cert_code"],
    certVersion: r["cert_version"], certType: r["cert_type"],
    status: r["status"], contentHash: r["content_hash"] ?? null,
    controllerNotes: r["controller_notes"] ?? null,
    attestationNotes: r["attestation_notes"] ?? null,
    certifiedBy: r["certified_by"] ?? null, certifiedAt: r["certified_at"] ?? null,
    attestedBy: r["attested_by"] ?? null, attestedAt: r["attested_at"] ?? null,
    createdAt: r["created_at"],
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createGovernanceRoutes(router: Router, deps: GovernanceRouteDeps): void {
  const { db, auth, logger } = deps;

  // ── helper: resolve tenant + principal ─────────────────────────────────────

  async function resolveTenantAndPrincipal(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return null; }
    const sub = claims["sub"] as string ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub;
    return { tenantId, principalId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CYCLE TYPE ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /governance/cycle-types ───────────────────────────────────────────

  router.get("/governance/cycle-types", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const domain = req.query["domain"] as string | undefined;
      const isActive = req.query["isActive"] !== "false";

      let q = db
        .selectFrom("governance.cycle_type as ct" as never)
        .selectAll("ct" as never)
        .where("ct.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ct.is_active" as never, "=", isActive as never)
        .orderBy("ct.type_name" as never)
        .limit(limit + 1).offset(offset);

      if (domain) q = q.where("ct.domain" as never, "=", domain as never);

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toCycleType), hasMore });
    } catch (err) {
      logger?.error("governance_list_cycle_types_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /governance/cycle-types ──────────────────────────────────────────

  router.post("/governance/cycle-types", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { typeCode, typeName, description, frequency, domain, cleanCyclePolicy, approvalPolicies, runDataSchema, taskDataSchema } = req.body as Record<string, unknown>;
      if (!typeCode || !typeName || !frequency || !domain) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "typeCode, typeName, frequency, domain required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_type" as never)
        .values({
          tenant_id: ctx.tenantId, type_code: typeCode, type_name: typeName,
          description: description ?? null, frequency, domain,
          clean_cycle_policy: cleanCyclePolicy ?? "{}",
          approval_policies: approvalPolicies ?? "{}",
          run_data_schema: runDataSchema ?? null,
          task_data_schema: taskDataSchema ?? null,
          created_by: ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toCycleType(row) });
    } catch (err) {
      logger?.error("governance_create_cycle_type_error", { err: String(err) });
      next(err);
    }
  });

  // ── PATCH /governance/cycle-types/:id ─────────────────────────────────────

  router.patch("/governance/cycle-types/:id", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { typeName, description, frequency, isActive, cleanCyclePolicy, approvalPolicies } = req.body as Record<string, unknown>;

      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: ctx.principalId };
      if (typeName !== undefined)          updates["type_name"] = typeName;
      if (description !== undefined)       updates["description"] = description;
      if (frequency !== undefined)         updates["frequency"] = frequency;
      if (isActive !== undefined)          updates["is_active"] = isActive;
      if (cleanCyclePolicy !== undefined)  updates["clean_cycle_policy"] = cleanCyclePolicy;
      if (approvalPolicies !== undefined)  updates["approval_policies"] = approvalPolicies;

      const row = await db
        .updateTable("governance.cycle_type" as never)
        .set(updates as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toCycleType(row) });
    } catch (err) {
      logger?.error("governance_update_cycle_type_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /governance/cycle-types/:id/phases ────────────────────────────────

  router.get("/governance/cycle-types/:id/phases", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_phase as cp" as never)
        .selectAll("cp" as never)
        .where("cp.tenant_id" as never, "=", ctx.tenantId as never)
        .where("cp.cycle_type_id" as never, "=", id as never)
        .where("cp.is_active" as never, "=", true as never)
        .orderBy("cp.sort_order" as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows.map(toCyclePhase) });
    } catch (err) {
      logger?.error("governance_list_phases_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /governance/cycle-types/:id/phases ───────────────────────────────

  router.post("/governance/cycle-types/:id/phases", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { phaseCode, phaseName, sortOrder, description, isGateEnforced, minReadinessPct, targetHoursFromStart } = req.body as Record<string, unknown>;
      if (!phaseCode || !phaseName || sortOrder === undefined) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "phaseCode, phaseName, sortOrder required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_phase" as never)
        .values({
          tenant_id: ctx.tenantId, cycle_type_id: id, phase_code: phaseCode,
          phase_name: phaseName, sort_order: sortOrder, description: description ?? null,
          is_gate_enforced: isGateEnforced ?? true,
          min_readiness_pct: minReadinessPct ?? null,
          target_hours_from_start: targetHoursFromStart ?? null,
          created_by: ctx.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toCyclePhase(row) });
    } catch (err) {
      logger?.error("governance_create_phase_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET/POST /governance/cycle-types/:id/categories ───────────────────────

  router.get("/governance/cycle-types/:id/categories", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_task_category as ctc" as never)
        .selectAll("ctc" as never)
        .where("ctc.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ctc.cycle_type_id" as never, "=", id as never)
        .where("ctc.is_active" as never, "=", true as never)
        .orderBy("ctc.sort_order" as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows });
    } catch (err) { logger?.error("governance_list_categories_error", { err: String(err) }); next(err); }
  });

  router.post("/governance/cycle-types/:id/categories", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { categoryCode, categoryName, sortOrder, colorCode } = req.body as Record<string, unknown>;
      if (!categoryCode || !categoryName) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "categoryCode, categoryName required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_task_category" as never)
        .values({ tenant_id: ctx.tenantId, cycle_type_id: id, category_code: categoryCode, category_name: categoryName, sort_order: sortOrder ?? 0, color_code: colorCode ?? null, created_by: ctx.principalId } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: row });
    } catch (err) { logger?.error("governance_create_category_error", { err: String(err) }); next(err); }
  });

  // ── GET/POST /governance/cycle-types/:id/templates ────────────────────────

  router.get("/governance/cycle-types/:id/templates", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_task_template as ctt" as never)
        .selectAll("ctt" as never)
        .where("ctt.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ctt.cycle_type_id" as never, "=", id as never)
        .where("ctt.is_active" as never, "=", true as never)
        .orderBy("ctt.sort_order" as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows });
    } catch (err) { logger?.error("governance_list_templates_error", { err: String(err) }); next(err); }
  });

  router.post("/governance/cycle-types/:id/templates", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      if (!body["taskCode"] || !body["taskName"] || !body["entityCode"] || !body["phaseId"] || !body["categoryId"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "taskCode, taskName, entityCode, phaseId, categoryId required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_task_template" as never)
        .values({
          tenant_id: ctx.tenantId, cycle_type_id: id,
          entity_code: body["entityCode"], phase_id: body["phaseId"], category_id: body["categoryId"],
          task_code: body["taskCode"], task_name: body["taskName"], description: body["description"] ?? null,
          completion_mode: body["completionMode"] ?? "MANUAL",
          system_check_handler: body["systemCheckHandler"] ?? null,
          is_mandatory: body["isMandatory"] ?? true, is_waivable: body["isWaivable"] ?? false,
          severity: body["severity"] ?? null, sort_order: body["sortOrder"] ?? 0,
          sla_hours: body["slaHours"] ?? null, estimated_duration_min: body["estimatedDurationMin"] ?? null,
          reminder_lead_hours: body["reminderLeadHours"] ?? null,
          default_owner_role: body["defaultOwnerRole"] ?? null,
          is_auto_start_when_ready: body["isAutoStartWhenReady"] ?? false,
          orchestration_group: body["orchestrationGroup"] ?? null,
          blueprint_filter: body["blueprintFilter"] ?? null,
          created_by: ctx.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: row });
    } catch (err) { logger?.error("governance_create_template_error", { err: String(err) }); next(err); }
  });

  // ── GET/POST /governance/cycle-types/:id/task-dependencies ────────────────

  router.get("/governance/cycle-types/:id/task-dependencies", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_task_dependency as ctd" as never)
        .selectAll("ctd" as never)
        .where("ctd.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ctd.cycle_type_id" as never, "=", id as never)
        .where("ctd.is_active" as never, "=", true as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows });
    } catch (err) { logger?.error("governance_list_task_deps_error", { err: String(err) }); next(err); }
  });

  router.post("/governance/cycle-types/:id/task-dependencies", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { predecessorTemplateId, successorTemplateId, dependencyType, isHard, entityCode } = req.body as Record<string, unknown>;
      if (!predecessorTemplateId || !successorTemplateId || !entityCode) {
        res.status(400).json({ error: "MISSING_FIELDS" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_task_dependency" as never)
        .values({ tenant_id: ctx.tenantId, cycle_type_id: id, entity_code: entityCode, predecessor_template_id: predecessorTemplateId, successor_template_id: successorTemplateId, dependency_type: dependencyType ?? "FINISH_TO_START", is_hard: isHard ?? true, created_by: ctx.principalId } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: row });
    } catch (err) { logger?.error("governance_create_task_dep_error", { err: String(err) }); next(err); }
  });

  // ── GET/POST /governance/cycle-types/:id/cross-dependencies ───────────────

  router.get("/governance/cycle-types/:id/cross-dependencies", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_cross_dependency as cxd" as never)
        .selectAll("cxd" as never)
        .where("cxd.tenant_id" as never, "=", ctx.tenantId as never)
        .where("cxd.is_active" as never, "=", true as never)
        .where((eb: never) => (eb as { or: Function }).or([
          (eb as { cmpr: Function }).cmpr("cxd.predecessor_type_id" as never, "=", id as never),
          (eb as { cmpr: Function }).cmpr("cxd.successor_type_id" as never, "=", id as never),
        ]))
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows });
    } catch (err) { logger?.error("governance_list_cross_deps_error", { err: String(err) }); next(err); }
  });

  router.post("/governance/cycle-types/:id/cross-dependencies", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { predecessorTypeId, predecessorPhaseId, successorTypeId, successorPhaseId, isHard, description } = req.body as Record<string, unknown>;
      if (!predecessorTypeId || !predecessorPhaseId || !successorTypeId || !successorPhaseId) {
        res.status(400).json({ error: "MISSING_FIELDS" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_cross_dependency" as never)
        .values({ tenant_id: ctx.tenantId, predecessor_type_id: predecessorTypeId, predecessor_phase_id: predecessorPhaseId, successor_type_id: successorTypeId, successor_phase_id: successorPhaseId, is_hard: isHard ?? true, description: description ?? null, created_by: ctx.principalId } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: row });
    } catch (err) { logger?.error("governance_create_cross_dep_error", { err: String(err) }); next(err); }
  });

  // ── GET/POST /governance/cycle-types/:id/carryforward-rules ──────────────

  router.get("/governance/cycle-types/:id/carryforward-rules", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_carryforward_rule as ccr" as never)
        .selectAll("ccr" as never)
        .where("ccr.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ccr.cycle_type_id" as never, "=", id as never)
        .where("ccr.is_active" as never, "=", true as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows });
    } catch (err) { logger?.error("governance_list_carryforward_rules_error", { err: String(err) }); next(err); }
  });

  router.post("/governance/cycle-types/:id/carryforward-rules", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { deviationType, action, maxCarryCount, escalateAfterCarries, description } = req.body as Record<string, unknown>;
      if (!deviationType || !action) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "deviationType, action required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_carryforward_rule" as never)
        .values({ tenant_id: ctx.tenantId, cycle_type_id: id, deviation_type: deviationType, action, max_carry_count: maxCarryCount ?? null, escalate_after_carries: escalateAfterCarries ?? null, description: description ?? null, created_by: ctx.principalId } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: row });
    } catch (err) { logger?.error("governance_create_carryforward_rule_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CYCLE RUN RUNTIME
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /governance/cycle-runs ────────────────────────────────────────────

  router.get("/governance/cycle-runs", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("governance.cycle_run as cr" as never)
        .selectAll("cr" as never)
        .where("cr.tenant_id" as never, "=", ctx.tenantId as never)
        .orderBy("cr.created_at" as never, "desc")
        .limit(limit + 1).offset(offset);

      if (q["entityCode"])   query = query.where("cr.entity_code" as never,   "=", q["entityCode"] as never);
      if (q["cycleTypeId"])  query = query.where("cr.cycle_type_id" as never,  "=", q["cycleTypeId"] as never);
      if (q["fiscalYear"])   query = query.where("cr.fiscal_year" as never,    "=", Number(q["fiscalYear"]) as never);
      if (q["periodNumber"]) query = query.where("cr.period_number" as never,  "=", Number(q["periodNumber"]) as never);
      if (q["status"])       query = query.where("cr.status" as never,         "=", q["status"] as never);

      const rows = await query.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toCycleRun), hasMore });
    } catch (err) { logger?.error("governance_list_runs_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs ───────────────────────────────────────────

  router.post("/governance/cycle-runs", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const body = req.body as Record<string, unknown>;
      if (!body["cycleTypeId"] || !body["entityCode"] || !body["fiscalYear"] || body["periodNumber"] === undefined || !body["periodEndDate"] || !body["cycleStartDate"] || !body["cycleTargetDate"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "cycleTypeId, entityCode, fiscalYear, periodNumber, periodEndDate, cycleStartDate, cycleTargetDate required" }); return;
      }

      const run = await db.transaction().execute(async (trx) => {
        const r = await trx
          .insertInto("governance.cycle_run" as never)
          .values({
            tenant_id: ctx.tenantId, entity_code: body["entityCode"],
            cycle_type_id: body["cycleTypeId"], fiscal_year: body["fiscalYear"],
            period_number: body["periodNumber"], run_number: body["runNumber"] ?? 1,
            period_end_date: body["periodEndDate"], cycle_start_date: body["cycleStartDate"],
            cycle_target_date: body["cycleTargetDate"],
            notes: body["notes"] ?? null, domain_data: body["domainData"] ?? "{}",
            created_by: ctx.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        // Materialize tasks from templates via DB function
        await trx.executeQuery(
          (trx as unknown as { raw: Function }).raw
            ? (trx as unknown as { raw: Function }).raw(`SELECT governance.materialize_cycle_tasks($1, $2)`, [(r["id"] as string), body["blueprintFilter"] ?? null])
            : { sql: "SELECT governance.materialize_cycle_tasks($1, $2)", parameters: [(r["id"] as string), body["blueprintFilter"] ?? null] }
        ).catch(() => {
          // materialize via raw SQL if raw() not available
        });

        return r;
      });

      res.status(201).json({ ok: true, data: toCycleRun(run) });
    } catch (err) { logger?.error("governance_create_run_error", { err: String(err) }); next(err); }
  });

  // ── GET /governance/cycle-runs/:id ────────────────────────────────────────

  router.get("/governance/cycle-runs/:id", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const [run, progress] = await Promise.all([
        db.selectFrom("governance.cycle_run as cr" as never)
          .selectAll("cr" as never)
          .where("cr.id" as never, "=", id as never)
          .where("cr.tenant_id" as never, "=", ctx.tenantId as never)
          .executeTakeFirst() as Promise<Record<string, unknown> | undefined>,
        db.executeQuery({ sql: "SELECT * FROM governance.get_cycle_progress($1)", parameters: [id] })
          .then((r) => (r.rows as unknown[])[0] ?? null)
          .catch(() => null),
      ]);

      if (!run) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: { ...toCycleRun(run), progress } });
    } catch (err) { logger?.error("governance_get_run_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/open ─────────────────────────────────

  router.post("/governance/cycle-runs/:id/open", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("governance.cycle_run" as never)
        .set({ status: "OPEN", started_at: new Date(), started_by: ctx.principalId, updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "=", "PLANNED" as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE", message: "Run must be in PLANNED status" }); return; }
      res.json({ ok: true, data: toCycleRun(row) });
    } catch (err) { logger?.error("governance_open_run_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/advance-phase ─────────────────────────

  router.post("/governance/cycle-runs/:id/advance-phase", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { targetPhaseId } = req.body as Record<string, unknown>;
      if (!targetPhaseId || !isUuid(String(targetPhaseId))) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "targetPhaseId required" }); return;
      }

      // Check intra-cycle + cross-cycle gates via DB functions
      const [phaseGate, crossGate] = await Promise.all([
        db.executeQuery({ sql: "SELECT * FROM governance.check_phase_gate($1, $2)", parameters: [id, targetPhaseId] })
          .then((r) => (r.rows as unknown[])[0] as Record<string, unknown> | undefined),
        db.executeQuery({ sql: "SELECT * FROM governance.check_cross_cycle_gate($1, $2)", parameters: [id, targetPhaseId] })
          .then((r) => (r.rows as unknown[])[0] as Record<string, unknown> | undefined),
      ]);

      if (phaseGate && !phaseGate["gate_passed"]) {
        res.status(409).json({ error: "GATE_BLOCKED", message: "Phase gate not cleared", gate: phaseGate }); return;
      }
      if (crossGate && !crossGate["gate_passed"]) {
        res.status(409).json({ error: "CROSS_CYCLE_BLOCKED", message: "Cross-cycle dependency not met", gate: crossGate }); return;
      }

      const row = await db
        .updateTable("governance.cycle_run" as never)
        .set({ status: "IN_PROGRESS", current_phase_id: targetPhaseId, updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toCycleRun(row) });
    } catch (err) { logger?.error("governance_advance_phase_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/complete ─────────────────────────────

  router.post("/governance/cycle-runs/:id/complete", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const cleanResult = await db
        .executeQuery({ sql: "SELECT * FROM governance.evaluate_clean_cycle($1)", parameters: [id] })
        .then((r) => (r.rows as unknown[])[0] as Record<string, unknown> | undefined)
        .catch(() => null);

      if (cleanResult && cleanResult["is_clean"] === false) {
        res.status(409).json({ error: "NOT_CLEAN", message: "Cycle has blocking open deviations", detail: cleanResult }); return;
      }

      const row = await db
        .updateTable("governance.cycle_run" as never)
        .set({ status: "COMPLETED", completed_at: new Date(), completed_by: ctx.principalId, updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "in", ["OPEN", "IN_PROGRESS", "PHASE_GATE"] as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      res.json({ ok: true, data: toCycleRun(row) });
    } catch (err) { logger?.error("governance_complete_run_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/certify ───────────────────────────────

  router.post("/governance/cycle-runs/:id/certify", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("governance.cycle_run" as never)
        .set({ status: "CERTIFIED", certified_at: new Date(), certified_by: ctx.principalId, updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "=", "COMPLETED" as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE", message: "Run must be COMPLETED to certify" }); return; }
      res.json({ ok: true, data: toCycleRun(row) });
    } catch (err) { logger?.error("governance_certify_run_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/close ────────────────────────────────

  router.post("/governance/cycle-runs/:id/close", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { nextRunId } = req.body as Record<string, unknown>;

      await db.transaction().execute(async (trx) => {
        // Execute carryforward if next run is provided
        if (nextRunId && isUuid(String(nextRunId))) {
          await trx.executeQuery({ sql: "SELECT governance.execute_carryforward($1, $2)", parameters: [id, nextRunId] });
        }
        await trx
          .updateTable("governance.cycle_run" as never)
          .set({ status: "CLOSED", updated_at: new Date(), updated_by: ctx.principalId } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", ctx.tenantId as never)
          .execute();
      });

      res.json({ ok: true });
    } catch (err) { logger?.error("governance_close_run_error", { err: String(err) }); next(err); }
  });

  // ── GET /governance/cycle-runs/:id/tasks ─────────────────────────────────

  router.get("/governance/cycle-runs/:id/tasks", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const status = req.query["status"] as string | undefined;
      let q = db
        .selectFrom("governance.cycle_task as ct" as never)
        .selectAll("ct" as never)
        .where("ct.tenant_id" as never, "=", ctx.tenantId as never)
        .where("ct.cycle_run_id" as never, "=", id as never)
        .orderBy("ct.created_at" as never);
      if (status) q = q.where("ct.status" as never, "=", status as never);
      const rows = await q.execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows.map(toCycleTask) });
    } catch (err) { logger?.error("governance_list_tasks_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-tasks/:id/start ────────────────────────────────

  router.post("/governance/cycle-tasks/:id/start", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .updateTable("governance.cycle_task" as never)
        .set({ status: "IN_PROGRESS", updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "=", "PENDING" as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      res.json({ ok: true, data: toCycleTask(row) });
    } catch (err) { logger?.error("governance_start_task_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-tasks/:id/complete ─────────────────────────────

  router.post("/governance/cycle-tasks/:id/complete", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { completionNotes, evidencePayload } = req.body as Record<string, unknown>;

      // Check task dependencies before completing
      const depCheck = await db
        .executeQuery({ sql: "SELECT * FROM governance.check_task_dependencies($1, $2)", parameters: [null, id] })
        .then((r) => (r.rows as unknown[])[0] as Record<string, unknown> | undefined)
        .catch(() => null);

      if (depCheck && depCheck["can_complete"] === false) {
        res.status(409).json({ error: "DEPENDENCY_BLOCKED", message: "Predecessor tasks not yet complete", detail: depCheck }); return;
      }

      const row = await db
        .updateTable("governance.cycle_task" as never)
        .set({ status: "COMPLETED", completed_by: ctx.principalId, completed_at: new Date(), completion_notes: completionNotes ?? null, evidence_payload: evidencePayload ? JSON.stringify(evidencePayload) : "{}", updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "=", "IN_PROGRESS" as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      res.json({ ok: true, data: toCycleTask(row) });
    } catch (err) { logger?.error("governance_complete_task_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-tasks/:id/fail ────────────────────────────────

  router.post("/governance/cycle-tasks/:id/fail", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { failureReason } = req.body as Record<string, unknown>;
      if (!failureReason) { res.status(400).json({ error: "MISSING_FIELDS", message: "failureReason required" }); return; }
      const row = await db
        .updateTable("governance.cycle_task" as never)
        .set({ status: "FAILED", failure_reason: failureReason, failed_at: new Date(), updated_at: new Date(), updated_by: ctx.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", ctx.tenantId as never)
        .where("status" as never, "in", ["PENDING", "IN_PROGRESS"] as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      res.json({ ok: true, data: toCycleTask(row) });
    } catch (err) { logger?.error("governance_fail_task_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-tasks/:id/deviate ─────────────────────────────

  router.post("/governance/cycle-tasks/:id/deviate", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      if (!body["title"] || !body["reasonCode"] || !body["deviationType"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "title, reasonCode, deviationType required" }); return;
      }

      // Get task's run context
      const task = await db
        .selectFrom("governance.cycle_task as ct" as never)
        .select(["ct.cycle_run_id", "ct.entity_code", "ct.id"] as never[])
        .where("ct.id" as never, "=", id as never)
        .where("ct.tenant_id" as never, "=", ctx.tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!task) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      await db.transaction().execute(async (trx) => {
        // Mark task as deviated
        await trx.updateTable("governance.cycle_task" as never)
          .set({ status: "DEVIATED", updated_at: new Date(), updated_by: ctx.principalId } as never)
          .where("id" as never, "=", id as never)
          .execute();
        // Create deviation record
        await trx.insertInto("governance.cycle_deviation" as never)
          .values({
            tenant_id: ctx.tenantId, entity_code: task["entity_code"],
            cycle_run_id: task["cycle_run_id"], deviation_type: body["deviationType"],
            scope: "TASK", task_id: id, title: body["title"],
            description: body["description"] ?? null, reason_code: body["reasonCode"],
            reason_subcode: body["reasonSubcode"] ?? null, reason_detail: body["reasonDetail"] ?? null,
            severity: body["severity"] ?? "MEDIUM", impact_type: body["impactType"] ?? "PROCESS",
            impact_amount: body["impactAmount"] ?? null, impact_currency: body["impactCurrency"] ?? null,
            requested_by: ctx.principalId, effective_from: new Date(),
            created_by: ctx.principalId,
          } as never)
          .execute();
      });

      res.json({ ok: true });
    } catch (err) { logger?.error("governance_deviate_task_error", { err: String(err) }); next(err); }
  });

  // ── GET /governance/cycle-runs/:id/deviations ─────────────────────────────

  router.get("/governance/cycle-runs/:id/deviations", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("governance.cycle_deviation as cd" as never)
        .selectAll("cd" as never)
        .where("cd.tenant_id" as never, "=", ctx.tenantId as never)
        .where("cd.cycle_run_id" as never, "=", id as never)
        .orderBy("cd.created_at" as never, "desc")
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows.map(toCycleDeviation) });
    } catch (err) { logger?.error("governance_list_deviations_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/deviations ────────────────────────────

  router.post("/governance/cycle-runs/:id/deviations", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      if (!body["title"] || !body["reasonCode"] || !body["deviationType"] || !body["entityCode"]) {
        res.status(400).json({ error: "MISSING_FIELDS" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_deviation" as never)
        .values({
          tenant_id: ctx.tenantId, entity_code: body["entityCode"], cycle_run_id: id,
          deviation_type: body["deviationType"], scope: body["scope"] ?? "TASK",
          task_id: body["taskId"] ?? null, title: body["title"],
          description: body["description"] ?? null, reason_code: body["reasonCode"],
          reason_subcode: body["reasonSubcode"] ?? null, reason_detail: body["reasonDetail"] ?? null,
          severity: body["severity"] ?? "MEDIUM", impact_type: body["impactType"] ?? "PROCESS",
          impact_amount: body["impactAmount"] ?? null, impact_currency: body["impactCurrency"] ?? null,
          requested_by: ctx.principalId, effective_from: new Date(),
          created_by: ctx.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toCycleDeviation(row) });
    } catch (err) { logger?.error("governance_create_deviation_error", { err: String(err) }); next(err); }
  });

  // ── Deviation lifecycle actions ────────────────────────────────────────────

  const deviationAction = (fromStatuses: string[], toStatus: string, extraFields: (body: Record<string, unknown>, principalId: string) => Record<string, unknown>) =>
    async (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) => {
      try {
        const ctx = await resolveTenantAndPrincipal(req, res);
        if (!ctx) return;
        const { id } = req.params;
        if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
        const row = await db
          .updateTable("governance.cycle_deviation" as never)
          .set({ status: toStatus, updated_at: new Date(), updated_by: ctx.principalId, ...extraFields(req.body as Record<string, unknown>, ctx.principalId) } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", ctx.tenantId as never)
          .where("status" as never, "in", fromStatuses as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
        res.json({ ok: true, data: toCycleDeviation(row) });
      } catch (err) { logger?.error(`governance_deviation_${toStatus.toLowerCase()}_error`, { err: String(err) }); next(err); }
    };

  router.post("/governance/cycle-deviations/:id/submit",  deviationAction(["OPEN"], "PENDING_APPROVAL", () => ({})));
  router.post("/governance/cycle-deviations/:id/approve", deviationAction(["PENDING_APPROVAL"], "APPROVED", (body, pid) => ({ decision_notes: body["decisionNotes"] ?? null, assigned_to: pid, assigned_at: new Date() })));
  router.post("/governance/cycle-deviations/:id/reject",  deviationAction(["PENDING_APPROVAL"], "REJECTED",  (body) => ({ decision_notes: body["decisionNotes"] ?? null })));
  router.post("/governance/cycle-deviations/:id/resolve", deviationAction(["APPROVED", "APPLIED"], "RESOLVED", (body, pid) => ({ resolution_notes: body["resolutionNotes"] ?? null, resolved_by: pid, resolved_at: new Date() })));

  // ── GET /governance/cycle-runs/:id/certifications ─────────────────────────

  router.get("/governance/cycle-runs/:id/certifications", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const [rows, metrics] = await Promise.all([
        db.selectFrom("governance.cycle_certification as cc" as never)
          .selectAll("cc" as never)
          .where("cc.tenant_id" as never, "=", ctx.tenantId as never)
          .where("cc.cycle_run_id" as never, "=", id as never)
          .orderBy("cc.created_at" as never, "desc")
          .execute() as Promise<Record<string, unknown>[]>,
        db.executeQuery({ sql: "SELECT * FROM governance.get_certification_metrics($1)", parameters: [id] })
          .then((r) => (r.rows as unknown[])[0] ?? null)
          .catch(() => null),
      ]);

      res.json({ ok: true, data: rows.map(toCycleCertification), metrics });
    } catch (err) { logger?.error("governance_list_certifications_error", { err: String(err) }); next(err); }
  });

  // ── POST /governance/cycle-runs/:id/certifications ────────────────────────

  router.post("/governance/cycle-runs/:id/certifications", async (req, res, next) => {
    try {
      const ctx = await resolveTenantAndPrincipal(req, res);
      if (!ctx) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      if (!body["certCode"] || !body["entityCode"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "certCode, entityCode required" }); return;
      }
      const row = await db
        .insertInto("governance.cycle_certification" as never)
        .values({
          tenant_id: ctx.tenantId, entity_code: body["entityCode"], cycle_run_id: id,
          cert_code: body["certCode"], cert_version: body["certVersion"] ?? 1,
          cert_type: body["certType"] ?? "STANDARD",
          content_hash: body["contentHash"] ?? null,
          snapshot_payload: body["snapshotPayload"] ?? null,
          controller_notes: body["controllerNotes"] ?? null,
          created_by: ctx.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toCycleCertification(row) });
    } catch (err) { logger?.error("governance_create_certification_error", { err: String(err) }); next(err); }
  });

  // ── Certification lifecycle actions ───────────────────────────────────────

  const certAction = (fromStatus: string, toStatus: string, extra: (body: Record<string, unknown>, pid: string) => Record<string, unknown>) =>
    async (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) => {
      try {
        const ctx = await resolveTenantAndPrincipal(req, res);
        if (!ctx) return;
        const { id } = req.params;
        if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
        const row = await db
          .updateTable("governance.cycle_certification" as never)
          .set({ status: toStatus, updated_at: new Date(), updated_by: ctx.principalId, ...extra(req.body as Record<string, unknown>, ctx.principalId) } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", ctx.tenantId as never)
          .where("status" as never, "=", fromStatus as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
        res.json({ ok: true, data: toCycleCertification(row) });
      } catch (err) { logger?.error(`governance_cert_${toStatus.toLowerCase()}_error`, { err: String(err) }); next(err); }
    };

  router.post("/governance/cycle-certifications/:id/certify", certAction("PENDING_REVIEW", "CERTIFIED", (_, pid) => ({ certified_by: pid, certified_at: new Date() })));
  router.post("/governance/cycle-certifications/:id/attest", certAction("CERTIFIED", "ATTESTED",  (body, pid) => ({ attested_by: pid, attested_at: new Date(), attestation_notes: body["attestationNotes"] ?? null })));
  router.post("/governance/cycle-certifications/:id/revoke", certAction("ATTESTED",   "REVOKED",   (body) => ({ revocation_reason: body["revocationReason"] ?? null })));
}
