/**
 * Policy & Rules Engine Routes
 *
 * Policy Definitions (when does a policy apply?)
 *   GET    /policy/definitions                     — list (filter: entity_type, module_id, is_active)
 *   POST   /policy/definitions                     — create
 *   GET    /policy/definitions/:id                 — detail
 *   PUT    /policy/definitions/:id                 — update
 *   GET    /policy/definitions/:id/export          — download JSON bundle (definition + rules)
 *   POST   /policy/definitions/import              — import JSON bundle with conflict detection
 *
 * Policy Rules (what happens when the policy fires?)
 *   GET    /policy/definitions/:id/rules           — list rules for a policy
 *   POST   /policy/definitions/:id/rules           — add a rule
 *   PUT    /policy/rules/:ruleId                   — update a rule
 *   DELETE /policy/rules/:ruleId                   — remove a rule
 *
 * Ad-hoc Evaluation
 *   POST   /policy/evaluate                        — evaluate policies for an entity_type + payload
 *
 * Evaluation Log
 *   GET    /policy/log                             — query policy_evaluation_log
 *
 * All write routes require an authenticated principal.
 * Evaluation (POST /evaluate) also requires authentication.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
} from "@athyper/svc-shared";

function resolveTenantId(claims: Record<string, unknown>): string | null {
  const t = claims["tenant_id"];
  return typeof t === "string" && t ? t : null;
}

function resolvePrincipalIdOrNull(claims: Record<string, unknown>): string | null {
  const s = claims["sub"] ?? claims["principal_id"];
  return typeof s === "string" && s ? s : null;
}
import {
  PolicyEngine,
  type PolicyAction,
  type EvaluationMode,
} from "../engine.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface PolicyRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function resolveActor(
  deps: PolicyRouteDeps,
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<{ tenantId: string; principalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
  if (!claims) return null;

  const tenantId = resolveTenantId(claims);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_TENANT" });
    return null;
  }

  const principalId = resolvePrincipalIdOrNull(claims);
  if (!principalId) {
    res.status(401).json({ error: "MISSING_PRINCIPAL" });
    return null;
  }

  return { tenantId, principalId };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createPolicyRoutes(router: Router, deps: PolicyRouteDeps): void {
  const engine = new PolicyEngine({ db: deps.db, logger: deps.logger });

  // ── GET /policy/definitions ───────────────────────────────────────────────

  router.get("/policy/definitions", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const { entity_type, module_id, is_active, limit, offset } = req.query as Record<string, string | undefined>;

    const items = await engine.listDefinitions({
      tenantId,
      entityType:  entity_type  || undefined,
      moduleId:    module_id    || undefined,
      isActive:    is_active !== undefined ? is_active === "true" : undefined,
      limit:       limit  ? parseInt(limit,  10) : 50,
      offset:      offset ? parseInt(offset, 10) : 0,
    });

    res.json({ items });
  }) as RequestHandler);

  // ── POST /policy/definitions ──────────────────────────────────────────────

  router.post("/policy/definitions", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const { entity_type, module_id, name, description, priority, evaluation_mode, effective_from, effective_until } = req.body as Record<string, unknown>;

    if (!entity_type || typeof entity_type !== "string") {
      res.status(400).json({ error: "MISSING_ENTITY_TYPE" }); return;
    }
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "MISSING_NAME" }); return;
    }
    if (module_id && !isUuid(module_id as string)) {
      res.status(400).json({ error: "INVALID_MODULE_ID" }); return;
    }
    const validModes: EvaluationMode[] = ["first_match", "accumulate", "all"];
    if (evaluation_mode && !validModes.includes(evaluation_mode as EvaluationMode)) {
      res.status(400).json({ error: "INVALID_EVALUATION_MODE", valid: validModes }); return;
    }

    const definition = await engine.createDefinition({
      tenantId,
      moduleId:       module_id       as string | undefined,
      entityType:     entity_type,
      name,
      description:    description     as string | undefined,
      priority:       priority        ? parseInt(String(priority), 10) : undefined,
      evaluationMode: evaluation_mode as EvaluationMode | undefined,
      effectiveFrom:  effective_from  as string | undefined,
      effectiveUntil: effective_until as string | undefined,
      createdBy:      principalId,
    });

    res.status(201).json(definition);
  }) as RequestHandler);

  // ── GET /policy/definitions/:id ───────────────────────────────────────────

  router.get("/policy/definitions/:id", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const definition = await engine.getDefinition(id, tenantId);
    if (!definition) { res.status(404).json({ error: "NOT_FOUND" }); return; }

    res.json(definition);
  }) as RequestHandler);

  // ── PUT /policy/definitions/:id ───────────────────────────────────────────

  router.put("/policy/definitions/:id", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const { name, description, priority, evaluation_mode, effective_from, effective_until, status } = req.body as Record<string, unknown>;

    const validModes: EvaluationMode[] = ["first_match", "accumulate", "all"];
    if (evaluation_mode && !validModes.includes(evaluation_mode as EvaluationMode)) {
      res.status(400).json({ error: "INVALID_EVALUATION_MODE", valid: validModes }); return;
    }
    const validStatuses = ["active", "inactive", "deprecated"];
    if (status && !validStatuses.includes(status as string)) {
      res.status(400).json({ error: "INVALID_STATUS", valid: validStatuses }); return;
    }

    const definition = await engine.updateDefinition(id, tenantId, {
      name:           name           as string | undefined,
      description:    description    as string | undefined,
      priority:       priority       ? parseInt(String(priority), 10) : undefined,
      evaluationMode: evaluation_mode as EvaluationMode | undefined,
      effectiveFrom:  effective_from  as string | undefined,
      effectiveUntil: effective_until as string | undefined,
      status:         status         as string | undefined,
      updatedBy:      principalId,
    });

    if (!definition) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json(definition);
  }) as RequestHandler);

  // ── GET /policy/definitions/:id/rules ────────────────────────────────────

  router.get("/policy/definitions/:id/rules", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const rules = await engine.listRules(id, tenantId);
    res.json({ items: rules });
  }) as RequestHandler);

  // ── POST /policy/definitions/:id/rules ───────────────────────────────────

  router.post("/policy/definitions/:id/rules", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const { priority, conditions, action, score, confidence, explanation, approvers, sla_hours } =
      req.body as Record<string, unknown>;

    const validActions: PolicyAction[] = ["allow", "deny", "warn", "require_workflow", "escalate"];
    if (!action || !validActions.includes(action as PolicyAction)) {
      res.status(400).json({ error: "INVALID_ACTION", valid: validActions }); return;
    }

    const rule = await engine.createRule(id, tenantId, {
      priority:    priority    ? parseInt(String(priority), 10) : undefined,
      conditions:  conditions  ?? undefined,
      action:      action      as PolicyAction,
      score:       score       != null ? parseFloat(String(score)) : undefined,
      confidence:  confidence  != null ? parseFloat(String(confidence)) : undefined,
      explanation: explanation as string | undefined,
      approvers:   Array.isArray(approvers) ? approvers : undefined,
      slaHours:    sla_hours   ? parseInt(String(sla_hours), 10) : undefined,
      createdBy:   principalId,
    });

    if (!rule) { res.status(404).json({ error: "POLICY_NOT_FOUND" }); return; }
    res.status(201).json(rule);
  }) as RequestHandler);

  // ── PUT /policy/rules/:ruleId ─────────────────────────────────────────────

  router.put("/policy/rules/:ruleId", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const ruleId = req.params["ruleId"] as string;
    if (!isUuid(ruleId)) { res.status(400).json({ error: "INVALID_RULE_ID" }); return; }

    const { priority, conditions, action, score, confidence, explanation, approvers, sla_hours } =
      req.body as Record<string, unknown>;

    const validActions: PolicyAction[] = ["allow", "deny", "warn", "require_workflow", "escalate"];
    if (action && !validActions.includes(action as PolicyAction)) {
      res.status(400).json({ error: "INVALID_ACTION", valid: validActions }); return;
    }

    const rule = await engine.updateRule(ruleId, tenantId, {
      priority:    priority    !== undefined ? parseInt(String(priority), 10) : undefined,
      conditions:  conditions  !== undefined ? conditions : undefined,
      action:      action      as PolicyAction | undefined,
      score:       score       !== undefined ? (score != null ? parseFloat(String(score)) : null) : undefined,
      confidence:  confidence  !== undefined ? (confidence != null ? parseFloat(String(confidence)) : null) : undefined,
      explanation: explanation !== undefined ? (explanation as string | null) : undefined,
      approvers:   approvers   !== undefined ? (Array.isArray(approvers) ? approvers : null) : undefined,
      slaHours:    sla_hours   !== undefined ? (sla_hours != null ? parseInt(String(sla_hours), 10) : null) : undefined,
      updatedBy:   principalId,
    });

    if (!rule) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json(rule);
  }) as RequestHandler);

  // ── DELETE /policy/rules/:ruleId ──────────────────────────────────────────

  router.delete("/policy/rules/:ruleId", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId } = actor;
    const ruleId = req.params["ruleId"] as string;
    if (!isUuid(ruleId)) { res.status(400).json({ error: "INVALID_RULE_ID" }); return; }

    const deleted = await engine.deleteRule(ruleId, tenantId);
    if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.status(204).send();
  }) as RequestHandler);

  // ── POST /policy/evaluate ─────────────────────────────────────────────────

  router.post("/policy/evaluate", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const {
      entity_type,
      entity_id,
      payload,
      company_code_id,
      legal_entity_id,
      pipeline_id,
      txn_id,
    } = req.body as Record<string, unknown>;

    if (!entity_type || typeof entity_type !== "string") {
      res.status(400).json({ error: "MISSING_ENTITY_TYPE" }); return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      res.status(400).json({ error: "MISSING_PAYLOAD" }); return;
    }

    const result = await engine.evaluate({
      tenantId,
      entityType:    entity_type,
      entityId:      entity_id     as string | undefined,
      payload:       payload       as Record<string, unknown>,
      companyCodeId: company_code_id as string | undefined,
      legalEntityId: legal_entity_id as string | undefined,
      pipelineId:    pipeline_id   as string | undefined,
      txnId:         txn_id        as string | undefined,
      requestedBy:   principalId,
    });

    res.json(result);
  }) as RequestHandler);

  // ── GET /policy/log ───────────────────────────────────────────────────────

  router.get("/policy/log", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const { txn_id, pipeline_id, action, limit, offset } = req.query as Record<string, string | undefined>;

    const items = await engine.queryLog({
      tenantId,
      txnId:      txn_id      || undefined,
      pipelineId: pipeline_id || undefined,
      action:     action      || undefined,
      limit:      limit  ? parseInt(limit,  10) : 50,
      offset:     offset ? parseInt(offset, 10) : 0,
    });

    res.json({ items });
  }) as RequestHandler);

  // ── GET /policy/rules/:ruleId/versions — rule change history ──────────────

  router.get("/policy/rules/:ruleId/versions", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;
    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const ruleId = req.params["ruleId"] as string;
    if (!isUuid(ruleId)) { res.status(400).json({ error: "INVALID_RULE_ID" }); return; }

    // Verify the rule belongs to this tenant via policy join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ruleCheck = await (deps.db as any)
      .selectFrom("control.policy_rule as pr")
      .innerJoin("control.policy_definition as pd", "pd.id", "pr.policy_id")
      .select("pr.id")
      .where("pr.id" as never, "=", ruleId as never)
      .where("pd.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!ruleCheck) { res.status(404).json({ error: "NOT_FOUND" }); return; }

    const versions = await deps.db
      .selectFrom("control.policy_rule_version as prv" as never)
      .selectAll("prv" as never)
      .where("prv.policy_rule_id" as never, "=", ruleId as never)
      .orderBy("prv.version_no" as never, "desc")
      .execute() as Record<string, unknown>[];

    res.json({
      items: versions.map((v) => ({
        id:            v["id"],
        policyRuleId:  v["policy_rule_id"],
        policyId:      v["policy_id"],
        versionNo:     v["version_no"],
        ruleSnapshot:  v["rule_snapshot"],
        effectiveFrom: v["effective_from"],
        effectiveUntil: v["effective_until"] ?? null,
        publishedBy:   v["published_by"] ?? null,
        publishedAt:   v["published_at"],
      })),
    });
  }) as RequestHandler);

  // ── GET /policy/definitions/:id/test-cases ────────────────────────────────

  router.get("/policy/definitions/:id/test-cases", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;
    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const items = await deps.db
      .selectFrom("control.policy_test_case as ptc" as never)
      .selectAll("ptc" as never)
      .where("ptc.tenant_id" as never, "=", tenantId as never)
      .where("ptc.policy_definition_id" as never, "=", id as never)
      .where("ptc.is_active" as never, "=", true as never)
      .orderBy("ptc.test_name" as never, "asc")
      .execute() as Record<string, unknown>[];

    res.json({ items: items.map((tc) => ({
      id:                 tc["id"],
      policyDefinitionId: tc["policy_definition_id"],
      testName:           tc["test_name"],
      description:        tc["description"] ?? null,
      inputPayload:       tc["input_payload"],
      expectedOutcome:    tc["expected_outcome"],
      lastRunAt:          tc["last_run_at"] ?? null,
      lastRunPassed:      tc["last_run_passed"] ?? null,
      lastRunResult:      tc["last_run_result"] ?? null,
      lastRunMs:          tc["last_run_ms"] ?? null,
      createdAt:          tc["created_at"],
    })) });
  }) as RequestHandler);

  // ── POST /policy/definitions/:id/test-cases ───────────────────────────────

  router.post("/policy/definitions/:id/test-cases", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const { test_name, description, input_payload, expected_outcome } = req.body as Record<string, unknown>;
    if (!test_name || typeof test_name !== "string") {
      res.status(400).json({ error: "MISSING_TEST_NAME" }); return;
    }
    if (!input_payload || typeof input_payload !== "object" || Array.isArray(input_payload)) {
      res.status(400).json({ error: "MISSING_INPUT_PAYLOAD" }); return;
    }
    if (!expected_outcome || typeof expected_outcome !== "object" || Array.isArray(expected_outcome)) {
      res.status(400).json({ error: "MISSING_EXPECTED_OUTCOME" }); return;
    }

    const tc = await deps.db
      .insertInto("control.policy_test_case" as never)
      .values({
        tenant_id:           tenantId,
        policy_definition_id: id,
        test_name:           test_name.trim(),
        description:         (description as string | undefined)?.trim() ?? null,
        input_payload,
        expected_outcome,
        is_active:           true,
        created_by:          principalId,
      } as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown>;

    res.status(201).json({ id: tc["id"], testName: tc["test_name"] });
  }) as RequestHandler);

  // ── PUT /policy/test-cases/:tcId ──────────────────────────────────────────

  router.put("/policy/test-cases/:tcId", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const tcId = req.params["tcId"] as string;
    if (!isUuid(tcId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const { test_name, description, input_payload, expected_outcome } = req.body as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updated_by: principalId, updated_at: new Date() };
    if (test_name     !== undefined) updates["test_name"] = String(test_name).trim();
    if (description   !== undefined) updates["description"] = description ?? null;
    if (input_payload !== undefined) updates["input_payload"] = input_payload;
    if (expected_outcome !== undefined) updates["expected_outcome"] = expected_outcome;

    const updated = await deps.db
      .updateTable("control.policy_test_case" as never)
      .set(updates as never)
      .where("id" as never, "=", tcId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!updated) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json({ id: updated["id"], testName: updated["test_name"] });
  }) as RequestHandler);

  // ── DELETE /policy/test-cases/:tcId (soft) ────────────────────────────────

  router.delete("/policy/test-cases/:tcId", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const tcId = req.params["tcId"] as string;
    if (!isUuid(tcId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const deleted = await deps.db
      .updateTable("control.policy_test_case" as never)
      .set({ is_active: false, updated_at: new Date(), updated_by: principalId } as never)
      .where("id" as never, "=", tcId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("is_active" as never, "=", true as never)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.status(204).send();
  }) as RequestHandler);

  // ── POST /policy/test-cases/:tcId/run — run one test case ─────────────────

  router.post("/policy/test-cases/:tcId/run", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const tcId = req.params["tcId"] as string;
    if (!isUuid(tcId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tc = await (deps.db as any)
      .selectFrom("control.policy_test_case as ptc")
      .innerJoin("control.policy_definition as pd", "pd.id", "ptc.policy_definition_id")
      .selectAll("ptc")
      .select("pd.entity_type")
      .where("ptc.id", "=", tcId)
      .where("ptc.tenant_id", "=", tenantId)
      .where("ptc.is_active", "=", true)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!tc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

    const startMs = Date.now();
    let actualResult: Record<string, unknown>;
    let passed = false;

    try {
      const evalResult = await engine.evaluate({
        tenantId,
        entityType:  tc["entity_type"] as string,
        payload:     tc["input_payload"] as Record<string, unknown>,
        requestedBy: principalId,
      });

      actualResult = {
        action:    evalResult.action,
        permitted: evalResult.permitted,
        score:     evalResult.winning?.score ?? null,
      };

      // Compare against expected_outcome
      const expected = tc["expected_outcome"] as Record<string, unknown>;
      passed = expected["action"] === actualResult["action"];
      if (expected["permitted"] !== undefined) {
        passed = passed && expected["permitted"] === actualResult["permitted"];
      }
      if (expected["score_min"] !== undefined || expected["score_max"] !== undefined) {
        const score = actualResult["score"] as number | null;
        if (score !== null) {
          if (expected["score_min"] !== undefined) passed = passed && score >= (expected["score_min"] as number);
          if (expected["score_max"] !== undefined) passed = passed && score <= (expected["score_max"] as number);
        } else {
          passed = false;
        }
      }
    } catch (err) {
      actualResult = { error: String(err) };
      passed = false;
    }

    const durationMs = Date.now() - startMs;

    // Persist last run result
    await deps.db
      .updateTable("control.policy_test_case" as never)
      .set({
        last_run_at:     new Date(),
        last_run_passed: passed,
        last_run_result: actualResult,
        last_run_ms:     durationMs,
        updated_at:      new Date(),
        updated_by:      principalId,
      } as never)
      .where("id" as never, "=", tcId as never)
      .execute();

    res.json({ passed, actualResult, expectedOutcome: tc["expected_outcome"], durationMs });
  }) as RequestHandler);

  // ── GET /policy/definitions/:id/export ───────────────────────────────────
  // Returns a portable JSON bundle: { schema_version, exported_at, definition, rules }
  // The Content-Disposition header triggers a file download in browsers.

  router.get("/policy/definitions/:id/export", (async (req, res) => {
    const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const definition = await engine.getDefinition(id, tenantId);
    if (!definition) { res.status(404).json({ error: "NOT_FOUND" }); return; }

    const rules = await engine.listRules(id, tenantId);

    // Strip server-side fields that should not be imported verbatim
    const { id: _defId, tenant_id: _tenantId, created_at: _ca, updated_at: _ua,
            created_by: _cb, updated_by: _ub, version_no: _vn, ...defFields } =
      (definition as unknown) as Record<string, unknown>;

    const exportedRules = rules.map((r) => {
      const { id: _rId, policy_id: _pid, created_at: _rca, updated_at: _rua,
              created_by: _rcb, updated_by: _rub, ...rFields } = (r as unknown) as Record<string, unknown>;
      return rFields;
    });

    const bundle = {
      schema_version: "1.0",
      exported_at:    new Date().toISOString(),
      definition:     defFields,
      rules:          exportedRules,
    };

    const filename = `policy_${((definition as unknown) as Record<string, unknown>)["entity_type"]}_${Date.now()}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.json(bundle);
  }) as RequestHandler);

  // ── POST /policy/definitions/import ──────────────────────────────────────
  // Accepts a bundle from GET .../export.
  // Conflict detection: if a policy with the same (entity_type, name) exists for
  // this tenant, the import is rejected unless the body includes { overwrite: true }.
  // Returns { created, definitionId, rulesImported, conflict? }.

  router.post("/policy/definitions/import", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const { definition: defInput, rules: rulesInput, overwrite, schema_version } =
      req.body as Record<string, unknown>;

    if (!schema_version || schema_version !== "1.0") {
      res.status(400).json({ error: "UNSUPPORTED_SCHEMA_VERSION", message: "bundle schema_version must be '1.0'" });
      return;
    }
    if (!defInput || typeof defInput !== "object" || Array.isArray(defInput)) {
      res.status(400).json({ error: "MISSING_DEFINITION" }); return;
    }
    const def = defInput as Record<string, unknown>;
    if (!def["entity_type"] || typeof def["entity_type"] !== "string") {
      res.status(400).json({ error: "MISSING_ENTITY_TYPE" }); return;
    }
    if (!def["name"] || typeof def["name"] !== "string") {
      res.status(400).json({ error: "MISSING_NAME" }); return;
    }

    // Conflict check: same entity_type + name in this tenant
    const existing = await deps.db
      .selectFrom("control.policy_definition as pd" as never)
      .select(["pd.id" as never, "pd.name" as never, "pd.entity_type" as never])
      .where("pd.tenant_id"   as never, "=", tenantId  as never)
      .where("pd.entity_type" as never, "=", def["entity_type"] as never)
      .where("pd.name"        as never, "=", def["name"]        as never)
      .where("pd.is_active"   as never, "=", true               as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (existing && !overwrite) {
      res.status(409).json({
        error:        "CONFLICT",
        message:      `A policy named "${def["name"]}" for entity_type "${def["entity_type"]}" already exists.`,
        conflict:     { id: existing["id"], name: existing["name"], entityType: existing["entity_type"] },
        hint:         "Pass overwrite: true to replace the existing policy's rules.",
      });
      return;
    }

    const validModes: string[] = ["first_match", "accumulate", "all"];
    const evalMode = def["evaluation_mode"] as string | undefined;
    const importedDefinition = existing && overwrite
      ? existing  // reuse the existing definition ID; rules will be replaced
      : await engine.createDefinition({
          tenantId,
          entityType:     def["entity_type"]    as string,
          moduleId:       def["module_id"]       as string | undefined,
          name:           def["name"]            as string,
          description:    def["description"]     as string | undefined,
          priority:       def["priority"]        ? parseInt(String(def["priority"]), 10) : undefined,
          evaluationMode: (evalMode && validModes.includes(evalMode) ? evalMode : "first_match") as never,
          effectiveFrom:  def["effective_from"]  as string | undefined,
          effectiveUntil: def["effective_until"] as string | undefined,
          createdBy:      principalId,
        });

    const targetId = (importedDefinition as Record<string, unknown>)["id"] as string;

    // If overwriting: soft-delete existing rules by marking them inactive
    if (existing && overwrite) {
      await deps.db
        .updateTable("control.policy_rule" as never)
        .set({ updated_at: new Date(), updated_by: principalId } as never)
        .where("policy_id" as never, "=", targetId  as never)
        .execute();

      // Hard-delete old rules so priority sequence is clean
      await deps.db
        .deleteFrom("control.policy_rule" as never)
        .where("policy_id" as never, "=", targetId as never)
        .execute();
    }

    // Import rules
    const rules = Array.isArray(rulesInput) ? rulesInput as Record<string, unknown>[] : [];
    let rulesImported = 0;

    const validActions = new Set(["allow", "deny", "warn", "require_workflow", "escalate"]);
    for (const r of rules) {
      const action = r["action"] as string | undefined;
      if (!action || !validActions.has(action)) continue;

      await engine.createRule(targetId, tenantId, {
        priority:    r["priority"]    ? parseInt(String(r["priority"]), 10) : undefined,
        conditions:  r["conditions"]  ?? undefined,
        action:      action           as never,
        score:       r["score"]       != null ? parseFloat(String(r["score"])) : undefined,
        confidence:  r["confidence"]  != null ? parseFloat(String(r["confidence"])) : undefined,
        explanation: r["explanation"] as string | undefined,
        approvers:   Array.isArray(r["approvers"]) ? r["approvers"] : undefined,
        slaHours:    r["sla_hours"]   ? parseInt(String(r["sla_hours"]), 10) : undefined,
        createdBy:   principalId,
      });
      rulesImported++;
    }

    res.status(existing && overwrite ? 200 : 201).json({
      created:       !(existing && overwrite),
      overwritten:   !!(existing && overwrite),
      definitionId:  targetId,
      rulesImported,
    });
  }) as RequestHandler);

  // ── POST /policy/definitions/:id/test — run ALL test cases ────────────────

  router.post("/policy/definitions/:id/test", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;
    const { tenantId, principalId } = actor;

    const id = req.params["id"] as string;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testCases = await (deps.db as any)
      .selectFrom("control.policy_test_case as ptc")
      .innerJoin("control.policy_definition as pd", "pd.id", "ptc.policy_definition_id")
      .selectAll("ptc")
      .select("pd.entity_type")
      .where("ptc.policy_definition_id", "=", id)
      .where("ptc.tenant_id", "=", tenantId)
      .where("ptc.is_active", "=", true)
      .execute() as Record<string, unknown>[];

    const results: Array<{ tcId: string; testName: string; passed: boolean; durationMs: number }> = [];

    for (const tc of testCases) {
      const startMs = Date.now();
      let passed = false;
      try {
        const evalResult = await engine.evaluate({
          tenantId,
          entityType:  tc["entity_type"] as string,
          payload:     tc["input_payload"] as Record<string, unknown>,
          requestedBy: principalId,
        });
        const expected = tc["expected_outcome"] as Record<string, unknown>;
        passed = expected["action"] === evalResult.action;
        if (expected["permitted"] !== undefined) {
          passed = passed && expected["permitted"] === evalResult.permitted;
        }
      } catch { passed = false; }

      const durationMs = Date.now() - startMs;

      await deps.db
        .updateTable("control.policy_test_case" as never)
        .set({ last_run_at: new Date(), last_run_passed: passed, last_run_ms: durationMs, updated_at: new Date(), updated_by: principalId } as never)
        .where("id" as never, "=", tc["id"] as string as never)
        .execute();

      results.push({ tcId: tc["id"] as string, testName: tc["test_name"] as string, passed, durationMs });
    }

    const totalPassed = results.filter((r) => r.passed).length;
    res.json({
      total:   results.length,
      passed:  totalPassed,
      failed:  results.length - totalPassed,
      results,
    });
  }) as RequestHandler);
}
