/**
 * Date-range presets. Same predicate on client and server so a "Last 30 days"
 * saved view resolves identically wherever it's loaded — the paired
 * verify-parity pattern from period-gate is deliberately reused.
 *
 * Presets fall in two families:
 *   Calendar-only (today, yesterday, last N days, this/last week, this/last month)
 *   Fiscal-aware (this/last quarter, this/last fiscal year, ytd)
 *
 * The fiscal-aware presets use `dateToFiscalPoint` from period-gate.ts so a
 * KSA company with fyStart=1 and an India company with fyStart=4 both get
 * correct "This quarter" boundaries against the same "today".
 */

import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  endOfWeekISO,
  endOfYearISO,
  parseBusinessDate,
  startOfMonthISO,
  startOfWeekISO,
  startOfYearISO,
  type WeekStart,
} from "@athyper/temporal";
import { dateToFiscalPoint } from "./period-gate";

// ─── Locale-aware preset labels ──────────────────────────────────────────────
//
// Ship English defaults; consumers may pass their own translations for locales
// we haven't caught yet. Keep this at the top of the file so translators can
// find it without hunting.

const PRESET_LABELS: Record<string, Partial<Record<PresetKeyRaw, string>>> = {
  en: {
    today: "Today",
    yesterday: "Yesterday",
    last_7_days: "Last 7 days",
    last_30_days: "Last 30 days",
    last_90_days: "Last 90 days",
    this_week: "This week",
    last_week: "Last week",
    this_month: "This month",
    last_month: "Last month",
    this_quarter: "This quarter",
    last_quarter: "Last quarter",
    this_fiscal_year: "This fiscal year",
    last_fiscal_year: "Last fiscal year",
    this_year: "This year",
    last_year: "Last year",
    ytd: "Year to date",
    qtd: "Quarter to date",
    mtd: "Month to date",
    this_period: "This period",
    last_period: "Last period",
  },
  ar: {
    today: "اليوم",
    yesterday: "أمس",
    last_7_days: "آخر ٧ أيام",
    last_30_days: "آخر ٣٠ يوماً",
    last_90_days: "آخر ٩٠ يوماً",
    this_week: "هذا الأسبوع",
    last_week: "الأسبوع الماضي",
    this_month: "هذا الشهر",
    last_month: "الشهر الماضي",
    this_quarter: "هذا الربع",
    last_quarter: "الربع الماضي",
    this_fiscal_year: "السنة المالية الحالية",
    last_fiscal_year: "السنة المالية السابقة",
    this_year: "هذه السنة",
    last_year: "السنة الماضية",
    ytd: "منذ بداية السنة",
    qtd: "منذ بداية الربع",
    mtd: "منذ بداية الشهر",
    this_period: "الفترة الحالية",
    last_period: "الفترة السابقة",
  },
  ja: {
    today: "今日",
    yesterday: "昨日",
    last_7_days: "過去7日間",
    last_30_days: "過去30日間",
    last_90_days: "過去90日間",
    this_week: "今週",
    last_week: "先週",
    this_month: "今月",
    last_month: "先月",
    this_quarter: "今四半期",
    last_quarter: "前四半期",
    this_fiscal_year: "今年度",
    last_fiscal_year: "前年度",
    this_year: "今年",
    last_year: "昨年",
    ytd: "年初来",
    qtd: "四半期初来",
    mtd: "月初来",
    this_period: "当会計期間",
    last_period: "前会計期間",
  },
};

// Private alias so PRESET_LABELS can reference the enum shape without
// forward-declaring the exported type below.
type PresetKeyRaw =
  | "today" | "yesterday"
  | "last_7_days" | "last_30_days" | "last_90_days"
  | "this_week" | "last_week"
  | "this_month" | "last_month"
  | "this_quarter" | "last_quarter"
  | "this_fiscal_year" | "last_fiscal_year"
  | "this_year" | "last_year"
  | "ytd" | "qtd" | "mtd"
  | "this_period" | "last_period";

/**
 * Return the display label for a preset in the given BCP-47 locale. Falls
 * back to the language subtag, then English, then the raw key. The trivial
 * fallback path means new locales won't crash the picker — they'll just show
 * English until translations land.
 */
export function presetLabel(key: DateRangePresetKey, locale: string): string {
  const exact = PRESET_LABELS[locale];
  if (exact && exact[key]) return exact[key] as string;
  const lang = locale.split("-")[0] ?? "en";
  const byLang = PRESET_LABELS[lang];
  if (byLang && byLang[key]) return byLang[key] as string;
  return PRESET_LABELS.en?.[key] ?? key;
}

/**
 * Preset keys for date-range filters.
 *
 * Two families of semantics — pick the right one for the tenant's UX:
 *
 * ─── Calendar family (always Jan-Dec / Sun-Sat / etc.) ─────────────────────
 *   today, yesterday, last_7_days, last_30_days, last_90_days
 *   this_week, last_week          (Mon-Sun by default; Sat-Fri under KSA locale)
 *   this_month, last_month
 *   this_year, last_year          (calendar year — ignores fiscalYearStartMonth)
 *   mtd                           (month-to-date; calendar month start → today)
 *
 * ─── Fiscal family (respects the company's fiscalYearStartMonth) ──────────
 *   this_quarter, last_quarter         (fiscal quarters, not calendar Q1-Q4)
 *   this_fiscal_year, last_fiscal_year (fiscal year, e.g. Apr-Mar in India)
 *   ytd                                 (fiscal year-to-date)
 *   qtd                                 (fiscal quarter-to-date)
 *
 * ─── Period family (needs a DB lookup, not a pure calendar predicate) ─────
 *   this_period, last_period      (rows from master.fiscal_period)
 *   resolveDateRangePreset throws for these — callers dispatch to the period
 *   service instead (server/packages/services/records/routes/lib/period-range.ts).
 *
 * Rule of thumb: if the tenant's fiscal-year-start is January, calendar and
 * fiscal presets return identical ranges. When it isn't (e.g. India's April
 * start), the distinction matters and the DateRangePicker sidebar renders a
 * divider between the two families so users can pick the right one at a glance.
 */
export type DateRangePresetKey =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_fiscal_year"
  | "last_fiscal_year"
  | "this_year"
  | "last_year"
  | "ytd"
  | "qtd"
  | "mtd"
  // `this_period` / `last_period` need a period-status lookup and are resolved
  // separately by the caller (the DatePicker / server route). Keys exist here
  // for label + type coverage, but `resolveDateRangePreset` will throw for them —
  // callers detect the key and dispatch to their period-service instead.
  | "this_period"
  | "last_period";

export interface PresetResolutionContext {
  /** Business-date anchor — call `todayInZone(businessTimeZone)` upstream. */
  today: string;
  /** Locale-driven week start. 0=Sun, 1=Mon, 6=Sat. */
  weekStart: WeekStart;
  /** Company-code fiscal year start month, 1-12. */
  fiscalYearStartMonth: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export function resolveDateRangePreset(
  key: DateRangePresetKey,
  ctx: PresetResolutionContext,
): DateRange {
  const today = parseBusinessDate(ctx.today);
  const fyStart = clampMonth(ctx.fiscalYearStartMonth);

  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return { from: y, to: y };
    }
    case "last_7_days":
      return { from: addDaysISO(today, -6), to: today };
    case "last_30_days":
      return { from: addDaysISO(today, -29), to: today };
    case "last_90_days":
      return { from: addDaysISO(today, -89), to: today };
    case "this_week":
      return { from: startOfWeekISO(today, ctx.weekStart), to: endOfWeekISO(today, ctx.weekStart) };
    case "last_week": {
      const lastWeekAnchor = addDaysISO(today, -7);
      return { from: startOfWeekISO(lastWeekAnchor, ctx.weekStart), to: endOfWeekISO(lastWeekAnchor, ctx.weekStart) };
    }
    case "this_month":
      return { from: startOfMonthISO(today), to: endOfMonthISO(today) };
    case "last_month": {
      const lastMonthAnchor = addMonthsISO(today, -1);
      return { from: startOfMonthISO(lastMonthAnchor), to: endOfMonthISO(lastMonthAnchor) };
    }
    case "this_quarter":
      return fiscalQuarterRange(today, fyStart, 0);
    case "last_quarter":
      return fiscalQuarterRange(today, fyStart, -1);
    case "this_fiscal_year":
      return fiscalYearRange(today, fyStart, 0);
    case "last_fiscal_year":
      return fiscalYearRange(today, fyStart, -1);
    case "ytd": {
      // Fiscal year-to-date when the caller supplies a fyStart other than 1.
      const yearStart = fiscalYearRange(today, fyStart, 0).from;
      return { from: yearStart, to: today };
    }
    case "this_year": {
      // Always CALENDAR year — the fiscal analogue is `this_fiscal_year`.
      const [y] = today.split("-").map(Number) as [number, number, number];
      return { from: `${String(y).padStart(4, "0")}-01-01`, to: `${String(y).padStart(4, "0")}-12-31` };
    }
    case "last_year": {
      const [y] = today.split("-").map(Number) as [number, number, number];
      const prev = y - 1;
      return { from: `${String(prev).padStart(4, "0")}-01-01`, to: `${String(prev).padStart(4, "0")}-12-31` };
    }
    case "qtd": {
      // Quarter-to-date: from current fiscal-quarter start to today.
      const q = fiscalQuarterRange(today, fyStart, 0);
      return { from: q.from, to: today };
    }
    case "mtd": {
      return { from: startOfMonthISO(today), to: today };
    }
    case "this_period":
    case "last_period":
      throw new Error(
        `[presets] "${key}" requires a period-status lookup and cannot be resolved by resolveDateRangePreset. ` +
        `Callers must dispatch to the period service (server) or usePeriodStatus (client) for these keys.`,
      );
    default:
      // Callers occasionally pass an untyped string (server sigil resolver).
      // Throw rather than silently returning undefined so their try/catch
      // fallback fires consistently.
      throw new Error(`[presets] Unknown preset key: ${key satisfies never}`);
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

function clampMonth(m: number): number {
  if (!Number.isFinite(m)) return 1;
  const rounded = Math.round(m);
  if (rounded < 1) return 1;
  if (rounded > 12) return 12;
  return rounded;
}

/**
 * Fiscal quarter (`offset` = 0 for the current one, -1 for the previous).
 * A fiscal quarter is 3 fiscal periods; period 1 = fyStart month.
 * The mapping:
 *   fy period P (1-12) → quarter Q = ceil(P/3) (1-4)
 *   quarter Q startPeriod = 3*(Q-1) + 1
 *   quarter Q startMonth  = ((fyStart - 1 + startPeriod - 1) mod 12) + 1
 */
function fiscalQuarterRange(today: string, fyStart: number, offset: number): DateRange {
  const point = dateToFiscalPoint(today, fyStart);
  if (!point) throw new Error(`[presets] cannot resolve fiscal quarter for date "${today}"`);
  const q = Math.ceil(point.period / 3);
  const shiftedQuarter = q + offset;
  // Handle year-wrap on offset
  let fy = point.fiscalYear;
  let effectiveQ = shiftedQuarter;
  while (effectiveQ < 1) { fy -= 1; effectiveQ += 4; }
  while (effectiveQ > 4) { fy += 1; effectiveQ -= 4; }
  const startPeriod = (effectiveQ - 1) * 3 + 1;
  const endPeriod = startPeriod + 2;
  const startMonthCal = ((fyStart - 1 + (startPeriod - 1)) % 12) + 1;
  const endMonthCal   = ((fyStart - 1 + (endPeriod - 1)) % 12) + 1;
  // Calendar year the start month lands in (may be fy or fy+1 depending on wrap)
  const startCalYear = calendarYearForFiscalPeriod(fy, fyStart, startPeriod);
  const endCalYear   = calendarYearForFiscalPeriod(fy, fyStart, endPeriod);
  return {
    from: `${String(startCalYear).padStart(4, "0")}-${String(startMonthCal).padStart(2, "0")}-01`,
    to: endOfMonthISO(`${String(endCalYear).padStart(4, "0")}-${String(endMonthCal).padStart(2, "0")}-01`),
  };
}

function fiscalYearRange(today: string, fyStart: number, offset: number): DateRange {
  const point = dateToFiscalPoint(today, fyStart);
  if (!point) throw new Error(`[presets] cannot resolve fiscal year for date "${today}"`);
  const targetFY = point.fiscalYear + offset;
  const startCalYear = calendarYearForFiscalPeriod(targetFY, fyStart, 1);
  const endCalYear   = calendarYearForFiscalPeriod(targetFY, fyStart, 12);
  const endMonthCal  = ((fyStart - 1 + 11) % 12) + 1;
  return {
    from: `${String(startCalYear).padStart(4, "0")}-${String(fyStart).padStart(2, "0")}-01`,
    to: endOfMonthISO(`${String(endCalYear).padStart(4, "0")}-${String(endMonthCal).padStart(2, "0")}-01`),
  };
}

/**
 * Given a fiscal year label and a fiscal period (1..12), returns the calendar
 * year that period lands in. For fyStart=1 (calendar-year FY), FY 2026 period 1
 * is calendar 2026. For fyStart=4 (India), FY 2026 period 1 is calendar 2026,
 * but FY 2026 period 10 is calendar 2027.
 */
function calendarYearForFiscalPeriod(fiscalYear: number, fyStart: number, period: number): number {
  const monthsIntoFY = period - 1;
  return fiscalYear + Math.floor((fyStart - 1 + monthsIntoFY) / 12);
}
