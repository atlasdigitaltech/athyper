import { createHash } from "node:crypto";
import type { AutonomyResolver } from "../autonomy-resolver.service.js";
import type { ConfidenceResolver } from "../confidence-resolver.service.js";
import type {
  AtlasToolPolicyAdapter,
  AtlasToolPolicyDecision,
} from "./atlas-tool.types.js";

/**
 * Phase 7C.1 policy bridge.
 *
 * Only automatically executable, low-risk reads can pass. Tenant policy can
 * always reduce that ceiling. A non-zero automatic-confidence threshold also
 * denies execution because provider tool proposals carry no trustworthy
 * confidence score.
 */
export class FoundationReadOnlyAtlasToolPolicyAdapter
implements AtlasToolPolicyAdapter {
  constructor(
    private readonly autonomy: Pick<AutonomyResolver, "resolveStrict">,
    private readonly confidence: Pick<ConfidenceResolver, "resolveStrict">,
  ) {}

  async evaluate(
    context: Parameters<AtlasToolPolicyAdapter["evaluate"]>[0],
    input: Parameters<AtlasToolPolicyAdapter["evaluate"]>[1],
  ): Promise<AtlasToolPolicyDecision> {
    return this.evaluateStrict(context, input);
  }

  async evaluateStrict(
    context: Parameters<AtlasToolPolicyAdapter["evaluateStrict"]>[0],
    input: Parameters<AtlasToolPolicyAdapter["evaluateStrict"]>[1],
  ): Promise<AtlasToolPolicyDecision> {
    const [policy, thresholds] = await Promise.all([
      this.autonomy.resolveStrict(
        context.tenantId,
        input.actionCode,
        null,
      ),
      this.confidence.resolveStrict(
        context.tenantId,
        input.actionCode,
        null,
        null,
      ),
    ]);
    const confidenceThreshold = Math.max(
      policy.min_confidence_for_auto ?? 0,
      thresholds.min_for_auto,
    );
    const policySnapshot = Object.freeze({
      autonomyLevel: policy.autonomy_level,
      requiresHumanConfirmation: policy.requires_human_confirmation,
      confidenceThreshold,
    });
    const policyRevision = policyRevisionFor({
      actionCode: input.actionCode,
      access: input.access,
      risk: input.risk,
      isActive: policy.is_active,
      policySnapshot,
      platformRiskCeiling: "low",
    });

    if (!policy.is_active) {
      return denied(
        policyRevision,
        policySnapshot,
        "policy_inactive",
      );
    }
    if (input.access !== "read_only") {
      return denied(
        policyRevision,
        policySnapshot,
        "operation_not_read_only",
      );
    }
    if (policy.autonomy_level !== "auto") {
      return denied(
        policyRevision,
        policySnapshot,
        "automatic_read_not_authorized",
      );
    }
    if (policy.requires_human_confirmation) {
      return denied(
        policyRevision,
        policySnapshot,
        "confirmation_flow_unavailable",
      );
    }
    if (confidenceThreshold > 0) {
      return denied(
        policyRevision,
        policySnapshot,
        "proposal_confidence_unavailable",
      );
    }

    return Object.freeze({
      allowed: true,
      riskCeiling: "low",
      policyRevision,
      policySnapshot,
    });
  }
}

function denied(
  policyRevision: string,
  policySnapshot: AtlasToolPolicyDecision["policySnapshot"],
  reasonCode: string,
): AtlasToolPolicyDecision {
  return Object.freeze({
    allowed: false,
    riskCeiling: "low",
    policyRevision,
    policySnapshot,
    reasonCode,
  });
}

function policyRevisionFor(
  input: Readonly<Record<string, unknown>>,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
  return `atlas-tool-policy-v1:sha256:${digest}`;
}
