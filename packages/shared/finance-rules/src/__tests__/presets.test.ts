import { describe, expect, it } from "vitest";
import { resolveDateRangePreset } from "../presets";

const CAL_YEAR_CTX = { today: "2026-06-30", weekStart: 1 as const, fiscalYearStartMonth: 1 };
const INDIA_FY_CTX = { today: "2026-06-30", weekStart: 0 as const, fiscalYearStartMonth: 4 };
const KSA_CTX      = { today: "2026-06-30", weekStart: 6 as const, fiscalYearStartMonth: 1 };

describe("resolveDateRangePreset — calendar-only presets", () => {
  it("today", () => {
    expect(resolveDateRangePreset("today", CAL_YEAR_CTX)).toEqual({ from: "2026-06-30", to: "2026-06-30" });
  });

  it("yesterday", () => {
    expect(resolveDateRangePreset("yesterday", CAL_YEAR_CTX)).toEqual({ from: "2026-06-29", to: "2026-06-29" });
  });

  it("last_7_days — inclusive of today", () => {
    // 2026-06-24 → 2026-06-30 is 7 days
    expect(resolveDateRangePreset("last_7_days", CAL_YEAR_CTX)).toEqual({ from: "2026-06-24", to: "2026-06-30" });
  });

  it("last_30_days — inclusive of today", () => {
    expect(resolveDateRangePreset("last_30_days", CAL_YEAR_CTX)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("last_90_days", () => {
    // 90 days back from 2026-06-30 (inclusive) = 2026-04-02
    expect(resolveDateRangePreset("last_90_days", CAL_YEAR_CTX)).toEqual({ from: "2026-04-02", to: "2026-06-30" });
  });

  it("this_week honours Monday-start (EU)", () => {
    // 2026-06-30 is a Tuesday. Mon-Sun week: Mon 2026-06-29 → Sun 2026-07-05
    expect(resolveDateRangePreset("this_week", CAL_YEAR_CTX)).toEqual({ from: "2026-06-29", to: "2026-07-05" });
  });

  it("this_week honours Saturday-start (KSA)", () => {
    // 2026-06-30 is Tuesday. Sat-Fri week: Sat 2026-06-27 → Fri 2026-07-03
    expect(resolveDateRangePreset("this_week", KSA_CTX)).toEqual({ from: "2026-06-27", to: "2026-07-03" });
  });

  it("last_week is the week before this_week", () => {
    expect(resolveDateRangePreset("last_week", CAL_YEAR_CTX)).toEqual({ from: "2026-06-22", to: "2026-06-28" });
  });

  it("this_month is calendar month regardless of fiscal setting", () => {
    expect(resolveDateRangePreset("this_month", CAL_YEAR_CTX)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(resolveDateRangePreset("this_month", INDIA_FY_CTX)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("last_month spans the calendar boundary correctly", () => {
    const jan = resolveDateRangePreset("last_month", { ...CAL_YEAR_CTX, today: "2026-02-15" });
    expect(jan).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("last_month handles February leap year", () => {
    const mar2024 = resolveDateRangePreset("last_month", { ...CAL_YEAR_CTX, today: "2024-03-15" });
    expect(mar2024).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("resolveDateRangePreset — fiscal-aware presets", () => {
  it("this_quarter — calendar-year FY (fyStart=1)", () => {
    // 2026-06-30 = FY 2026 period 6 = Q2 (Apr-Jun)
    expect(resolveDateRangePreset("this_quarter", CAL_YEAR_CTX)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("this_quarter — India FY (fyStart=4)", () => {
    // 2026-06-30 = FY 2026 period 3 = Q1 (Apr-Jun)
    expect(resolveDateRangePreset("this_quarter", INDIA_FY_CTX)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("this_quarter spans year boundary for India FY Q4", () => {
    // 2026-02-15 in India FY: FY 2025 period 11 = Q4 (Jan-Mar)
    const q4 = resolveDateRangePreset("this_quarter", { ...INDIA_FY_CTX, today: "2026-02-15" });
    expect(q4).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("last_quarter wraps to previous fiscal year at Q1", () => {
    // 2026-04-15 India FY = FY 2026 Q1. Last quarter = FY 2025 Q4 (Jan-Mar 2026)
    const lastQ = resolveDateRangePreset("last_quarter", { ...INDIA_FY_CTX, today: "2026-04-15" });
    expect(lastQ).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("this_fiscal_year — calendar-year FY", () => {
    expect(resolveDateRangePreset("this_fiscal_year", CAL_YEAR_CTX)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("this_fiscal_year — India FY (Apr-Mar)", () => {
    expect(resolveDateRangePreset("this_fiscal_year", INDIA_FY_CTX)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("last_fiscal_year — India FY", () => {
    // 2026-06-30 is in FY 2026 → last FY is 2025 (Apr 2025 – Mar 2026)
    expect(resolveDateRangePreset("last_fiscal_year", INDIA_FY_CTX)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });

  it("ytd — calendar-year FY = calendar YTD", () => {
    expect(resolveDateRangePreset("ytd", CAL_YEAR_CTX)).toEqual({ from: "2026-01-01", to: "2026-06-30" });
  });

  it("ytd — India FY (fyStart=4) is fiscal YTD", () => {
    // FY 2026 started 2026-04-01. YTD ends today.
    expect(resolveDateRangePreset("ytd", INDIA_FY_CTX)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });
});

describe("resolveDateRangePreset — legacy parity keys (this_year / last_year / qtd / mtd)", () => {
  it("this_year is calendar-year regardless of fiscal setting", () => {
    expect(resolveDateRangePreset("this_year", CAL_YEAR_CTX)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolveDateRangePreset("this_year", INDIA_FY_CTX)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("last_year is the previous calendar year", () => {
    expect(resolveDateRangePreset("last_year", CAL_YEAR_CTX)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("mtd starts at calendar month-start and ends today", () => {
    expect(resolveDateRangePreset("mtd", CAL_YEAR_CTX)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("qtd starts at current fiscal-quarter and ends today (fiscal-aware)", () => {
    // Calendar-year FY: 2026-06-30 in Q2 → Apr 1
    expect(resolveDateRangePreset("qtd", CAL_YEAR_CTX)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    // India FY (fyStart=4): 2026-06-30 in FY Q1 → Apr 1
    expect(resolveDateRangePreset("qtd", INDIA_FY_CTX)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("this_period and last_period throw with a clear diagnostic", () => {
    expect(() => resolveDateRangePreset("this_period", CAL_YEAR_CTX)).toThrow(/period-status lookup/);
    expect(() => resolveDateRangePreset("last_period", CAL_YEAR_CTX)).toThrow(/period-status lookup/);
  });
});

describe("resolveDateRangePreset — invariants", () => {
  const ALL_KEYS = [
    "today", "yesterday",
    "last_7_days", "last_30_days", "last_90_days",
    "this_week", "last_week",
    "this_month", "last_month",
    "this_quarter", "last_quarter",
    "this_fiscal_year", "last_fiscal_year",
    "this_year", "last_year",
    "ytd", "qtd", "mtd",
  ] as const;

  for (const key of ALL_KEYS) {
    it(`${key}: from ≤ to for all fiscal calendars`, () => {
      for (const ctx of [CAL_YEAR_CTX, INDIA_FY_CTX, KSA_CTX]) {
        const range = resolveDateRangePreset(key, ctx);
        expect(range.from <= range.to).toBe(true);
      }
    });
  }

  it("clamps out-of-range fiscalYearStartMonth", () => {
    // Both should still produce a valid range
    const zero = resolveDateRangePreset("this_fiscal_year", { ...CAL_YEAR_CTX, fiscalYearStartMonth: 0 });
    const thirteen = resolveDateRangePreset("this_fiscal_year", { ...CAL_YEAR_CTX, fiscalYearStartMonth: 13 });
    expect(zero.from <= zero.to).toBe(true);
    expect(thirteen.from <= thirteen.to).toBe(true);
  });
});
