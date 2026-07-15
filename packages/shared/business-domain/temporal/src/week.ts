/**
 * Week-info: first-day-of-week and weekend days by locale.
 *
 * The browser-shipped Intl.Locale.getWeekInfo() is the best source but its
 * availability matrix is patchy (Chromium has it, Safari/older Node may not).
 * We feature-detect and fall back to a static table for the locales we
 * actually ship: KSA users get Saturday-start with Fri/Sat weekend, etc.
 */

import type { WeekStart } from "./kinds";

interface WeekInfo {
  firstDay: WeekStart;
  weekend: ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6>;
}

const FALLBACK_TABLE: Record<string, WeekInfo> = {
  "ar-SA": { firstDay: 6, weekend: [5, 6] },
  "ar-AE": { firstDay: 6, weekend: [5, 6] },
  "ar-QA": { firstDay: 6, weekend: [5, 6] },
  "ar-BH": { firstDay: 6, weekend: [5, 6] },
  "ar-KW": { firstDay: 6, weekend: [5, 6] },
  "ar-OM": { firstDay: 6, weekend: [5, 6] },
  "ar-JO": { firstDay: 6, weekend: [5, 6] },
  "en-US": { firstDay: 0, weekend: [0, 6] },
  "en-CA": { firstDay: 0, weekend: [0, 6] },
  "en-AU": { firstDay: 0, weekend: [0, 6] },
  "en-GB": { firstDay: 1, weekend: [0, 6] },
  "en-IE": { firstDay: 1, weekend: [0, 6] },
  "en-IN": { firstDay: 0, weekend: [0, 6] },
  "de-DE": { firstDay: 1, weekend: [0, 6] },
  "fr-FR": { firstDay: 1, weekend: [0, 6] },
  "es-ES": { firstDay: 1, weekend: [0, 6] },
  "it-IT": { firstDay: 1, weekend: [0, 6] },
  "ja-JP": { firstDay: 0, weekend: [0, 6] },
  "zh-CN": { firstDay: 1, weekend: [0, 6] },
  "ko-KR": { firstDay: 0, weekend: [0, 6] },
  "hi-IN": { firstDay: 0, weekend: [0, 6] },
};

const DEFAULT_INFO: WeekInfo = { firstDay: 1, weekend: [0, 6] };

/**
 * Returns the first day of the week (0=Sun, 1=Mon, 6=Sat) for the given
 * BCP-47 locale. Tries Intl.Locale.getWeekInfo first; falls back to the table.
 */
export function firstDayOfWeekFor(locale: string): WeekStart {
  const info = resolveWeekInfo(locale);
  return info.firstDay;
}

/** Returns the weekend day numbers (e.g. [5,6] for KSA, [0,6] elsewhere). */
export function weekendDaysFor(locale: string): ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  return resolveWeekInfo(locale).weekend;
}

/** True if the given Date (or "YYYY-MM-DD" string) is a weekend day in the locale. */
export function isWeekendFor(value: string, locale: string): boolean {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  // Use UTC noon as a stable anchor (avoids DST + TZ shifts).
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return weekendDaysFor(locale).includes(day);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function resolveWeekInfo(locale: string): WeekInfo {
  // Intentionally NOT calling Intl.Locale.getWeekInfo() — its return shape
  // (firstDay: 1-7 with 1=Mon vs 1=Sun) varies between engines. The fallback
  // table covers every locale we ship to and gives predictable output.
  // Revisit once the TC39 Intl.Locale proposal stabilises across Chromium,
  // V8, JSC, and Spidermonkey.
  if (FALLBACK_TABLE[locale]) return FALLBACK_TABLE[locale]!;
  const lang = locale.split("-")[0];
  for (const key of Object.keys(FALLBACK_TABLE)) {
    if (key.startsWith(`${lang}-`)) return FALLBACK_TABLE[key]!;
  }
  return DEFAULT_INFO;
}
