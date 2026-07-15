/**
 * Pure temporal-context resolver. Combines (user, tenant, company) profile
 * sources and produces a single resolved view that the DatePicker reads.
 *
 * Resolution chain (most-specific → fallback):
 *   businessLocale    ← company.locale → tenant.locale → user.locale → "en"
 *   businessTimeZone  ← company.tz     → tenant.tz     → user.tz     → "UTC"
 *   businessDateFormat← company.format → tenant.format → user.format → "%d %b %Y"
 *   businessWeekStart ← company.week_start → tenant.week_start → derived from businessLocale
 *   userLocale        ← user.locale → "en"
 *   userTimeZone      ← user.tz     → "UTC"
 *
 * No React, no fetching. The React hook (useTemporalContext.ts) calls this
 * after the relevant queries resolve.
 */

import { firstDayOfWeekFor } from "@athyper/temporal";
import type { WeekStart } from "@athyper/temporal";

export interface UserTemporalProfile {
  locale: string | null;
  timeZone: string | null;
  dateFormat: string | null;
}

export interface TenantTemporalProfile {
  locale: string | null;
  timeZone: string | null;
  dateFormat: string | null;
  weekStart: WeekStart | null;
}

export interface CompanyTemporalProfile {
  locale: string | null;
  timeZone: string | null;
  dateFormat: string | null;
  weekStart: WeekStart | null;
  /** Fiscal year start month, 1-12. Needed by the posting-date gate. */
  fiscalYearStartMonth: number | null;
  /** Echoed back so consumers can key React Query / lookups by company. */
  companyCodeId: string | null;
}

export interface ResolvedTemporalContext {
  /** Business clock — used for documents owned by `company`. */
  businessLocale: string;
  businessTimeZone: string;
  businessDateFormat: string;
  businessWeekStart: WeekStart;
  /** User clock — used for instants (audit timestamps, "ago" labels). */
  userLocale: string;
  userTimeZone: string;
  userDateFormat: string;
  /**
   * Pass-through identifiers for downstream period-gate / finance hooks.
   * `null` when no companyCodeId was provided (form not bound to a company).
   */
  companyCodeId: string | null;
  fiscalYearStartMonth: number | null;
}

const DEFAULT_LOCALE = "en";
const DEFAULT_TZ = "UTC";
const DEFAULT_DATE_FORMAT = "%d %b %Y";

export interface ResolveTemporalContextInput {
  user: UserTemporalProfile | null;
  tenant: TenantTemporalProfile | null;
  company: CompanyTemporalProfile | null;
}

export function resolveTemporalContext(input: ResolveTemporalContextInput): ResolvedTemporalContext {
  const u = input.user ?? { locale: null, timeZone: null, dateFormat: null };
  const t = input.tenant ?? { locale: null, timeZone: null, dateFormat: null, weekStart: null };
  const c = input.company
    ?? { locale: null, timeZone: null, dateFormat: null, weekStart: null, fiscalYearStartMonth: null, companyCodeId: null };

  const userLocale = nonEmpty(u.locale) ?? DEFAULT_LOCALE;
  const userTimeZone = nonEmpty(u.timeZone) ?? DEFAULT_TZ;
  const userDateFormat = nonEmpty(u.dateFormat) ?? DEFAULT_DATE_FORMAT;

  const businessLocale = nonEmpty(c.locale) ?? nonEmpty(t.locale) ?? userLocale;
  const businessTimeZone = nonEmpty(c.timeZone) ?? nonEmpty(t.timeZone) ?? userTimeZone;
  const businessDateFormat = nonEmpty(c.dateFormat) ?? nonEmpty(t.dateFormat) ?? userDateFormat;
  const businessWeekStart: WeekStart =
    c.weekStart ?? t.weekStart ?? firstDayOfWeekFor(businessLocale);

  return {
    businessLocale,
    businessTimeZone,
    businessDateFormat,
    businessWeekStart,
    userLocale,
    userTimeZone,
    userDateFormat,
    companyCodeId: c.companyCodeId,
    fiscalYearStartMonth: c.fiscalYearStartMonth,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
