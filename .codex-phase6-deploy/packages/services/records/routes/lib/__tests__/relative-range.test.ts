import { describe, expect, it } from "vitest";
import { resolveRelativeRange, NON_CALENDAR_KEYS } from "../relative-range";

describe("resolveRelativeRange — legacy @token compatibility", () => {
  const anchor = { today: "2026-06-30", weekStart: 1 as const, fiscalYearStartMonth: 1 };

  it("today: same day both ends", () => {
    expect(resolveRelativeRange("today", anchor)).toEqual({ from: "2026-06-30", to: "2026-06-30" });
  });

  it("this_month: inclusive month boundaries", () => {
    expect(resolveRelativeRange("this_month", anchor)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("this_quarter: Q2 for June (calendar quarters)", () => {
    expect(resolveRelativeRange("this_quarter", anchor)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("this_year: full calendar year", () => {
    expect(resolveRelativeRange("this_year", anchor)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("ytd: calendar year-to-date", () => {
    expect(resolveRelativeRange("ytd", anchor)).toEqual({ from: "2026-01-01", to: "2026-06-30" });
  });

  it("qtd: fiscal quarter-to-date (calendar-year FY here)", () => {
    expect(resolveRelativeRange("qtd", anchor)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("mtd: month-to-date", () => {
    expect(resolveRelativeRange("mtd", anchor)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("resolveRelativeRange — non-calendar keys short-circuit", () => {
  it("this_period returns null (dispatch to period service)", () => {
    expect(resolveRelativeRange("this_period")).toBeNull();
  });

  it("last_period returns null (dispatch to period service)", () => {
    expect(resolveRelativeRange("last_period")).toBeNull();
  });

  it("NON_CALENDAR_KEYS export lists exactly the period-service keys", () => {
    expect([...NON_CALENDAR_KEYS].sort()).toEqual(["last_period", "this_period"]);
  });
});

describe("resolveRelativeRange — unknown tokens", () => {
  it("unknown token returns null (does not throw)", () => {
    expect(resolveRelativeRange("this_millennium")).toBeNull();
    expect(resolveRelativeRange("")).toBeNull();
    expect(resolveRelativeRange("@today")).toBeNull(); // caller strips the @ before passing in
  });
});

describe("resolveRelativeRange — fiscal-context override (client parity guarantee)", () => {
  const indiaAnchor = { today: "2026-06-30", weekStart: 0 as const, fiscalYearStartMonth: 4 };

  it("this_fiscal_year respects India FY (Apr 2026 – Mar 2027)", () => {
    expect(resolveRelativeRange("this_fiscal_year", indiaAnchor)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("this_quarter under India FY: 2026-06-30 is in FY 2026 Q1 (Apr-Jun)", () => {
    expect(resolveRelativeRange("this_quarter", indiaAnchor)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("this_week honours Saturday-start (KSA weekStart=6)", () => {
    const ksa = { today: "2026-06-30", weekStart: 6 as const, fiscalYearStartMonth: 1 };
    // 2026-06-30 is Tuesday. Sat 2026-06-27 → Fri 2026-07-03
    expect(resolveRelativeRange("this_week", ksa)).toEqual({ from: "2026-06-27", to: "2026-07-03" });
  });
});
