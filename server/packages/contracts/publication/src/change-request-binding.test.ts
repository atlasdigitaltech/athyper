import { expect, it } from "vitest";
import { parseChangeRequestBinding } from "./change-request-binding.js";
const binding = {
  schemaVersion: 1,
  owner: "required_parent",
  draftEntityCode: "change_case",
  flowArtifactKey: "change_case/flow.amend",
  requestKind: "record.amend",
  amendmentTarget: "operation_context",
};
it("accepts explicit parent or self owners without inferring entity behavior", () => {
  expect(parseChangeRequestBinding(binding).owner).toBe("required_parent");
  expect(parseChangeRequestBinding({ ...binding, owner: "self" }).owner).toBe(
    "self",
  );
});
it("rejects client targets, unknown keys and inconsistent flow coordinates", () => {
  for (const change of [
    { owner: "request_parent" },
    { parentId: "caller-parent" },
    { flowArtifactKey: "other_case/flow.amend" },
    { amendmentTarget: "client" },
    { requestKind: "" },
  ])
    expect(() => parseChangeRequestBinding({ ...binding, ...change })).toThrow(
      "BINDING_INVALID",
    );
});

import { validateCompiledEntityRelease } from "./artifact.js";
it("requires the pinned flow dependency, matching request kind and declared parent", () => {
  const build = () => {
    const artifacts: any[] = [
      {
        artifactKey: "line/core",
        artifactType: "core",
        entityCode: "line",
        plane: "neon",
        artifactHash: "core-hash",
        dependencies: [],
        content: {
          directoryScope: {
            parent: { entityCode: "order", relationshipKey: "lines" },
          },
        },
      },
      {
        artifactKey: "line/operation",
        artifactType: "operation",
        entityCode: "line",
        plane: "neon",
        artifactHash: "op-hash",
        dependencies: [binding.flowArtifactKey],
        content: {
          operations: [
            { key: "request_change", changeRequestBinding: { ...binding } },
          ],
        },
      },
      {
        artifactKey: binding.flowArtifactKey,
        artifactType: "flow",
        entityCode: "change_case",
        plane: "neon",
        artifactHash: "flow-hash",
        dependencies: [],
        content: { requestContract: { requestKind: binding.requestKind } },
      },
    ];
    const release: any = {
      artifacts: artifacts.map((a) => ({
        artifactKey: a.artifactKey,
        artifactType: a.artifactType,
        entityCode: a.entityCode,
        hash: a.artifactHash,
      })),
    };
    const check = () =>
      validateCompiledEntityRelease(release, artifacts, {
        handlers: new Set(),
        resolvers: new Set(),
        renderers: new Set(),
        evaluators: new Set(),
      });
    return { artifacts, check };
  };
  expect(build().check).not.toThrow();
  for (const mutate of [
    (a: any[]) => {
      a[1].dependencies = [];
    },
    (a: any[]) => {
      a[2].content.requestContract.requestKind = "different";
    },
    (a: any[]) => {
      a[0].content.directoryScope = {};
    },
    (a: any[]) => {
      a[2].plane = "mesh";
    },
  ]) {
    const f = build();
    mutate(f.artifacts);
    expect(f.check).toThrow("Invalid change request binding");
  }
});
