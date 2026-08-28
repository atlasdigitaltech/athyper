import { describe, expect, it, vi } from "vitest";
import { RecordServiceError } from "../errors.js";
import { createRecordBookmarkService } from "../bookmarks/record-bookmark-service.js";

const ID_A = "018f6d2a-1111-7a11-8111-111111111111";
const ID_B = "018f6d2a-2222-7a22-8222-222222222222";
const context = { planeKey: "neon", tenantId: "018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa", principalId: "018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb" } as never;

describe("record bookmark service", () => {
  it("resolves a visible page from one cached principal/entity membership set", async () => {
    const get = vi.fn(async () => JSON.stringify([ID_A]));
    const service = createRecordBookmarkService({ transactions: { run: vi.fn() } as never, listExecutor: {} as never, cache: { get, set: vi.fn(), delete: vi.fn() } });
    await expect(service.membership(context, "business_partner", [ID_A, ID_B])).resolves.toEqual(new Set([ID_A]));
    expect(get).toHaveBeenCalledOnce();
  });

  it("rejects an add when the authorized list boundary cannot read every target", async () => {
    const execute = vi.fn(async () => ({ descriptor: { storage: { idField: "id" } }, result: { data: [{ id: ID_A }] } }));
    const run = vi.fn();
    const service = createRecordBookmarkService({ transactions: { run } as never, listExecutor: { execute } as never });
    await expect(service.add(context, "business_partner", [{ id: ID_A }, { id: ID_B }])).rejects.toMatchObject<RecordServiceError>({ statusCode: 403, code: "BOOKMARK_RECORD_FORBIDDEN" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ recordIds: [ID_A, ID_B], limit: 2 }));
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed before persistence for invalid or excessive identities", async () => {
    const service = createRecordBookmarkService({ transactions: { run: vi.fn() } as never, listExecutor: {} as never });
    await expect(service.remove(context, "business_partner", ["not-a-uuid"])).rejects.toMatchObject({ code: "INVALID_BOOKMARK_RECORDS" });
    await expect(service.remove(context, "business_partner", Array.from({ length: 101 }, (_, index) => `018f6d2a-${String(index).padStart(4, "0")}-7a11-8111-111111111111`))).rejects.toMatchObject({ code: "INVALID_BOOKMARK_RECORDS" });
  });
});
