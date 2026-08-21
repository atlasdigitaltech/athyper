import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("numbering counter tracking regression", () => {
  it("advances every DDL-owned allocation tracking column in one update", async () => {
    const source = await readFile(new URL("../kysely-numbering-repository.ts", import.meta.url), "utf8");
    for (const assignment of [
      "next_value=${result.followingValue}",
      "allocation_count=allocation_count+1",
      "row_version=row_version+1",
      "last_allocated_value=${result.allocatedValue}",
      "last_allocation_id=${input.allocationId}::uuid",
      "last_allocated_at=clock_timestamp()",
      "last_allocated_by=${input.context.principalId}::uuid",
      "last_correlation_id=${input.correlationId??null}::uuid",
      "updated_by=${input.context.principalId}::uuid",
    ]) expect(source).toContain(assignment);
  });
});
