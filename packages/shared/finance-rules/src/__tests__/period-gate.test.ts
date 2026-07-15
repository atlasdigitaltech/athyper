import { describe, expect, it } from "vitest";
import {
  decidePeriodGate,
  isPostingAllowed,
  isPostingDateOpen,
  effectivePeriodStatus,
  dateToFiscalPoint,
  isPostingDateAllowedInCalendar,
  periodCalendarKey,
  type PeriodCalendar,
} from "../period-gate";

describe("decidePeriodGate - forward posting", () => {
  it("allows open/open", () => {
    expect(decidePeriodGate({ fiscalPeriodStatus: "open", bookPeriodStatus: "open" }))
      .toEqual({ allowed: true, reason: "forward_open" });
  });

  it("allows soft_close on either side when both gates are open or soft_close", () => {
    expect(isPostingAllowed({ fiscalPeriodStatus: "soft_close", bookPeriodStatus: "open" })).toBe(true);
    expect(isPostingAllowed({ fiscalPeriodStatus: "open", bookPeriodStatus: "soft_close" })).toBe(true);
    expect(isPostingAllowed({ fiscalPeriodStatus: "soft_close", bookPeriodStatus: "soft_close" })).toBe(true);
  });

  it("blocks fiscal hard_close, future, or missing fiscal period", () => {
    expect(decidePeriodGate({ fiscalPeriodStatus: "hard_close", bookPeriodStatus: "open" }))
      .toEqual({ allowed: false, reason: "fiscal_not_open" });
    expect(decidePeriodGate({ fiscalPeriodStatus: "future", bookPeriodStatus: "open" }))
      .toEqual({ allowed: false, reason: "fiscal_not_open" });
    expect(decidePeriodGate({ fiscalPeriodStatus: null, bookPeriodStatus: "open" }))
      .toEqual({ allowed: false, reason: "fiscal_not_open" });
  });

  it("blocks book hard_close or future", () => {
    expect(decidePeriodGate({ fiscalPeriodStatus: "open", bookPeriodStatus: "hard_close" }))
      .toEqual({ allowed: false, reason: "book_not_open" });
    expect(decidePeriodGate({ fiscalPeriodStatus: "open", bookPeriodStatus: "future" }))
      .toEqual({ allowed: false, reason: "book_not_open" });
  });

  it("distinguishes a missing book row from a closed book row", () => {
    expect(decidePeriodGate({ fiscalPeriodStatus: "open", bookPeriodStatus: null }))
      .toEqual({ allowed: false, reason: "book_missing" });
  });
});

describe("decidePeriodGate - reversal", () => {
  it("allows reversal as an explicit trigger exemption", () => {
    expect(decidePeriodGate(
      { fiscalPeriodStatus: "hard_close", bookPeriodStatus: "hard_close" },
      "reversal",
    )).toEqual({ allowed: true, reason: "reversal_exempt" });
  });
});

describe("isPostingDateOpen - date guard", () => {
  it("rejects non-businessDate strings before checking status", () => {
    expect(() =>
      isPostingDateOpen("2026-06-30T00:00:00Z", { fiscalPeriodStatus: "open", bookPeriodStatus: "open" }),
    ).toThrow();
  });
});

describe("effectivePeriodStatus - most restrictive lifecycle display", () => {
  it("hard_close on either side wins", () => {
    expect(effectivePeriodStatus({ fiscalPeriodStatus: "hard_close", bookPeriodStatus: "open" })).toBe("hard_close");
    expect(effectivePeriodStatus({ fiscalPeriodStatus: "open", bookPeriodStatus: "hard_close" })).toBe("hard_close");
  });

  it("soft_close outranks future for lifecycle posture", () => {
    expect(effectivePeriodStatus({ fiscalPeriodStatus: "soft_close", bookPeriodStatus: "future" })).toBe("soft_close");
  });

  it("future on both sides", () => {
    expect(effectivePeriodStatus({ fiscalPeriodStatus: "future", bookPeriodStatus: "future" })).toBe("future");
  });
});

describe("dateToFiscalPoint", () => {
  it("calendar year (fyStart=1) maps directly", () => {
    expect(dateToFiscalPoint("2026-06-30", 1)).toEqual({ fiscalYear: 2026, period: 6 });
    expect(dateToFiscalPoint("2026-01-15", 1)).toEqual({ fiscalYear: 2026, period: 1 });
    expect(dateToFiscalPoint("2026-12-31", 1)).toEqual({ fiscalYear: 2026, period: 12 });
  });

  it("April-start shifts the calendar", () => {
    expect(dateToFiscalPoint("2026-04-01", 4)).toEqual({ fiscalYear: 2026, period: 1 });
    expect(dateToFiscalPoint("2026-03-31", 4)).toEqual({ fiscalYear: 2025, period: 12 });
    expect(dateToFiscalPoint("2026-06-30", 4)).toEqual({ fiscalYear: 2026, period: 3 });
    expect(dateToFiscalPoint("2026-01-15", 4)).toEqual({ fiscalYear: 2025, period: 10 });
  });

  it("returns null on bad input", () => {
    expect(dateToFiscalPoint("2026/06/30", 1)).toBeNull();
    expect(dateToFiscalPoint("2026-06-30", 0)).toBeNull();
    expect(dateToFiscalPoint("2026-06-30", 13)).toBeNull();
  });
});

describe("isPostingDateAllowedInCalendar", () => {
  function calendar(entries: Array<[number, number, "open" | "soft_close" | "hard_close" | "future"]>): PeriodCalendar {
    const m = new Map<string, { fiscalPeriodStatus: "open"|"soft_close"|"hard_close"|"future"|null; bookPeriodStatus: "open"|"soft_close"|"hard_close"|"future"|null }>();
    for (const [fy, p, status] of entries) {
      m.set(periodCalendarKey(fy, p), { fiscalPeriodStatus: status, bookPeriodStatus: status });
    }
    return m;
  }

  it("allows open period", () => {
    const cal = calendar([[2026, 6, "open"]]);
    expect(isPostingDateAllowedInCalendar("2026-06-30", 1, cal)).toBe(true);
  });

  it("blocks hard-closed and future periods", () => {
    expect(isPostingDateAllowedInCalendar("2026-06-30", 1, calendar([[2026, 6, "hard_close"]]))).toBe(false);
    expect(isPostingDateAllowedInCalendar("2026-06-30", 1, calendar([[2026, 6, "future"]]))).toBe(false);
  });

  it("missing row is blocked", () => {
    const cal = calendar([]);
    expect(isPostingDateAllowedInCalendar("2026-06-30", 1, cal)).toBe(false);
  });

  it("malformed date permits UI selection while server remains authoritative", () => {
    const cal = calendar([]);
    expect(isPostingDateAllowedInCalendar("not-a-date", 1, cal)).toBe(true);
  });

  it("respects fiscalYearStartMonth shift", () => {
    const cal = calendar([[2025, 12, "open"], [2026, 1, "hard_close"]]);
    expect(isPostingDateAllowedInCalendar("2026-03-31", 4, cal)).toBe(true);
    expect(isPostingDateAllowedInCalendar("2026-04-01", 4, cal)).toBe(false);
  });
});
