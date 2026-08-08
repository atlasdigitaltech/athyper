"use client";

/**
 * useTemporalContext — React Query hook that assembles the three-source
 * temporal profile (user, tenant, company) and returns a resolved view for
 * the DatePicker. See temporal-context.ts for the pure resolver.
 *
 * Caching:
 *   • Company profile keyed by ['temporal-context','company',companyCodeId];
 *     stale 5 min, refetched on mutation hook invalidation.
 *   • User/tenant profile is passed in by the caller (already cached by the
 *     existing usePreferences() flow — avoids duplicate /api/me/preferences fetch).
 *
 * Invalidation:
 *   • Mutations that touch tenant_profile / principal_ui_profile /
 *     company_code.{locale,tz,date_format,week_start} should call
 *     queryClient.invalidateQueries({ queryKey: ['temporal-context'] }).
 *   • The helper `invalidateTemporalContext(queryClient)` does exactly that.
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  resolveTemporalContext,
  type CompanyTemporalProfile,
  type ResolvedTemporalContext,
  type TenantTemporalProfile,
  type UserTemporalProfile,
} from "./temporal-context";
import type { WeekStart } from "@athyper/temporal";

interface CompanyCodeProfileWire {
  companyCodeId: string;
  code: string;
  timezoneCode: string | null;
  localeCode: string | null;
  dateFormat: string | null;
  weekStart: 0 | 1 | 6 | null;
  countryCode: string | null;
  fiscalYearStartMonth: number | null;
}

async function fetchCompanyCodeProfile(companyCodeId: string): Promise<CompanyTemporalProfile> {
  const res = await fetch(`/api/master/company-code/${companyCodeId}/profile`);
  if (!res.ok) throw new Error(`Failed to load company-code profile (${res.status})`);
  const wire: CompanyCodeProfileWire = await res.json();
  return {
    locale: wire.localeCode,
    timeZone: wire.timezoneCode,
    dateFormat: wire.dateFormat,
    weekStart: wire.weekStart as WeekStart | null,
    fiscalYearStartMonth: wire.fiscalYearStartMonth,
    companyCodeId: wire.companyCodeId,
  };
}

export interface UseTemporalContextInput {
  /** Document owner — when present, drives business* fields. */
  companyCodeId?: string | null;
  /** Already-resolved user preferences (locale, tz, date format). */
  user: UserTemporalProfile | null;
  /** Tenant defaults (loaded once at app boot). */
  tenant: TenantTemporalProfile | null;
}

export interface UseTemporalContextResult {
  context: ResolvedTemporalContext;
  isLoading: boolean;
  isError: boolean;
}

export function useTemporalContext(input: UseTemporalContextInput): UseTemporalContextResult {
  const enabled = !!input.companyCodeId;
  const query = useQuery({
    queryKey: ["temporal-context", "company", input.companyCodeId],
    queryFn: () => fetchCompanyCodeProfile(input.companyCodeId as string),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const company = enabled && query.data ? query.data : null;
  const context = resolveTemporalContext({ user: input.user, tenant: input.tenant, company });
  return {
    context,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
  };
}

/**
 * Call this from any mutation hook that changes user prefs, tenant profile,
 * or company-code temporal columns. Forces every DatePicker in the app to
 * re-resolve its locale/timezone.
 */
export function invalidateTemporalContext(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ["temporal-context"] });
}
