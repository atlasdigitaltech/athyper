import { expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import type { InstalledComponentEvidence } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createNativeBootstrapComponents } from "./native-bootstrap-components.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const scope = {
  tenantId: null,
  plane: "studio" as const,
  hostReleaseHash: "c".repeat(64),
};
function fixture() {
  const { graph } = nativeReleaseFixture();
  graph.surfaces = graph.surfaces.map((s) => ({
    ...s,
    componentContractId: id(900),
  }));
  graph.surfaceSections = graph.surfaceSections.map((s) => ({
    ...s,
    componentContractId: null,
  }));
  graph.surfaceFieldBindings = graph.surfaceFieldBindings.map((b) => ({
    ...b,
    componentDisplayId: id(901),
    componentInputId: null,
    componentFilterId: null,
    componentFormatId: null,
  }));
  const evidence: InstalledComponentEvidence[] = [900, 901].map((n) => ({
    plane: "studio",
    hostReleaseHash: scope.hostReleaseHash,
    evidenceHash: "d".repeat(64),
    runtimeKey: n === 900 ? "entity" : "text",
    contract: {
      id: id(n),
      tenantId: null,
      componentKey: `fixture.component-${n}`,
      componentVersion: 1,
      componentLevel: n === 900 ? "surface" : "field_display",
      componentTier: "standard",
      manifestHash: "a".repeat(64),
      resourceOwner: "platform",
      resourceNamespace: "entity.ui",
      publicationResourceKey: `fixture.component-${n}`,
      publicationReleaseHash: "b".repeat(64),
      supportedDataTypes: n === 900 ? [] : ["string"],
      supportedPlanes: ["studio"],
      supportedSurfaceKinds: ["list", "detail"],
      supportedModes: [],
      cardinalities: ["one"],
      optionKeys: [],
      filterOperators: [],
      compatibleDisplayIds: [],
      maskedRepresentationSafe: false,
      status: "active",
    },
  }));
  const pins = evidence.map((e) => ({
    componentId: e.contract.id,
    manifestHash: e.contract.manifestHash,
    publicationReleaseHash: e.contract.publicationReleaseHash,
  }));
  const admit = vi.fn(async () => {}),
    read = vi.fn(async (_tx: unknown, input: { componentId: string }) =>
      structuredClone(
        evidence[pins.findIndex((p) => p.componentId === input.componentId)]!,
      ),
    );
  const options = { pins, admit, read, maximumComponents: 10 };
  return {
    graph,
    evidence,
    options,
    resolve: createNativeBootstrapComponents(options),
  };
}
it("assembles fresh-root components from exact evidence without querying unborn child rows", async () => {
  const f = fixture();
  const result = await f.resolve(tx, f.graph, scope);
  expect(result.coreComponents).toHaveLength(1);
  expect(result.layoutComponents).toHaveLength(1);
  expect(result.runtimeComponents).toHaveLength(2);
  expect(f.options.read).toHaveBeenCalledTimes(2);
  expect(f.options.admit).toHaveBeenCalledOnce();
  expect(f.options.read.mock.calls[0]![0]).toBe(tx);
  expect(f.options.read.mock.calls[0]![1]).toMatchObject({
    changeSetId: f.graph.ownedLabels!.changeSetId,
    scope,
  });
});
it("rejects missing explicit selections and missing installed pins without fallback", async () => {
  const f = fixture();
  f.graph.surfaces[0] = {
    ...f.graph.surfaces[0]!,
    componentContractId: id(999),
  };
  await expect(f.resolve(tx, f.graph, scope)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_COMPONENT_PIN_REQUIRED",
  );
  expect(f.options.read).not.toHaveBeenCalled();
});
it("does not infer admission from installed evidence", async () => {
  const f = fixture();
  f.options.admit.mockRejectedValueOnce(Error("HOST_NOT_APPROVED"));
  await expect(f.resolve(tx, f.graph, scope)).rejects.toThrow(
    "HOST_NOT_APPROVED",
  );
  expect(f.options.read).not.toHaveBeenCalled();
});
it.each(["id", "manifestHash", "publicationReleaseHash"] as const)(
  "rejects mismatched %s in resource readback",
  async (key) => {
    const f = fixture();
    f.evidence[0]!.contract = {
      ...f.evidence[0]!.contract,
      [key]: key === "id" ? id(999) : "e".repeat(64),
    };
    await expect(f.resolve(tx, f.graph, scope)).rejects.toThrow(
      "NATIVE_BOOTSTRAP_COMPONENT_EVIDENCE_MISMATCH",
    );
  },
);
it("rejects stale host evidence and unconfigured plane", async () => {
  const f = fixture();
  f.evidence[0] = { ...f.evidence[0]!, hostReleaseHash: "e".repeat(64) };
  await expect(f.resolve(tx, f.graph, scope)).rejects.toThrow(
    "COMPONENT_INSTALLATION_EVIDENCE_MISMATCH",
  );
  await expect(
    f.resolve(tx, f.graph, { ...scope, plane: "neon" }),
  ).rejects.toThrow("NATIVE_BOOTSTRAP_COMPONENT_SCOPE_INVALID");
});
it("rejects duplicate pins and over-budget configuration", () => {
  const f = fixture();
  expect(() =>
    createNativeBootstrapComponents({
      ...f.options,
      pins: [f.options.pins[0]!, f.options.pins[0]!],
    }),
  ).toThrow("NATIVE_BOOTSTRAP_COMPONENT_CONFIGURATION_INVALID");
  expect(() =>
    createNativeBootstrapComponents({ ...f.options, maximumComponents: 1 }),
  ).toThrow("NATIVE_BOOTSTRAP_COMPONENT_CONFIGURATION_INVALID");
});
