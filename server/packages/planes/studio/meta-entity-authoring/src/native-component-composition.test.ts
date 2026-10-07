import { expect, it, vi } from "vitest";
import type { NativeConversionComposition } from "./native-conversion-composition.js";
import type { NativeComponentComposition } from "./native-component-composition.js";
const mock = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./native-component-resources.js", () => ({
  resolveNativeComponentResources: mock.resolve,
}));
import { withNativeComponentCompilationResources } from "./native-component-composition.js";
it("replaces unverified rosters, binds installed evidence and retains host controls", async () => {
  const admit = vi.fn(),
    initializer = vi.fn();
  const base = {
    host: {
      admit,
      resolveInitializer: initializer,
      resolveContext: async () => ({
        coreContext: { components: ["unverified"] },
        components: ["unverified"],
      }),
    },
    compiler: async () => ({
      core: { components: ["unverified"] },
      layout: { components: ["unverified"] },
      components: ["unverified"],
    }),
  } as unknown as NativeConversionComposition;
  const scope = {
    tenantId: null,
    plane: "studio",
    hostReleaseHash: "a".repeat(64),
  };
  const resources = {} as NativeComponentComposition["resources"];
  const composition = {
    resources,
    scope: async () => scope,
  } as NativeComponentComposition;
  const resolved = {
    coreComponents: [{ id: "surface" }],
    layoutComponents: [{ id: "display" }],
    runtimeComponents: [{ id: "display", runtimeKey: "text" }],
    evidence: [{ evidenceHash: "b".repeat(64) }],
  };
  mock.resolve.mockResolvedValue(resolved);
  const wrapped = withNativeComponentCompilationResources(base, composition);
  expect(wrapped.host.admit).toBe(admit);
  expect(wrapped.host.resolveInitializer).toBe(initializer);
  const graph = {
    authoringSource: { tenantId: null },
    fields: [],
    runtimeProfiles: [],
    surfaces: [{ componentContractId: "surface" }],
    surfaceSections: [],
    surfaceFieldBindings: [
      {
        componentDisplayId: "display",
        componentInputId: null,
        componentFilterId: null,
        componentFormatId: null,
      },
    ],
  } as unknown as Parameters<typeof wrapped.compiler>[1];
  const tx = {} as Parameters<typeof wrapped.compiler>[0];
  const result = await wrapped.compiler(tx, graph);
  expect(mock.resolve).toHaveBeenCalledWith(
    tx,
    scope,
    ["display", "surface"],
    resources,
  );
  expect(result.core.components).toEqual(resolved.coreComponents);
  expect(result.layout.components).toEqual(resolved.layoutComponents);
  expect(result.components).toEqual(resolved.runtimeComponents);
  expect(result.componentResourceEvidence).toEqual(resolved.evidence);
  composition.scope = async () => ({ ...scope, tenantId: "another" }) as never;
  await expect(wrapped.compiler(tx, graph)).rejects.toThrow(
    "COMPONENT_RESOURCE_SCOPE_INVALID",
  );
});
