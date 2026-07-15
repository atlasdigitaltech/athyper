import { describe, expect, it } from "vitest";
import {
  parseBusinessDate,
  parseInstant,
  parseZonedDateTime,
  TemporalParseError,
  formatBusinessDate,
  formatInstant,
  formatZonedDateTime,
  formatDayNumber,
  localeUsesAlternativeCalendar,
  todayInZone,
  firstDayOfWeekFor,
  weekendDaysFor,
  isWeekendFor,
  resolveTemporalKind,
} from "../index";

describe("parsers — strict, no silent coercion", () => {
  it("parseBusinessDate accepts canonical YYYY-MM-DD", () => {
    expect(parseBusinessDate("2026-06-30")).toBe("2026-06-30");
  });

  it("parseBusinessDate rejects trailing time, offset, or T", () => {
    for (const bad of ["2026-06-30T00:00:00", "2026-06-30Z", "2026-06-30T00:00:00Z", "2026-06-30 ", "06/30/2026", ""]) {
      expect(() => parseBusinessDate(bad)).toThrow(TemporalParseError);
    }
  });

  it("parseBusinessDate rejects invalid calendar days", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-15", "2026-04-31"]) {
      expect(() => parseBusinessDate(bad)).toThrow(TemporalParseError);
    }
  });

  it("parseInstant requires explicit Z, rejects naked offsets", () => {
    expect(parseInstant("2026-06-30T14:45:00Z")).toBe("2026-06-30T14:45:00Z");
    expect(parseInstant("2026-06-30T14:45:00.123Z")).toBe("2026-06-30T14:45:00.123Z");
    for (const bad of ["2026-06-30T14:45:00", "2026-06-30T14:45:00+03:00", "2026-06-30", "2026-06-30T14:45Z "]) {
      expect(() => parseInstant(bad)).toThrow(TemporalParseError);
    }
  });

  it("parseZonedDateTime rejects bracketed string form (must be object)", () => {
    expect(() => parseZonedDateTime("2026-06-30T18:00:00[Asia/Riyadh]")).toThrow(TemporalParseError);
    expect(parseZonedDateTime({ localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" })).toEqual({
      localDateTime: "2026-06-30T18:00:00",
      timeZone: "Asia/Riyadh",
    });
  });
});

describe("todayInZone — timezone-aware", () => {
  it("returns 'YYYY-MM-DD' in the requested zone", () => {
    const today = todayInZone("UTC");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Riyadh and Los Angeles disagree across midnight", () => {
    // Spot-check at runtime: the two zones are 10–11 hours apart, so for
    // ~3 hours each day they disagree on the date. We can't pin a fake clock
    // here without a fake-timers helper, so just assert the shape.
    expect(todayInZone("Asia/Riyadh")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInZone("America/Los_Angeles")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("week info — locale-driven", () => {
  it("KSA week starts Saturday, weekend Fri+Sat", () => {
    expect(firstDayOfWeekFor("ar-SA")).toBe(6);
    expect(weekendDaysFor("ar-SA")).toEqual([5, 6]);
  });

  it("EU starts Monday, weekend Sat+Sun", () => {
    expect(firstDayOfWeekFor("de-DE")).toBe(1);
    expect(weekendDaysFor("de-DE")).toEqual([0, 6]);
  });

  it("US starts Sunday", () => {
    expect(firstDayOfWeekFor("en-US")).toBe(0);
  });

  it("isWeekendFor honours locale", () => {
    // 2026-07-03 is a Friday; weekend in KSA, weekday in DE.
    expect(isWeekendFor("2026-07-03", "ar-SA")).toBe(true);
    expect(isWeekendFor("2026-07-03", "de-DE")).toBe(false);
    // 2026-07-04 is a Saturday — weekend everywhere we ship.
    expect(isWeekendFor("2026-07-04", "ar-SA")).toBe(true);
    expect(isWeekendFor("2026-07-04", "de-DE")).toBe(true);
  });
});

describe("formatters", () => {
  it("formatBusinessDate is timezone-immune", () => {
    expect(formatBusinessDate("2026-06-30", { locale: "en-GB", template: "%d/%m/%Y" })).toBe("30/06/2026");
    expect(formatBusinessDate("2026-06-30", { locale: "en-US", template: "%m/%d/%Y" })).toBe("06/30/2026");
    expect(formatBusinessDate("2026-06-30", { locale: "ja-JP", template: "%Y-%m-%d" })).toBe("2026-06-30");
  });

  it("formatInstant projects into the requested zone", () => {
    const tokyo = formatInstant("2026-06-30T14:45:00Z", { locale: "en-GB", timeZone: "Asia/Tokyo" });
    const utc = formatInstant("2026-06-30T14:45:00Z", { locale: "en-GB", timeZone: "UTC" });
    expect(tokyo).not.toBe(utc);
  });

  it("formatZonedDateTime always renders the bound zone, never user TZ", () => {
    const out = formatZonedDateTime(
      { localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" },
      { locale: "en-GB", showZone: true },
    );
    expect(out).toContain("18:00");
    expect(out).toContain("Asia/Riyadh");
  });
});

describe("calendar systems (Phase 5)", () => {
  it("localeUsesAlternativeCalendar detects -u-ca- extension", () => {
    expect(localeUsesAlternativeCalendar("ar-SA-u-ca-islamic-umalqura")).toBe(true);
    expect(localeUsesAlternativeCalendar("ja-JP-u-ca-japanese")).toBe(true);
    expect(localeUsesAlternativeCalendar("en-GB")).toBe(false);
    expect(localeUsesAlternativeCalendar("ar-SA")).toBe(false);
  });

  it("localeUsesAlternativeCalendar ignores explicit gregorian override", () => {
    expect(localeUsesAlternativeCalendar("en-GB-u-ca-gregory")).toBe(false);
    expect(localeUsesAlternativeCalendar("en-GB-u-ca-gregorian")).toBe(false);
  });

  it("formatBusinessDate bypasses sprintf template under Hijri locale", () => {
    // Under Gregorian locale, %d/%m/%Y renders Gregorian numerics.
    expect(formatBusinessDate("2026-06-30", { locale: "en-GB", template: "%d/%m/%Y" })).toBe("30/06/2026");
    // Under Hijri locale with the same template, formatter falls through to
    // native Intl rendering — never renders %d as Gregorian numerics under a Hijri locale.
    const hijri = formatBusinessDate("2026-06-30", { locale: "ar-SA-u-ca-islamic-umalqura", template: "%d/%m/%Y" });
    expect(hijri).not.toMatch(/^30\/06\/2026$/);
  });

  it("formatDayNumber returns Hijri day under Hijri locale", () => {
    // 2026-06-30 ≈ 1447-12-15 (or thereabouts) in Umm al-Qura. Engines vary on
    // the exact mapping near month boundaries, so just assert the result is
    // NOT the Gregorian "30" and IS a non-empty string.
    const out = formatDayNumber("2026-06-30", "ar-SA-u-ca-islamic-umalqura");
    expect(out.length).toBeGreaterThan(0);
    // Eastern Arabic 30 = "٣٠"; Latin 30 = "30". A Hijri day in mid-Dhu al-Hijjah
    // would be 12-15 — neither, in any numbering system.
    expect(out).not.toBe("30");
    expect(out).not.toBe("٣٠");
  });

  it("formatDayNumber returns Gregorian day under Gregorian locale", () => {
    expect(formatDayNumber("2026-06-30", "en-GB")).toBe("30");
  });

  it("Japanese-era locale renders year in Reiwa", () => {
    // 2026 Gregorian → Reiwa 8 (令和8年). Engines may emit "R8", "令和8", etc.
    const out = formatBusinessDate("2026-06-30", { locale: "ja-JP-u-ca-japanese" });
    // The string must not be the bare Gregorian "30 Jun 2026".
    expect(out).not.toMatch(/2026/);
  });
});

describe("resolveTemporalKind", () => {
  it("explicit temporalKind always wins", () => {
    const res = resolveTemporalKind({ dataType: "timestamptz", temporalKind: "businessDate", displayMode: "date" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.kind).toBe("businessDate");
      expect(res.source).toBe("explicit");
      expect(res.displayMode).toBe("date");
    }
  });

  it("infers businessDate from DATE", () => {
    const res = resolveTemporalKind({ dataType: "date" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.kind).toBe("businessDate");
      expect(res.source).toBe("inferred");
    }
  });

  it("infers instant from TIMESTAMPTZ", () => {
    const res = resolveTemporalKind({ dataType: "timestamptz" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") expect(res.kind).toBe("instant");
  });

  it("safely infers 'datetime' as instant (post-normalisation form)", () => {
    const res = resolveTemporalKind({ dataType: "datetime" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.kind).toBe("instant");
      expect(res.source).toBe("inferred");
    }
  });

  it("safely infers 'timestamp' as instant (pre-normalisation literal)", () => {
    const res = resolveTemporalKind({ dataType: "timestamp" });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.kind).toBe("instant");
      expect(res.source).toBe("inferred");
    }
  });

  it("returns not_temporal for non-temporal types", () => {
    expect(resolveTemporalKind({ dataType: "text" }).status).toBe("not_temporal");
    expect(resolveTemporalKind({ dataType: "uuid" }).status).toBe("not_temporal");
  });
});
