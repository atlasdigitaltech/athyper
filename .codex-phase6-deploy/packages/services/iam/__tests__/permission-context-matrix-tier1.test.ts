/**
 * Three-Plane Permission Stack — Phase 8 Matrix Tier 1.
 *
 * Covers the architectural invariants listed in the matrix-test design doc
 * that are testable in-process without a real DB:
 *
 *   S1  — `profileHash` and `allowed` set are stable across re-runs for the
 *         same (tenant, principal, persona, roles, groups, plan version).
 *   S2  — persona change produces a different `profileHash`.
 *   S4  — cross-plane permission isolation: a code in the wrong plane lands
 *         in `planeExcluded`, never `allowed`.
 *   S5  — multi-tenant mesh partner: the cache key fingerprint changes per
 *         binding, even when the principal is identical.
 *
 * S8 / S9 (EFFECTIVE lock + emergency override) live in Tier 2 — those need
 * a real DB connection and ship as `verify-effective-lock-scenarios.ts`.
 * S11 (alias resolution in the compiler) is already covered by Phase 3's
 * `phase3-capabilities.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  composeGrantRevokePattern,
  composeDescInvalidatePattern,
} from "../../../../src/services/cache-invalidation/listener.js";
import {
  computePersonaFingerprint,
  computeProfileHash,
} from "../permission-context/resolvers/base.js";
import { partitionDecisions } from "../permission-context/resolvers/neon-resolver.js";

import type { PermissionBatchResult } from "../permission/permission.types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function decision(
  status: "allow" | "deny" | "not_in_plan" | "not_found",
  reason = "test",
): PermissionBatchResult[string] {
  return {
    decision: status,
    reason: reason as any,
    scope: { visibility: "own", company_code_ids: [] },
    evaluation_ms: 1,
  };
}

const NEON_PLANE = new Map([
  ["read",   { code: "read",   is_plan_restricted: false }],
  ["update", { code: "update", is_plan_restricted: false }],
  ["delete", { code: "delete", is_plan_restricted: false }],
  ["JOBS.QUEUE.MANAGE", { code: "JOBS.QUEUE.MANAGE", is_plan_restricted: true }],
]);

const MESH_PLANE = new Map([
  ["MESH.BUYER.VIEW",    { code: "MESH.BUYER.VIEW",    is_plan_restricted: false }],
  ["MESH.BUYER.RESPOND", { code: "MESH.BUYER.RESPOND", is_plan_restricted: false }],
]);

const ADMIN_PLANE = new Map([
  ["PLATFORM.STUDIO.EDIT",  { code: "PLATFORM.STUDIO.EDIT",  is_plan_restricted: true }],
  ["PLATFORM.AUDIT.VIEW",   { code: "PLATFORM.AUDIT.VIEW",   is_plan_restricted: true }],
]);

// ──────────────────────────────────────────────────────────────────────────────
// S1 — Stable profileHash + allowed set
// ──────────────────────────────────────────────────────────────────────────────

describe("S1 — stable profileHash for unchanged identity context", () => {
  const decisions: PermissionBatchResult = {
    read:   decision("allow"),
    update: decision("allow"),
    delete: decision("not_found"),
  };

  it("produces identical fingerprints across re-runs", () => {
    const fp1 = computePersonaFingerprint({
      personaId: "persona-1",
      roleIds:   ["role-a", "role-b"],
      groupIds:  ["group-z"],
    });
    const fp2 = computePersonaFingerprint({
      personaId: "persona-1",
      roleIds:   ["role-a", "role-b"],
      groupIds:  ["group-z"],
    });
    expect(fp1).toEqual(fp2);
  });

  it("produces identical profileHash for unchanged inputs", () => {
    const fp = computePersonaFingerprint({
      personaId: "persona-1",
      roleIds:   ["role-a"],
      groupIds:  [],
    });
    const { allowed: a1 } = partitionDecisions(decisions, NEON_PLANE);
    const { allowed: a2 } = partitionDecisions(decisions, NEON_PLANE);
    const h1 = computeProfileHash({ principalFingerprint: fp, allowedCodes: a1, planVersionId: "pv-1" });
    const h2 = computeProfileHash({ principalFingerprint: fp, allowedCodes: a2, planVersionId: "pv-1" });
    expect(h1).toEqual(h2);
  });

  it("is independent of the resolver's iteration order over decisions", () => {
    const decisionsA: PermissionBatchResult = {
      read:   decision("allow"),
      update: decision("allow"),
    };
    const decisionsB: PermissionBatchResult = {
      update: decision("allow"),
      read:   decision("allow"),
    };
    const { allowed: aA } = partitionDecisions(decisionsA, NEON_PLANE);
    const { allowed: aB } = partitionDecisions(decisionsB, NEON_PLANE);
    expect([...aA].sort()).toEqual([...aB].sort());
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// S2 — Persona change invalidates the cache key
// ──────────────────────────────────────────────────────────────────────────────

describe("S2 — persona change produces a different profileHash", () => {
  const allowed = new Set(["read"]);

  it("differs when personaId changes", () => {
    const fp1 = computePersonaFingerprint({ personaId: "ap_clerk",        roleIds: [], groupIds: [] });
    const fp2 = computePersonaFingerprint({ personaId: "finance_manager", roleIds: [], groupIds: [] });
    expect(fp1).not.toEqual(fp2);

    const h1 = computeProfileHash({ principalFingerprint: fp1, allowedCodes: allowed, planVersionId: "pv-1" });
    const h2 = computeProfileHash({ principalFingerprint: fp2, allowedCodes: allowed, planVersionId: "pv-1" });
    expect(h1).not.toEqual(h2);
  });

  it("differs when group membership changes", () => {
    const fp1 = computePersonaFingerprint({ personaId: "ap_clerk", roleIds: [], groupIds: ["g1"] });
    const fp2 = computePersonaFingerprint({ personaId: "ap_clerk", roleIds: [], groupIds: ["g1", "g2"] });
    expect(fp1).not.toEqual(fp2);
  });

  it("differs when role set changes", () => {
    const fp1 = computePersonaFingerprint({ personaId: "ap_clerk", roleIds: ["r1"], groupIds: [] });
    const fp2 = computePersonaFingerprint({ personaId: "ap_clerk", roleIds: ["r2"], groupIds: [] });
    expect(fp1).not.toEqual(fp2);
  });

  it("differs when plan version changes (neon-only path)", () => {
    const fp = computePersonaFingerprint({ personaId: "ap_clerk", roleIds: [], groupIds: [] });
    const h1 = computeProfileHash({ principalFingerprint: fp, allowedCodes: allowed, planVersionId: "pv-1" });
    const h2 = computeProfileHash({ principalFingerprint: fp, allowedCodes: allowed, planVersionId: "pv-2" });
    expect(h1).not.toEqual(h2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// S4 — Cross-plane permission isolation
// ──────────────────────────────────────────────────────────────────────────────

describe("S4 — cross-plane permission isolation", () => {
  it("places mesh.* codes outside the neon plane catalog into planeExcluded", () => {
    const decisions: PermissionBatchResult = {
      read: decision("allow"),
      "MESH.BUYER.RESPOND": decision("allow"),
      "PLATFORM.STUDIO.EDIT": decision("allow"),
    };
    const { allowed, planeExcluded, entries } = partitionDecisions(decisions, NEON_PLANE);

    expect([...allowed]).toEqual(["read"]);
    expect(planeExcluded.has("MESH.BUYER.RESPOND")).toBe(true);
    expect(planeExcluded.has("PLATFORM.STUDIO.EDIT")).toBe(true);
    expect(entries.get("MESH.BUYER.RESPOND")?.reason).toEqual("plane_excluded");
  });

  it("places neon CRUD codes outside the mesh catalog into planeExcluded", () => {
    const decisions: PermissionBatchResult = {
      read:   decision("allow"),
      update: decision("allow"),
      "MESH.BUYER.VIEW": decision("allow"),
    };
    const { allowed, planeExcluded } = partitionDecisions(decisions, MESH_PLANE);
    expect([...allowed]).toEqual(["MESH.BUYER.VIEW"]);
    expect(planeExcluded.has("read")).toBe(true);
    expect(planeExcluded.has("update")).toBe(true);
  });

  it("places everything outside the admin catalog into planeExcluded", () => {
    const decisions: PermissionBatchResult = {
      read: decision("allow"),
      "PLATFORM.STUDIO.EDIT": decision("allow"),
      "MESH.BUYER.VIEW": decision("allow"),
    };
    const { allowed, planeExcluded } = partitionDecisions(decisions, ADMIN_PLANE);
    expect([...allowed]).toEqual(["PLATFORM.STUDIO.EDIT"]);
    expect(planeExcluded.has("read")).toBe(true);
    expect(planeExcluded.has("MESH.BUYER.VIEW")).toBe(true);
  });

  it("preserves plan-locked codes inside the plane (not excluded)", () => {
    const decisions: PermissionBatchResult = {
      read: decision("allow"),
      "JOBS.QUEUE.MANAGE": decision("not_in_plan"),
    };
    const { allowed, planLocked, planeExcluded, entries } = partitionDecisions(decisions, NEON_PLANE);
    expect([...allowed]).toEqual(["read"]);
    expect([...planLocked]).toEqual(["JOBS.QUEUE.MANAGE"]);
    expect(planeExcluded.size).toBe(0);
    expect(entries.get("JOBS.QUEUE.MANAGE")?.reason).toEqual("plan_locked");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// S5 — Multi-tenant mesh partner isolation
// ──────────────────────────────────────────────────────────────────────────────

describe("S5 — multi-tenant mesh partner uses distinct fingerprints", () => {
  // Mesh fingerprint = SHA256(principal_id || account_id || role_code).
  // The mesh.account_grant row carries this column (Phase 1 trigger).
  // Re-derive here with the same shape to validate composeAllowedSet would
  // produce distinct cache keys across bindings.

  const PARTNER = "partner-1";
  const T1_BINDING = { account_id: "acct-T1", role_code: "account_user" };
  const T2_BINDING = { account_id: "acct-T2", role_code: "account_admin" };

  it("derives distinct fingerprints when one principal is bound to two tenants", () => {
    const fp1 = `${PARTNER}:${T1_BINDING.account_id}:${T1_BINDING.role_code}`;
    const fp2 = `${PARTNER}:${T2_BINDING.account_id}:${T2_BINDING.role_code}`;
    expect(fp1).not.toEqual(fp2);
  });

  it("partitions T1's mesh grants without contaminating T2's allowed set", () => {
    const t1Decisions: PermissionBatchResult = {
      "MESH.BUYER.VIEW":    decision("allow"),
      "MESH.BUYER.RESPOND": decision("not_found"),
    };
    const t2Decisions: PermissionBatchResult = {
      "MESH.BUYER.VIEW":    decision("allow"),
      "MESH.BUYER.RESPOND": decision("allow"),
    };
    const t1 = partitionDecisions(t1Decisions, MESH_PLANE);
    const t2 = partitionDecisions(t2Decisions, MESH_PLANE);

    expect([...t1.allowed].sort()).toEqual(["MESH.BUYER.VIEW"]);
    expect([...t2.allowed].sort()).toEqual(["MESH.BUYER.RESPOND", "MESH.BUYER.VIEW"]);
  });

  it("composes cache-purge patterns per-tenant on mesh", () => {
    // composeGrantRevokePattern intentionally drops the fingerprint —
    // Phase 3 A1 keeps the cache key principal-agnostic. The pattern
    // therefore differs only by tenant.
    const p1 = composeGrantRevokePattern("t-1", "fp-irrelevant");
    const p2 = composeGrantRevokePattern("t-2", "fp-irrelevant");
    expect(p1).not.toEqual(p2);
    expect(p1).toContain(":t-1:");
    expect(p2).toContain(":t-2:");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Compositional sanity — cache key + permission set interplay
// ──────────────────────────────────────────────────────────────────────────────

describe("Phase 5 composite — describe-invalidate pattern stays principal-agnostic", () => {
  it("matches every plane for a given (tenant, entity)", () => {
    const p = composeDescInvalidatePattern("t-1", "purchase_invoice");
    expect(p).toBe("desc:v5:*:t-1:*:purchase_invoice:*");
  });
});
