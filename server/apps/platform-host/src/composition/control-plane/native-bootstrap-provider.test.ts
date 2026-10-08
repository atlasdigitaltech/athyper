import { describe, expect, it } from "vitest";
import { GENERIC_RECORD_READ_CAPABILITIES } from "@athyper/server-service-records";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { resolveNativeBootstrapListProviders } from "./native-bootstrap-provider.js";

function fixture() {
  const { graph } = nativeReleaseFixture();
  const list = graph.surfaces.find((s) => s.surfaceKind === "list")!;
  Object.assign(list, { maxFilterDepth: 1 });
  return { graph, list };
}
describe("native bootstrap record provider assembly", () => {
  it("binds a complete list to implementation capabilities, independent of entity code", () => {
    const { graph, list } = fixture();
    const before = structuredClone(graph);
    const [provider] = resolveNativeBootstrapListProviders(graph);
    expect(provider).toMatchObject({
      surfaceId: list.id,
      modes: ["table", "compact"],
      countModes: ["exact", "none"],
      maximumPageSize: 100,
      maximumFilters: 20,
      maximumFilterDepth: 1,
    });
    expect(provider!.provider.hash).toBe(
      sha256(GENERIC_RECORD_READ_CAPABILITIES),
    );
    expect(graph).toEqual(before);
    graph.entity.entityCode = "another_reference";
    expect(resolveNativeBootstrapListProviders(graph)).toEqual([provider]);
  });
  it.each([
    { maxPageSize: 101 },
    { allowedPageSizes: [25, 101] },
    { maxFilters: 21 },
    { maxFilterDepth: 2 },
    { maxSortLevels: 11 },
    { countMode: "estimated" },
    { supportedModes: ["board"] },
  ])("rejects unsupported list declarations %j", (patch) => {
    const { graph, list } = fixture();
    Object.assign(list, patch);
    expect(() => resolveNativeBootstrapListProviders(graph)).toThrow();
  });
  it.each([
    { readMode: "handler" },
    { backingKind: "view" },
    { writeMode: "generic" },
    { readHandlerKey: "other.handler", readHandlerVersion: 1 },
    { writeHandlerKey: "other.writer", writeHandlerVersion: 1 },
  ])("does not qualify another provider %j", (patch) => {
    const { graph } = fixture();
    Object.assign(graph.runtimeProfiles[0]!, patch);
    expect(() => resolveNativeBootstrapListProviders(graph)).toThrow(
      "PROVIDER_UNSUPPORTED",
    );
  });
  it("rejects missing or duplicate list scope and multiple runtime profiles", () => {
    const { graph, list } = fixture();
    graph.surfaces = graph.surfaces.filter((s) => s !== list);
    expect(() => resolveNativeBootstrapListProviders(graph)).toThrow(
      "SCOPE_INVALID",
    );
    graph.surfaces.push(list, list);
    expect(() => resolveNativeBootstrapListProviders(graph)).toThrow(
      "SCOPE_INVALID",
    );
    graph.surfaces.pop();
    graph.runtimeProfiles.push(graph.runtimeProfiles[0]!);
    expect(() => resolveNativeBootstrapListProviders(graph)).toThrow(
      "PROVIDER_UNSUPPORTED",
    );
  });
});
