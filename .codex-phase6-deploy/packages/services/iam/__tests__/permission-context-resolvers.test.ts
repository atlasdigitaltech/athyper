/**
 * Permission-context resolver — partition logic unit tests.
 *
 * The resolver classes themselves run real SQL through Kysely; that path is
 * covered by Phase 7 integration tests against a live DB. These unit tests
 * exercise only the pure partitioning that takes (checkPermissionBatch output,
 * planeEligibleSet) and produces the EffectivePermissionContext buckets.
 *
 * The registry factory is also exercised here — it is a thin dispatch map
 * with no DB calls.
 */

import { describe, expect, it } from "vitest";

import { createPermissionResolverRegistry } from "../permission-context/index.js";
import { partitionDecisions } from "../permission-context/resolvers/neon-resolver.js";
import type { PlaneKey } from "../permission-context/plane-key.js";
import type { PermissionBatchResult } from "../permission/permission.types.js";

function decision(
  d: "allow" | "deny" | "not_in_plan" | "not_found" | "addon_required" | "not_granted",
  reason = "test",
): PermissionBatchResult[string] {
  return {
    decision: d,
    reason: reason as any,
    scope: { visibility: "own", company_code_ids: [] },
    evaluation_ms: 1,
  };
}

describe("partitionDecisions", () => {
  it("partitions allow / deny / plan-locked / plane-excluded into separate buckets", () => {
    const decisions: PermissionBatchResult = {
      "read":                  decision("allow"),
      "update":                decision("deny"),
      "JOBS.QUEUE.MANAGE":     decision("not_in_plan"),
      "MESH.BUYER.RESPOND":    decision("allow"),
      "delete":                decision("not_found"),
    };
    const planeEligible = new Map([
      ["read",   { code: "read",   is_plan_restricted: false }],
      ["update", { code: "update", is_plan_restricted: false }],
      ["delete", { code: "delete", is_plan_restricted: false }],
      ["JOBS.QUEUE.MANAGE", { code: "JOBS.QUEUE.MANAGE", is_plan_restricted: true }],
    ]);

    const out = partitionDecisions(decisions, planeEligible);

    expect([...out.allowed]).toEqual(["read"]);
    expect([...out.denied]).toEqual(["update"]);
    expect([...out.planLocked]).toEqual(["JOBS.QUEUE.MANAGE"]);
    expect(out.planeExcluded.has("MESH.BUYER.RESPOND")).toBe(true);
    expect(out.entries.get("delete")?.reason).toEqual("missing_permission");
  });

  it("treats addon_required the same as not_in_plan", () => {
    const decisions: PermissionBatchResult = {
      "premium.feature": decision("addon_required", "addon_required"),
    };
    const planeEligible = new Map([
      ["premium.feature", { code: "premium.feature", is_plan_restricted: true }],
    ]);

    const out = partitionDecisions(decisions, planeEligible);

    expect([...out.planLocked]).toEqual(["premium.feature"]);
    expect(out.entries.get("premium.feature")?.reason).toEqual("plan_locked");
  });

  it("emits plane_excluded for codes outside the plane catalog regardless of decision", () => {
    const decisions: PermissionBatchResult = {
      "rogue.code": decision("allow"),
    };
    const planeEligible = new Map(); // empty catalog

    const out = partitionDecisions(decisions, planeEligible);

    expect(out.allowed.size).toBe(0);
    expect([...out.planeExcluded]).toEqual(["rogue.code"]);
    expect(out.entries.get("rogue.code")?.reason).toEqual("plane_excluded");
  });
});

describe("createPermissionResolverRegistry", () => {
  // Provide a minimal kysely-shaped stub; we don't call build() here so the
  // executor is never invoked.
  const dbStub = {} as any;

  it("dispatches to the matching plane resolver", () => {
    const registry = createPermissionResolverRegistry({
      neon: { db: dbStub },
      admin: { db: dbStub },
      mesh: { db: dbStub },
    });

    expect(registry.get("neon" as PlaneKey).planeKey).toEqual("neon");
    expect(registry.get("admin" as PlaneKey).planeKey).toEqual("admin");
    expect(registry.get("mesh" as PlaneKey).planeKey).toEqual("mesh");
  });

  it("throws on unknown plane key", () => {
    const registry = createPermissionResolverRegistry({
      neon: { db: dbStub },
      admin: { db: dbStub },
      mesh: { db: dbStub },
    });
    expect(() => registry.get("rogue" as PlaneKey)).toThrow(/unknown plane/);
  });
});
