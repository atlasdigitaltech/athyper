import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationDecisionRouter,
  AuthorizationV2EnforcementError,
} from "../authorization-decision-router.js";
import type {
  AuthorizationRolloutSelection,
} from "../authorization-rollout.types.js";

interface Decision {
  decision: "allow" | "deny";
  permissions: string[];
  scopes: string[];
}

function selection(
  mode: AuthorizationRolloutSelection["mode"],
): AuthorizationRolloutSelection {
  return {
    mode,
    planeKey: "neon",
    permissionCode: "finance.journal.post",
    reason: mode === "legacy" ? "default_legacy" : "matched_rule",
    policyRevision: "rev-1",
    ...(mode === "legacy" ? {} : { ruleId: `${mode}-rule` }),
  };
}

function router(onShadowComparison = vi.fn()) {
  return {
    onShadowComparison,
    router: new AuthorizationDecisionRouter<Decision>({
      areEquivalent: (legacy, v2) =>
        JSON.stringify(legacy) === JSON.stringify(v2),
      onShadowComparison,
    }),
  };
}

describe("AuthorizationDecisionRouter", () => {
  it("uses only the legacy evaluator in legacy mode", async () => {
    const { router: decisionRouter } = router();
    const legacy = {
      decision: "allow",
      permissions: ["finance.journal.post"],
      scopes: ["company-a"],
    } satisfies Decision;
    const evaluateLegacy = vi.fn(async () => legacy);
    const evaluateV2 = vi.fn(async () => ({
      decision: "deny" as const,
      permissions: [],
      scopes: [],
    }));

    const result = await decisionRouter.decide(selection("legacy"), {
      evaluateLegacy,
      evaluateV2,
    });

    expect(result).toBe(legacy);
    expect(evaluateLegacy).toHaveBeenCalledOnce();
    expect(evaluateV2).not.toHaveBeenCalled();
  });

  it("runs both evaluators in shadow but returns the exact legacy object", async () => {
    const { router: decisionRouter, onShadowComparison } = router();
    const legacy = {
      decision: "allow",
      permissions: ["finance.journal.post"],
      scopes: ["company-a"],
    } satisfies Decision;
    const v2 = {
      decision: "allow",
      permissions: ["finance.journal.post"],
      scopes: ["company-b"],
    } satisfies Decision;

    const result = await decisionRouter.decide(selection("shadow"), {
      evaluateLegacy: vi.fn(async () => legacy),
      evaluateV2: vi.fn(async () => v2),
    });

    expect(result).toBe(legacy);
    expect(result.permissions).toEqual(["finance.journal.post"]);
    expect(result.scopes).toEqual(["company-a"]);
    expect(onShadowComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "mismatch",
        legacyDecision: legacy,
        v2Decision: v2,
      }),
    );
  });

  it("returns legacy and reports when v2 fails in shadow", async () => {
    const { router: decisionRouter, onShadowComparison } = router();
    const legacy = {
      decision: "deny",
      permissions: [],
      scopes: [],
    } satisfies Decision;
    const v2Error = new Error("v2 unavailable");

    await expect(decisionRouter.decide(selection("shadow"), {
      evaluateLegacy: vi.fn(async () => legacy),
      evaluateV2: vi.fn(async () => {
        throw v2Error;
      }),
    })).resolves.toBe(legacy);
    expect(onShadowComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "v2_error",
        legacyDecision: legacy,
        v2Error,
      }),
    );
  });

  it("uses only v2 in enforce mode", async () => {
    const { router: decisionRouter } = router();
    const v2 = {
      decision: "allow",
      permissions: ["finance.journal.post"],
      scopes: ["company-a"],
    } satisfies Decision;
    const evaluateLegacy = vi.fn(async () => ({
      decision: "deny" as const,
      permissions: [],
      scopes: [],
    }));
    const evaluateV2 = vi.fn(async () => v2);

    await expect(decisionRouter.decide(selection("enforce"), {
      evaluateLegacy,
      evaluateV2,
    })).resolves.toBe(v2);
    expect(evaluateLegacy).not.toHaveBeenCalled();
    expect(evaluateV2).toHaveBeenCalledOnce();
  });

  it("fails closed without legacy fallback when v2 fails in enforce mode", async () => {
    const { router: decisionRouter } = router();
    const evaluateLegacy = vi.fn(async () => ({
      decision: "allow" as const,
      permissions: ["finance.journal.post"],
      scopes: ["tenant"],
    }));

    await expect(decisionRouter.decide(selection("enforce"), {
      evaluateLegacy,
      evaluateV2: vi.fn(async () => {
        throw new Error("v2 failed");
      }),
    })).rejects.toBeInstanceOf(AuthorizationV2EnforcementError);
    expect(evaluateLegacy).not.toHaveBeenCalled();
  });

  it("falls back to legacy for an invalid runtime mode", async () => {
    const { router: decisionRouter } = router();
    const legacy = {
      decision: "deny",
      permissions: [],
      scopes: [],
    } satisfies Decision;
    const evaluateLegacy = vi.fn(async () => legacy);
    const evaluateV2 = vi.fn(async () => ({
      decision: "allow" as const,
      permissions: ["finance.journal.post"],
      scopes: ["tenant"],
    }));

    await expect(decisionRouter.decide({
      ...selection("legacy"),
      mode: "percentage-50",
    } as unknown as AuthorizationRolloutSelection, {
      evaluateLegacy,
      evaluateV2,
    })).resolves.toBe(legacy);
    expect(evaluateV2).not.toHaveBeenCalled();
  });
});
