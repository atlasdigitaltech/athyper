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
  const d = get("day");
  const h = get("hour") === 24 ? 0 : get("hour");
  const mi = get("minute");
  const s = get("second");
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asUTC - utcMs) / 60000);
}

/**
 * Converts a wall-clock time in `timeZone` to its UTC instant as ISO string.
 *
 *   utcFromZoneWallClock(2026, 6, 30, 18, 0, "Asia/Riyadh") → "2026-06-30T15:00:00.000Z"
 *
 * Two-pass: first guess (offset=0), then re-evaluate offset at the candidate
 * to absorb DST. Near a DST transition the second pass is required.
 */
export function utcFromZoneWallClock(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): string {
  const candidate = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = utcOffsetMinutes(timeZone, candidate);
  const refined = candidate - off1 * 60000;
  const off2 = utcOffsetMinutes(timeZone, refined);
  const final = candidate - off2 * 60000;
  // eslint-disable-next-line no-direct-date-parse -- reason: numeric ms → ISO is safe; no string parsing involved
  return new Date(final).toISOString();
}
