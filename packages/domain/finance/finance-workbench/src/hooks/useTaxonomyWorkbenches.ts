"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export const COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER = "workbench.supply_chain.commodity_category_tree_batch_size";
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
  isBuyAllowed: boolean;
  isSellAllowed: boolean;
  isInventoryAllowed: boolean;
  uomCode: string | null;
  salesRevenueRecognitionMethod: string | null;
  salesVariableConsideration: string | null;
  salesStandaloneSellingPriceMethod: string | null;
  isStockable: boolean;
  isConsumable: boolean;
  defaultValuationMethod: string | null;
  isLotTrackingAllowed: boolean;
  isLotTrackingRequired: boolean;
  isSerialTrackingAllowed: boolean;
  isSerialTrackingRequired: boolean;
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

export interface AccountingProfileRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  direction: string;
  subledgerType: string;
  domainHint: string | null;
  iconKey: string | null;
  colorToken: string | null;
  metadata: unknown;
  status: string;
  isActive: boolean | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
  configCount: number;
  activeConfigCount: number;
  eventCount: number;
  templateCount: number;
  intentRuleCount: number;
  bookRuleCount: number;
  dimensionRuleCount: number;
  commitmentConfigCount: number;
  revenueConfigCount: number;
  settlementConfigCount: number;
  activeConfigId: string | null;
  activeConfigVersion: number | null;
  activeProfileType: string | null;
  activeRecognitionTiming: string | null;
  activeTaxTreatment: string | null;
  activeMatchingType: string | null;
  activeFlowCodes: string[];
  activeDocTypes: string[];
}

export interface AccountingProfileConfigRow {
  id: string;
  tenantId: string;
  accountingProfileId: string;
  profileCode: string;
  profileName: string;
  direction: string;
  profileType: string;
  subledgerType: string;
  applicableFlowCodes: string[];
  applicableDocTypes: string[];
  recognitionTiming: string;
  deferralScheduleType: string | null;
  deferralPeriods: number | null;
  autoReverse: boolean;
  reversalPeriodOffset: number | null;
  taxTreatment: string;
  defaultTaxGroupId: string | null;
  isReverseCharge: boolean;
  matchingType: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  isActive: boolean | null;
  eventCount: number;
  templateCount: number;
  intentRuleCount: number;
}

export interface AccountingProfileRuleRow {
  id: string;
  tenantId: string;
  direction: string | null;
  intentId: string | null;
  intentCode: string | null;
  intentName: string | null;
  intentDomain: string | null;
  flowCode: string | null;
  companyCodeId: string | null;
  companyCode: string | null;
  companyName: string | null;
  docType: string | null;
  currencyCode: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  isCrossBorder: boolean | null;
  isIntercompany: boolean | null;
  commodityDomain: string | null;
  commitmentType: string | null;
  counterpartyTier: string | null;
  contractValueMin: number | null;
  contractValueMax: number | null;
  revenueType: string | null;
  resolvedProfileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  profileName: string;
  profileType: string;
  explanationTemplate: string;
  confidence: number | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  isActive: boolean | null;
}

export interface AccountingProfileEventRow {
  id: string;
  tenantId: string;
  profileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  eventCode: string;
  eventName: string;
  createsJe: boolean;
  reversesEvent: string | null;
  isAutoReverse: boolean;
  autoReverseOffset: number | null;
  commitmentAction: string;
  commitmentAmountSource: string | null;
  firesPairedProfile: boolean;
  eventSeq: number;
  status: string;
  isActive: boolean | null;
  templateCount: number;
}

export interface AccountingProfileTemplateRow {
  id: string;
  tenantId: string;
  profileEventId: string;
  profileConfigId: string;
  accountingProfileId: string;
  profileCode: string;
  eventCode: string;
  lineSeq: number;
  description: string;
  postingSide: string;
  accountSource: string;
  accountCode: string | null;
  accountLookupKey: string | null;
  accountFallback: string | null;
  amountSource: string;
  amountFormula: string | null;
  amountPercentage: number | null;
  isBalancingLine: boolean;
  appliesToDocTypes: string[];
  sortOrder: number;
  status: string;
  isActive: boolean | null;
}

export interface AccountingProfileSummary {
  total: number;
  activeProfiles: number;
  activeConfigs: number;
  intentRules: number;
  activeIntentRules: number;
  events: number;
  entryTemplates: number;
  optionalConfigs: number;
  profilesWithoutConfig: number;
  profilesWithoutRules: number;
  profilesWithoutTemplates: number;
}

export interface AccountingProfilePayload {
  items: AccountingProfileRow[];
  configs: AccountingProfileConfigRow[];
  rules: AccountingProfileRuleRow[];
  events: AccountingProfileEventRow[];
  templates: AccountingProfileTemplateRow[];
  summary: AccountingProfileSummary;
  hasIdentityTable: boolean;
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
        snapshot.values?.[COMMODITY_CATEGORY_TREE_BATCH_SIZE_PARAMETER],
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

export function useAccountingProfiles() {
  return useQuery<AccountingProfilePayload>({
    queryKey: ["finance", "taxonomy", "accounting-profiles"],
    queryFn: () => fetchJson<AccountingProfilePayload>("/api/finance/accounting-profiles"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
