"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Payloads ──────────────────────────────────────────────────────────────

export interface AssignGlControlPayload {
  companyCode:           string;
  glAccountCode:         string;
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
}

export interface UpdateGlControlPayload {
  controlId:             string;
  companyCode:           string;  // used for invalidation
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
}

export interface DeactivateGlControlPayload {
  controlId:   string;
  companyCode: string;
}

export interface SetPrimaryChartAssignmentPayload {
  assignmentId: string;
  companyCode:  string;
}

export interface SetPrimaryBookPayload {
  bookId:      string;
  companyCode: string;
}

export interface ToggleHouseBankPayload {
  configId:    string;
  companyCode: string;
  activate:    boolean;
}


// ─── Utils ─────────────────────────────────────────────────────────────────

async function postJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    cache:       "no-store",
    headers:     { "content-type": "application/json" },
    body:        body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP_${res.status}` }));
    const err = new Error(errBody?.message ?? `${path} → ${res.status}`) as Error & { status: number; code: string };
    err.status = res.status;
    err.code   = errBody?.error ?? "REQUEST_FAILED";
    throw err;
  }
  return res.json() as Promise<T>;
}

/** Invalidate every finance-setup query touched by a mutation on this company. */
function invalidateFinanceSetup(qc: ReturnType<typeof useQueryClient>, companyCode: string) {
  qc.invalidateQueries({ queryKey: ["finance", "setup", "company-hub", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "conflicts", "company", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "gl-controls", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "chart-assignments", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "book-assignments", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "explore", "chart-tree", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "explore", "gl-accounts", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "explore", "books", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "explore", "house-banks", companyCode] });
  // rollups are cached separately; refetch on next visit
  qc.invalidateQueries({ queryKey: ["finance", "setup", "rollup"] });
}


// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useAssignGlControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignGlControlPayload) =>
      postJson<{ controlId: string; glAccountId: string; companyCodeId: string }>(
        "/api/finance/setup/mutations/gl-control/assign",
        "POST",
        payload,
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useUpdateGlControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateGlControlPayload) => {
      const { controlId, companyCode: _cc, ...body } = payload;
      void _cc;
      return postJson<{ controlId: string }>(
        `/api/finance/setup/mutations/gl-control/${encodeURIComponent(controlId)}`,
        "PATCH",
        body,
      );
    },
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useDeactivateGlControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeactivateGlControlPayload) =>
      postJson<{ controlId: string }>(
        `/api/finance/setup/mutations/gl-control/${encodeURIComponent(payload.controlId)}`,
        "DELETE",
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSetPrimaryChartAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetPrimaryChartAssignmentPayload) =>
      postJson<{ assignmentId: string }>(
        `/api/finance/setup/mutations/chart-assignment/${encodeURIComponent(payload.assignmentId)}/set-primary`,
        "POST",
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSetPrimaryBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetPrimaryBookPayload) =>
      postJson<{ bookId: string }>(
        `/api/finance/setup/mutations/book/${encodeURIComponent(payload.bookId)}/set-primary`,
        "POST",
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useToggleHouseBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ToggleHouseBankPayload) =>
      postJson<{ configId: string; status: string }>(
        `/api/finance/setup/mutations/house-bank/${encodeURIComponent(payload.configId)}/toggle`,
        "POST",
        { activate: payload.activate },
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}
