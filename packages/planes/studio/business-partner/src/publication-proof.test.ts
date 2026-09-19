import { expect, it } from "vitest";
import { proofMismatch } from "./publication-proof";
import type { Inspection } from "./workbench-model";
const source: Inspection = {
  source: "release",
  id: "r",
  hash: "h",
  version: "2",
  status: "published",
  targets: ["neon"],
  data: {
    surfaces: [{ id: "s", surfaceKey: "intake_partner" }],
    fields: [{ id: "f", fieldKey: "requested_role" }],
    surfaceFieldBindings: [
      {
        entitySurfaceId: "s",
        entityFieldId: "f",
        labelOverride: "Requested role",
      },
    ],
  },
};
const target = {
  plane: "neon",
  state: "active",
  releaseId: "r",
  contractHash: "h",
  descriptorSourceHash: "h",
  descriptorHash: "d",
  appliedReleaseId: "a",
  activatedAt: "2026-09-16T00:00:00Z",
};
const tracking = {
  releaseId: "r",
  contractHash: "h",
  tenantId: "t",
  targets: [target],
};
const proof = {
  schema: "athyper.studio-workbench-neon-verification/2",
  passed: true,
  releaseId: "r",
  contractHash: "h",
  tenantId: "t",
  target,
  runtimeDescriptorHash: "d",
  surfaceKey: "intake_partner",
  fieldKey: "requested_role",
  expectedText: "Requested role",
  observedAt: "2026-09-16T00:01:00Z",
};
it("accepts only a complete observation matching the current activation coordinates", () => {
  expect(proofMismatch(source, tracking, proof)).toBeUndefined();
  for (const changed of [
    { releaseId: "other" },
    { tenantId: "other" },
    { runtimeDescriptorHash: "preview" },
    { passed: false },
    { fieldKey: "" },
    { observedAt: "invalid" },
  ])
    expect(
      proofMismatch(source, tracking, { ...proof, ...changed }),
    ).toBeTruthy();
});
it("invalidates observations after reactivation or ambiguous target evidence", () => {
  expect(
    proofMismatch(
      source,
      { ...tracking, targets: [{ ...target, appliedReleaseId: "new" }] },
      proof,
    ),
  ).toBeTruthy();
  expect(
    proofMismatch(source, { ...tracking, targets: [target, target] }, proof),
  ).toBeTruthy();
});
