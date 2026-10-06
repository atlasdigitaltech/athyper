import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityReferenceReader } from "./entity-reference-reader.js";

// Entity names are fixture inputs, never runtime dispatch. All consumers use
// the same metadata-selected reader and published-operation admission.
function fixture(targetCode: string, planeKey: "studio" | "neon" | "mesh") {
  const context = {
    tenantId: "tenant-a",
    principalId: "reviewer",
    planeKey,
  } as never;
  const source = {
    entityCode: "fixture_owner",
    planeKey,
    fields: [
      {
        key: "reference_code",
        type: "string",
        keyReference: {
          targetEntity: targetCode,
          labelField: "name",
          fields: [{ source: "reference_code", target: "code" }],
        },
      },
    ],
    operations: { read: {} },
  } as unknown as EntityRuntimeDescriptor;
  const target = {
    entityCode: targetCode,
    planeKey,
    storage: { idField: "id" },
    fields: [
      { key: "code", type: "string" },
      { key: "name", type: "string" },
    ],
    operations: { read: {}, list: {} },
  } as unknown as EntityRuntimeDescriptor;
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    code: "A",
    name: "Readable reference",
  };
  const execute = vi.fn(async () => ({
    result: { data: [row], pagination: {} },
  }));
  const get = vi.fn(async () => ({ data: row }));
  const authorize = vi.fn(async () => ({ allowed: true }));
  const metadata = vi.fn(async () => target);
  const reader = createEntityReferenceReader({
    metadata: { getEntityDescriptor: metadata },
    authorizer: { authorize, authorizeEntityOperation: vi.fn(async () => ({ allowed: true })) },
    listExecutor: { execute },
    queries: { get },
  } as never);
  return { context, source, target, execute, get, authorize, metadata, reader };
}
for (const plane of ["studio", "neon", "mesh"] as const) {
  it.each(["country", "state_region", "fixture_reference"])(
    `uses published metadata for %s on ${plane}`,
    async (code) => {
      const f = fixture(code, plane);
      const page = await f.reader.lookup(f.context, f.source, {
        field: "reference_code",
        value: "A",
      });
      expect(page.options).toEqual([
        {
          value: "A",
          label: "Readable reference",
          recordId: "00000000-0000-4000-8000-000000000001",
          entityCode: code,
        },
      ]);
      expect(f.metadata).toHaveBeenCalledWith(f.context, code);
      expect(f.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          context: f.context,
          entityCode: code,
          filters: [{ field: "code", operator: "eq", value: "A" }],
        }),
      );
      expect(f.get).toHaveBeenCalledWith(
        expect.objectContaining({ context: f.context, entityCode: code }),
      );
    },
  );
}
it.each([
  "missing",
  "wrong-entity",
  "wrong-plane",
  "uuid-label",
  "masked-label",
])("blocks %s metadata before querying records", async (kind) => {
  const f = fixture("country", "studio");
  if (kind === "missing") f.metadata.mockResolvedValue(null as never);
  if (kind === "wrong-entity")
    Object.assign(f.target, { entityCode: "foreign" });
  if (kind === "wrong-plane") Object.assign(f.target, { planeKey: "mesh" });
  if (kind === "uuid-label")
    Object.assign(f.target, {
      fields: [
        { key: "code", type: "string" },
        { key: "name", type: "uuid" },
      ],
    });
  if (kind === "masked-label")
    Object.assign(f.target, {
      policyBindings: [{ stage: "masking", fieldKey: "name" }],
    });
  await expect(
    f.reader.lookup(f.context, f.source, { field: "reference_code" }),
  ).rejects.toMatchObject({ code: "ENTITY_REFERENCE_FORBIDDEN" });
  expect(f.execute).not.toHaveBeenCalled();
});
it("INV-002 keeps an absent grant distinct from a broken defined permission", async () => {
  const f = fixture("country", "studio");
  await expect(
    f.reader.lookup(f.context, f.source, { field: "reference_code" }),
  ).resolves.toMatchObject({ options: expect.any(Array) });
  Object.assign(f.target, {
    operations: { read: { permissionCode: "fixture.explicit.read" }, list: {} },
  });
  f.authorize.mockResolvedValue({
    allowed: false,
    reason: "permission_not_found",
  } as never);
  f.execute.mockClear();
  await expect(
    f.reader.lookup(f.context, f.source, { field: "reference_code" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.execute).not.toHaveBeenCalled();
});
