/**
 * Policy & Rules Engine Routes
 *
 * Policy Definitions (when does a policy apply?)
 *   GET    /policy/definitions                     — list (filter: entity_type, module_id, is_active)
 *   POST   /policy/definitions                     — create
 *   GET    /policy/definitions/:id                 — detail
 *   PUT    /policy/definitions/:id                 — update
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
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
} from "@athyper/svc-shared";
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
  const claims = await verifyBearer(deps.auth, req, res);
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
    const claims = await verifyBearer(deps.auth, req, res);
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
    const claims = await verifyBearer(deps.auth, req, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const { id } = req.params;
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
    const { id } = req.params;
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
    const claims = await verifyBearer(deps.auth, req, res);
    if (!claims) return;

    const tenantId = resolveTenantId(claims);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

    const rules = await engine.listRules(id, tenantId);
    res.json({ items: rules });
  }) as RequestHandler);

  // ── POST /policy/definitions/:id/rules ───────────────────────────────────

  router.post("/policy/definitions/:id/rules", (async (req, res) => {
    const actor = await resolveActor(deps, req, res);
    if (!actor) return;

    const { tenantId, principalId } = actor;
    const { id } = req.params;
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
    const { ruleId } = req.params;
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
    const { ruleId } = req.params;
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
    const claims = await verifyBearer(deps.auth, req, res);
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
}
