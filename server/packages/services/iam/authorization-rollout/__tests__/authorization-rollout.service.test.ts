import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  parseAuthorizationRolloutSnapshot,
} from "../authorization-rollout.policy.js";
import {
  AuthorizationRolloutService,
} from "../authorization-rollout.service.js";
import type {
  AuthorizationRolloutPolicyProvider,
  AuthorizationRolloutSnapshot,
} from "../authorization-rollout.types.js";

const NOW = Date.parse("2026-08-01T00:00:00.000Z");

function approval() {
  return {
    approvedBy: "security-owner",
    approvedAt: "2026-07-30T00:00:00.000Z",
    ticket: "AUTH-100",
    rollbackOwner: "iam-on-call",
    observationWindowEndsAt: "2026-08-14T00:00:00.000Z",
  };
}

function snapshot(
  overrides: Partial<AuthorizationRolloutSnapshot> = {},
): AuthorizationRolloutSnapshot {
  return {
    schemaVersion: 1,
    planeKey: "neon",
    authority: "neon",
    revision: "rev-1",
    defaultMode: "legacy",
    rules: [{
      id: "neon-high-risk-shadow",
      cohortCode: "high-risk",
      mode: "shadow",
      permissionCodes: ["finance.journal.post"],
      tenantIds: ["tenant-a"],
      approval: approval(),
    }],
    ...overrides,
  };
}

function provider(
  value: unknown,
  overrides: Partial<AuthorizationRolloutPolicyProvider> = {},
): AuthorizationRolloutPolicyProvider {
  return {
    planeKey: "neon",
    authority: "neon",
    loadSnapshot: vi.fn(async () => value),
    ...overrides,
  };
}

describe("authorization rollout governance contract", () => {
  it("ships default-legacy, non-percentage, plane-local initial snapshots", () => {
    const contractPath = fileURLToPath(new URL(
      "../../../../../../config/governance/authorization-rollout-contract.json",
      import.meta.url,
    ));
    const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
      defaultMode: string;
      percentageRolloutAllowed: boolean;
      decisionComposition: string;
      policySources: Record<string, {
        authority: string;
        kind: string;
        forbiddenSources?: string[];
      }>;
      initialSnapshots: Record<string, unknown>;
    };

    expect(contract.defaultMode).toBe("legacy");
    expect(contract.percentageRolloutAllowed).toBe(false);
    expect(contract.decisionComposition).toBe("select_one_never_union");
    expect(contract.policySources["mesh"]).toEqual(expect.objectContaining({
      kind: "caller_supplied_plane_local",
      authority: "mesh",
      forbiddenSources: expect.arrayContaining([
        "neon.control.feature_flag",
        "implicit_neon_fallback",
      ]),
    }));

    for (const plane of ["neon", "admin", "mesh"]) {
      const parsed = parseAuthorizationRolloutSnapshot(
        contract.initialSnapshots[plane],
      );
      expect(parsed.planeKey).toBe(plane);
      expect(parsed.defaultMode).toBe("legacy");
      expect(parsed.rules).toEqual([]);
    }
  });
});

describe("AuthorizationRolloutService", () => {
  it("selects shadow only for an exact approved cohort match", async () => {
    const service = new AuthorizationRolloutService({
      planeKey: "neon",
      policyProvider: provider(snapshot()),
      now: () => NOW,
    });

    await expect(service.select({
      planeKey: "neon",
      permissionCode: "finance.journal.post",
      cohortCode: "high-risk",
      tenantId: "tenant-a",
      principalId: "principal-a",
    })).resolves.toEqual(expect.objectContaining({
      mode: "shadow",
      reason: "matched_rule",
      ruleId: "neon-high-risk-shadow",
      policyRevision: "rev-1",
    }));

    await expect(service.select({
      planeKey: "neon",
      permissionCode: "finance.journal.read",
      cohortCode: "high-risk",
      tenantId: "tenant-a",
    })).resolves.toEqual(expect.objectContaining({
      mode: "legacy",
      reason: "default_legacy",
    }));
  });

  it("selects legacy when policy loading or validation fails", async () => {
    const unavailable = new AuthorizationRolloutService({
      planeKey: "neon",
      policyProvider: {
        ...provider(null),
        loadSnapshot: vi.fn(async () => {
          throw new Error("policy store unavailable");
        }),
      },
      now: () => NOW,
    });
    await expect(unavailable.select({
      planeKey: "neon",
      permissionCode: "finance.journal.post",
    })).resolves.toEqual(expect.objectContaining({
      mode: "legacy",
      reason: "policy_unavailable",
    }));

    const invalid = {
      ...snapshot(),
      rolloutPct: 10,
    };
    const malformed = new AuthorizationRolloutService({
      planeKey: "neon",
      policyProvider: provider(invalid),
      now: () => NOW,
    });
    await expect(malformed.select({
      planeKey: "neon",
      permissionCode: "finance.journal.post",
    })).resolves.toEqual(expect.objectContaining({
      mode: "legacy",
      reason: "invalid_policy",
      diagnosticCode: "UNKNOWN_FIELD",
    }));
  });

  it("rejects non-legacy defaults and wildcard permissions", () => {
    expect(() => parseAuthorizationRolloutSnapshot({
      ...snapshot(),
      defaultMode: "enforce",
    })).toThrow(/defaultMode must remain legacy/);

    expect(() => parseAuthorizationRolloutSnapshot({
      ...snapshot(),
      rules: [{
        ...snapshot().rules[0],
        permissionCodes: ["finance.*"],
      }],
    })).toThrow(/non-exact permission/);
  });

  it("selects legacy for ambiguous overlaps and pinned revision drift", async () => {
    const duplicateMatch = snapshot({
      rules: [
        snapshot().rules[0]!,
        {
          ...snapshot().rules[0]!,
          id: "second-shadow-rule",
          cohortCode: "finance-risk",
        },
      ],
    });
    const service = new AuthorizationRolloutService({
      planeKey: "neon",
      policyProvider: provider(duplicateMatch),
      now: () => NOW,
    });
    const context = {
      planeKey: "neon" as const,
      permissionCode: "finance.journal.post",
      tenantId: "tenant-a",
    };

    await expect(service.select(context)).resolves.toEqual(
      expect.objectContaining({
        mode: "legacy",
        reason: "ambiguous_match",
      }),
    );
    await expect(service.select(context, {
      requiredRevision: "rev-previous",
    })).resolves.toEqual(expect.objectContaining({
      mode: "legacy",
      reason: "revision_mismatch",
      policyRevision: "rev-1",
    }));
  });

  it("requires a caller-supplied Mesh-local provider and policy authority", async () => {
    const neonProviderForMesh = provider(snapshot(), {
      planeKey: "mesh",
      authority: "neon",
    });
    const rejected = new AuthorizationRolloutService({
      planeKey: "mesh",
      policyProvider: neonProviderForMesh,
      now: () => NOW,
    });
    await expect(rejected.select({
      planeKey: "mesh",
      permissionCode: "mesh.exchange.accept",
    })).resolves.toEqual(expect.objectContaining({
      mode: "legacy",
      reason: "provider_mismatch",
    }));
    expect(neonProviderForMesh.loadSnapshot).not.toHaveBeenCalled();

    const meshSnapshot = snapshot({
      planeKey: "mesh",
      authority: "mesh",
      rules: [{
        id: "mesh-exchange-enforce",
        cohortCode: "mesh-exchange",
        mode: "enforce",
        permissionCodes: ["mesh.exchange.accept"],
        approval: approval(),
      }],
    });
    const meshProvider = provider(meshSnapshot, {
      planeKey: "mesh",
      authority: "mesh",
    });
    const accepted = new AuthorizationRolloutService({
      planeKey: "mesh",
      policyProvider: meshProvider,
      now: () => NOW,
    });
    await expect(accepted.select({
      planeKey: "mesh",
      permissionCode: "mesh.exchange.accept",
      cohortCode: "mesh-exchange",
    })).resolves.toEqual(expect.objectContaining({
      mode: "enforce",
      reason: "matched_rule",
    }));
    expect(meshProvider.loadSnapshot).toHaveBeenCalledOnce();
  });

  it("does not activate future or expired rules", async () => {
    const future = snapshot({
      rules: [{
        ...snapshot().rules[0]!,
        effectiveFrom: "2026-08-02T00:00:00.000Z",
      }],
    });
    const expired = snapshot({
      rules: [{
        ...snapshot().rules[0]!,
        expiresAt: "2026-07-31T00:00:00.000Z",
      }],
    });
    for (const candidate of [future, expired]) {
      const service = new AuthorizationRolloutService({
        planeKey: "neon",
        policyProvider: provider(candidate),
        now: () => NOW,
      });
      await expect(service.select({
        planeKey: "neon",
        permissionCode: "finance.journal.post",
        tenantId: "tenant-a",
      })).resolves.toEqual(expect.objectContaining({
        mode: "legacy",
        reason: "default_legacy",
      }));
    }
  });
});
