import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { createConfiguredAuthorizationManagement } from "../authorization-management-config.js";
it("exposes an unapproved writer when no operator evidence is supplied", async () => {
  const c = createConfiguredAuthorizationManagement();
  expect(await c.rolloutPolicies.loadExactPlane("neon")).toBeUndefined();
  expect(await c.writerGate.inspect("neon")).toMatchObject({
    approved: false,
    targetWritable: false,
    approvedBy: [],
  });
});
it("requires exact plane evidence and observes its removal without retaining approval", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-writer-")),
    path = join(dir, "policy.json");
  try {
    const policy = {
      planeKey: "neon",
      mode: "enforce",
      revision: "fixture",
      approved: true,
      approvedAt: "2026-09-01T00:00:00Z",
    };
    const writerSwitch = {
      approved: true,
      targetWritable: true,
      sourceWatermark: "1",
      appliedWatermark: "1",
      goldenCorpusSha256: "a".repeat(64),
      goldenEvaluatorCorpusQualified: true,
      ddlEpochIntegrationQualified: true,
      approvedBy: ["fixture-a", "fixture-b"],
      approvalTicket: "fixture",
    };
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, planes: [{ policy, writerSwitch }] }),
    );
    const c = createConfiguredAuthorizationManagement(path);
    expect(await c.writerGate.inspect("neon")).toEqual(writerSwitch);
    expect(await c.writerGate.inspect("studio")).toMatchObject({
      approved: false,
    });
    writeFileSync(path, "invalid");
    expect(await c.rolloutPolicies.loadExactPlane("neon")).toBeUndefined();
    expect(await c.writerGate.inspect("neon")).toMatchObject({
      approved: false,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("rejects malformed evidence at startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-writer-")),
    path = join(dir, "policy.json");
  try {
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        planes: [{ policy: { planeKey: "neon" } }],
      }),
    );
    expect(() => createConfiguredAuthorizationManagement(path)).toThrow(
      "AUTHORIZATION_MANAGEMENT_POLICY_INVALID",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
