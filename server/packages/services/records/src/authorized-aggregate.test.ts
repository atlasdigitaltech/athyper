import { expect, it } from "vitest";
import type {
  RecordRepository,
  RecordRepositoryListInput,
} from "@athyper/server-contract-records";
import { executeAuthorizedAggregate } from "./authorized-aggregate.js";

it("authorizes aggregate identities with bounded concurrency", async () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  }));
  const repository = {
    list: async (input: RecordRepositoryListInput) => {
      const data = rows.filter(
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
      };
    },
  } as unknown as RecordRepository<object>;
  let active = 0;
  let maximumActive = 0;
  const result = await executeAuthorizedAggregate({
    repository,
    transaction: {},
    query: {
      descriptor: { storage: { idField: "id" } },
      countMode: "exact",
      cursorScope: "principal",
      collectionScope: [],
      filters: [],
      limit: 25,
      projection: ["id"],
      sort: [],
      tenantId: "tenant",
    } as unknown as RecordRepositoryListInput,
    authorize: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return true;
    },
  });

  expect(result.pagination.total).toBe(50);
  expect(maximumActive).toBe(25);
});
