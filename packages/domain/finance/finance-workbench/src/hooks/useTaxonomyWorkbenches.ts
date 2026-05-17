"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export const COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER = "workbench.supply_chain.commodity_category_tree_batch_size";
export const LEGACY_SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER = "workbench.supply_chain.spend_category_tree_batch_size";
export const DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE = 500;
const MIN_COMMODITY_CATEGORY_TREE_BATCH_SIZE = 50;
const MAX_COMMODITY_CATEGORY_TREE_BATCH_SIZE = 1000;

export interface CommodityCategoryRow {
  id: string;
  tenantId: string;
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
  allowedDomains: unknown;
  defaultIntentId: string | null;
  defaultIntentCode: string | null;
  defaultIntentName: string | null;
  defaultIntentDomain: string | null;
  childCount: number;
  companyPolicyCount: number;
  companyDenyCount: number;
  supplierPolicyCount: number;
  supplierBlockCount: number;
  glDefaultCount: number;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  sortOrder: number;
}

export interface CommodityCategoryRuleRow {
  id: string;
  tenantId: string;
  classificationSource: string;
  classificationId: string;
  direction: string | null;
  conditionType: string;
  conditionConfig: unknown;
  appliesToFlows: string[];
  resolvedIntentId: string;
  resolvedIntentCode: string | null;
  resolvedIntentName: string | null;
  resolvedDomain: string | null;
  explanationTemplate: string;
  confidence: number | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CommodityCategorySummary {
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

export interface CommodityCategoryPayload {
  items: CommodityCategoryRow[];
  rules?: CommodityCategoryRuleRow[];
  summary: CommodityCategorySummary;
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
  policyDefaults: number;
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

type CommoditySummaryMode = "include" | "only" | "false";

interface CommodityCategoryQueryParams {
  id?: string | null;
  parentId?: string | null;
  q?: string | null;
  limit?: number;
  summary?: CommoditySummaryMode;
  includeAncestors?: boolean;
  includeRules?: boolean;
}

const ROOT_PARENT_ID = "__root";
const COMMODITY_CATEGORY_BASE_URL = "/api/finance/commodity-categories";

function commodityCategoryUrl(params: CommodityCategoryQueryParams = {}): string {
  const qs = new URLSearchParams();
  if (params.id) qs.set("id", params.id);
  if (params.parentId !== undefined) qs.set("parentId", params.parentId ?? ROOT_PARENT_ID);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.summary) qs.set("summary", params.summary);
  if (params.includeAncestors) qs.set("includeAncestors", "true");
  if (params.includeRules) qs.set("includeRules", "true");
  const query = qs.toString();
  return query ? `${COMMODITY_CATEGORY_BASE_URL}?${query}` : COMMODITY_CATEGORY_BASE_URL;
}

function commodityCategoryQueryKey(params: CommodityCategoryQueryParams = {}) {
  return [
    "finance",
    "taxonomy",
    "commodity-categories",
    params.id ?? "",
    params.parentId ?? "",
    params.q?.trim() ?? "",
    params.limit ?? "",
    params.summary ?? "include",
    params.includeAncestors ? "ancestors" : "",
    params.includeRules ? "rules" : "",
  ] as const;
}

function fetchCommodityCategories(params: CommodityCategoryQueryParams = {}) {
  return fetchJson<CommodityCategoryPayload>(commodityCategoryUrl(params));
}

function normalizeTreeBatchSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE;
  return Math.min(
    MAX_COMMODITY_CATEGORY_TREE_BATCH_SIZE,
    Math.max(MIN_COMMODITY_CATEGORY_TREE_BATCH_SIZE, Math.trunc(parsed)),
  );
}

function mergeCommodityRows(current: Map<string, CommodityCategoryRow>, rows: CommodityCategoryRow[]) {
  const next = new Map(current);
  for (const row of rows) next.set(row.id, row);
  return next;
}

export function useCommodityCategoryTreeBatchSize({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<number>({
    queryKey: ["iam", "parameters", "effective", "workbench.supply_chain", COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER],
    queryFn: async () => {
      const snapshot = await fetchJson<ParameterSnapshotPayload>("/api/iam/parameters/effective?namespace=workbench.supply_chain");
      return normalizeTreeBatchSize(
        snapshot.values?.[COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER]
          ?? snapshot.values?.[LEGACY_SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER],
      );
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE,
  });
}

export function useCommodityCategories({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<CommodityCategoryPayload>({
    queryKey: ["finance", "taxonomy", "commodity-categories"],
    queryFn: () => fetchCommodityCategories(),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommodityCategorySummary({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<CommodityCategoryPayload>({
    queryKey: commodityCategoryQueryKey({ summary: "only" }),
    queryFn: () => fetchCommodityCategories({ summary: "only" }),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommodityCategoryChildren(parentId: string | null, { enabled = true, limit = 500 }: { enabled?: boolean; limit?: number } = {}) {
  return useQuery<CommodityCategoryPayload>({
    queryKey: commodityCategoryQueryKey({ parentId, summary: "false", limit }),
    queryFn: () => fetchCommodityCategories({ parentId, summary: "false", limit }),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommodityCategoryDetail(id?: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<CommodityCategoryPayload>({
    queryKey: commodityCategoryQueryKey({ id, summary: "false", limit: 1, includeRules: true }),
    queryFn: () => fetchCommodityCategories({ id, summary: "false", limit: 1, includeRules: true }),
    enabled: enabled && !!id,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommodityCategorySearch(q: string, { enabled = true, limit = 75 }: { enabled?: boolean; limit?: number } = {}) {
  const normalized = q.trim();
  return useQuery<CommodityCategoryPayload>({
    queryKey: commodityCategoryQueryKey({ q: normalized, summary: "false", includeAncestors: true, limit }),
    queryFn: () => fetchCommodityCategories({ q: normalized, summary: "false", includeAncestors: true, limit }),
    enabled: enabled && normalized.length >= 2,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useLazyCommodityCategoryHierarchy({
  enabled = true,
  search = "",
  limit = 500,
}: {
  enabled?: boolean;
  search?: string;
  limit?: number;
}) {
  const queryClient = useQueryClient();
  const [itemsById, setItemsById] = useState<Map<string, CommodityCategoryRow>>(() => new Map());
  const [loadedParentIds, setLoadedParentIds] = useState<Set<string>>(() => new Set());
  const [loadingParentIds, setLoadingParentIds] = useState<Set<string>>(() => new Set());
  const normalizedSearch = search.trim();
  const isSearching = normalizedSearch.length >= 2;
  const rootsQuery = useCommodityCategoryChildren(null, { enabled: enabled && !isSearching, limit });
  const searchQuery = useCommodityCategorySearch(normalizedSearch, { enabled, limit });

  useEffect(() => {
    setItemsById(new Map());
    setLoadedParentIds(new Set());
    setLoadingParentIds(new Set());
  }, [limit]);

  useEffect(() => {
    if (!rootsQuery.data?.items) return;
    setItemsById((current) => mergeCommodityRows(current, rootsQuery.data.items));
    setLoadedParentIds((current) => new Set(current).add(ROOT_PARENT_ID));
  }, [rootsQuery.data?.items]);

  const loadChildren = useCallback(async (parentId: string) => {
    if (!enabled || loadedParentIds.has(parentId) || loadingParentIds.has(parentId)) return;

    setLoadingParentIds((current) => new Set(current).add(parentId));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: commodityCategoryQueryKey({ parentId, summary: "false", limit }),
        queryFn: () => fetchCommodityCategories({ parentId, summary: "false", limit }),
        staleTime: 5 * 60 * 1000,
      });
      setItemsById((current) => mergeCommodityRows(current, data.items));
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

/** @deprecated Use COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER. */
export const SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER = LEGACY_SPEND_CATEGORY_TREE_BATCH_SIZE_PARAMETER;
/** @deprecated Use DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE. */
export const DEFAULT_SPEND_CATEGORY_TREE_BATCH_SIZE = DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE;

/** @deprecated Use CommodityCategoryRow. */
export type SpendCategoryRow = CommodityCategoryRow;
/** @deprecated Use CommodityCategoryRuleRow. */
export type SpendCategoryRuleRow = CommodityCategoryRuleRow;
/** @deprecated Use CommodityCategorySummary. */
export type SpendCategorySummary = CommodityCategorySummary;
/** @deprecated Use CommodityCategoryPayload. */
export type SpendCategoryPayload = CommodityCategoryPayload;

/** @deprecated Use useCommodityCategoryTreeBatchSize. */
export const useSpendCategoryTreeBatchSize = useCommodityCategoryTreeBatchSize;
/** @deprecated Use useCommodityCategories. */
export const useSpendCategories = useCommodityCategories;
/** @deprecated Use useCommodityCategorySummary. */
export const useSpendCategorySummary = useCommodityCategorySummary;
/** @deprecated Use useCommodityCategoryChildren. */
export const useSpendCategoryChildren = useCommodityCategoryChildren;
/** @deprecated Use useCommodityCategoryDetail. */
export const useSpendCategoryDetail = useCommodityCategoryDetail;
/** @deprecated Use useCommodityCategorySearch. */
export const useSpendCategorySearch = useCommodityCategorySearch;
/** @deprecated Use useLazyCommodityCategoryHierarchy. */
export const useLazySpendCategoryHierarchy = useLazyCommodityCategoryHierarchy;
