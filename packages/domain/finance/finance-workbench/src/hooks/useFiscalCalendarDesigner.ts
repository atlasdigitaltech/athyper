"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type FiscalCalendarType =
  | "monthly" | "four_four_five" | "four_five_four" | "five_four_four"
  | "thirteen_period" | "custom";

export interface FiscalCalendarRule {
  id?: string;
  sequenceNo: number;
  periodNumber: number;
  periodType: "opening" | "normal" | "adjustment" | "closing";
  nameTemplate: string;
  durationUnit: "point" | "day" | "week" | "month";
  durationValue: number;
  anchor: "sequence" | "year_start" | "year_end";
  quarterNumber: number | null;
  absorbsLeapWeek: boolean;
}

export interface FiscalCalendarConfig {
  id: string;
  code: string;
  name: string;
  description: string | null;
  calendarType: FiscalCalendarType;
  versionNo: number;
  fiscalYearLabelRule: "start_year" | "end_year";
  yearStartRule: "fixed_date" | "first_on_or_after" | "last_on_or_before" | "nearest_weekday";
  anchorMonth: number;
  anchorDay: number;
  weekStartDay: number;
  periodsPerYear: number;
  leapWeekRule: "none" | "last_period";
  status: "draft" | "active";
  createdAt: string;
  rules: FiscalCalendarRule[];
}

export interface FiscalCalendarDesignerPayload {
  company: { id: string; code: string; name: string };
  calendars: FiscalCalendarConfig[];
  assignments: Array<{
    id: string; calendarId: string; fiscalYearFrom: number;
    fiscalYearTo: number | null; priority: number; status: string;
  }>;
  generatedYears: Array<{
    calendarId: string | null; fiscalYear: number; periodCount: number;
    firstDate: string; lastDate: string; nonFutureCount: number;
  }>;
}

export interface FiscalCalendarSavePayload {
  calendarId?: string;
  code: string;
  name: string;
  description?: string | null;
  calendarType: FiscalCalendarType;
  fiscalYearLabelRule: "start_year" | "end_year";
  yearStartRule: "fixed_date" | "first_on_or_after" | "last_on_or_before" | "nearest_weekday";
  anchorMonth: number;
  anchorDay: number;
  weekStartDay: number;
  periodsPerYear: number;
  leapWeekRule: "none" | "last_period";
  rules?: FiscalCalendarRule[];
}

export interface FiscalCalendarPreview {
  calendarId: string;
  fiscalYear: number;
  periods: Array<{
    sequenceNo: number; periodNumber: number; periodType: string; name: string;
    startDate: string; endDate: string; quarterNumber: number | null; isAdjustment: boolean;
  }>;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    const error = new Error(body?.message ?? `${path} returned ${response.status}`) as Error & { code?: string };
    error.code = body?.error;
    throw error;
  }
  return response.json() as Promise<T>;
}

function scopedUrl(companyCode: string) {
  const params = new URLSearchParams({ scopeType: "company", scopeCode: companyCode });
  return `/api/finance/setup/configure/fiscal-calendar?${params}`;
}

function invalidate(qc: ReturnType<typeof useQueryClient>, companyCode: string) {
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "fiscal-calendar", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "fiscal-calendar-preview", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "fiscal-periods"] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "company-hub", companyCode] });
}

export function useFiscalCalendarDesigner(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "fiscal-calendar", companyCode],
    queryFn: () => requestJson<FiscalCalendarDesignerPayload>(scopedUrl(companyCode)),
    enabled: Boolean(companyCode),
    staleTime: 30_000,
  });
}

export function useFiscalCalendarPreview(companyCode: string, calendarId: string, fiscalYear: number) {
  const params = new URLSearchParams({
    scopeType: "company", scopeCode: companyCode, fiscalYear: String(fiscalYear),
  });
  return useQuery({
    queryKey: ["finance", "setup", "configure", "fiscal-calendar-preview", companyCode, calendarId, fiscalYear],
    queryFn: () => requestJson<FiscalCalendarPreview>(
      `/api/finance/setup/configure/fiscal-calendar/${encodeURIComponent(calendarId)}/preview?${params}`,
    ),
    enabled: Boolean(companyCode && calendarId && Number.isInteger(fiscalYear)),
    staleTime: 30_000,
  });
}

export function useSaveFiscalCalendar(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FiscalCalendarSavePayload) => {
      const { calendarId, ...body } = payload;
      return requestJson<{ calendarId: string; versionNo: number; status: string; ruleCount: number }>(
        calendarId
          ? `/api/finance/setup/mutations/fiscal-calendar/${encodeURIComponent(calendarId)}`
          : "/api/finance/setup/mutations/fiscal-calendar",
        { method: calendarId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      );
    },
    onSuccess: () => invalidate(qc, companyCode),
  });
}

export function useAssignFiscalCalendar(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, fiscalYearFrom }: { calendarId: string; fiscalYearFrom: number }) =>
      requestJson<{ assignmentId: string }>(
        `/api/finance/setup/mutations/fiscal-calendar/${encodeURIComponent(calendarId)}/assign`,
        {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyCode, fiscalYearFrom }),
        },
      ),
    onSuccess: () => invalidate(qc, companyCode),
  });
}

export function useRetireFiscalCalendar(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calendarId: string) => requestJson<{ calendarId: string; status: string }>(
      `/api/finance/setup/mutations/fiscal-calendar/${encodeURIComponent(calendarId)}`,
      { method: "DELETE" },
    ),
    onSuccess: () => invalidate(qc, companyCode),
  });
}

export function useGenerateFiscalPeriods(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, fiscalYear }: { calendarId: string; fiscalYear: number }) =>
      requestJson<Record<string, unknown>>(
        `/api/finance/setup/mutations/fiscal-calendar/${encodeURIComponent(calendarId)}/generate`,
        {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyCode, fiscalYear }),
        },
      ),
    onSuccess: () => invalidate(qc, companyCode),
  });
}
