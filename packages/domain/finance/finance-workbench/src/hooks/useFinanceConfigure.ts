"use client";

import { useQuery } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ConfigureGlControlRow {
  /** company_code_gl_account.id — null when no control row exists. */
  controlId:            string | null;
  glAccountId:          string;
  accountCode:          string;
  accountName:          string;
  accountClass:         string;
  nodeType:             string;
  currencyCode:         string | null;
  chartCode:            string;
  normalBalance:        string;
  isPosting:            boolean;
  hasCompanyControl:    boolean;
  postingAllowed:       boolean;
  blockedForManual:     boolean;
  blockedForAuto:       boolean;
  requiresCostCenter:   boolean;
  requiresProfitCenter: boolean;
  requiresProject:      boolean;
  reconciliationType:   string | null;
  taxCategory:          string | null;
  defaultCostCenterId:  string | null;
  defaultSiteId:        string | null;
  createdAt:            string | null;
  updatedAt:            string | null;
}

export interface ConfigureGlControlsGrid {
  companyCode:     string;
  totalPostable:   number;
  totalControlled: number;
  coveragePct:     number;
  rows:            ConfigureGlControlRow[];
}

export interface ConfigureChartAssignment {
  assignmentId:   string;
  assignmentType: string;
  chartId:        string;
  chartCode:      string;
  chartName:      string;
  chartStatus:    string;
  status:         string;
  isPrimary:      boolean;
  effectiveFrom:  string | null;
  effectiveTo:    string | null;
  impactedAccountCount: number;
  updatedAt:      string | null;
}

export interface ConfigureChartOption {
  chartId: string;
  code: string;
  name: string;
  framework: string | null;
  countryCode: string | null;
  version: number;
  status: string;
  postingAccountCount: number;
}

export interface ConfigureBookAssignment {
  assignmentId:     string;
  bookId:           string;
  bookCode:         string;
  bookName:         string;
  bookStatus:       string;
  assignmentStatus: string;
  isTenantDefault:  boolean;
  isCompanyDefault: boolean;
  baseCurrencyCode: string;
  overrideCurrencyCode: string | null;
  currencyCode:     string | null;
  currencySource:   "assignment_override" | "book_base";
  companyFunctionalCurrency: string | null;
  alternateCoaPrefix: string | null;
  effectiveFrom:    string;
  effectiveTo:      string | null;
  priority:         number;
  conflictStrategy: string;
  purpose:          string | null;
  isPostingEnabled: boolean;
  updatedAt:        string | null;
}

export interface ConfigureBookOption {
  bookId: string;
  code: string;
  name: string;
  category: string;
  reportingStandard: string | null;
  baseCurrencyCode: string;
  isTenantDefault: boolean;
  status: string;
  assignedCompanyCount: number;
}


// ─── Fetchers ─────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function url(kind: string, companyCode: string): string {
  const params = new URLSearchParams({ scopeType: "company", scopeCode: companyCode });
  return `/api/finance/setup/configure/${kind}?${params}`;
}


// ─── Hooks ────────────────────────────────────────────────────────────────

export function useConfigureGlControls(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "gl-controls", companyCode],
    queryFn:  () => fetchJson<ConfigureGlControlsGrid>(url("gl-controls", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useConfigureChartAssignments(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "chart-assignments", companyCode],
    queryFn:  () => fetchJson<ConfigureChartAssignment[]>(url("chart-assignments", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useConfigureChartOptions(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "chart-options", companyCode],
    queryFn: () => fetchJson<ConfigureChartOption[]>(url("chart-options", companyCode)),
    enabled: !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useConfigureBookAssignments(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "book-assignments", companyCode],
    queryFn:  () => fetchJson<ConfigureBookAssignment[]>(url("book-assignments", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useConfigureBookOptions(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "book-options", companyCode],
    queryFn: () => fetchJson<ConfigureBookOption[]>(url("book-options", companyCode)),
    enabled: !!companyCode,
    staleTime: 60 * 1000,
  });
}
