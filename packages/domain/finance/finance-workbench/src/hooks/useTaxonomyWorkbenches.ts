"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export const SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER = "workbench.supply_chain.spend_category_tree_batch_size";
export const DEFAULT_SPEND_CATEGORY_TREE_BATCH_SIZE = 500;
const MIN_SPEND_CATEGORY_TREE_BATCH_SIZE = 50;
const MAX_SPEND_CATEGORY_TREE_BATCH_SIZE = 1000;

export interface SpendCategoryRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  rootCategoryId: string | null;
  rootCode: string | null;
  rootName: string | null;
  procurementType: string;
  visibility: string;
  isClassificationRequired: boolean;
  isHsRequired: boolean;
  isRegulated: boolean;
  defaultIntentCode: string | null;
  defaultIntentName: string | null;
  defaultIntentDomain: string | null;
  childCount: number;
  companyPolicyCount: number;
  companyDenyCount: number;
  supplierPolicyCount: number;
  supplierBlockCount: number;
  glDefaultCount: number;
  status: string;
  sortOrder: number;
}

export interface SpendCategorySummary {
  total: number;
  roots: number;
  leaves: number;
  goods: number;
  services: number;
  regulated: number;
  linkedIntent: number;
  policyCategories: number;
  companyPolicies: number;
  supplierPolicies: number;
  deniedPolicies: number;
}

export interface TaxonomyPageInfo {
  scope: "all" | "summary" | "roots" | "children" | "detail" | "search";
  limit: number | null;
  returned: number;
  hasMore: boolean;
}

export interface SpendCategoryPayload {
  items: SpendCategoryRow[];
  summary: SpendCategorySummary;
  asAt: string;
  isLive: boolean;
  pageInfo?: TaxonomyPageInfo;
}

interface ParameterSnapshotPayload {
  values?: Record<string, unknown>;
}

export interface BusinessIntentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  domain: string;
  subtype: string | null;
  parentId: string | null;
  path: string | null;
  depth: number;
  defaultGlAccountCode: string | null;
  defaultGlAccountName: string | null;
  defaultTaxCode: string | null;
  defaultAssetProfileCode: string | null;
  isApprovalRequired: boolean;
  maxAutoApproveAmount: number | null;
  maxAutoApproveCurrency: string | null;
  visibility: string;
  childCount: number;
  companyPolicyCount: number;
  companyDenyCount: number;
  companyDefaultCount: number;
  supplierPolicyCount: number;
  supplierDenyCount: number;
  status: string;
  sortOrder: number;
}

export interface BusinessIntentSummary {
  total: number;
  roots: number;
  leaves: number;
  domains: number;
  approvalRequired: number;
  glDefaults: number;
  restricted: number;
  companyPolicies: number;
  supplierPolicies: number;
  deniedPolicies: number;
}

export interface BusinessIntentPayload {
  items: BusinessIntentRow[];
  summary: BusinessIntentSummary;
  asAt: string;
  isLive: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json() as Promise<T>;
}

type SpendSummaryMode = "include" | "only" | "false";

interface SpendCategoryQueryParams {
  id?: string | null;
  parentId?: string | null;
  q?: string | null;
  limit?: number;
  summary?: SpendSummaryMode;
  includeAncestors?: boolean;
}

const ROOT_PARENT_ID = "__root";
const SPEND_CATEGORY_BASE_URL = "/api/finance/spend-categories";

function spendCategoryUrl(params: SpendCategoryQueryParams = {}): string {
  const qs = new URLSearchParams();
  if (params.id) qs.set("id", params.id);
  if (params.parentId !== undefined) qs.set("parentId", params.parentId ?? ROOT_PARENT_ID);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.summary) qs.set("summary", params.summary);
  if (params.includeAncestors) qs.set("includeAncestors", "true");
  const query = qs.toString();
  return query ? `${SPEND_CATEGORY_BASE_URL}?${query}` : SPEND_CATEGORY_BASE_URL;
}

function spendCategoryQueryKey(params: SpendCategoryQueryParams = {}) {
  return [
    "finance",
    "taxonomy",
    "spend-categories",
    params.id ?? "",
    params.parentId ?? "",
    params.q?.trim() ?? "",
    params.limit ?? "",
    params.summary ?? "include",
    params.includeAncestors ? "ancestors" : "",
  ] as const;
}

function fetchSpendCategories(params: SpendCategoryQueryParams = {}) {
  return fetchJson<SpendCategoryPayload>(spendCategoryUrl(params));
}

function normalizeTreeBatchSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SPEND_CATEGORY_TREE_BATCH_SIZE;
  return Math.min(
    MAX_SPEND_CATEGORY_TREE_BATCH_SIZE,
    Math.max(MIN_SPEND_CATEGORY_TREE_BATCH_SIZE, Math.trunc(parsed)),
  );
}

function mergeSpendRows(current: Map<string, SpendCategoryRow>, rows: SpendCategoryRow[]) {
  const next = new Map(current);
  for (const row of rows) next.set(row.id, row);
  return next;
}

export function useSpendCategoryTreeBatchSize({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<number>({
    queryKey: ["iam", "parameters", "effective", "workbench.supply_chain", SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER],
    queryFn: async () => {
      const snapshot = await fetchJson<ParameterSnapshotPayload>("/api/iam/parameters/effective?namespace=workbench.supply_chain");
      return normalizeTreeBatchSize(snapshot.values?.[SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER]);
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_SPEND_CATEGORY_TREE_BATCH_SIZE,
  });
}

export function useSpendCategories({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<SpendCategoryPayload>({
    queryKey: ["finance", "taxonomy", "spend-categories"],
    queryFn: () => fetchSpendCategories(),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendCategorySummary({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<SpendCategoryPayload>({
    queryKey: spendCategoryQueryKey({ summary: "only" }),
    queryFn: () => fetchSpendCategories({ summary: "only" }),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendCategoryChildren(parentId: string | null, { enabled = true, limit = 500 }: { enabled?: boolean; limit?: number } = {}) {
  return useQuery<SpendCategoryPayload>({
    queryKey: spendCategoryQueryKey({ parentId, summary: "false", limit }),
    queryFn: () => fetchSpendCategories({ parentId, summary: "false", limit }),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendCategoryDetail(id?: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<SpendCategoryPayload>({
    queryKey: spendCategoryQueryKey({ id, summary: "false", limit: 1 }),
    queryFn: () => fetchSpendCategories({ id, summary: "false", limit: 1 }),
    enabled: enabled && !!id,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendCategorySearch(q: string, { enabled = true, limit = 75 }: { enabled?: boolean; limit?: number } = {}) {
  const normalized = q.trim();
  return useQuery<SpendCategoryPayload>({
    queryKey: spendCategoryQueryKey({ q: normalized, summary: "false", includeAncestors: true, limit }),
    queryFn: () => fetchSpendCategories({ q: normalized, summary: "false", includeAncestors: true, limit }),
    enabled: enabled && normalized.length >= 2,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useLazySpendCategoryHierarchy({
  enabled = true,
  search = "",
  limit = 500,
}: {
  enabled?: boolean;
  search?: string;
  limit?: number;
}) {
  const queryClient = useQueryClient();
  const [itemsById, setItemsById] = useState<Map<string, SpendCategoryRow>>(() => new Map());
  const [loadedParentIds, setLoadedParentIds] = useState<Set<string>>(() => new Set());
  const [loadingParentIds, setLoadingParentIds] = useState<Set<string>>(() => new Set());
  const normalizedSearch = search.trim();
  const isSearching = normalizedSearch.length >= 2;
  const rootsQuery = useSpendCategoryChildren(null, { enabled: enabled && !isSearching, limit });
  const searchQuery = useSpendCategorySearch(normalizedSearch, { enabled, limit });

  useEffect(() => {
    setItemsById(new Map());
    setLoadedParentIds(new Set());
    setLoadingParentIds(new Set());
  }, [limit]);

  useEffect(() => {
    if (!rootsQuery.data?.items) return;
    setItemsById((current) => mergeSpendRows(current, rootsQuery.data.items));
    setLoadedParentIds((current) => new Set(current).add(ROOT_PARENT_ID));
  }, [rootsQuery.data?.items]);

  const loadChildren = useCallback(async (parentId: string) => {
    if (!enabled || loadedParentIds.has(parentId) || loadingParentIds.has(parentId)) return;

    setLoadingParentIds((current) => new Set(current).add(parentId));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: spendCategoryQueryKey({ parentId, summary: "false", limit }),
        queryFn: () => fetchSpendCategories({ parentId, summary: "false", limit }),
        staleTime: 5 * 60 * 1000,
      });
      setItemsById((current) => mergeSpendRows(current, data.items));
      setLoadedParentIds((current) => new Set(current).add(parentId));
    } finally {
      setLoadingParentIds((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
  }, [enabled, limit, loadedParentIds, loadingParentIds, queryClient]);

  const items = useMemo(
    () => isSearching ? searchQuery.data?.items ?? [] : Array.from(itemsById.values()),
    [isSearching, itemsById, searchQuery.data?.items],
  );
  const loadingIds = useMemo(() => Array.from(loadingParentIds), [loadingParentIds]);

  return {
    items,
    isLoading: isSearching ? searchQuery.isLoading : rootsQuery.isLoading,
    isError: isSearching ? searchQuery.isError : rootsQuery.isError,
    isSearching,
    loadingIds,
    loadChildren,
  };
}

export function useBusinessIntents() {
  return useQuery<BusinessIntentPayload>({
    queryKey: ["finance", "taxonomy", "business-intents"],
    queryFn: () => fetchJson<BusinessIntentPayload>("/api/finance/business-intents"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
