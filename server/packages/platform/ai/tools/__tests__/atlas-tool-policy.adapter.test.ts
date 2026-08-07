import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { FoundationReadOnlyAtlasToolPolicyAdapter } from "../atlas-tool-policy.adapter.js";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
} as VerifiedRequestContext;

const input = {
  toolName: "atlas_catalog_help",
  toolVersion: "1.0.0",
  actionCode: "atlas_tool_read",
  access: "read_only" as const,
  risk: "low" as const,
};

function target(overrides: {
  autonomy?: "disabled" | "suggest" | "assist" | "auto";
  confirmation?: boolean;
  active?: boolean;
  threshold?: number;
} = {}) {
  const resolveAutonomy = vi.fn(async () => ({
    autonomy_level: overrides.autonomy ?? "auto",
    requires_human_confirmation: overrides.confirmation ?? false,
    min_confidence_for_auto: null,
    is_active: overrides.active ?? true,
  }));
  const resolveConfidence = vi.fn(async () => ({
    min_for_suggest: 0,
    min_for_assist: 0,
    min_for_auto: overrides.threshold ?? 0,
    drift_alert_below: null,
    drift_window_hours: 72,
  }));
  return {
    adapter: new FoundationReadOnlyAtlasToolPolicyAdapter(
      { resolveStrict: resolveAutonomy },
      { resolveStrict: resolveConfidence },
    ),
    resolveAutonomy,
    resolveConfidence,
  };
}

describe("FoundationReadOnlyAtlasToolPolicyAdapter", () => {
  it("allows only an automatic, confirmation-free, zero-threshold read", async () => {
    const { adapter } = target();

    await expect(adapter.evaluate(context, input)).resolves.toMatchObject({
      allowed: true,
      riskCeiling: "low",
      policyRevision: expect.stringMatching(
        /^atlas-tool-policy-v1:sha256:[a-f0-9]{64}$/,
      ),
      policySnapshot: {
        autonomyLevel: "auto",
        requiresHumanConfirmation: false,
        confidenceThreshold: 0,
      },
    });
  });

  it.each([
    [{ autonomy: "assist" as const }, "automatic_read_not_authorized"],
    [{ confirmation: true }, "confirmation_flow_unavailable"],
    [{ threshold: 0.1 }, "proposal_confidence_unavailable"],
    [{ active: false }, "policy_inactive"],
  ])("fails closed for a stricter policy %#", async (overrides, reasonCode) => {
    const { adapter } = target(overrides);

    await expect(adapter.evaluate(context, input)).resolves.toMatchObject({
      allowed: false,
      riskCeiling: "low",
      reasonCode,
    });
  });

  it("propagates strict resolver failures instead of using a permissive fallback", async () => {
    const adapter = new FoundationReadOnlyAtlasToolPolicyAdapter(
      {
        resolveStrict: vi.fn(async () => {
          throw new Error("policy database unavailable");
        }),
      },
      {
        resolveStrict: vi.fn(async () => ({
          min_for_suggest: 0,
          min_for_assist: 0,
          min_for_auto: 0,
          drift_alert_below: null,
          drift_window_hours: 72,
        })),
      },
    );

    await expect(adapter.evaluate(context, input)).rejects.toThrow(
      "policy database unavailable",
    );
  });
});
