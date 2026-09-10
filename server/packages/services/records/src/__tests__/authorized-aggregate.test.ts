import { expect, it, vi } from "vitest";
import { executeAuthorizedAggregate } from "../authorized-aggregate.js";
import type {
  RecordRepository,
  RecordRepositoryListInput,
} from "@athyper/server-contract-records";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const query = {
  descriptor: { storage: { idField: "id" } },
  countMode: "exact",
  group: "status",
  cursorScope: "principal",
  collectionScope: [],
  filters: [],
  sort: [],
  projection: ["id", "status"],
  tenantId: "tenant",
  limit: 10,
} as unknown as RecordRepositoryListInput;
function fixture() {
  const calls: RecordRepositoryListInput[] = [];
  const repository = {
    list: vi.fn(async (input: RecordRepositoryListInput) => {
      calls.push(input);
      const data = [
        { id: a, status: "active" },
        { id: b, status: "hidden" },
      ].filter(
        (row) =>
          input.recordIds === undefined || input.recordIds.includes(row.id),
      );
      return {
        data,
        pagination: {
          pageSize: data.length,
          hasMore: false,
          countMode: input.countMode ?? "none",
          ...(input.countMode === "exact" ? { total: data.length } : {}),
        },
        ...(input.group
          ? { groups: data.map((row) => ({ value: row.status, count: 1 })) }
          : {}),
      };
    }),
  } as unknown as RecordRepository<object>;
  return { repository, calls };
}
it("counts and groups only the authorized ID set in SQL repository input", async () => {
  const f = fixture();
  const result = await executeAuthorizedAggregate({
    ...f,
    query,
    transaction: {},
    authorize: async (id) => id === a,
  });
  expect(result.pagination.total).toBe(1);
  expect(result.groups).toEqual([{ value: "active", count: 1 }]);
  expect(f.calls[0]?.group).toBeUndefined();
  expect(f.calls[1]?.recordIds).toEqual([a]);
});
it("an empty authorization set cannot become an unrestricted aggregate", async () => {
  const f = fixture();
  const result = await executeAuthorizedAggregate({
    ...f,
    query,
    transaction: {},
    authorize: async () => false,
  });
  expect(result.pagination.total).toBe(0);
  expect(f.calls[1]?.recordIds).toEqual([]);
});
it("revocation after SQL invalidates the complete aggregate", async () => {
  const f = fixture();
  await expect(
    executeAuthorizedAggregate({
      ...f,
      query,
      transaction: {},
      authorize: async () => f.calls.length < 2,
    }),
  ).rejects.toMatchObject({ code: "ENTITY_AGGREGATE_AUTHORIZATION_CHANGED" });
});
it("enumeration outages prevent SQL aggregation", async () => {
  const f = fixture();
  await expect(
    executeAuthorizedAggregate({
      ...f,
      query,
      transaction: {},
      authorize: async () => {
        throw Error("authority unavailable");
      },
    }),
  ).rejects.toThrow("authority unavailable");
  expect(f.calls).toHaveLength(1);
});
it("repeated pagination cannot produce a partial exact total", async () => {
  const f = fixture();
  vi.mocked(f.repository.list).mockResolvedValue({
    data: [{ id: a }],
    pagination: {
      pageSize: 1,
      hasMore: true,
      nextCursor: "same",
      countMode: "none",
    },
  });
  await expect(
    executeAuthorizedAggregate({
      ...f,
      query,
      transaction: {},
      authorize: async () => true,
    }),
  ).rejects.toMatchObject({ code: "ENTITY_AGGREGATE_IDENTITY_INVALID" });
});
