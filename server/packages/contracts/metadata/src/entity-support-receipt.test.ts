import { expect, it } from "vitest";
import {
  entitySupportReceiptHash,
  entitySupportReceiptJson,
  parseEntityDeploymentSupportPointer,
  parseEntitySupportReceipt,
} from "./entity-readiness.js";

function receipt() {
  return {
    schema: "entity-deployment-support/1" as const,
    target: {
      deploymentId: "api-1",
      configurationRevision: "config-1",
      plane: "neon" as const,
      releaseArtifactHash: "a".repeat(64),
    },
    supportRevision: "support-1",
    adapterVersions: { records: "1" },
    qualifiedAtMs: 100,
    expiresAtMs: 200,
    results: [
      {
        id: "entity_read_record",
        version: "1",
        manifestHash: "b".repeat(64),
        inputSchemaHash: "c".repeat(64),
        resultSchemaHash: "d".repeat(64),
        passed: true,
      },
    ],
  };
}
it("preserves receipt meaning and identity across canonical persistence", () => {
  const value = receipt(),
    json = entitySupportReceiptJson(value);
  expect(parseEntitySupportReceipt(JSON.parse(json))).toEqual(value);
  expect(
    entitySupportReceiptHash(parseEntitySupportReceipt(JSON.parse(json))),
  ).toBe(entitySupportReceiptHash(value));
  expect(
    entitySupportReceiptJson({ ...value, adapterVersions: { z: "2", a: "1" } }),
  ).toBe(
    entitySupportReceiptJson({ ...value, adapterVersions: { a: "1", z: "2" } }),
  );
});
it("detaches and freezes all nested receipt and pointer values", () => {
  const value = receipt(),
    parsed = parseEntitySupportReceipt(value);
  const pointer = parseEntityDeploymentSupportPointer({
    target: value.target,
    supportRevision: value.supportRevision,
    adapterVersions: value.adapterVersions,
    receiptHash: entitySupportReceiptHash(value),
  });
  value.target.deploymentId = "changed";
  value.adapterVersions.records = "2";
  value.results[0]!.passed = false;
  expect(parsed.target.deploymentId).toBe("api-1");
  expect(parsed.adapterVersions.records).toBe("1");
  expect(parsed.results[0]?.passed).toBe(true);
  expect(pointer.target.deploymentId).toBe("api-1");
  expect(pointer.adapterVersions.records).toBe("1");
  for (const item of [
    parsed,
    parsed.target,
    parsed.adapterVersions,
    parsed.results,
    parsed.results[0],
    pointer,
    pointer.target,
    pointer.adapterVersions,
  ])
    expect(Object.isFrozen(item)).toBe(true);
});
it.each([
  null,
  [],
  {},
  { ...receipt(), handler: "module" },
  { ...receipt(), target: { ...receipt().target, credential: "secret" } },
  { ...receipt(), results: [{ ...receipt().results[0], passed: "true" }] },
  { ...receipt(), results: [{ ...receipt().results[0], evidenceUrl: "url" }] },
  { ...receipt(), qualifiedAtMs: Number.NaN },
])("rejects malformed or unsupported persisted receipt %#", (value) => {
  expect(() => parseEntitySupportReceipt(value)).toThrow();
});
it("rejects authority pointers with unpinned hashes or executable selections", () => {
  const value = receipt(),
    pointer = {
      target: value.target,
      supportRevision: value.supportRevision,
      adapterVersions: value.adapterVersions,
      receiptHash: entitySupportReceiptHash(value),
    };
  expect(() =>
    parseEntityDeploymentSupportPointer({ ...pointer, receiptHash: "latest" }),
  ).toThrow("ENTITY_SUPPORT_POINTER_INVALID");
  expect(() =>
    parseEntityDeploymentSupportPointer({ ...pointer, handler: "module" }),
  ).toThrow("ENTITY_SUPPORT_POINTER_INVALID");
});
