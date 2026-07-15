"use client";

import { useQuery } from "@tanstack/react-query";

// ─── Types (mirror server DTOs; kept local to avoid tight coupling) ────────

export interface ExploreChartNode {
  id:                 string;
  parentId:           string | null;
  code:               string;
  name:               string;
  accountClass:       string;
  normalBalance:      string;
  nodeType:           string;
  isPosting:          boolean;
  isActive:           boolean;
  status:             string;
  levelNo:            number;
  hasCompanyControl:  boolean;
  subledgerType:      string | null;
}

export interface ExploreChartTree {
  chartId:          string;
  chartCode:        string;
  chartName:        string;
  chartStatus:      string;
  assignmentStatus: string;
  totalNodes:       number;
  postingNodes:     number;
  nodes:            ExploreChartNode[];
}

export interface ExploreGlAccount {
  glAccountId:          string;
  accountCode:          string;
  accountName:          string;
  accountClass:         string;
  normalBalance:        string;
  subledgerType:        string | null;
  postingAllowed:       boolean;
  blockedForManual:     boolean;
  blockedForAuto:       boolean;
  requiresCostCenter:   boolean;
  requiresProfitCenter: boolean;
  requiresProject:      boolean;
  hasCompanyControl:    boolean;
}

export interface ExploreLedgerBook {
  bookId:          string;
  bookCode:        string;
  bookName:        string;
  status:          string;
  isPrimary:       boolean;
  currencyCode:    string | null;
  fiscalYearStart: string | null;
  purpose:         string | null;
  createdAt:       string;
}

export type HouseBankChipTone = "active" | "inactive" | "effective" | "expired" | "future";

export interface ExploreHouseBank {
  configId:             string;
  configStatus:         HouseBankChipTone;
  partyId:              string;
  partyName:            string;
  partyStatus:          HouseBankChipTone;
  bankAccountId:        string;
  bankAccountLabel:     string;
  bankAccountStatus:    HouseBankChipTone;
  linkId:               string;
  linkStatus:           HouseBankChipTone;
  effectiveFrom:        string;
  effectiveUntil:       string | null;
  usageType:            string;
  isDefaultDisbursement:boolean;
  isDefaultCollection:  boolean;
  glAccountCode:        string | null;
  isReady:              boolean;
  notReadyReasons:      string[];
}


// ─── Fetchers ──────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function url(kind: string, companyCode: string): string {
  const params = new URLSearchParams({ scopeType: "company", scopeCode: companyCode });
  return `/api/finance/setup/explore/${kind}?${params}`;
}


// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useExploreChartTree(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "explore", "chart-tree", companyCode],
    queryFn:  () => fetchJson<ExploreChartTree>(url("chart-tree", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useExploreGlAccounts(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "explore", "gl-accounts", companyCode],
    queryFn:  () => fetchJson<ExploreGlAccount[]>(url("gl-accounts", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useExploreBooks(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "explore", "books", companyCode],
    queryFn:  () => fetchJson<ExploreLedgerBook[]>(url("books", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useExploreHouseBanks(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "explore", "house-banks", companyCode],
    queryFn:  () => fetchJson<ExploreHouseBank[]>(url("house-banks", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}
