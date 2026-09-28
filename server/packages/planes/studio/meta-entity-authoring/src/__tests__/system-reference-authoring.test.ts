import { expect, it, vi } from "vitest";
import { importSystemReferenceProduct } from "../system-reference-authoring.js";
import { parseSharedReferenceProduct } from "../authoring/product.js";
import type { Kysely } from "kysely";

const product = () => parseSharedReferenceProduct({
  schema: "athyper.shared-reference-product/1", moduleCode: "ent", planes: ["studio", "neon", "mesh"],
  definition: { entityCode: "example_reference", title: "Examples", storageObject: "example_reference",
    codeField: "code", titleField: "name", fields: [
      { key: "id", label: "ID", type: "uuid", required: true },
      { key: "code", label: "Code", type: "string", required: true },
      { key: "name", label: "Name", type: "string", required: true },
    ], columns: ["code", "name"], searchFields: ["code", "name"], sections: [{ key: "main", label: "Main", fields: ["code", "name"] }],
  },
});
it("requires explicit authority for the exact product before any database work", async () => {
  const transaction = vi.fn(() => { throw Error("must not connect"); });
  const db = { transaction } as unknown as Kysely<Record<string, never>>;
  const assertAuthorized = vi.fn(async () => { throw Error("DENIED"); });
  await expect(importSystemReferenceProduct(db, { assertAuthorized }, {
    product: product(), actorId: "11111111-1111-4111-8111-111111111111",
  })).rejects.toThrow("DENIED");
  expect(transaction).not.toHaveBeenCalled();
  expect(assertAuthorized).toHaveBeenCalledWith({ actorId: "11111111-1111-4111-8111-111111111111",
    action: "system_reference.import", entityCode: "example_reference", productHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    targetPlanes: ["studio", "neon", "mesh"],
  });
});
it("does not let privileged callers import writable source shapes", async () => {
  const candidate = product();
  Object.assign(candidate.definition.fields[0]!, { required: false });
  const assertAuthorized = vi.fn(async () => {});
  await expect(importSystemReferenceProduct({} as Kysely<Record<string, never>>, { assertAuthorized }, {
    product: candidate, actorId: "11111111-1111-4111-8111-111111111111",
  })).rejects.toThrow("REFERENCE_PRODUCT_IDENTITY_INVALID");
  expect(assertAuthorized).not.toHaveBeenCalled();
});
it("requires the canonical Studio source and a real actor coordinate", async () => {
  const assertAuthorized = vi.fn(async () => {});
  for (const input of [{ product: product(), actorId: "missing" },
    { product: { ...product(), planes: ["neon" as const] }, actorId: "11111111-1111-4111-8111-111111111111" }]) {
    await expect(importSystemReferenceProduct({} as Kysely<Record<string, never>>, { assertAuthorized }, input)).rejects.toThrow();
  }
  expect(assertAuthorized).not.toHaveBeenCalled();
});
