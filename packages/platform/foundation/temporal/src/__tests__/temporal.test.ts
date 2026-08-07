import { describe, expect, it } from "vitest";
import {
  parseBusinessDate,
  parseInstant,
  parseZonedDateTime,
  TemporalParseError,
  BusinessDateSchema,
  InstantSchema,
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
  utcOffsetMinutes,
  utcFromZoneWallClock,
  addDaysISO,
  addMonthsISO,
  startOfMonthISO,
  endOfMonthISO,
  startOfWeekISO,
  endOfWeekISO,
  startOfYearISO,
  endOfYearISO,
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

  it("parseInstant rejects out-of-range time components", () => {
    expect(() => parseInstant("2026-06-30T25:00:00Z")).toThrow(TemporalParseError);
    expect(() => parseInstant("2026-06-30T14:60:00Z")).toThrow(TemporalParseError);
    expect(() => parseInstant("2026-06-30T14:45:60Z")).toThrow(TemporalParseError);
  });

  it("parseZonedDateTime rejects bracketed string form (must be object)", () => {
    expect(() => parseZonedDateTime("2026-06-30T18:00:00[Asia/Riyadh]")).toThrow(TemporalParseError);
    expect(parseZonedDateTime({ localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" })).toEqual({
      localDateTime: "2026-06-30T18:00:00",
      timeZone: "Asia/Riyadh",
    });
  });

  it("TemporalParseError safely handles non-serialisable raw values", () => {
    const err = new TemporalParseError("businessDate", undefined);
    expect(err.message).toContain("businessDate");
    // BigInt is not JSON-serialisable — must not throw
    const err2 = new TemporalParseError("instant", BigInt(42));
    expect(err2.message).toContain("instant");
  });
});

describe("Zod refinement schemas", () => {
  it("BusinessDateSchema passes valid dates", () => {
    expect(BusinessDateSchema.safeParse("2026-06-30").success).toBe(true);
  });

  it("BusinessDateSchema rejects invalid strings", () => {
    expect(BusinessDateSchema.safeParse("not-a-date").success).toBe(false);
    expect(BusinessDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(BusinessDateSchema.safeParse("2026-06-30T00:00:00Z").success).toBe(false);
  });

  it("InstantSchema passes valid instants", () => {
    expect(InstantSchema.safeParse("2026-06-30T14:45:00Z").success).toBe(true);
    expect(InstantSchema.safeParse("2026-06-30T14:45:00.999Z").success).toBe(true);
  });

  it("InstantSchema rejects invalid instants", () => {
    expect(InstantSchema.safeParse("2026-06-30").success).toBe(false);
    expect(InstantSchema.safeParse("2026-06-30T25:00:00Z").success).toBe(false);
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

  it("ar-YE resolves to Arab-world defaults, not random ar-* entry", () => {
    // Before the language-defaults fix, ar-YE could resolve to ar-JO or
    // ar-SA depending on FALLBACK_TABLE insertion order. Now it must always
    // resolve to the explicit LANGUAGE_DEFAULTS["ar"] entry.
    expect(firstDayOfWeekFor("ar-YE")).toBe(6);
    expect(weekendDaysFor("ar-YE")).toEqual([5, 6]);
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

  it("formatZonedDateTime includes seconds when present in localDateTime", () => {
    const out = formatZonedDateTime(
      { localDateTime: "2026-06-30T18:00:30", timeZone: "Asia/Riyadh" },
      { locale: "en-GB", showZone: false },
    );
    expect(out).toContain("18:00:30");
  });

  it("formatZonedDateTime omits seconds when not present in localDateTime", () => {
    const out = formatZonedDateTime(
      { localDateTime: "2026-06-30T18:00", timeZone: "Asia/Riyadh" },
      { locale: "en-GB", showZone: false },
    );
    expect(out).toContain("18:00");
    expect(out).not.toMatch(/18:00:\d{2}/);
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
    // The string must not be the bare Gregorian "2026".
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

  it("returns unresolved for unknown explicit kind string", () => {
    const res = resolveTemporalKind({ dataType: "date", temporalKind: "wallClock" });
    expect(res.status).toBe("unresolved");
    if (res.status === "unresolved") expect(res.reason).toBe("unknown_kind_string");
  });
});

describe("arithmetic — pure calendar, timezone-immune", () => {
  it("addDaysISO forward", () => {
    expect(addDaysISO("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addDaysISO backward", () => {
    expect(addDaysISO("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDaysISO("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("addDaysISO zero is identity", () => {
    expect(addDaysISO("2026-06-15", 0)).toBe("2026-06-15");
  });

  it("addMonthsISO simple advance", () => {
    expect(addMonthsISO("2026-06-15", 1)).toBe("2026-07-15");
    expect(addMonthsISO("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("addMonthsISO clamps day to end of target month", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("addMonthsISO leap year — Feb 29 survives", () => {
    expect(addMonthsISO("2024-01-31", 1)).toBe("2024-02-29"); // 2024 is a leap year
  });

  it("startOfMonthISO / endOfMonthISO", () => {
    expect(startOfMonthISO("2026-06-15")).toBe("2026-06-01");
    expect(endOfMonthISO("2026-06-15")).toBe("2026-06-30");
    expect(endOfMonthISO("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthISO("2024-02-10")).toBe("2024-02-29"); // leap year
  });

  it("startOfYearISO / endOfYearISO", () => {
    expect(startOfYearISO("2026-06-15")).toBe("2026-01-01");
    expect(endOfYearISO("2026-06-15")).toBe("2026-12-31");
  });

  it("startOfWeekISO — Sunday start (en-US)", () => {
    // 2026-07-01 is a Wednesday; previous Sunday is 2026-06-28
    expect(startOfWeekISO("2026-07-01", 0)).toBe("2026-06-28");
    // 2026-06-28 is itself a Sunday
    expect(startOfWeekISO("2026-06-28", 0)).toBe("2026-06-28");
  });

  it("startOfWeekISO — Monday start (en-GB)", () => {
    // 2026-07-01 is Wednesday; previous Monday is 2026-06-29
    expect(startOfWeekISO("2026-07-01", 1)).toBe("2026-06-29");
    // 2026-06-29 is itself a Monday
    expect(startOfWeekISO("2026-06-29", 1)).toBe("2026-06-29");
  });

  it("startOfWeekISO — Saturday start (ar-SA)", () => {
    // 2026-07-01 is Wednesday; previous Saturday is 2026-06-27
    expect(startOfWeekISO("2026-07-01", 6)).toBe("2026-06-27");
    // 2026-06-27 is itself a Saturday
    expect(startOfWeekISO("2026-06-27", 6)).toBe("2026-06-27");
  });

  it("endOfWeekISO is startOfWeek + 6", () => {
    expect(endOfWeekISO("2026-07-01", 1)).toBe("2026-07-05");
  });
});

describe("utcOffsetMinutes — Intl-driven offset", () => {
  it("UTC is always 0", () => {
    expect(utcOffsetMinutes("UTC", Date.UTC(2026, 5, 30, 12, 0, 0))).toBe(0);
  });

  it("Asia/Riyadh is +180 (no DST)", () => {
    expect(utcOffsetMinutes("Asia/Riyadh", Date.UTC(2026, 5, 30, 12, 0, 0))).toBe(180);
  });

  it("America/New_York winter offset is -300 (EST)", () => {
    // 2026-01-15 is well into EST (no DST)
    expect(utcOffsetMinutes("America/New_York", Date.UTC(2026, 0, 15, 12, 0, 0))).toBe(-300);
  });

  it("America/New_York summer offset is -240 (EDT)", () => {
    // 2026-07-15 is well into EDT
    expect(utcOffsetMinutes("America/New_York", Date.UTC(2026, 6, 15, 12, 0, 0))).toBe(-240);
  });

  it("Europe/London winter offset is 0 (GMT)", () => {
    expect(utcOffsetMinutes("Europe/London", Date.UTC(2026, 0, 15, 12, 0, 0))).toBe(0);
  });

  it("Europe/London summer offset is +60 (BST)", () => {
    expect(utcOffsetMinutes("Europe/London", Date.UTC(2026, 6, 15, 12, 0, 0))).toBe(60);
  });
});

describe("utcFromZoneWallClock — DST handling", () => {
  it("converts wall-clock in Riyadh (no DST) correctly", () => {
    // 18:00 Riyadh = 15:00 UTC (UTC+3, no DST ever)
    const result = utcFromZoneWallClock(2026, 6, 30, 18, 0, "Asia/Riyadh");
    expect(result).toBe("2026-06-30T15:00:00.000Z");
  });

  it("spring-forward gap (America/New_York 2026-03-08): 02:30 does not exist, rounds up past gap", () => {
    // 2026-03-08 02:00 EST → 03:00 EDT (spring forward, +1h). Times 02:00–02:59
    // do not exist. The algorithm uses the pre-transition (EST) offset, which
    // rounds up to the equivalent time on the EDT side.
    // 02:30 EST = 07:30 UTC. At 07:30 UTC, NY is on EDT, local time = 03:30 EDT.
    const result = utcFromZoneWallClock(2026, 3, 8, 2, 30, "America/New_York");
    expect(result).toBe("2026-03-08T07:30:00.000Z");
  });

  it("fall-back ambiguous hour — 'earlier' selects first occurrence (DST offset)", () => {
    // 2026-11-01 01:30 in America/New_York: clocks go back 02:00→01:00, so
    // 01:30 exists twice. 'earlier' = EDT (UTC-4) → 05:30Z.
    const earlier = utcFromZoneWallClock(2026, 11, 1, 1, 30, "America/New_York", "earlier");
    // 'later' = EST (UTC-5) → 06:30Z.
    const later = utcFromZoneWallClock(2026, 11, 1, 1, 30, "America/New_York", "later");
    // The two must differ by exactly 1 hour (3600000 ms).
    const diff = Math.abs(Date.parse(later) - Date.parse(earlier));
    expect(diff).toBe(3600000);
    // 'earlier' must be before 'later'.
    expect(Date.parse(earlier)).toBeLessThan(Date.parse(later));
  });

  it("fall-back default resolution is 'earlier'", () => {
    const explicit = utcFromZoneWallClock(2026, 11, 1, 1, 30, "America/New_York", "earlier");
    const defaulted = utcFromZoneWallClock(2026, 11, 1, 1, 30, "America/New_York");
    expect(explicit).toBe(defaulted);
  });

  it("non-ambiguous time is unaffected by dst hint", () => {
    const earlier = utcFromZoneWallClock(2026, 6, 15, 12, 0, "America/New_York", "earlier");
    const later = utcFromZoneWallClock(2026, 6, 15, 12, 0, "America/New_York", "later");
    expect(earlier).toBe(later);
  });
});
