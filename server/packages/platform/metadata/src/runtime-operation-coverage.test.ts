import { expect, it } from "vitest";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { assertCompleteRuntimeOperations } from "./runtime-operation-coverage.js";
function fixture(entityCode = "shipment") {
  const source: any = {
    artifactKey: `${entityCode}/operation`,
    artifactType: "operation",
    entityCode,
    content: {
      operations: [
        {
          key: "read",
          permissionCode: "example.view",
          execution: { handlerKey: "entity.record.read.v1" },
          scopeBinding: { resolverKey: "tenant.record.v1" },
        },
        {
          key: "approve",
          permissionCode: "example.approve",
          execution: { handlerKey: "workflow.approve.v1" },
        },
      ],
    },
  };
  const runtime: any = {
    artifactKey: `${entityCode}/runtime`,
    artifactType: "runtime_contract",
    entityCode,
    content: {
      descriptor: {
        operations: {
          read: { permissionCode: "example.view" },
          approve: { permissionCode: "example.approve" },
        },
        authorization: {
          operations: [
            { key: "read", permissionCode: "example.view" },
            { key: "approve", permissionCode: "example.approve" },
          ],
        },
        authorizationRuntime: {
          bindings: [
            {
              operation: "read",
              handler: "entity.record.read.v1",
              resolver: "tenant.record.v1",
            },
            { operation: "approve", handler: "workflow.approve.v1" },
          ],
        },
      },
    },
  };
  return {
    source,
    descriptor: runtime.content.descriptor,
    artifacts: [source, runtime] as CompiledEntityArtifactV2[],
  };
}
it.each(["shipment", "inspection"])(
  "admits complete %s contracts without entity dispatch",
  (code) => {
    expect(() =>
      assertCompleteRuntimeOperations(fixture(code).artifacts),
    ).not.toThrow();
  },
);
it("rejects a partial read candidate that drops an authored workflow", () => {
  const f = fixture();
  delete f.descriptor.operations.approve;
  f.descriptor.authorization.operations.pop();
  f.descriptor.authorizationRuntime.bindings.pop();
  expect(() => assertCompleteRuntimeOperations(f.artifacts)).toThrow(
    "UNLOWERED:shipment:approve",
  );
});
it("does not derive a permission when all applicable properties are absent", () => {
  const f = fixture();
  delete f.source.content.operations[0].permissionCode;
  delete f.descriptor.operations.read.permissionCode;
  delete f.descriptor.authorization.operations[0].permissionCode;
  expect(() => assertCompleteRuntimeOperations(f.artifacts)).not.toThrow();
});
it("rejects changed permissions, handlers, resolvers and unauthored operations", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      delete f.descriptor.authorization.operations[0].permissionCode;
    },
    (f: ReturnType<typeof fixture>) => {
      f.descriptor.authorizationRuntime.bindings[0].handler = "other";
    },
    (f: ReturnType<typeof fixture>) => {
      f.descriptor.authorizationRuntime.bindings[0].resolver = "other";
    },
    (f: ReturnType<typeof fixture>) => {
      f.descriptor.operations.extra = {};
    },
    (f: ReturnType<typeof fixture>) => {
      f.source.content.operations[0].requiresPreflight = true;
      f.descriptor.authorization.operations[0].requiresPreflight = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.source.content.operations.push(f.source.content.operations[0]);
    },
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => assertCompleteRuntimeOperations(f.artifacts)).toThrow();
  }
});
it("retains the collection scope-binding contract without synthesizing handlers", () => {
  const f = fixture();
  for (const op of f.source.content.operations) {
    delete op.execution;
    delete op.scopeBinding;
  }
  delete f.descriptor.authorizationRuntime;
  f.descriptor.collectionRelationship = { target: "parent" };
  expect(() => assertCompleteRuntimeOperations(f.artifacts)).not.toThrow();
});
