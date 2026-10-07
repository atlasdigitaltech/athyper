import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import {
  uiComponentColumns,
  type UiComponentContract,
} from "@athyper/server-contract-meta-entity-authoring";
const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("kysely", () => ({
  sql: Object.assign(() => ({ execute: mock.execute }), {
    join: (v: unknown) => v,
  }),
}));
import {
  resolveNativeComponentResources,
  type NativeComponentResourcePolicy,
} from "./native-component-resources.js";
const id = "00000000-0000-4000-8000-000000000001";
const contract: UiComponentContract = {
  id,
  tenantId: null,
  componentKey: "shared.text",
  componentVersion: 1,
  componentLevel: "field_display",
  componentTier: "standard",
  manifestHash: "a".repeat(64),
  resourceOwner: "platform",
  resourceNamespace: "entity.ui",
  publicationResourceKey: "shared.text",
  publicationReleaseHash: "b".repeat(64),
  supportedDataTypes: ["string"],
  supportedPlanes: ["studio"],
  supportedSurfaceKinds: ["list", "detail"],
  supportedModes: [],
  cardinalities: ["one"],
  optionKeys: ["text_wrap"],
  filterOperators: [],
  compatibleDisplayIds: [],
  maskedRepresentationSafe: false,
  status: "active",
};
const scope = {
  tenantId: null,
  plane: "studio" as const,
  hostReleaseHash: "c".repeat(64),
};
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const installed = () => ({
  contract: structuredClone(contract),
  ...scope,
  evidenceHash: "d".repeat(64),
  runtimeKey: "text",
});
let policy: NativeComponentResourcePolicy;
beforeEach(() => {
  mock.execute
    .mockReset()
    .mockResolvedValue({
      rows: [
        {
          row: Object.fromEntries(
            Object.entries(uiComponentColumns).map(([key, col]) => [
              col.name,
              contract[key as keyof UiComponentContract],
            ]),
          ),
        },
      ],
    });
  policy = {
    maximumComponents: 10,
    admit: vi.fn(async () => {}),
    installed: vi.fn(async () => installed()),
  };
});
it("resolves immutable global resource coordinates through independent installed evidence", async () => {
  const result = await resolveNativeComponentResources(tx, scope, [id], policy);
  expect(result.layoutComponents).toEqual([
    {
      id,
      level: "field_display",
      surfaceKinds: ["list", "detail"],
      dataTypes: ["string"],
      cardinalities: ["one"],
      options: ["textWrap"],
      filterOperators: [],
      compatibleDisplayIds: [],
      maskedRepresentationSafe: false,
    },
  ]);
  expect(result.coreComponents).toEqual([]);
  expect(result.runtimeComponents).toEqual([{ id, runtimeKey: "text" }]);
  expect(policy.installed).toHaveBeenCalledWith(
    tx,
    scope,
    expect.objectContaining({
      resourceOwner: "platform",
      resourceNamespace: "entity.ui",
      manifestHash: contract.manifestHash,
      publicationReleaseHash: contract.publicationReleaseHash,
    }),
  );
});
it.each(["host", "plane", "manifest", "capabilities", "revoked"])(
  "rejects %s installation mismatch",
  async (kind) => {
    policy.installed = async () => {
      const e = installed();
      if (kind === "host") e.hostReleaseHash = "e".repeat(64);
      if (kind === "plane") Reflect.set(e, "plane", "mesh");
      if (kind === "manifest")
        Reflect.set(e.contract, "manifestHash", "e".repeat(64));
      if (kind === "capabilities")
        Reflect.set(e.contract, "maskedRepresentationSafe", true);
      if (kind === "revoked") throw Error("RESOURCE_REVOKED");
      return e;
    };
    await expect(
      resolveNativeComponentResources(tx, scope, [id], policy),
    ).rejects.toThrow(
      kind === "revoked"
        ? "RESOURCE_REVOKED"
        : "COMPONENT_INSTALLATION_EVIDENCE_MISMATCH",
    );
  },
);
it("requires host admission, exact catalogue rows and a bounded transactional request", async () => {
  policy.admit = async () => {
    throw Error("HOST_DENIED");
  };
  await expect(
    resolveNativeComponentResources(tx, scope, [id], policy),
  ).rejects.toThrow("HOST_DENIED");
  expect(mock.execute).not.toHaveBeenCalled();
  policy.admit = async () => {};
  mock.execute.mockResolvedValue({ rows: [] });
  await expect(
    resolveNativeComponentResources(tx, scope, [id], policy),
  ).rejects.toThrow("COMPONENT_RESOURCE_NOT_FOUND");
  await expect(
    resolveNativeComponentResources(tx, scope, [id, id], policy),
  ).rejects.toThrow("COMPONENT_RESOURCE_BUDGET_INVALID");
  await expect(
    resolveNativeComponentResources(
      { isTransaction: false } as typeof tx,
      scope,
      [id],
      policy,
    ),
  ).rejects.toThrow("COMPONENT_RESOURCE_TRANSACTION_REQUIRED");
});
