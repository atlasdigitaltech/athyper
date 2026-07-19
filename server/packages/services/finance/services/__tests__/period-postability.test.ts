import { describe, expect, it } from "vitest";

import { resolvePeriodPostability } from "../finance-readiness.service.js";

describe("finance period postability contract", () => {
  it("requires both the fiscal period and book period to be open", () => {
    expect(resolvePeriodPostability("open", "open")).toEqual({
      chip: "postable",
      reasonCode: "period_open",
    });
    expect(resolvePeriodPostability("open", null)).toEqual({
      chip: "locked",
      reasonCode: "book_period_missing",
    });
    expect(resolvePeriodPostability(null, "open")).toEqual({
      chip: "locked",
      reasonCode: "period_not_opened",
    });
  });

  it("uses the most restrictive of the company and book gates", () => {
    expect(resolvePeriodPostability("soft_close", "open").chip).toBe("adjustment_only");
    expect(resolvePeriodPostability("open", "soft_close").chip).toBe("adjustment_only");
    expect(resolvePeriodPostability("hard_close", "open")).toEqual({
      chip: "locked",
      reasonCode: "period_hard_closed",
    });
    expect(resolvePeriodPostability("open", "hard_close")).toEqual({
      chip: "locked",
      reasonCode: "period_hard_closed",
    });
    expect(resolvePeriodPostability("future", "open")).toEqual({
      chip: "locked",
      reasonCode: "period_not_opened",
    });
    expect(resolvePeriodPostability("open", "future")).toEqual({
      chip: "locked",
      reasonCode: "period_not_opened",
    });
  });
});
