import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import { uiComponentColumns } from "@athyper/server-contract-meta-entity-authoring";
import { componentSourceFixture } from "./native-component-publication.fixtures.js";
import { sha256 } from "./deterministic.js";
const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("kysely", () => ({
  sql: Object.assign(() => ({ execute: mock.execute }), {
    join: (v: unknown) => v,
    ref: (v: unknown) => v,
  }),
}));
import {
  installNativeComponentCatalogue,
  type UiComponentInstallationPolicy,
} from "./native-component-installation.js";
const id = "00000000-0000-4000-8000-000000000009";
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const source = componentSourceFixture();
const evidence = {
  sourceHash: sha256(source),
  implementationHash: source.implementation.sourceHash,
  publicationReleaseHash: "b".repeat(64),
};
const projection = {
  ...source.declaration,
  manifestHash: evidence.sourceHash,
  publicationReleaseHash: evidence.publicationReleaseHash,
  status: "active",
};
const row = Object.fromEntries(
  Object.entries(uiComponentColumns).map(([key, c]) => [
    c.name,
    Reflect.get(projection, key),
  ]),
);
const policy: UiComponentInstallationPolicy = {
  withActiveSource: async (_tx, _id, use) =>
    use(structuredClone(source), evidence),
};
beforeEach(() =>
  mock.execute
    .mockReset()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ row }] }),
);
it("inserts only derived typed columns and accepts exact readback/replay", async () => {
  await installNativeComponentCatalogue(tx, id, policy);
  expect(mock.execute).toHaveBeenCalledTimes(2);
});
it("requires transaction and active-source qualification before any write", async () => {
  await expect(
    installNativeComponentCatalogue(
      { isTransaction: false } as unknown as typeof tx,
      id,
      policy,
    ),
  ).rejects.toThrow("UI_COMPONENT_INSTALLATION_TRANSACTION_REQUIRED");
  await expect(
    installNativeComponentCatalogue(tx, id, {
      withActiveSource: async () => {
        throw Error("INACTIVE");
      },
    }),
  ).rejects.toThrow("INACTIVE");
  expect(mock.execute).not.toHaveBeenCalled();
});
it("rejects conflicting immutable readback without updating it", async () => {
  mock.execute
    .mockReset()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{ row: { ...row, manifest_hash: "c".repeat(64) } }],
    });
  await expect(installNativeComponentCatalogue(tx, id, policy)).rejects.toThrow(
    "UI_COMPONENT_INSTALLATION_CONFLICT",
  );
  expect(mock.execute).toHaveBeenCalledTimes(2);
});
it("rejects mismatched approved source before installation", async () => {
  await expect(
    installNativeComponentCatalogue(tx, id, {
      withActiveSource: async (_tx, _id, use) =>
        use(source, { ...evidence, sourceHash: "d".repeat(64) }),
    }),
  ).rejects.toThrow("UI_COMPONENT_PUBLICATION_EVIDENCE_MISMATCH");
  expect(mock.execute).not.toHaveBeenCalled();
});
