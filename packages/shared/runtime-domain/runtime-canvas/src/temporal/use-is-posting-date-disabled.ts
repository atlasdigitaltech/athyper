"use client";

/**
 * useIsPostingDateDisabled — period-gate plumbing for posting-date fields.
 *
 * Returns a predicate `(iso: string) => boolean` that the DatePicker uses to
 * dim closed-period cells. The predicate is identical to the SQL trigger
 * (`document.trg_je_period_gate_fn`) by virtue of `@athyper/finance-rules`
 * exporting the shared `isPostingDateAllowedInCalendar` function.
 *
 * Today this fetches a single fiscal year (derived from "today in the business
 * timezone"). If a user navigates the calendar to a different FY, dates there
 * fall through the "no row" branch which the predicate treats as blocked
 * (matching SQL semantics — missing book-period row counts as 'future'). The
 * server is still authoritative; this hook is a UI affordance.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  dateToFiscalPoint,
  isPostingDateAllowedInCalendar,
  periodCalendarKey,
  type PeriodCalendar,
  type FiscalPeriodStatus,
} from "@athyper/finance-rules";
import { todayInZone } from "@athyper/temporal";

interface PeriodStatusWire {
  companyCode: string;
  fiscalYear: number;
  periodNumber: number;
  fiscalPeriodStatus: FiscalPeriodStatus | null;
  bookPeriodStatus: FiscalPeriodStatus | null;
}

async function fetchPeriodCalendar(
  companyCodeId: string,
  fiscalYear: number,
): Promise<PeriodCalendar> {
  const params = new URLSearchParams({
    scopeType: "company_code",
    scopeId: companyCodeId,
    fiscalYear: String(fiscalYear),
  });
  const res = await fetch(`/api/finance/period-status?${params}`);
  if (!res.ok) {
    if (res.status === 404) return new Map();
    throw new Error(`Failed to load period status (${res.status})`);
  }
  const rows: PeriodStatusWire[] = await res.json();
  const map = new Map<string, { fiscalPeriodStatus: FiscalPeriodStatus | null; bookPeriodStatus: FiscalPeriodStatus | null }>();
  for (const row of rows) {
    map.set(periodCalendarKey(row.fiscalYear, row.periodNumber), {
      fiscalPeriodStatus: row.fiscalPeriodStatus,
      bookPeriodStatus: row.bookPeriodStatus,
    });
  }
  return map;
}

export interface UseIsPostingDateDisabledInput {
  companyCodeId: string | null;
  fiscalYearStartMonth: number | null;
  /** Resolved business timezone — drives the "current FY" calculation. */
  businessTimeZone: string;
  /** When false, no fetch is issued and the predicate always returns false. */
  enabled?: boolean;
}

export interface UseIsPostingDateDisabledResult {
  isDateDisabled: (iso: string) => boolean;
  isLoading: boolean;
}

export function useIsPostingDateDisabled(input: UseIsPostingDateDisabledInput): UseIsPostingDateDisabledResult {
  const fyStart = input.fiscalYearStartMonth ?? 1;
  const fyForToday = useMemo(() => {
    const today = todayInZone(input.businessTimeZone);
    const point = dateToFiscalPoint(today, fyStart);
    return point?.fiscalYear ?? new Date().getUTCFullYear();
  }, [input.businessTimeZone, fyStart]);

  const enabled = (input.enabled ?? true) && !!input.companyCodeId;

  const query = useQuery({
    queryKey: ["temporal-context", "period-calendar", input.companyCodeId, fyForToday],
    queryFn: () => fetchPeriodCalendar(input.companyCodeId as string, fyForToday),
    enabled,
    staleTime: 30 * 1000,
  });

  const calendar = (enabled && query.data) ? query.data : EMPTY_CALENDAR;

  const isDateDisabled = useMemo(
    () => {
      if (!enabled) return () => false;
      return (iso: string): boolean => !isPostingDateAllowedInCalendar(iso, fyStart, calendar);
    },
    [enabled, fyStart, calendar],
  );

  return { isDateDisabled, isLoading: enabled && query.isLoading };
}

const EMPTY_CALENDAR: PeriodCalendar = new Map();
