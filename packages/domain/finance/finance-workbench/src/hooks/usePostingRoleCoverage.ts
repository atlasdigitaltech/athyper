"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PostingRoleBook {
  bookId: string;
  bookCode: string;
  bookName: string;
  isPrimary: boolean;
}

export type PostingRoleCellStatus = "resolved" | "missing" | "invalid" | "not_required";

export interface PostingRoleCoverageCell {
  bookId: string;
  bookCode: string;
  required: boolean;
  requiredBy: string[];
  status: PostingRoleCellStatus;
  reasonCode: string;
  mappingId: string | null;
  glAccountId: string | null;
  glAccountCode: string | null;
  glAccountName: string | null;
  priority: number | null;
  versionNo: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface PostingRoleCoverageRow {
  roleCode: string;
  roleName: string;
  description: string | null;
  domain: string;
  normalBalance: string;
  mandatoryForReadiness: boolean;
  cells: PostingRoleCoverageCell[];
}

export interface PostingRoleCoveragePayload {
  companyCode: string;
  asOfDate: string;
  books: PostingRoleBook[];
  rows: PostingRoleCoverageRow[];
  accounts: Array<{
    glAccountId: string;
    accountCode: string;
    accountName: string;
    accountClass: string;
    normalBalance: string;
  }>;
  summary: {
    requiredCells: number;
    resolvedCells: number;
    missingCells: number;
    invalidCells: number;
    coveragePct: number;
    ready: boolean;
  };
}

export interface PostingRoleResolutionTrace {
  status: string;
  reasonCode?: string;
  canonicalRoleCode?: string | null;
  glAccountId?: string;
  glAccountCode?: string;
  glAccountName?: string;
  candidateCount?: number;
  steps?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface SavePostingRoleMapPayload {
  mappingId?: string;
  companyCode: string;
  roleCode: string;
  ledgerBookId: string;
  glAccountId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  priority?: number;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include", cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => null) as { message?: string } | null;
  if (!res.ok) throw new Error(body?.message ?? `${path} → ${res.status}`);
  return body as T;
}

function invalidate(qc: ReturnType<typeof useQueryClient>, companyCode: string) {
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "posting-role-coverage", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "readiness", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "conflicts", companyCode] });
}

export function usePostingRoleCoverage(companyCode: string, asOfDate: string) {
  const params = new URLSearchParams({ scopeType: "company", scopeCode: companyCode, asOfDate });
  return useQuery({
    queryKey: ["finance", "setup", "configure", "posting-role-coverage", companyCode, asOfDate],
    queryFn: () => fetchJson<PostingRoleCoveragePayload>(`/api/finance/setup/configure/posting-role-coverage?${params}`),
    enabled: !!companyCode && !!asOfDate,
    staleTime: 30_000,
  });
}

export function usePostingRoleResolutionTrace(
  companyCode: string, roleCode: string | undefined, bookCode: string | undefined, asOfDate: string,
) {
  const params = new URLSearchParams({
    scopeType: "company", scopeCode: companyCode, roleCode: roleCode ?? "",
    bookCode: bookCode ?? "", asOfDate,
  });
  return useQuery({
    queryKey: ["finance", "setup", "posting-role-trace", companyCode, roleCode, bookCode, asOfDate],
    queryFn: () => fetchJson<PostingRoleResolutionTrace>(`/api/finance/setup/configure/posting-role-resolution-trace?${params}`),
    enabled: !!companyCode && !!roleCode && !!bookCode && !!asOfDate,
    staleTime: 10_000,
  });
}

export function useSavePostingRoleAccountMap(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SavePostingRoleMapPayload) => {
      const path = payload.mappingId
        ? `/api/finance/setup/mutations/posting-role-account-map/${encodeURIComponent(payload.mappingId)}`
        : "/api/finance/setup/mutations/posting-role-account-map";
      return fetchJson<{ id: string; versionNo: number }>(path, {
        method: payload.mappingId ? "PUT" : "POST", body: JSON.stringify(payload),
      });
    },
    onSuccess: () => invalidate(qc, companyCode),
  });
}

export function useRetirePostingRoleAccountMap(companyCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: string) => fetchJson<{ id: string; status: string }>(
      `/api/finance/setup/mutations/posting-role-account-map/${encodeURIComponent(mappingId)}`,
      { method: "DELETE", body: JSON.stringify({ companyCode }) },
    ),
    onSuccess: () => invalidate(qc, companyCode),
  });
}

