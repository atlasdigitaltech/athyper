import { expect, it, vi } from "vitest";
import {
  parseUiComponentResourceSource,
  type UiComponentResourceSource,
} from "@athyper/server-contract-meta-entity-authoring";
import { compileUiComponentProjection } from "./native-component-publication.js";
import { sha256 } from "./deterministic.js";
const source = (): UiComponentResourceSource => ({
  schema: "entity.ui-component-resource/1",
  declaration: {
    id: "00000000-0000-4000-8000-000000000001",
    tenantId: null,
    componentKey: "shared.text",
    componentVersion: 1,
    componentLevel: "field_display",
    componentTier: "standard",
    resourceOwner: "platform",
    resourceNamespace: "entity.ui",
    publicationResourceKey: "shared.text",
    supportedDataTypes: ["string"],
    supportedPlanes: ["studio"],
    supportedSurfaceKinds: ["list"],
    supportedModes: [],
    cardinalities: ["one"],
    optionKeys: [],
    filterOperators: [],
    compatibleDisplayIds: [],
    maskedRepresentationSafe: false,
  },
  implementation: {
    packageName: "fixture-package",
    exportName: "Text",
    runtimeKey: "text",
    sourceHash: "a".repeat(64),
  },
});
const qualify = async (s: UiComponentResourceSource, hash: string) => ({
  sourceHash: hash,
  publicationReleaseHash: "b".repeat(64),
  implementationHash: s.implementation.sourceHash,
});
it("derives projection hashes after qualification without a self-referential release hash", async () => {
  const s = source(),
    policy = vi.fn(qualify);
  const row = await compileUiComponentProjection(s, policy);
  expect(row.manifestHash).toBe(sha256(s));
  expect(row.publicationReleaseHash).toBe("b".repeat(64));
  expect(row.status).toBe("active");
  expect(policy).toHaveBeenCalledOnce();
});
it.each(["manifestHash", "publicationReleaseHash", "status"])(
  "rejects source-injected projection property %s",
  (key) => {
    const s = source();
    Object.assign(s.declaration, { [key]: "a".repeat(64) });
    expect(() => parseUiComponentResourceSource(s)).toThrow();
  },
);
it("rejects duplicate applicability and missing planes", () => {
  const s = source();
  expect(() =>
    parseUiComponentResourceSource({
      ...s,
      declaration: { ...s.declaration, supportedPlanes: [] },
    }),
  ).toThrow();
  expect(() =>
    parseUiComponentResourceSource({
      ...s,
      declaration: { ...s.declaration, supportedPlanes: ["studio", "studio"] },
    }),
  ).toThrow();
});
it.each(["sourceHash", "publicationReleaseHash", "implementationHash"])(
  "rejects mismatched evidence %s",
  async (key) => {
    await expect(
      compileUiComponentProjection(source(), async (s, hash) => ({
        ...(await qualify(s, hash)),
        [key]: "invalid",
      })),
    ).rejects.toThrow("UI_COMPONENT_PUBLICATION_EVIDENCE_MISMATCH");
  },
);
it("propagates rejected approval and captures input before async qualification", async () => {
  await expect(
    compileUiComponentProjection(source(), async () => {
      throw Error("NOT_APPROVED");
    }),
  ).rejects.toThrow("NOT_APPROVED");
  const s = source();
  const row = await compileUiComponentProjection(s, async (copy, hash) => {
    Object.assign(copy.declaration, { componentKey: "changed" });
    Object.assign(s.declaration, { componentKey: "also_changed" });
    return { ...(await qualify(copy, hash)) };
  });
  expect(row.componentKey).toBe("shared.text");
});
