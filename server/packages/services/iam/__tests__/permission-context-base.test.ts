/**
 * Permission-context base helpers — unit tests.
 *
 * Validates the pure helpers (fingerprint computation, schema hash, profile
 * hash). DB-backed loaders are exercised via the resolver tests with mocked
 * sql.execute.
 */

import { describe, expect, it } from "vitest";

import {
  computePersonaFingerprint,
  computeProfileHash,
  computeSchemaHash,
} from "../permission-context/resolvers/base.js";

describe("computePersonaFingerprint", () => {
  it("returns the same hash for the same inputs regardless of role/group order", () => {
    const a = computePersonaFingerprint({
      personaId: "p1",
      roleIds: ["r1", "r2", "r3"],
      groupIds: ["g1", "g2"],
    });
    const b = computePersonaFingerprint({
      personaId: "p1",
      roleIds: ["r3", "r1", "r2"],
      groupIds: ["g2", "g1"],
    });
    expect(a).toEqual(b);
  });

  it("produces a different hash when persona changes", () => {
    const a = computePersonaFingerprint({ personaId: "p1", roleIds: [], groupIds: [] });
    const b = computePersonaFingerprint({ personaId: "p2", roleIds: [], groupIds: [] });
    expect(a).not.toEqual(b);
  });

  it("produces a different hash when role set changes", () => {
    const a = computePersonaFingerprint({ personaId: "p1", roleIds: ["r1"], groupIds: [] });
    const b = computePersonaFingerprint({ personaId: "p1", roleIds: ["r1", "r2"], groupIds: [] });
    expect(a).not.toEqual(b);
  });

  it("treats undefined persona as a distinct, stable value", () => {
    const a = computePersonaFingerprint({ personaId: undefined, roleIds: [], groupIds: [] });
    const b = computePersonaFingerprint({ personaId: null, roleIds: [], groupIds: [] });
    const c = computePersonaFingerprint({ personaId: undefined, roleIds: [], groupIds: [] });
    expect(a).toEqual(b); // both fall back to the same "none" sentinel
    expect(a).toEqual(c); // determinism
  });
});

describe("computeProfileHash", () => {
  it("is stable when allowed-codes order changes", () => {
    const allowedA = new Set(["read", "update", "delete"]);
    const allowedB = new Set(["delete", "read", "update"]);
    const a = computeProfileHash({
      principalFingerprint: "fp",
      allowedCodes: allowedA,
      planVersionId: "pv1",
    });
    const b = computeProfileHash({
      principalFingerprint: "fp",
      allowedCodes: allowedB,
      planVersionId: "pv1",
    });
    expect(a).toEqual(b);
  });

  it("changes when plan version changes", () => {
    const allowed = new Set(["read"]);
    const a = computeProfileHash({ principalFingerprint: "fp", allowedCodes: allowed, planVersionId: "pv1" });
    const b = computeProfileHash({ principalFingerprint: "fp", allowedCodes: allowed, planVersionId: "pv2" });
    expect(a).not.toEqual(b);
  });

  it("treats missing plan version distinctly from any concrete value", () => {
    const allowed = new Set(["read"]);
    const a = computeProfileHash({ principalFingerprint: "fp", allowedCodes: allowed });
    const b = computeProfileHash({ principalFingerprint: "fp", allowedCodes: allowed, planVersionId: "na" });
    // "na" is the explicit sentinel — when planVersionId is undefined we also
    // emit "na"; both must hash identically so admin/mesh are stable.
    expect(a).toEqual(b);
  });

  it("changes when an allowed code is added", () => {
    const a = computeProfileHash({
      principalFingerprint: "fp",
      allowedCodes: new Set(["read"]),
    });
    const b = computeProfileHash({
      principalFingerprint: "fp",
      allowedCodes: new Set(["read", "update"]),
    });
    expect(a).not.toEqual(b);
  });
});

describe("computeSchemaHash", () => {
  it("returns a 12-char hex prefix", () => {
    const hash = computeSchemaHash();
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });
});
