/**
 * "Today" by kind.
 *
 * The thing that bites people: `new Date().toISOString().slice(0,10)` gives you
 * UTC's today, not the user's today and not the company's today. A US AP clerk
 * processing KSA invoices at 23:30 Pacific is already tomorrow in Riyadh —
 * "Today" must return the Riyadh today for a KSA businessDate field.
 */

/** Today in the given IANA zone as "YYYY-MM-DD". */
export function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(Date.now());

  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  return `${year}-${month}-${day}`;
}

/**
 * Now-as-instant — the canonical wire form for the current moment.
 * One of the few places where `Date.now()` and `.toISOString()` are correct;
 * everywhere else, use these helpers.
 */
export function nowInstant(): string {
  return new Date(Date.now()).toISOString();
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/**
 * Returns the UTC offset (in minutes) of the given IANA zone at the given
 * UTC instant. East of UTC is positive (e.g. Asia/Riyadh = +180).
 *
 * Pure Intl — no DST table needed. Works near DST boundaries because the
 * formatter respects the zone's actual rules at that instant.
 *
 * DST note: some engines emit hour=24 at midnight on a day that ends with a
 * DST fall-back. When this occurs we normalise to 00:00 of the *next* day
 * (d+1) before converting to UTC, matching the POSIX convention.
 */
export function utcOffsetMinutes(timeZone: string, utcMs: number): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcMs);
  const get = (t: Intl.DateTimeFormatPartTypes): number => Number(partValue(parts, t) || "0");
  const y = get("year");
  const mo = get("month");
  let d = get("day");
  const rawHour = get("hour");
  let h = rawHour;
  // Some engines emit hour=24 for midnight at the end of a DST backward
  // transition day. Normalise: roll to 00:00 of the following day.
  if (rawHour === 24) {
    h = 0;
    d += 1;
  }
  const mi = get("minute");
  const s = get("second");
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asUTC - utcMs) / 60000);
}

/**
 * DST resolution hint for wall-clock times that fall in the ambiguous hour
 * created by a "fall-back" (clocks go back) transition.
 *
 * During a fall-back transition (e.g. clocks go 02:00 → 01:00) the hour
 * 01:00–01:59 occurs twice — once on DST and once on standard time. Supplying
 * a hint lets callers choose which occurrence to target:
 *
 *   "earlier" — the first occurrence (still on DST, higher UTC offset)
 *   "later"   — the second occurrence (already on standard time, lower offset)
 *
 * For "spring-forward" transitions and all unambiguous times the hint is
 * ignored and the result is always deterministic.
 */
export type DstResolution = "earlier" | "later";

/**
 * Converts a wall-clock time in `timeZone` to its UTC instant as ISO string.
 *
 *   utcFromZoneWallClock(2026, 6, 30, 18, 0, "Asia/Riyadh") → "2026-06-30T15:00:00.000Z"
 *
 * DST "spring-forward" gap: times that fall in the skipped hour (e.g. 02:30
 * when clocks jump 02:00→03:00) do not exist. The algorithm uses the
 * pre-transition offset, rounding up to the first moment after the gap
 * (e.g. 02:30 in a spring-forward zone → UTC equivalent of 03:30 post-gap).
 * This matches the POSIX convention.
 *
 * DST "fall-back" ambiguity: when clocks go back, one wall-clock hour maps to
 * two distinct UTC moments. The `dst` parameter selects which one:
 *   "earlier" (default) — first occurrence / pre-transition offset
 *   "later"             — second occurrence / post-transition offset
 *
 * For zones with no DST (e.g. Asia/Riyadh) the result is always deterministic
 * and `dst` is ignored.
 *
 * Note: assumes standard 1-hour DST transitions. Zones with historical
 * 30-minute transitions will always resolve to "earlier".
 */
export function utcFromZoneWallClock(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  dst: DstResolution = "earlier",
): string {
  // Two-pass algorithm: initial naive-UTC guess, then re-evaluate at the
  // candidate to absorb DST. The candidate uses UTC+0 as the initial estimate.
  const candidate = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = utcOffsetMinutes(timeZone, candidate);
  const refined = candidate - off1 * 60000;
  const off2 = utcOffsetMinutes(timeZone, refined);

  if (off1 !== off2) {
    // The two passes crossed a DST boundary.
    if (off1 < off2) {
      // Spring-forward gap: off1 is the pre-transition (more negative) offset,
      // off2 is the post-transition (less negative) offset. The requested
      // wall-clock falls in the skipped hour. Use the pre-transition offset so
      // the result lands on the "post-gap" side (rounds up past the gap).
      // eslint-disable-next-line no-direct-date-parse -- reason: numeric ms → ISO is safe
      return new Date(candidate - off1 * 60000).toISOString();
    }
    // off1 > off2: the two passes crossed from a post-transition period back
    // through the fall-back. The requested wall-clock is unambiguous (it exists
    // only on the post-transition/standard side). Use off2 (post-transition).
    // eslint-disable-next-line no-direct-date-parse -- reason: numeric ms → ISO is safe
    return new Date(candidate - off2 * 60000).toISOString();
  }

  // off1 == off2: unambiguous time, or the ambiguous fall-back hour (the
  // two-pass stays on the pre-transition side, giving the "earlier" UTC).
  const earlier = candidate - off2 * 60000;

  if (dst === "later") {
    // Probe one hour forward. For a fall-back transition (clocks go back 1h),
    // `earlier + 3600000` lands in the post-transition period, maps to the
    // same wall-clock, and has a different offset. Verify the wall-clock
    // matches before committing — this prevents "later" from misfiring on
    // unambiguous times near a spring-forward transition.
    const probeMs = earlier + 3600000;
    const offProbe = utcOffsetMinutes(timeZone, probeMs);
    if (offProbe !== off2) {
      const [ph, pmi] = wallClockHourMin(probeMs, timeZone);
      if (ph === hour && pmi === minute) {
        // eslint-disable-next-line no-direct-date-parse -- reason: numeric ms → ISO is safe
        return new Date(probeMs).toISOString();
      }
    }
  }

  // eslint-disable-next-line no-direct-date-parse -- reason: numeric ms → ISO is safe
  return new Date(earlier).toISOString();
}

// ─── Internals ───────────────────────────────────────────────────────────────

function wallClockHourMin(utcMs: number, timeZone: string): [number, number] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcMs);
  const h = Number(partValue(parts, "hour") || "0");
  const mi = Number(partValue(parts, "minute") || "0");
  return [h === 24 ? 0 : h, mi];
}
