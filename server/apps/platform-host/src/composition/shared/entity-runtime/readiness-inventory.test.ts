import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityReadinessHealth } from "./readiness-inventory.js";

it("reassesses the actual active inventory on every probe", async () => {
  let current = [{ entityCode: "country" }] as EntityRuntimeDescriptor[];
  const inventory = vi.fn(async () => current);
  const assertDescriptors = vi.fn(async () => {});
  const health = createEntityReadinessHealth({ inventory, assertDescriptors });
  expect(await health()).toEqual({ status: "healthy" });
  expect(assertDescriptors).toHaveBeenLastCalledWith(current);
  current = [{ entityCode: "principal" }] as EntityRuntimeDescriptor[];
  assertDescriptors.mockRejectedValueOnce(Error("private support details"));
  expect(await health()).toEqual({
    status: "unhealthy",
    message: "Entity deployment support or active inventory is unavailable",
  });
  expect(assertDescriptors).toHaveBeenLastCalledWith(current);
  expect(inventory).toHaveBeenCalledTimes(2);
});
it("does not report a failed inventory as an empty ready deployment", async () => {
  const assertDescriptors = vi.fn();
  const health = createEntityReadinessHealth({
    inventory: async () => {
      throw Error("private database details");
    },
    assertDescriptors,
  });
  expect(await health()).toMatchObject({ status: "unhealthy" });
  expect(assertDescriptors).not.toHaveBeenCalled();
});
