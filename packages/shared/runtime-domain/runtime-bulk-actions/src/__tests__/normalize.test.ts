import { describe, expect, it } from "vitest";
import { fromBulkActionResult, fromBulkCrudResult } from "../normalize";
import type { BulkActionResult } from "@athyper/api-contracts/entity-list";

describe("fromBulkActionResult", () => {
  it("passes through the bulk-action server shape unchanged in summary", () => {
    const src: BulkActionResult = {
      action: "submit",
      total: 3,
      succeeded: 2,
      failed: 1,
      records: [
        { id: "a", status: "success" },
        { id: "b", status: "success" },
        { id: "c", status: "error", reason: "boom" },
      ],
      summary: {
        success: 2, skipped: 0, denied: 0, requiresWorkflow: 0, error: 1,
      },
    };
    const out = fromBulkActionResult(src);
    expect(out.action).toBe("submit");
    expect(out.records).toHaveLength(3);
    expect(out.summary).toEqual(src.summary);
  });
});

describe("fromBulkCrudResult", () => {
  it("translates {succeeded, failed, rows} into normalised shape", () => {
    const out = fromBulkCrudResult("delete", {
      ok: true,
      succeeded: 4,
      failed: 1,
      rows: [
        { id: "a", success: true },
        { id: "b", success: true },
        { id: "c", success: true },
        { id: "d", success: true },
        { id: "e", success: false, error: "lock" },
      ],
    });

    expect(out.action).toBe("delete");
    expect(out.total).toBe(5);
    expect(out.succeeded).toBe(4);
    expect(out.failed).toBe(1);
    expect(out.summary.success).toBe(4);
    expect(out.summary.error).toBe(1);
    expect(out.records.find((r) => r.id === "e")?.status).toBe("error");
    expect(out.records.find((r) => r.id === "e")?.reason).toBe("lock");
    expect(out.records.find((r) => r.id === "a")?.status).toBe("success");
  });
});
