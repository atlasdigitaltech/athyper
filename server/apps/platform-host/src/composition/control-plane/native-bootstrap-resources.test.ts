import { expect, it, vi } from "vitest";
import { createNativeBootstrapResourceComposition } from "./native-bootstrap-resources.js";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { compileNativeRelease } from "@athyper/server-plane-studio-meta-entity-authoring";

type Options = Parameters<typeof createNativeBootstrapResourceComposition>[0];
function fixture() {
  const { graph, c, controls } = nativeReleaseFixture();
  const tx = { isTransaction: true } as Parameters<Options["resolve"]>[0];
  const context = { principalId: "author" } as Parameters<
    Options["resolve"]
  >[1];
  const input = {
    entityId: graph.authoringSource.entityId,
    changeSetId: graph.ownedLabels!.changeSetId,
    actorId: "author",
    tenantId: null,
    proposalHash: c.graphHash,
    idempotencyKey: "bootstrap-01",
  };
  const proposal = {
    graph,
    title: "Reference",
    branchCode: "native",
    baseReleaseId: null,
  };
  const qualify = vi.fn(async () => {});
  const base = {
    schema: {
      database: "fixture",
      applicationRole: "application",
      schemaHash: "a".repeat(64),
    },
    host: {
      commands: { authoringSchemaHash: c.authoringSchemaHash },
      snapshotVersions: [2],
    },
    preparation: {
      compiler: c,
      operations: {},
      reader: { registration: {}, storagePlane: "studio", permissions: [] },
    },
    qualify,
  } as unknown as Awaited<ReturnType<Options["resolve"]>>;
  const resolve = vi.fn(async () => base);
  const components = vi.fn(async () => ({
    coreComponents: c.core.components,
    layoutComponents: c.layout.components,
    runtimeComponents: c.components,
    evidence: [],
  }));
  const scope = vi.fn(async () => ({
    tenantId: null,
    plane: "studio" as const,
    hostReleaseHash: "b".repeat(64),
  }));
  const run = () =>
    createNativeBootstrapResourceComposition({ resolve, components, scope })(
      tx,
      context,
      input,
      proposal,
    );
  return {
    tx,
    context,
    input,
    proposal,
    base,
    resolve,
    qualify,
    components,
    scope,
    run,
    controls,
  };
}
it("joins installed component rosters to the whole compiler and rechecks qualification", async () => {
  const f = fixture();
  const result = await f.run();
  expect(
    compileNativeRelease(
      f.proposal.graph,
      result.preparation.compiler,
      f.controls,
    ),
  ).toBeDefined();
  expect(result.preparation.operations).toBe(f.base.preparation.operations);
  expect(result.schema).toEqual(f.base.schema);
  await result.qualify(f.tx, f.input);
  expect(f.resolve).toHaveBeenCalledTimes(2);
  expect(f.components).toHaveBeenCalledTimes(2);
  expect(f.qualify).toHaveBeenCalledTimes(2);
});
it.each(["graph", "schema", "snapshot"])(
  "rejects mismatched %s composition before resolving components",
  async (kind) => {
    const f = fixture();
    if (kind === "graph")
      Object.assign(f.base.preparation.compiler, { graphHash: "f".repeat(64) });
    if (kind === "schema")
      Object.assign(f.base.host.commands, {
        authoringSchemaHash: "f".repeat(64),
      });
    if (kind === "snapshot")
      Object.assign(f.base.host, { snapshotVersions: [1] });
    await expect(f.run()).rejects.toThrow("COMPOSITION_CHANGED");
    expect(f.components).not.toHaveBeenCalled();
  },
);
it("rejects changed installed schema during replay qualification", async () => {
  const f = fixture(),
    result = await f.run();
  Object.assign(f.base.schema, { schemaHash: "f".repeat(64) });
  await expect(result.qualify(f.tx, f.input)).rejects.toThrow(
    "COMPOSITION_CHANGED",
  );
});
it("rejects revoked component evidence even with unchanged proposal bytes", async () => {
  const f = fixture(),
    result = await f.run();
  f.components.mockRejectedValueOnce(Error("COMPONENT_REVOKED"));
  await expect(result.qualify(f.tx, f.input)).rejects.toThrow(
    "COMPONENT_REVOKED",
  );
});
it("checks re-resolved owner qualification with unchanged content pins", async () => {
  const f = fixture(),
    result = await f.run();
  f.resolve.mockResolvedValueOnce({
    ...f.base,
    qualify: async () => {
      throw Error("OWNER_REVOKED");
    },
  });
  await expect(result.qualify(f.tx, f.input)).rejects.toThrow("OWNER_REVOKED");
});
it("rejects transaction and command substitution", async () => {
  const f = fixture(),
    result = await f.run();
  await expect(result.qualify({ ...f.tx }, f.input)).rejects.toThrow(
    "COMPOSITION_CHANGED",
  );
  await expect(
    result.qualify(f.tx, { ...f.input, actorId: "other" }),
  ).rejects.toThrow("COMPOSITION_CHANGED");
  expect(f.resolve).toHaveBeenCalledTimes(1);
});

it("rejects a changed host release even when the selected component set is empty", async () => {
  const f = fixture(),
    result = await f.run();
  f.scope.mockResolvedValueOnce({
    tenantId: null,
    plane: "studio",
    hostReleaseHash: "c".repeat(64),
  });
  await expect(result.qualify(f.tx, f.input)).rejects.toThrow(
    "COMPOSITION_CHANGED",
  );
});
