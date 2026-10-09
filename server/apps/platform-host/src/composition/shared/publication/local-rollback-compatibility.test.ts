import { expect, it } from "vitest";
import { assertLocalRollbackCompatible } from "./local-rollback-compatibility.js";
function payload(density = "comfortable") {
  const descriptor = {
    schema: "fixture",
    source: { release_hash: "current" },
    storage: { object: "reference" },
    fields: [{ key: "name", readPermissionCode: "read-name" }],
    operations: { read: { permissionCode: "read" } },
    authorization: {
      operations: [
        { key: "read", permissionCode: "read" },
        { key: "list", permissionCode: "list" },
      ],
    },
    operation_scope_bindings: [
      {
        bindingId: "new",
        scopeBindingId: "new",
        sourceEntityOperationId: "new",
        operationKey: "read",
        permissionCode: "read",
        scopeKind: "tenant",
      },
    ],
    listPresentation: { defaultState: { density } },
  };
  return { artifacts: [{ content: { descriptor } }] };
}
it("permits density rollback with regenerated provenance and unordered operations, without mutating artifacts", () => {
  const current = payload(),
    target = payload("compact"),
    before = structuredClone(current);
  const d = target.artifacts[0]!.content.descriptor;
  d.source.release_hash = "previous";
  d.operation_scope_bindings[0]!.bindingId = "old";
  d.authorization.operations.reverse();
  expect(() => assertLocalRollbackCompatible(current, target)).not.toThrow();
  expect(current).toEqual(before);
});
it.each(["permission", "field", "storage", "unknown"])(
  "rejects incompatible %s changes",
  (kind) => {
    const current = payload(),
      target = payload();
    const d = target.artifacts[0]!.content.descriptor;
    if (kind === "permission") d.operations.read.permissionCode = "other";
    if (kind === "field") d.fields[0]!.readPermissionCode = "other";
    if (kind === "storage") d.storage.object = "other";
    if (kind === "unknown") Object.assign(d, { newExecutableContract: true });
    expect(() => assertLocalRollbackCompatible(current, target)).toThrow(
      "LOCAL_ROLLBACK_INCOMPATIBLE_DESCRIPTOR",
    );
  },
);
it("rejects missing and ambiguous descriptor payloads", () => {
  expect(() => assertLocalRollbackCompatible({}, payload())).toThrow(
    "LOCAL_ROLLBACK_DESCRIPTOR_REQUIRED",
  );
  const bad = payload();
  bad.artifacts.push(bad.artifacts[0]!);
  expect(() => assertLocalRollbackCompatible(bad, payload())).toThrow(
    "LOCAL_ROLLBACK_DESCRIPTOR_REQUIRED",
  );
});
