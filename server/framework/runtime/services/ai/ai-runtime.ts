/**
 * AIRuntime — the single entry point for all AI actions in the platform.
 *
 * Architecture principle: every AI call goes through runAction().  Domain
 * adapters (Layer 3) never call model providers directly.
 *
 * Execution flow:
 *   1. Parse & validate ActionRequest (Zod)
 *   2. Resolve autonomy policy (AutonomyResolver)
 *   3. Resolve confidence thresholds (ConfidenceResolver)
 *   4. Find capability handler (CapabilityRegistry)
 *   5. Run capability → raw CapabilityResult
 *   6. Compute effective decision:
 *        rawDecision  = confidence → tier map against thresholds
 *        decision     = capByCeiling(rawDecision, policy.autonomy_level)
 *        decision     = capByCeiling(decision,    handler.consumer_ceiling)
 *   7. Write inference log row (fire-and-forget)
 *   8. Return ActionResponse
 *
 * Callers MUST NOT use confidence values to gate autonomy — only decision
 * carries the authoritative autonomy signal.  Confidence is display-only.
 */

import { randomUUID } from "node:crypto";
import type { AnyDb, ActionRequest, ActionResponse, AiLogger } from "./ai-runtime.types.js";
import { ActionRequestSchema, capByCeiling, type AutonomyLevel } from "./ai-runtime.types.js";
import type { AutonomyResolver }   from "./autonomy-resolver.service.js";
import type { ConfidenceResolver } from "./confidence-resolver.service.js";
import type { CapabilityRegistry, CapabilityDeps } from "./capability-registry.js";
import type { InferenceLogWriter }  from "./inference-log-writer.js";
import type { ModelRouter }         from "./model-router.js";
import type { PromptStore }         from "./prompt-store.js";
import type { EvidenceBinder }      from "./evidence-binder.js";

export interface AiRuntimeDeps {
  db:                 AnyDb;
  autonomyResolver:   AutonomyResolver;
  confidenceResolver: ConfidenceResolver;
  capabilityRegistry: CapabilityRegistry;
  inferenceLogWriter: InferenceLogWriter;
  modelRouter:        ModelRouter;
  promptStore:        PromptStore;
  evidenceBinder:     EvidenceBinder;
  logger:             AiLogger;
}

export class AIRuntime {
  constructor(private readonly deps: AiRuntimeDeps) {}

  async runAction(
    rawRequest: unknown,
    tenantId:   string,
    principalId: string,
  ): Promise<ActionResponse> {
    const pipelineId = randomUUID();
    const {
      db, autonomyResolver, confidenceResolver, capabilityRegistry,
      inferenceLogWriter, modelRouter, promptStore, evidenceBinder, logger,
    } = this.deps;

    // ── 1. Parse request ──────────────────────────────────────────────────────
    const parsed = ActionRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      return this._failedResponse(pipelineId, "unknown", [
        { code: "INVALID_REQUEST", message: parsed.error.issues.map((i) => i.message).join("; ") },
      ]);
    }
    const request = parsed.data;

    // ── 2. Resolve autonomy policy ────────────────────────────────────────────
    const policy = await autonomyResolver.resolve(tenantId, request.action_code, request.doc_class);

    if (!policy.is_active || policy.autonomy_level === "disabled") {
      logger.info("ai_action_denied_disabled", { tenantId, actionCode: request.action_code, pipelineId });
      return this._deniedResponse(pipelineId, request.action_code, [
        { code: "ACTION_DISABLED", message: `Action "${request.action_code}" is disabled for this tenant` },
      ]);
    }

    // ── 3. Find capability handler ────────────────────────────────────────────
    const handler = capabilityRegistry.get(request.action_code);
    if (!handler) {
      return this._failedResponse(pipelineId, request.action_code, [
        { code: "CAPABILITY_NOT_REGISTERED", message: `No capability handler for action "${request.action_code}"` },
      ]);
    }

    // ── 4. Resolve confidence thresholds ─────────────────────────────────────
    const thresholds = await confidenceResolver.resolve(tenantId, request.action_code, request.doc_class, null);

    // ── 5. Run capability ─────────────────────────────────────────────────────
    let capResult;
    try {
      const capDeps: CapabilityDeps = { db, modelRouter, promptStore, evidenceBinder, logger };
      capResult = await handler.run(capDeps, {
        request, tenantId, principalId, pipelineId,
      });
    } catch (e) {
      logger.error("ai_capability_run_failed", { pipelineId, actionCode: request.action_code, err: String(e) });
      return this._failedResponse(pipelineId, request.action_code, [
        { code: "CAPABILITY_EXECUTION_FAILED", message: String(e) },
      ]);
    }

    // ── 6. Compute effective decision ─────────────────────────────────────────
    const overall = capResult.confidence.overall;
    const rawDecision = this._confidenceToDecision(overall, thresholds);

    // Cap: policy ceiling (tenant-configured)
    let decision = capByCeiling(rawDecision, policy.autonomy_level);
    // Cap: handler ceiling (hardcoded — financial actions capped at assist)
    decision = capByCeiling(decision, handler.consumer_ceiling);

    // If desired_tier is stricter than computed decision, honour it
    if (request.desired_tier) {
      decision = capByCeiling(decision, request.desired_tier);
    }

    const modelId    = capResult.modelId    ?? "unknown";
    const modelVersion = capResult.modelVersion ?? "unknown";

    const finalResponse: ActionResponse = {
      action_code:  request.action_code,
      status:       "ok",
      decision:     decision === "disabled" ? "denied" : decision,
      output:       capResult.output,
      confidence:   capResult.confidence,
      evidence:     capResult.evidence,
      pipeline_id:        pipelineId,
      ai_inference_log_id: "", // filled below after write
      model_id:     modelId,
      model_version: modelVersion,
      prompt_version: capResult.promptVersion,
      cost_units:   capResult.costUnits,
      blockers:     [],
      warnings:     capResult.warnings,
    };

    // ── 7. Write inference log (fire-and-forget) ──────────────────────────────
    const logId = await inferenceLogWriter
      .write({ pipelineId, tenantId, principalId, request, response: finalResponse })
      .catch((e) => {
        logger.error("ai_inference_log_failed", { pipelineId, err: String(e) });
        return "";
      });

    finalResponse.ai_inference_log_id = logId;

    logger.info("ai_action_complete", {
      tenantId, pipelineId,
      actionCode: request.action_code,
      decision,
      confidence: overall,
    });

    return finalResponse;
  }

  // Computes the raw decision level from confidence and thresholds.
  private _confidenceToDecision(
    confidence: number,
    thresholds: { min_for_auto: number; min_for_assist: number; min_for_suggest: number },
  ): AutonomyLevel {
    if (confidence >= thresholds.min_for_auto)    return "auto";
    if (confidence >= thresholds.min_for_assist)  return "assist";
    if (confidence >= thresholds.min_for_suggest) return "suggest";
    return "suggest"; // below suggest threshold → still return suggest; policy may cap to denied
  }

  private _failedResponse(
    pipelineId:  string,
    actionCode:  string,
    blockers:    Array<{ code: string; message: string }>,
  ): ActionResponse {
    return {
      action_code: actionCode,
      status:      "failed",
      decision:    "denied",
      output:      null,
      confidence:  { overall: 0, fields: {} },
      evidence:    {},
      pipeline_id:          pipelineId,
      ai_inference_log_id:  "",
      model_id:    "",
      model_version: "",
      prompt_version: null,
      cost_units:  { input_tokens: 0, output_tokens: 0, vision_pages: 0, duration_ms: 0 },
      blockers,
      warnings:    [],
    };
  }

  private _deniedResponse(
    pipelineId:  string,
    actionCode:  string,
    blockers:    Array<{ code: string; message: string }>,
  ): ActionResponse {
    return { ...this._failedResponse(pipelineId, actionCode, blockers), status: "blocked" };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAiRuntime(deps: AiRuntimeDeps): AIRuntime {
  return new AIRuntime(deps);
}
