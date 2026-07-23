"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Payloads ──────────────────────────────────────────────────────────────

export interface AssignGlControlPayload {
  companyCode:           string;
  glAccountCode:         string;
  glAccountId?:          string;
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
  defaultCostCenterId?:  string | null;
  defaultSiteId?:        string | null;
}

export interface UpdateGlControlPayload {
  controlId:             string;
  companyCode:           string;  // used for invalidation
  expectedUpdatedAt:     string | null;
  postingAllowed?:       boolean;
  blockedForManual?:     boolean;
  blockedForAuto?:       boolean;
  requiresCostCenter?:   boolean;
  requiresProfitCenter?: boolean;
  requiresProject?:      boolean;
  reconciliationType?:   string | null;
  taxCategory?:          string | null;
  defaultCostCenterId?:  string | null;
  defaultSiteId?:        string | null;
}

export interface DeactivateGlControlPayload {
  controlId:   string;
  companyCode: string;
  expectedUpdatedAt: string | null;
}

export interface SetPrimaryChartAssignmentPayload {
  assignmentId: string;
  companyCode:  string;
  expectedUpdatedAt: string | null;
}

export interface SaveChartAssignmentPayload {
  assignmentId?: string;
  companyCode: string;
  chartId: string;
  assignmentType: "operating" | "local" | "group" | "reporting";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isPrimary: boolean;
  status: "active" | "inactive";
  expectedUpdatedAt?: string | null;
}

export interface DeactivateChartAssignmentPayload {
  assignmentId: string;
  companyCode: string;
  expectedUpdatedAt: string | null;
}

export interface BulkGlControlsPayload {
  companyCode: string;
  glAccountIds: string[];
  postingAllowed?: boolean;
  blockedForManual?: boolean;
  blockedForAuto?: boolean;
  requiresCostCenter?: boolean;
  requiresProfitCenter?: boolean;
  requiresProject?: boolean;
}

export interface SetCompanyDefaultBookPayload {
  bookId: string;
  companyCode: string;
  expectedUpdatedAt: string | null;
}

export interface SaveBookAssignmentPayload {
  assignmentId?: string;
  companyCode: string;
  bookId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  overrideCurrencyCode: string | null;
  alternateCoaPrefix: string | null;
  priority: number;
  conflictStrategy: "highest_priority" | "most_specific" | "error_on_conflict";
  status: "active" | "inactive";
  setAsDefault?: boolean;
  expectedUpdatedAt?: string | null;
}

export interface DeactivateBookAssignmentPayload {
  assignmentId: string;
  companyCode: string;
  expectedUpdatedAt: string | null;
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
  qc.invalidateQueries({ queryKey: ["finance", "setup", "foundation", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "conflicts", "company", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "gl-controls", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "chart-assignments", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "book-assignments", companyCode] });
  qc.invalidateQueries({ queryKey: ["finance", "setup", "configure", "book-options", companyCode] });
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
    mutationFn: (payload: AssignGlControlPayload) => {
      const { companyCode, ...body } = payload;
      return postJson<{ controlId: string; glAccountId: string; companyCodeId: string }>(
        `/api/finance/setup/company/${encodeURIComponent(companyCode)}/gl-controls`,
        "POST",
        body,
      );
    },
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useUpdateGlControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateGlControlPayload) => {
      const { controlId, companyCode, ...body } = payload;
      return postJson<{ controlId: string }>(
        `/api/finance/setup/company/${encodeURIComponent(companyCode)}/gl-controls/${encodeURIComponent(controlId)}`,
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
        `/api/finance/setup/company/${encodeURIComponent(payload.companyCode)}/gl-controls/${encodeURIComponent(payload.controlId)}`,
        "DELETE",
        { expectedUpdatedAt: payload.expectedUpdatedAt },
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSetPrimaryChartAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetPrimaryChartAssignmentPayload) =>
      postJson<{ assignmentId: string }>(
        `/api/finance/setup/company/${encodeURIComponent(payload.companyCode)}/chart-assignments/${encodeURIComponent(payload.assignmentId)}/set-primary`,
        "POST",
        { expectedUpdatedAt: payload.expectedUpdatedAt },
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSaveChartAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveChartAssignmentPayload) => {
      const { assignmentId, companyCode, ...body } = payload;
      const path = assignmentId
        ? `/api/finance/setup/company/${encodeURIComponent(companyCode)}/chart-assignments/${encodeURIComponent(assignmentId)}`
        : `/api/finance/setup/company/${encodeURIComponent(companyCode)}/chart-assignments`;
      return postJson<{ assignmentId: string }>(path, assignmentId ? "PUT" : "POST", body);
    },
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useDeactivateChartAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeactivateChartAssignmentPayload) => postJson<{ assignmentId: string }>(
      `/api/finance/setup/company/${encodeURIComponent(payload.companyCode)}/chart-assignments/${encodeURIComponent(payload.assignmentId)}`,
      "DELETE",
      { expectedUpdatedAt: payload.expectedUpdatedAt },
    ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useBulkGlControls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkGlControlsPayload) => {
      const { companyCode, ...body } = payload;
      return postJson<{ updatedCount: number }>(
        `/api/finance/setup/company/${encodeURIComponent(companyCode)}/gl-controls/bulk`,
        "POST",
        body,
      );
    },
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSetCompanyDefaultBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetCompanyDefaultBookPayload) =>
      postJson<{ bookId: string }>(
        `/api/finance/setup/company/${encodeURIComponent(payload.companyCode)}/book-assignments/${encodeURIComponent(payload.bookId)}/set-default`,
        "POST",
        { expectedUpdatedAt: payload.expectedUpdatedAt },
      ),
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useSaveBookAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveBookAssignmentPayload) => {
      const { assignmentId, companyCode, ...body } = payload;
      const path = assignmentId
        ? `/api/finance/setup/company/${encodeURIComponent(companyCode)}/book-assignments/${encodeURIComponent(assignmentId)}`
        : `/api/finance/setup/company/${encodeURIComponent(companyCode)}/book-assignments`;
      return postJson<{ assignmentId: string }>(path, assignmentId ? "PUT" : "POST", body);
    },
    onSuccess: (_data, vars) => invalidateFinanceSetup(qc, vars.companyCode),
  });
}

export function useDeactivateBookAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeactivateBookAssignmentPayload) => postJson<{ assignmentId: string }>(
      `/api/finance/setup/company/${encodeURIComponent(payload.companyCode)}/book-assignments/${encodeURIComponent(payload.assignmentId)}`,
      "DELETE",
      { expectedUpdatedAt: payload.expectedUpdatedAt },
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
