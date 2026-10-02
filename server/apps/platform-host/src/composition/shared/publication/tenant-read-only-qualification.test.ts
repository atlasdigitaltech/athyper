import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { qualifyReferencePublicationTarget } from "./target-qualification.js";

function target() {
  const product = parseTableEntityProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../../metadata/products/shared/entities/person/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const { graph, artifact } = compileTableEntityProduct(product, "neon");
  graph.surfaces![0]!.layoutConfig = {
    ...graph.surfaces![0]!.layoutConfig,
    tableEntityProduct: {},
  };
  return {
    graph,
    artifact,
    targetPlane: "neon" as const,
    sourceContractHash: artifact.contractHash,
  };
}
const dependencies = {
  databases: {},
  runtime: { qualify() {} },
  qualifyCapabilities: async () => {},
};

it("allows explicitly tenant-authorized read-only tables to reach actual database qualification", async () => {
  await expect(
    qualifyReferencePublicationTarget(target(), dependencies),
  ).rejects.toThrow("TARGET_DATABASE_UNAVAILABLE");
});

it.each([
  "writeMode",
  "mutableField",
  "writeOperation",
  "authorization",
  "scope",
])(
  "rejects ownerless tables when %s widens the read-only contract",
  async (change) => {
    const candidate = target();
    if (change === "writeMode")
      candidate.graph.runtimeProfiles![0] = {
        ...candidate.graph.runtimeProfiles![0]!,
        writeMode: "generic",
      };
    if (change === "mutableField")
      candidate.graph.fields[0] = {
        ...candidate.graph.fields[0]!,
        writeMode: "mutable",
      };
    if (change === "writeOperation")
      candidate.graph.operations[0] = {
        ...candidate.graph.operations[0]!,
        operationKey: "patch",
        operationKind: "update",
      };
    if (change === "authorization")
      candidate.artifact.descriptor.authorization = undefined;
    if (change === "scope")
      candidate.graph.operationScopeBindings![0] = {
        ...candidate.graph.operationScopeBindings![0]!,
        missingValueBehavior: "allow",
      } as never;
    await expect(
      qualifyReferencePublicationTarget(candidate, dependencies),
    ).rejects.toThrow("TABLE_ENTITY_PROFILE_INVALID");
  },
);
