import { describe, expect, it, vi } from "vitest";
import { createAnthropicAtlasBindings } from "../model-catalog.js";
import {
  ATLAS_AGENT_GLOBAL_FLAG,
  ATLAS_AGENT_PLANE_FLAGS,
  createPhase0AtlasPlanePolicyResolver,
} from "../plane-policy.js";

const neonSession = {
  tenantId: "tenant-1",
  principalId: "principal-1",
  plane: "neon",
};

function resolver(enabledCodes: readonly string[]) {
  const isEnabled = vi.fn(async (code: string) =>
    enabledCodes.includes(code)
  );
  return {
    isEnabled,
    policy: createPhase0AtlasPlanePolicyResolver({
      featureFlags: { isEnabled },
      evaluateBinding: () => ({ allowed: true }),
    }),
  };
}

describe("Phase 0 Atlas plane admission", () => {
  it("allows only allowlisted Neon chat and keeps later feature classes off", async () => {
    const { policy, isEnabled } = resolver([
      ATLAS_AGENT_GLOBAL_FLAG,
      ATLAS_AGENT_PLANE_FLAGS.neon,
    ]);

    await expect(policy.resolve(neonSession)).resolves.toMatchObject({
      plane: "neon",
      chatAllowed: true,
      persistenceAllowed: false,
      readToolsAllowed: false,
      mutationsAllowed: false,
      allowedPublicModelIds: [
        "atlas-fast",
        "atlas-balanced",
        "atlas-best",
        "atlas-openai-eval",
        "atlas-gemini-eval",
      ],
    });
    expect(isEnabled.mock.calls).toEqual([
      [ATLAS_AGENT_GLOBAL_FLAG, "tenant-1"],
      [ATLAS_AGENT_PLANE_FLAGS.neon, "tenant-1"],
    ]);
  });

  it.each(["mesh"] as const)(
    "keeps %s disabled even when its rollout flag is true",
    async (plane) => {
      const { policy } = resolver([
        ATLAS_AGENT_GLOBAL_FLAG,
        ATLAS_AGENT_PLANE_FLAGS[plane],
      ]);

      await expect(policy.resolve({
        ...neonSession,
        plane,
      })).resolves.toMatchObject({
        plane,
        chatAllowed: false,
        persistenceAllowed: false,
        readToolsAllowed: false,
        mutationsAllowed: false,
        reasonCode: "plane_not_enabled",
      });
    },
  );

  it("allows Admin product-help chat while keeping persistence and tools off", async () => {
    const { policy } = resolver([
      ATLAS_AGENT_GLOBAL_FLAG,
      ATLAS_AGENT_PLANE_FLAGS.admin,
    ]);

    await expect(policy.resolve({
      ...neonSession,
      plane: "admin",
    })).resolves.toMatchObject({
      plane: "admin",
      chatAllowed: true,
      persistenceAllowed: false,
      readToolsAllowed: false,
      mutationsAllowed: false,
      allowedPublicModelIds: ["atlas-fast"],
    });
  });

  it("fails closed when either the global or Neon rollout flag is absent", async () => {
    const globalOff = resolver([]);
    const planeOff = resolver([ATLAS_AGENT_GLOBAL_FLAG]);

    await expect(globalOff.policy.resolve(neonSession)).resolves.toMatchObject({
      chatAllowed: false,
      reasonCode: "global_feature_disabled",
    });
    await expect(planeOff.policy.resolve(neonSession)).resolves.toMatchObject({
      chatAllowed: false,
      reasonCode: "plane_feature_disabled",
    });
  });

  it("binds feature posture and plane into the model policy revision", async () => {
    const { policy } = resolver([
      ATLAS_AGENT_GLOBAL_FLAG,
      ATLAS_AGENT_PLANE_FLAGS.neon,
      ATLAS_AGENT_PLANE_FLAGS.mesh,
    ]);
    const neon = await policy.resolve(neonSession);
    const mesh = await policy.resolve({ ...neonSession, plane: "mesh" });

    expect(neon.policyRevision).toContain(":neon:");
    expect(neon.policyRevision).toContain("persistence=0");
    expect(mesh.policyRevision).toContain(":mesh:");
    expect(mesh.policyRevision).not.toBe(neon.policyRevision);
  });

  it("does not let a resolved snapshot authorize another scope", async () => {
    const { policy } = resolver([
      ATLAS_AGENT_GLOBAL_FLAG,
      ATLAS_AGENT_PLANE_FLAGS.neon,
    ]);
    const snapshot = await policy.resolveBindingPolicy(neonSession);
    const binding = createAnthropicAtlasBindings({
      fastUpstreamModelId: "claude-haiku-4-5-20251001",
      balancedUpstreamModelId: "claude-sonnet-4-6",
      bestUpstreamModelId: "claude-opus-4-8",
    })[0]!;

    await expect(snapshot.evaluatePolicy(binding, {
      ...neonSession,
      tenantId: "tenant-2",
    })).resolves.toEqual({
      allowed: false,
      reason: "plane_policy_scope_mismatch",
    });
  });

  it("uses only server model allowlists when evaluating a binding", async () => {
    const { policy } = resolver([
      ATLAS_AGENT_GLOBAL_FLAG,
      ATLAS_AGENT_PLANE_FLAGS.neon,
    ]);
    const snapshot = await policy.resolveBindingPolicy(neonSession);
    const binding = {
      ...createAnthropicAtlasBindings({
        fastUpstreamModelId: "claude-haiku-4-5-20251001",
        balancedUpstreamModelId: "claude-sonnet-4-6",
        bestUpstreamModelId: "claude-opus-4-8",
      })[0]!,
      publicModelId: "client-injected-model",
    };

    await expect(snapshot.evaluatePolicy(binding, neonSession)).resolves.toEqual({
      allowed: false,
      reason: "model_not_allowed_for_plane",
    });
  });
});
