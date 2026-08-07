/**
 * AI Foundation Routes
 *
 * POST   /api/ai/actions/run            — execute an AI action (persists inference log)
 * POST   /api/ai/actions/preview        — dry-run (no inference log, no DB writes)
 * POST   /api/ai/feedback               — submit user verdict on an AI output
 * GET    /api/ai/policy/effective       — resolve effective policy for (action, doc_class)
 * PUT    /api/ai/policy/autonomy        - upsert autonomy policy and invalidate cache
 * PUT    /api/ai/policy/threshold       - upsert confidence threshold and invalidate cache
 *
 * Auth:   Bearer token required on all routes.
 * Perms:  ai.use_extraction to call /run and /preview
 *         ai.agent.feedback.submit for Atlas Agent feedback
 *         ai.review_ai_output for legacy AI feedback
 *         ai.calibrate_thresholds to mutate AI policy and thresholds
 *         (no permission gate on /policy/effective — informational only)
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { z } from "zod";
import { checkPermission, requireAllow } from "@athyper/svc-iam";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import type { AIRuntime }         from "../ai-runtime.js";
import type { AutonomyResolver }  from "../autonomy-resolver.service.js";
import type { ConfidenceResolver } from "../confidence-resolver.service.js";
import type { FeedbackLogWriter } from "../feedback-log-writer.js";
import type { AnyDb }             from "../ai-runtime.types.js";
import { ActionRequestSchema }    from "../ai-runtime.types.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AiRouteDeps {
  db:                 AnyDb;
  auth:               { verifyToken(token: string): Promise<{ sub: string; [k: string]: unknown }> };
  aiRuntime:          AIRuntime;
  autonomyResolver:   AutonomyResolver;
  confidenceResolver: ConfidenceResolver;
  feedbackLogWriter:  FeedbackLogWriter;
  logger:             { info(event: string, fields?: Record<string, unknown>): void; error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerAiRoutes(router: Router, deps: AiRouteDeps): Router {
  const { db, auth, aiRuntime, autonomyResolver, confidenceResolver, feedbackLogWriter, logger } = deps;

  // ── POST /api/ai/actions/run ─────────────────────────────────────────────
  router.post("/ai/actions/run", (req, res) => {
    void (async () => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;

        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "tenant_not_found" }); return; }

        const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId, xRealm) ?? "";

        const permCheck = await checkPermission(db, tenantId, principalId, "ai.use_extraction");
        if (!requireAllow(permCheck, res)) {
          return;
        }

        const parsed = ActionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
          return;
        }

        const response = await aiRuntime.runAction(parsed.data, tenantId, principalId);
        res.status(response.status === "ok" ? 200 : response.status === "blocked" ? 403 : 422).json(response);
      } catch (e) {
        logger.error("ai_run_route_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  // ── POST /api/ai/actions/preview ─────────────────────────────────────────
  // Same as /run but runs without writing inference log or mutating DB.
  // Used by the frontend to show the AI suggestion before the user commits.
  router.post("/ai/actions/preview", (req, res) => {
    void (async () => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;

        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "tenant_not_found" }); return; }

        const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId, xRealm) ?? "";

        const permCheck = await checkPermission(db, tenantId, principalId, "ai.use_extraction");
        if (!requireAllow(permCheck, res)) return;

        const parsed = ActionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
          return;
        }

        // Preview runs through the same runtime but the inference log writer
        // is a no-op in preview context.  We mark the response pipeline_id with
        // "preview:" prefix so logs can distinguish.
        const response = await aiRuntime.runAction(
          { ...parsed.data, context: { ...parsed.data.context, extra: { ...parsed.data.context.extra, _preview: true } } },
          tenantId,
          principalId,
        );

        res.status(200).json({ ...response, ai_inference_log_id: null });
      } catch (e) {
        logger.error("ai_preview_route_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  // ── POST /api/ai/feedback ────────────────────────────────────────────────
  const FeedbackSchema = z.object({
    feedback_type:     z.string().min(1),
    entity_type:       z.string().optional(),
    entity_id:         z.string().uuid().optional(),
    target_id:         z.string().uuid().optional(),
    verdict:           z.enum(["correct", "wrong", "partial", "missing"]),
    reason_code:       z.string().optional(),
    reason_detail:     z.string().max(2000).optional(),
    evidence_snapshot: z.any().optional(),
    detail:            z.any().optional(),
  });
  const AtlasAgentFeedbackDetailSchema = z.object({
    agent_run_id: z.string().uuid(),
    message_id: z.string().uuid(),
  }).strict();
  const AtlasAgentFeedbackSchema = z.object({
    feedback_type: z.literal("atlas_agent"),
    target_id: z.string().uuid(),
    verdict: z.enum(["correct", "wrong", "partial", "missing"]),
    reason_code: z.string().trim().min(1).max(100).optional(),
    reason_detail: z.string().trim().min(1).max(2000).optional(),
    detail: AtlasAgentFeedbackDetailSchema,
  }).strict();

  router.post("/ai/feedback", (req, res) => {
    void (async () => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;

        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "tenant_not_found" }); return; }

        const principalId = await resolvePrincipalIdOrNull(
          db,
          String(claims["sub"] ?? ""),
          tenantId,
          xRealm,
        );
        if (!principalId) {
          res.status(403).json({ error: "forbidden", reason: "principal_not_found" });
          return;
        }

        const parsed = FeedbackSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
          return;
        }

        const fb = parsed.data;
        const isAtlasAgentFeedback = fb.feedback_type === "atlas_agent";
        const permCheck = await checkPermission(
          db,
          tenantId,
          principalId,
          isAtlasAgentFeedback
            ? "ai.agent.feedback.submit"
            : "ai.review_ai_output",
        );
        if (!requireAllow(permCheck, res)) return;

        if (isAtlasAgentFeedback) {
          const atlasFeedback = AtlasAgentFeedbackSchema.safeParse(req.body);
          if (
            !atlasFeedback.success
            || atlasFeedback.data.target_id
              !== atlasFeedback.data.detail.agent_run_id
          ) {
            res.status(400).json({
              error: "invalid_atlas_agent_feedback_target",
            });
            return;
          }

          const ownedRun = await db
            .selectFrom("ai.ai_agent_run")
            .select("id")
            .where("tenant_id", "=", tenantId)
            .where("principal_id", "=", principalId)
            .where("id", "=", atlasFeedback.data.target_id)
            .where(
              "response_message_id",
              "=",
              atlasFeedback.data.detail.message_id,
            )
            .executeTakeFirst();
          if (!ownedRun) {
            res.status(404).json({ error: "atlas_agent_run_not_found" });
            return;
          }

          await feedbackLogWriter.write({
            tenantId,
            principalId,
            feedbackType: "atlas_agent",
            targetId: atlasFeedback.data.target_id,
            verdict: atlasFeedback.data.verdict,
            reasonCode: atlasFeedback.data.reason_code,
            reasonDetail: atlasFeedback.data.reason_detail,
            detail: atlasFeedback.data.detail,
          });

          res.status(201).json({ ok: true });
          return;
        }

        await feedbackLogWriter.write({
          tenantId,
          principalId,
          feedbackType:     fb.feedback_type,
          entityType:       fb.entity_type,
          entityId:         fb.entity_id,
          targetId:         fb.target_id,
          verdict:          fb.verdict,
          reasonCode:       fb.reason_code,
          reasonDetail:     fb.reason_detail,
          evidenceSnapshot: fb.evidence_snapshot,
          detail:           fb.detail,
        });

        res.status(201).json({ ok: true });
      } catch (e) {
        logger.error("ai_feedback_route_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  // ── GET /api/ai/policy/effective ─────────────────────────────────────────
  // Returns the effective (tenant-resolved) autonomy policy and confidence
  // thresholds for a given action + doc_class.  Informational — no permission gate.
  router.get("/ai/policy/effective", (req, res) => {
    void (async () => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;

        const { xOrg, xRealm } = extractOrgHeaders(req);
        const tenantId = await resolveTenantId(db, xOrg, xRealm);
        if (!tenantId) { res.status(400).json({ error: "tenant_not_found" }); return; }

        const actionCode = String(req.query["action_code"] ?? "");
        const docClass   = req.query["doc_class"] ? String(req.query["doc_class"]) : null;

        if (!actionCode) {
          res.status(400).json({ error: "action_code_required" });
          return;
        }

        const [policy, thresholds] = await Promise.all([
          autonomyResolver.resolve(tenantId, actionCode, docClass),
          confidenceResolver.resolve(tenantId, actionCode, docClass, null),
        ]);

        res.json({ action_code: actionCode, doc_class: docClass, policy, thresholds });
      } catch (e) {
        logger.error("ai_policy_route_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  const AutonomyPolicySchema = z.object({
    action_code:                 z.string().trim().min(1),
    doc_class:                   z.string().trim().min(1).nullable().optional(),
    autonomy_level:              z.enum(["disabled", "suggest", "assist", "auto"]),
    min_confidence_for_auto:     z.number().min(0).max(1).nullable().optional(),
    requires_human_confirmation: z.boolean().optional().default(true),
    override_policy_definition_id: z.string().uuid().nullable().optional(),
    is_active:                   z.boolean().optional().default(true),
  });

  const ConfidenceThresholdSchema = z.object({
    action_code:        z.string().trim().min(1),
    doc_class:          z.string().trim().min(1).nullable().optional(),
    model_id:           z.string().trim().min(1).nullable().optional(),
    min_for_suggest:    z.number().min(0).max(1),
    min_for_assist:     z.number().min(0).max(1),
    min_for_auto:       z.number().min(0).max(1),
    drift_alert_below:  z.number().min(0).max(1).nullable().optional(),
    drift_window_hours: z.number().int().positive().optional().default(24),
    is_active:          z.boolean().optional().default(true),
  }).refine((v) => v.min_for_suggest <= v.min_for_assist && v.min_for_assist <= v.min_for_auto, {
    message: "thresholds must satisfy min_for_suggest <= min_for_assist <= min_for_auto",
    path: ["min_for_auto"],
  });

  async function resolvePolicyAdmin(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
  ): Promise<{ tenantId: string; principalId: string } | null> {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;

    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "tenant_not_found" }); return null; }

    const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId, xRealm);
    if (!principalId) { res.status(403).json({ error: "forbidden", reason: "principal_not_found" }); return null; }

    const permCheck = await checkPermission(db, tenantId, principalId, "ai.calibrate_thresholds");
    if (!requireAllow(permCheck, res)) {
      return null;
    }

    return { tenantId, principalId };
  }

  router.put("/ai/policy/autonomy", (req, res) => {
    void (async () => {
      try {
        const admin = await resolvePolicyAdmin(req, res);
        if (!admin) return;

        const parsed = AutonomyPolicySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
          return;
        }

        const body = parsed.data;
        const docClass = body.doc_class ?? null;
        const minConfidence = body.min_confidence_for_auto ?? null;
        const overridePolicyId = body.override_policy_definition_id ?? null;

        const result = await sql<{ id: string }>`
          INSERT INTO ai.ai_action_policy (
            tenant_id, action_code, doc_class, autonomy_level, min_confidence_for_auto,
            requires_human_confirmation, override_policy_definition_id, is_active,
            created_by, updated_by
          )
          VALUES (
            ${admin.tenantId}::uuid, ${body.action_code}, ${docClass}, ${body.autonomy_level},
            ${minConfidence}, ${body.requires_human_confirmation}, ${overridePolicyId}::uuid,
            ${body.is_active}, ${admin.principalId}::uuid, ${admin.principalId}::uuid
          )
          ON CONFLICT ON CONSTRAINT aap_natural_uq DO UPDATE SET
            autonomy_level = EXCLUDED.autonomy_level,
            min_confidence_for_auto = EXCLUDED.min_confidence_for_auto,
            requires_human_confirmation = EXCLUDED.requires_human_confirmation,
            override_policy_definition_id = EXCLUDED.override_policy_definition_id,
            is_active = EXCLUDED.is_active,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
          RETURNING id
        `.execute(db);

        const invalidated = await autonomyResolver.invalidate(admin.tenantId, body.action_code, docClass);
        res.json({
          id: result.rows[0]?.id,
          action_code: body.action_code,
          doc_class: docClass,
          invalidated_cache_keys: invalidated,
        });
      } catch (e) {
        logger.error("ai_policy_autonomy_upsert_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  router.put("/ai/policy/threshold", (req, res) => {
    void (async () => {
      try {
        const admin = await resolvePolicyAdmin(req, res);
        if (!admin) return;

        const parsed = ConfidenceThresholdSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
          return;
        }

        const body = parsed.data;
        const docClass = body.doc_class ?? null;
        const modelId = body.model_id ?? null;
        const driftAlertBelow = body.drift_alert_below ?? null;

        const result = await sql<{ id: string }>`
          INSERT INTO ai.ai_confidence_threshold (
            tenant_id, action_code, doc_class, model_id,
            min_for_suggest, min_for_assist, min_for_auto,
            drift_alert_below, drift_window_hours, is_active,
            created_by, updated_by
          )
          VALUES (
            ${admin.tenantId}::uuid, ${body.action_code}, ${docClass}, ${modelId},
            ${body.min_for_suggest}, ${body.min_for_assist}, ${body.min_for_auto},
            ${driftAlertBelow}, ${body.drift_window_hours}, ${body.is_active},
            ${admin.principalId}::uuid, ${admin.principalId}::uuid
          )
          ON CONFLICT ON CONSTRAINT act_natural_uq DO UPDATE SET
            min_for_suggest = EXCLUDED.min_for_suggest,
            min_for_assist = EXCLUDED.min_for_assist,
            min_for_auto = EXCLUDED.min_for_auto,
            drift_alert_below = EXCLUDED.drift_alert_below,
            drift_window_hours = EXCLUDED.drift_window_hours,
            is_active = EXCLUDED.is_active,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
          RETURNING id
        `.execute(db);

        const invalidated = await confidenceResolver.invalidate(admin.tenantId, body.action_code, docClass, modelId);
        res.json({
          id: result.rows[0]?.id,
          action_code: body.action_code,
          doc_class: docClass,
          model_id: modelId,
          invalidated_cache_keys: invalidated,
        });
      } catch (e) {
        logger.error("ai_policy_threshold_upsert_error", { err: String(e) });
        res.status(500).json({ error: "internal_error" });
      }
    })();
  });

  return router;
}
