import { JobValidationError } from "@athyper/server-contract-jobs";
import { describe, expect, it } from "vitest";
import { previewCron } from "../cron-preview.js";

describe("governed cron preview", () => {
  it("returns deterministic next runs in the requested timezone", () => {
    expect(previewCron({ expression: "0 9 * * 1-5", timezone: "Asia/Kuala_Lumpur", from: "2026-08-07T02:00:00Z", count: 2 })).toEqual({
      expression: "0 9 * * 1-5",
      timezone: "Asia/Kuala_Lumpur",
      nextRuns: ["2026-08-10T01:00:00.000Z", "2026-08-11T01:00:00.000Z"],
    });
  });

  it.each([
    { expression: "not cron", timezone: "UTC" },
    { expression: "0 * * * *", timezone: "" },
    { expression: "0 * * * *", timezone: "UTC", from: "not-a-date" },
  ])("identifies expected validation errors: %j", (input) => {
    expect(() => previewCron(input)).toThrow(JobValidationError);
  });

  it("rejects invalid expressions and bounds the response", () => {
    expect(() => previewCron({ expression: "not cron", timezone: "UTC" })).toThrow("Invalid cron schedule");
    expect(previewCron({ expression: "0 * * * *", timezone: "UTC", from: "2026-08-10T00:00:00Z", count: 100 }).nextRuns).toHaveLength(20);
  });
});
