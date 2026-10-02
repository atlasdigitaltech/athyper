import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createAtlasBusinessContextResolver } from "./business-context.js";
import { context } from "./__tests__/review-fixture.js";

const id = "10000000-0000-4000-8000-000000000003";
const page = {
  schemaVersion: 1,
  kind: "record",
  entityCode: "country",
  recordId: id,
  section: "overview",
  dirty: false,
  generationId: id,
  locale: "en",
};
function fixture() {
  const descriptor = {
    entityCode: "country",
    planeKey: "neon",
    compiledHash: "published",
    contractHash: "contract",
    directoryScope: { mode: "tenant" },
    ai: {
      enabled: true,
      contextKinds: ["record"],
      insightProviders: [{ id: "entity_read_record", version: 1 }],
    },
  } as unknown as EntityRuntimeDescriptor;
  const get = vi.fn(async (_query: unknown) => ({ data: { id } }));
  const list = vi.fn(async (_query: unknown) => ({
    rows: [{ id }],
    descriptorHash: "list",
    scopeFingerprint: "authorized",
  }));
  const resolver = createAtlasBusinessContextResolver({
    metadata: { getEntityDescriptor: async () => descriptor },
    records: { get } as never,
    list,
  });
  return { descriptor, get, list, resolver };
}
it("inherits the verified session and page without requiring company, organization or elevated assurance", async () => {
  const f = fixture();
  const baseline = { ...context, assurance: "baseline" as const };
  const result = await f.resolver.resolve(baseline, page);
  expect(result.page).toEqual(page);
  expect(f.get).toHaveBeenCalledWith(
    expect.objectContaining({ context: baseline, recordId: id }),
  );
  expect(f.list).toHaveBeenCalledWith(
    expect.objectContaining({ context: baseline, recordIds: [id] }),
  );
  expect(f.list.mock.calls[0]![0]).not.toHaveProperty("scopeCoordinate");
});
it("tenant reference admission does not treat optional work coordinates as required transaction scope", async () => {
  const f = fixture();
  await f.resolver.resolve(context, {
    ...page,
    workContext: { companyCodeId: id },
  });
  expect(f.list.mock.calls[0]![0]).not.toHaveProperty("scopeCoordinate");
});
it("denies missing and unauthorized records without revealing their existence", async () => {
  for (const mode of ["missing", "denied"]) {
    const f = fixture();
    if (mode === "missing") f.get.mockResolvedValue({ data: null } as never);
    else
      f.get.mockRejectedValue({
        statusCode: 403,
        code: "RECORD_ACCESS_DENIED",
        message: "private",
      });
    await expect(f.resolver.resolve(context, page)).rejects.toMatchObject({
      code: "BUSINESS_CONTEXT_UNAVAILABLE",
    });
    expect(f.list).not.toHaveBeenCalled();
  }
});
it("reports unsupported Entity AI metadata separately from access or infrastructure failure", async () => {
  const f = fixture();
  Object.assign(f.descriptor, { ai: undefined });
  await expect(f.resolver.resolve(context, page)).rejects.toMatchObject({
    code: "BUSINESS_CONTEXT_NOT_ENABLED",
  });
  expect(f.get).not.toHaveBeenCalled();
});
it("never diagnoses a database failure as missing authorization or scope", async () => {
  const f = fixture();
  f.list.mockRejectedValue(new Error("private database details"));
  await expect(f.resolver.resolve(context, page)).rejects.toMatchObject({
    code: "BUSINESS_CONTEXT_SERVICE_UNAVAILABLE",
    message: "Atlas could not verify the Entity context.",
  });
});
it("keeps explicit scope requirements and denies records excluded by the scoped owner", async () => {
  const f = fixture();
  f.list.mockRejectedValue({ code: "RECORD_LIST_SCOPE_REQUIRED" });
  await expect(f.resolver.resolve(context, page)).rejects.toMatchObject({
    code: "TOOL_DENIED",
  });
  f.list.mockResolvedValue({
    rows: [],
    descriptorHash: "list",
    scopeFingerprint: "authorized",
  });
  await expect(f.resolver.resolve(context, page)).rejects.toMatchObject({
    code: "BUSINESS_CONTEXT_UNAVAILABLE",
  });
});
