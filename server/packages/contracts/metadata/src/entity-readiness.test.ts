import { expect, it, vi } from "vitest";
import {
  createEntityReadinessEvaluator,
  entitySupportReceiptHash,
  type EntityCapabilityRequirement,
  type EntityDeploymentSupport,
  type EntityServingTarget,
} from "./entity-readiness.js";

const target: EntityServingTarget = {
  deploymentId: "api-instance-a",
  configurationRevision: "configuration-1",
  plane: "neon",
  releaseArtifactHash: "a".repeat(64),
};
const required: EntityCapabilityRequirement = {
  id: "entity_read_record",
  version: "1",
  manifestHash: "b".repeat(64),
  inputSchemaHash: "c".repeat(64),
  resultSchemaHash: "d".repeat(64),
  required: true,
};
const optional: EntityCapabilityRequirement = {
  ...required,
  id: "entity_read_comments",
  required: false,
};
function fixture(): EntityDeploymentSupport {
  const receipt = {
    schema: "entity-deployment-support/1" as const,
    target: { ...target },
    supportRevision: "support-1",
    adapterVersions: { records: "1", metadata: "1" },
    qualifiedAtMs: 100,
    expiresAtMs: 200,
    results: [
      {
        id: required.id,
        version: required.version,
        manifestHash: required.manifestHash,
        inputSchemaHash: required.inputSchemaHash,
        resultSchemaHash: required.resultSchemaHash,
        passed: true,
      },
    ],
  };
  return {
    current: {
      target: { ...target },
      supportRevision: "support-1",
      adapterVersions: { records: "1", metadata: "1" },
      receiptHash: entitySupportReceiptHash(receipt),
    },
    receipt,
  };
}
const evaluate = (
  support: EntityDeploymentSupport | null,
  requirements = [required, optional],
  now = 150,
) =>
  createEntityReadinessEvaluator({
    lookup: async () => support,
    now: () => now,
  })({ target, requirements });

it("admits qualified required support and excludes unavailable optional support without an authorization grant", async () => {
  const result = await evaluate(fixture());
  expect(result).toMatchObject({
    ready: true,
    available: [required.id],
    unavailable: [
      { id: optional.id, required: false, reason: "capability_missing" },
    ],
  });
  expect(result).not.toHaveProperty("allowed");
  expect(Object.isFrozen(result.available)).toBe(true);
});
it("missing required support blocks the relevant operation", async () => {
  expect(
    await evaluate(fixture(), [{ ...optional, required: true }]),
  ).toMatchObject({ ready: false, available: [] });
});
it.each([
  ["deployment", { deploymentId: "worker-instance" }],
  ["configuration", { configurationRevision: "configuration-2" }],
  ["plane", { plane: "mesh" }],
  ["release", { releaseArtifactHash: "e".repeat(64) }],
])("rejects receipts for a different %s", async (_label, change) => {
  const support = fixture();
  Object.assign(support.receipt.target, change);
  expect(await evaluate(support)).toMatchObject({
    ready: false,
    available: [],
    unavailable: [{ reason: "target_changed" }, { reason: "target_changed" }],
  });
});
it("current support pointer must name the serving instance too", async () => {
  const support = fixture();
  Object.assign(support.current.target, { deploymentId: "other-api" });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "target_changed",
  );
});
it("configuration reassessment cannot reuse a receipt from an earlier support revision", async () => {
  const support = fixture();
  Object.assign(support.current, { supportRevision: "support-2" });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "support_revision_changed",
  );
});
it("adapter removal or replacement requires reassessment even with identical manifests", async () => {
  const support = fixture();
  Object.assign(support.current, { adapterVersions: { metadata: "2" } });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "adapters_changed",
  );
});
it("immutable receipt substitution fails against the current pointer", async () => {
  const support = fixture();
  Object.assign(support.receipt.results[0]!, { passed: false });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "receipt_changed",
  );
});
it.each([99, 200, 201, Number.NaN])(
  "rejects out-of-period evidence at %s",
  async (now) => {
    expect(
      (await evaluate(fixture(), [required], now)).unavailable[0]?.reason,
    ).toBe("receipt_expired");
  },
);
it("failed qualification is distinct from incompatible manifest and missing support", async () => {
  const support = fixture();
  Object.assign(support.receipt.results[0]!, { passed: false });
  Object.assign(support.current, {
    receiptHash: entitySupportReceiptHash(support.receipt),
  });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "qualification_failed",
  );
  expect(
    (
      await evaluate(fixture(), [
        { ...required, resultSchemaHash: "e".repeat(64) },
      ])
    ).unavailable[0]?.reason,
  ).toBe("manifest_incompatible");
  expect((await evaluate(null)).unavailable[0]?.reason).toBe(
    "support_unavailable",
  );
});
it("lookup failure excludes optional capabilities while preserving unrelated Entity availability", async () => {
  const run = createEntityReadinessEvaluator({
    lookup: async () => {
      throw Error("private credential details");
    },
  });
  expect(await run({ target, requirements: [optional] })).toEqual({
    ready: true,
    available: [],
    unavailable: [
      { id: optional.id, required: false, reason: "support_lookup_failed" },
    ],
  });
});
it("malformed or duplicated qualification results fail closed", async () => {
  const support = fixture();
  Object.assign(support.receipt, {
    results: [...support.receipt.results, ...support.receipt.results],
  });
  expect((await evaluate(support)).unavailable[0]?.reason).toBe(
    "support_invalid",
  );
});
it("invalid and duplicate requirements cannot reach the trusted lookup", async () => {
  const lookup = vi.fn(async () => fixture()),
    run = createEntityReadinessEvaluator({ lookup });
  await expect(
    run({ target, requirements: [required, required] }),
  ).rejects.toThrow("ENTITY_READINESS_REQUIREMENTS_INVALID");
  await expect(
    run({
      target: { ...target, releaseArtifactHash: "unpinned" },
      requirements: [required],
    }),
  ).rejects.toThrow();
  expect(lookup).not.toHaveBeenCalled();
});
it("snapshots requirements before asynchronous support lookup", async () => {
  const requirement = { ...required },
    inputTarget = { ...target };
  const lookup = vi.fn(async () => {
    requirement.manifestHash = "e".repeat(64);
    inputTarget.deploymentId = "other-api";
    return fixture();
  });
  const run = createEntityReadinessEvaluator({ lookup, now: () => 150 });
  expect(
    await run({ target: inputTarget, requirements: [requirement] }),
  ).toMatchObject({ ready: true, available: [required.id] });
});
it("unrelated releases with no requirements do not depend on support lookup", async () => {
  const lookup = vi.fn(async () => null);
  expect(
    await createEntityReadinessEvaluator({ lookup })({
      target,
      requirements: [],
    }),
  ).toEqual({ ready: true, available: [], unavailable: [] });
  expect(lookup).not.toHaveBeenCalled();
});
