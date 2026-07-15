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
}

export interface ConfigureBookAssignment {
  bookId:           string;
  bookCode:         string;
  bookName:         string;
  status:           string;
  isPrimary:        boolean;
  currencyCode:     string | null;
  purpose:          string | null;
  isPostingEnabled: boolean;
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

export function useConfigureBookAssignments(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "configure", "book-assignments", companyCode],
    queryFn:  () => fetchJson<ConfigureBookAssignment[]>(url("book-assignments", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}
