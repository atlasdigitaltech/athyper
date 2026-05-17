"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  ArrowDown,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  ExternalLink,
  History,
  Layers3,
  Link2,
  LockKeyhole,
  Globe2,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  EntityPicker,
  SupplierPicker,
  type EntityPickerOption,
  type EntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import {
  AsyncCombobox,
  MoneyInput,
  WorkbenchHierarchyTree,
  WorkbenchMatrix,
  type ComboboxOption,
  type WorkbenchHierarchyMeta,
  type WorkbenchMatrixAxisItem,
  type WorkbenchMatrixCellItem,
  type WorkbenchMatrixLegendItem,
} from "@athyper/ui/composites";
import { Badge, Button } from "@athyper/ui/primitives";
import { ReportMetricCard, ReportMetricGrid } from "../components/ReportScaffold";
import { StampToggle } from "../components/StampToggle";
import { TaxonomyWorkbenchHeader } from "../components/TaxonomyWorkbenchHeader";
import {
  getTaxonomyWorkbenchDefinition,
  type TaxonomyRelatedApp,
  type TaxonomyWorkbenchMode,
} from "../components/taxonomyWorkbenchManifest";
import {
  useLazyCommodityCategoryHierarchy,
  useCommodityCategories,
  useCommodityCategoryDetail,
  useCommodityCategorySummary,
  useCommodityCategoryTreeBatchSize,
  DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE,
  type CommodityCategoryRow,
  type CommodityCategoryRuleRow,
  type CommodityCategorySummary,
} from "../hooks/useTaxonomyWorkbenches";
import { useScopeOptions, type CompanyOption } from "../hooks/useScopeOptions";

interface SimulatorInputs {
  companyCodeId: string | null;
  companyCode: string;
  companyName: string;
  supplierId: string | null;
  supplierName: string;
  amount: number | null;
  currency: string;
  documentType: string;
  recurring: boolean;
  crossBorder: boolean;
}

interface PublicSessionSnapshot {
  authenticated?: boolean;
  activeOrg?: string | null;
}

interface SimulationStep {
  key: string;
  label: string;
  status: "resolved" | "applied" | "review" | "skipped" | "no-rule";
  value: string;
  detail: string;
}

interface PinnedScenario {
  id: string;
  title: string;
  result: string;
  detail: string;
}

interface CommodityClassificationRow {
  id: string;
  classificationType: string | null;
  domainCode: string | null;
  codeId: string | null;
  systemCode: string | null;
  systemName: string | null;
  systemLabel: string | null;
  mappingType: string | null;
  confidence: number | null;
  provenance: string | null;
  isPrimary: boolean;
  description: string | null;
  status: string;
}

interface CommodityRoutingRuleRow {
  id: string;
  commodityDomainCode: string | null;
  matchMode: string | null;
  codeFrom: string | null;
  codeTo: string | null;
  codeLevel: number | null;
  priority: number | null;
  confidence: number | null;
  status: string;
}

interface CurrencyRow {
  code: string;
  name: string;
  symbol?: string | null;
}

type EditorVerb = "configure" | "govern" | "route" | "link" | "audit";
type SpendEditorScope = "tenant" | "company" | "supplier";
type SpendMatrixSourceKey = "company" | "supplier" | "classification" | "intent";

interface EditorVerbDefinition {
  key: EditorVerb;
  label: string;
  icon: LucideIcon;
}

interface SpendEditorScopeDefinition {
  key: SpendEditorScope;
  singleCompanyLabel: string;
  multiCompanyLabel: string;
  singleCompanyDetail: string;
  multiCompanyDetail: string;
  icon: LucideIcon;
}

interface SpendMatrixCompany extends WorkbenchMatrixAxisItem {
  country: string;
}

interface SpendMatrixToken {
  label: string;
  tone: "default" | "muted" | "info" | "success" | "warning" | "destructive" | "primary";
  title: string;
}

interface SpendMatrixCellSource {
  key: SpendMatrixSourceKey;
  label: string;
  entityCode: string;
  coverage: (row: CommodityCategoryRow) => number;
  token: (row: CommodityCategoryRow, ordinal: number) => SpendMatrixToken;
  legend: WorkbenchMatrixLegendItem[];
}

const EMPTY_SUMMARY: CommodityCategorySummary = {
  total: 0,
  roots: 0,
  leaves: 0,
  goods: 0,
  services: 0,
  regulated: 0,
  linkedIntent: 0,
  policyCategories: 0,
  companyPolicies: 0,
  supplierPolicies: 0,
  deniedPolicies: 0,
};

const DEFAULT_SIMULATOR_INPUTS: SimulatorInputs = {
  companyCodeId: null,
  companyCode: "",
  companyName: "",
  supplierId: null,
  supplierName: "",
  amount: 12_000,
  currency: "USD",
  documentType: "Vendor invoice",
  recurring: true,
  crossBorder: false,
};

const WORKBENCH_SPEND_CATEGORY_PICKER_CONFIG: EntityPickerOptionConfig = {
  variant: "standard",
  labelField: "name",
  codeField: "code",
  descriptionField: "description",
  recordIdField: "code",
  optionActionLabel: "Open category",
};

const WORKBENCH_COMPANY_CODE_PICKER_CONFIG: EntityPickerOptionConfig = {
  variant: "standard",
  labelField: "name",
  codeField: "code",
  descriptionField: "functional_currency",
  recordIdField: "code",
  optionActionLabel: "Open company code",
};

const WORKBENCH_COMPANY_CODE_SEARCH_PARAMS = {
  "filter.status": "active",
};

const WORKBENCH_SUPPLIER_FIELD = {
  label: "supplier",
  reference_config: {
    target_entity: "supplier",
    target_field: "id",
    display_field: "name",
    label_field: "name",
    code_field: "supplier_code",
    description_field: "legal_name",
    show_code: true,
    picker: {
      variant: "advanced",
      density: "mini",
      width: 420,
      max_list_height: 320,
      page_size: 20,
      default_search_mode: "server",
      option_action_label: "Open supplier",
      result_label: "supplier",
      show_recently_used: true,
      recent_limit: 5,
      default_control: "active",
      controls: [
        { id: "all", label: "All", value: "all" },
        { id: "active", label: "Active", value: "active", field: "status", match_value: "active" },
        { id: "on_hold", label: "On Hold", value: "on_hold", field: "status", match_value: "on_hold" },
        { id: "suspended", label: "Suspended", value: "suspended", field: "status", match_value: "suspended" },
        { id: "onboarding", label: "Onboarding", value: "onboarding", field: "status", match_value: "onboarding" },
      ],
      sections: [
        { id: "matches", label: "All matches" },
      ],
      badges: [
        {
          field: "status",
          label_map: {
            active: "Active",
            onboarding: "Onboarding",
            on_hold: "On Hold",
            suspended: "Suspended",
            inactive: "Inactive",
            archived: "Archived",
          },
          tone_map: {
            active: "success",
            onboarding: "info",
            on_hold: "warning",
            suspended: "destructive",
            inactive: "muted",
            archived: "muted",
          },
        },
      ],
    },
  },
  lookup_config: {
    depends_on: {
      source_field: "company_code_id",
      target_field: "id",
      through_entity: "company_code_supplier_profile",
      through_source_field: "company_code_id",
      through_target_field: "supplier_id",
      through_filters: { status: "active" },
      empty_behavior: "empty",
    },
  },
};

const EDITOR_VERBS: EditorVerbDefinition[] = [
  { key: "configure", label: "Configure", icon: Settings2 },
  { key: "govern", label: "Govern", icon: ShieldCheck },
  { key: "route", label: "Route", icon: Route },
  { key: "link", label: "Link", icon: Link2 },
  { key: "audit", label: "Audit", icon: History },
];

const SPEND_EDITOR_SCOPES: SpendEditorScopeDefinition[] = [
  {
    key: "tenant",
    singleCompanyLabel: "Company default",
    multiCompanyLabel: "All companies",
    singleCompanyDetail: "Base setup for this company.",
    multiCompanyDetail: "Tenant-wide default used unless a company or supplier exception exists.",
    icon: Layers3,
  },
  {
    key: "company",
    singleCompanyLabel: "Company exception",
    multiCompanyLabel: "Specific company",
    singleCompanyDetail: "Hidden for single-company tenants unless an exception is needed.",
    multiCompanyDetail: "Override the default for one company code.",
    icon: SlidersHorizontal,
  },
  {
    key: "supplier",
    singleCompanyLabel: "Supplier exception",
    multiCompanyLabel: "Supplier within company",
    singleCompanyDetail: "Vendor-specific routing for this company.",
    multiCompanyDetail: "Most specific routing for a supplier in a selected company.",
    icon: Route,
  },
];

const SPEND_MATRIX_COMPANIES: SpendMatrixCompany[] = [
  { key: "athq-MY", label: "athq-MY", country: "Malaysia" },
  { key: "athq-SG", label: "athq-SG", country: "Singapore" },
  { key: "athq-US", label: "athq-US", country: "United States" },
  { key: "athq-UK", label: "athq-UK", country: "United Kingdom" },
  { key: "athq-IN", label: "athq-IN", country: "India" },
];

const SPEND_MATRIX_CELL_SOURCES: SpendMatrixCellSource[] = [
  {
    key: "company",
    label: "Company policies",
    entityCode: "commodity_category_buy_policy",
    coverage: (row) => row.companyPolicyCount + row.companyDenyCount + row.glDefaultCount,
    token: (row, ordinal) => {
      if (ordinal < row.companyDenyCount) {
        return { label: "DENY", tone: "destructive", title: "Company deny policy" };
      }
      if (ordinal < row.companyDenyCount + row.glDefaultCount) {
        return { label: "GL", tone: "info", title: "GL default override" };
      }
      if (row.isRegulated && ordinal === row.companyPolicyCount + row.companyDenyCount + row.glDefaultCount - 1) {
        return { label: "ALLOW", tone: "success", title: "Allow-only governed policy" };
      }
      return { label: "$", tone: "primary", title: "Company threshold policy" };
    },
    legend: [
      { key: "gl", marker: "GL", label: "GL override", tone: "info" },
      { key: "threshold", marker: "$", label: "Threshold", tone: "primary" },
      { key: "allow", marker: "OK", label: "ALLOW only", tone: "success" },
      { key: "deny", marker: "X", label: "DENY", tone: "destructive" },
      { key: "base", marker: "base", label: "Inherits base", tone: "muted" },
    ],
  },
  {
    key: "supplier",
    label: "Supplier overrides",
    entityCode: "commodity_category_buy_policy",
    coverage: (row) => row.supplierPolicyCount + row.supplierBlockCount,
    token: (row, ordinal) => {
      if (ordinal < row.supplierBlockCount) {
        return { label: "BLOCK", tone: "destructive", title: "Supplier block override" };
      }
      return { label: "SUP", tone: "warning", title: "Supplier category override" };
    },
    legend: [
      { key: "supplier", marker: "SUP", label: "Supplier override", tone: "warning" },
      { key: "block", marker: "X", label: "Supplier block", tone: "destructive" },
      { key: "base", marker: "base", label: "Inherits company/base", tone: "muted" },
    ],
  },
  {
    key: "classification",
    label: "Classification rules",
    entityCode: "commodity_classification_to_intent_rule",
    coverage: (row) => [
      row.isClassificationRequired,
      row.isHsRequired,
      row.isRegulated,
    ].filter(Boolean).length,
    token: (row, ordinal) => {
      const tokens: SpendMatrixToken[] = [
        row.isClassificationRequired ? { label: "CLS", tone: "info", title: "Commodity classification required" } : null,
        row.isHsRequired ? { label: "HS", tone: "warning", title: "HS code required" } : null,
        row.isRegulated ? { label: "REG", tone: "destructive", title: "Regulated category" } : null,
      ].filter(Boolean) as SpendMatrixToken[];
      return tokens[ordinal % tokens.length] ?? { label: "CLS", tone: "info", title: "Classification rule" };
    },
    legend: [
      { key: "classification", marker: "CLS", label: "Classification", tone: "info" },
      { key: "hs", marker: "HS", label: "HS required", tone: "warning" },
      { key: "regulated", marker: "REG", label: "Regulated", tone: "destructive" },
      { key: "base", marker: "base", label: "No explicit rule", tone: "muted" },
    ],
  },
  {
    key: "intent",
    label: "Default intents",
    entityCode: "commodity_category",
    coverage: (row) => row.defaultIntentCode ? 1 : 0,
    token: (row) => ({
      label: row.defaultIntentCode ?? "INT",
      tone: "success",
      title: row.defaultIntentName ?? "Default intent",
    }),
    legend: [
      { key: "intent", marker: "INT", label: "Default intent", tone: "success" },
      { key: "gap", marker: "base", label: "No default intent", tone: "muted" },
    ],
  },
];

function displayPct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function reviewTone(count: number): string {
  if (count > 0) return "border-warning/30 bg-warning/10 text-warning";
  return "border-success/30 bg-success/10 text-success";
}

function countText(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function contextValue(row: CommodityCategoryRow, source: NonNullable<TaxonomyRelatedApp["context"]>["source"]): string | null {
  switch (source) {
    case "id":
      return row.id;
    case "code":
      return row.code;
    case "name":
      return row.name;
    case "defaultIntentCode":
      return row.defaultIntentCode;
    default:
      return null;
  }
}

function forceServerSearchForQueryParam(params: URLSearchParams, paramName: string): void {
  if (paramName === "q") params.set("search_mode", "server");
}

function relatedAppHref(
  app: TaxonomyRelatedApp,
  row?: CommodityCategoryRow,
  options: { returnTo?: string } = {},
): string {
  const [path = app.href, query = ""] = app.href.split("?");
  const params = new URLSearchParams(query);
  if (row && app.context) {
    const value = contextValue(row, app.context.source);
    if (value) {
      params.set(app.context.param, value);
      forceServerSearchForQueryParam(params, app.context.param);
    }
  }
  if (options.returnTo) params.set("returnTo", options.returnTo);
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function relatedAppKey(app: TaxonomyRelatedApp): string {
  return `${app.entityCode}:${app.href}:${app.label}`;
}

function modeFromParam(value: string | null): TaxonomyWorkbenchMode | null {
  return value === "overview"
    || value === "explorer"
    || value === "classification"
    || value === "simulator"
    || value === "editor"
    || value === "matrix"
    ? value
    : null;
}

function workbenchReturnHref(mode: TaxonomyWorkbenchMode, selectedId?: string | null): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (selectedId) params.set("selected", selectedId);
  return `${getTaxonomyWorkbenchDefinition("spend").href}?${params}`;
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return hash;
}

function getSpendMatrixSource(key: SpendMatrixSourceKey): SpendMatrixCellSource {
  return SPEND_MATRIX_CELL_SOURCES.find((source) => source.key === key) ?? SPEND_MATRIX_CELL_SOURCES[0]!;
}

function orderedMatrixCompanies(row: CommodityCategoryRow, companies: SpendMatrixCompany[], seed: string): SpendMatrixCompany[] {
  return [...companies].sort((left, right) => (
    hashText(`${row.id}:${seed}:${left.key}`) - hashText(`${row.id}:${seed}:${right.key}`)
  ));
}

function buildSpendMatrixCells(
  rows: CommodityCategoryRow[],
  companies: SpendMatrixCompany[],
  source: SpendMatrixCellSource,
): WorkbenchMatrixCellItem[] {
  const cells: WorkbenchMatrixCellItem[] = [];

  for (const row of rows) {
    const coverage = Math.min(companies.length, Math.max(0, source.coverage(row)));
    const selectedCompanies = orderedMatrixCompanies(row, companies, source.key).slice(0, coverage);

    selectedCompanies.forEach((company, ordinal) => {
      const token = source.token(row, ordinal);
      cells.push({
        key: `${row.id}:${company.key}:${source.key}`,
        rowKey: row.id,
        columnKey: company.key,
        label: token.label,
        tone: token.tone,
        title: token.title,
      });
    });
  }

  return cells;
}

function useWorkbenchSessionSnapshot() {
  return useQuery<PublicSessionSnapshot | null>({
    queryKey: ["auth", "session", "finance-workbench"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return null;
      return res.json() as Promise<PublicSessionSnapshot>;
    },
    retry: false,
    staleTime: 60 * 1000,
  });
}

function parseActiveOrgCompanyCode(activeOrg?: string | null): string | null {
  const raw = activeOrg?.trim();
  if (!raw) return null;
  if (raw.includes("--")) return raw.split("--").at(-1)?.trim() || null;
  if (raw.includes(":")) return raw.split(":").at(-1)?.trim() || null;
  return raw;
}

function normalizeCurrency(value?: string | null): string {
  const code = value?.trim().toUpperCase();
  return code || "USD";
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "1";
  }
  if (typeof value === "number") return value === 1;
  return false;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function entityRecordValue(record: unknown, names: string[]): unknown {
  const envelope = objectRecord(record) ?? {};
  const data = objectRecord(envelope["data"]) ?? {};
  for (const name of names) {
    if (data[name] !== undefined && data[name] !== null) return data[name];
  }
  for (const name of names) {
    if (envelope[name] !== undefined && envelope[name] !== null) return envelope[name];
  }
  return null;
}

async function fetchEntityRecordList(entityCode: string, params: URLSearchParams): Promise<unknown[]> {
  const query = params.toString();
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}${query ? `?${query}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${entityCode}`);
  const body = await res.json() as { data?: unknown[] };
  return Array.isArray(body.data) ? body.data : [];
}

function mapCommodityClassification(record: unknown): CommodityClassificationRow {
  const id = stringValue(entityRecordValue(record, ["id"])) ?? "";
  const systemCode = stringValue(entityRecordValue(record, ["system_code", "systemCode"]));
  const systemName = stringValue(entityRecordValue(record, ["system_name", "systemName"]));
  return {
    id,
    classificationType: stringValue(entityRecordValue(record, ["classification_type", "classificationType"])),
    domainCode: stringValue(entityRecordValue(record, ["domain_code", "domainCode"])),
    codeId: stringValue(entityRecordValue(record, ["code_id", "codeId"])),
    systemCode,
    systemName,
    systemLabel: stringValue(entityRecordValue(record, ["system_label", "systemLabel"])) ?? codeName(systemCode, systemName),
    mappingType: stringValue(entityRecordValue(record, ["mapping_type", "mappingType"])),
    confidence: numberValue(entityRecordValue(record, ["confidence"])),
    provenance: stringValue(entityRecordValue(record, ["provenance"])),
    isPrimary: booleanValue(entityRecordValue(record, ["is_primary", "isPrimary"])),
    description: stringValue(entityRecordValue(record, ["description"])),
    status: stringValue(entityRecordValue(record, ["status"])) ?? "active",
  };
}

function mapCommodityRoutingRule(record: unknown): CommodityRoutingRuleRow {
  return {
    id: stringValue(entityRecordValue(record, ["id"])) ?? "",
    commodityDomainCode: stringValue(entityRecordValue(record, ["commodity_domain_code", "commodityDomainCode"])),
    matchMode: stringValue(entityRecordValue(record, ["match_mode", "matchMode"])),
    codeFrom: stringValue(entityRecordValue(record, ["code_from", "codeFrom"])),
    codeTo: stringValue(entityRecordValue(record, ["code_to", "codeTo"])),
    codeLevel: numberValue(entityRecordValue(record, ["code_level", "codeLevel"])),
    priority: numberValue(entityRecordValue(record, ["priority"])),
    confidence: numberValue(entityRecordValue(record, ["confidence"])),
    status: stringValue(entityRecordValue(record, ["status"])) ?? "active",
  };
}

function useCommodityClassifications(ownerId?: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<CommodityClassificationRow[]>({
    queryKey: ["finance", "taxonomy", "commodity-classifications", ownerId ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({
        "filter.owner_type": "commodity_category",
        "filter.owner_id": ownerId ?? "",
        page_size: "25",
        sort: "domain_code:asc",
      });
      const rows = await fetchEntityRecordList("commodity_classification", params);
      return rows.map(mapCommodityClassification).filter((row) => row.id);
    },
    enabled: enabled && !!ownerId,
    retry: false,
    staleTime: 30 * 1000,
  });
}

function useCommodityRoutingRules(commodityCategoryId?: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<CommodityRoutingRuleRow[]>({
    queryKey: ["finance", "taxonomy", "commodity-routing-rules", commodityCategoryId ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({
        "filter.commodity_category_id": commodityCategoryId ?? "",
        page_size: "25",
        sort: "priority:desc",
      });
      const rows = await fetchEntityRecordList("commodity_code_to_category_rule", params);
      return rows.map(mapCommodityRoutingRule).filter((row) => row.id);
    },
    enabled: enabled && !!commodityCategoryId,
    retry: false,
    staleTime: 30 * 1000,
  });
}

function companyFromPickerOption(option: EntityPickerOption): CompanyOption | null {
  const raw = option.raw ?? {};
  const id = stringValue(raw["id"]) ?? option.value;
  const code = stringValue(raw["code"]) ?? option.code ?? "";
  const name = stringValue(raw["name"]) ?? option.label;
  if (!id || !name) return null;

  return {
    id,
    code,
    name,
    functionalCurrency: normalizeCurrency(
      stringValue(raw["functionalCurrency"])
        ?? stringValue(raw["functional_currency"])
        ?? option.description,
    ),
    legalEntityId: stringValue(raw["legalEntityId"]) ?? stringValue(raw["legal_entity_id"]) ?? "",
    fiscalYearStartMonth: numberValue(raw["fiscalYearStartMonth"]) ?? numberValue(raw["fiscal_year_start_month"]) ?? 1,
  };
}

function companyDisplayLabel(company?: CompanyOption | null): string | null {
  return company?.name ?? null;
}

function companyContextLabel(inputs: SimulatorInputs): string {
  if (inputs.companyCode && inputs.companyName) return `${inputs.companyCode} - ${inputs.companyName}`;
  if (inputs.companyName) return inputs.companyName;
  if (inputs.companyCode) return inputs.companyCode;
  return "current company";
}

function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function stepTone(status: SimulationStep["status"]): string {
  switch (status) {
    case "resolved":
      return "border-success/30 bg-success/10";
    case "applied":
      return "border-info/30 bg-info/10";
    case "review":
      return "border-warning/30 bg-warning/10";
    case "no-rule":
      return "border-border bg-background";
    case "skipped":
      return "border-border bg-muted/40 opacity-75";
    default:
      return "border-border bg-card";
  }
}

function statusLabel(status: SimulationStep["status"]): string {
  switch (status) {
    case "resolved":
      return "resolved";
    case "applied":
      return "applied";
    case "review":
      return "review";
    case "no-rule":
      return "no rule";
    case "skipped":
      return "skipped";
    default:
      return "applied";
  }
}

function buildSimulation(row: CommodityCategoryRow | undefined, inputs: SimulatorInputs) {
  if (!row) {
    return {
      sentence: "Select a category to preview the resolution path.",
      caption: "The simulator reads from the taxonomy workbench data already loaded on this page.",
      inputsLine: "",
      approvals: 0,
      steps: [] as SimulationStep[],
    };
  }

  const amount = parseAmount(inputs.amount);
  const formattedAmount = amount.toLocaleString();
  const policyRisk = row.companyDenyCount + row.supplierBlockCount;
  const needsClassification = row.isClassificationRequired || !row.defaultIntentCode;
  const approvalTriggers = [
    row.isRegulated,
    row.isHsRequired,
    amount >= 50_000,
    inputs.crossBorder,
  ].filter(Boolean).length;
  const approvals = policyRisk > 0 || needsClassification
    ? Math.max(1, approvalTriggers)
    : approvalTriggers;

  const sentence = policyRisk > 0
    ? `Policy review needed before ${row.code} can post.`
    : needsClassification
      ? `${row.code} needs classification before GL routing.`
      : `Would resolve to ${row.defaultIntentCode} ${row.defaultIntentName ?? row.name}${approvals ? ` with ${approvals} approval${approvals === 1 ? "" : "s"}` : " with no extra approvals"}.`;

  const steps: SimulationStep[] = [
    {
      key: "supplier",
      label: "1 · supplier x company",
      status: row.supplierPolicyCount > 0 ? "review" : "no-rule",
      value: row.supplierPolicyCount > 0
        ? `${row.supplierPolicyCount} supplier overlay${row.supplierPolicyCount === 1 ? "" : "s"}`
        : "no supplier override",
      detail: row.supplierBlockCount > 0
        ? `${row.supplierBlockCount} blocked supplier policy rows exist for this category.`
        : `${inputs.supplierName || "Selected supplier"} inherits company or base rules.`,
    },
    {
      key: "company",
      label: "2 · company policy",
      status: row.companyDenyCount > 0 ? "review" : row.companyPolicyCount > 0 ? "applied" : "skipped",
      value: row.companyDenyCount > 0
        ? `${row.companyDenyCount} deny overlay${row.companyDenyCount === 1 ? "" : "s"}`
        : row.companyPolicyCount > 0
          ? `${row.companyPolicyCount} policy row${row.companyPolicyCount === 1 ? "" : "s"}`
          : "inherits base rules",
      detail: row.glDefaultCount > 0
        ? `${row.glDefaultCount} GL default override${row.glDefaultCount === 1 ? "" : "s"} available.`
        : `Context: ${companyContextLabel(inputs)}.`,
    },
    {
      key: "intent",
      label: "3 · intent",
      status: row.defaultIntentCode ? "resolved" : "review",
      value: row.defaultIntentCode ?? "classification required",
      detail: row.defaultIntentName ?? "No default intent is linked to this category.",
    },
    {
      key: "profile",
      label: "4 · profile",
      status: row.defaultIntentDomain ? "applied" : "skipped",
      value: row.defaultIntentDomain ? `${row.defaultIntentDomain} profile` : "no profile",
      detail: row.defaultIntentDomain ? "Accounting profile selected from the resolved intent." : "No profile can be selected until an intent resolves.",
    },
  ];

  return {
    sentence,
    caption: "Preview based on taxonomy, default intent, and policy overlays.",
    inputsLine: `${inputs.documentType} / ${inputs.currency} ${formattedAmount}${inputs.recurring ? " / recurring" : ""}${inputs.crossBorder ? " / cross-border" : ""}`,
    approvals,
    steps,
  };
}

function codeName(code?: string | null, name?: string | null): string {
  if (code && name) return `${code} - ${name}`;
  if (code) return code;
  if (name) return name;
  return "Not set";
}

function effectiveWindowText(from?: string | null, to?: string | null): string {
  if (!from && !to) return "Always active";
  const parts = [];
  if (from) parts.push(`Effective From: ${from.slice(0, 10)}`);
  if (to) parts.push(`Effective To: ${to.slice(0, 10)}`);
  return parts.join(" / ");
}

function confidenceText(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not set";
  return value.toFixed(2);
}

function titleize(value?: string | null): string {
  const text = value?.trim();
  if (!text) return "Not set";
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactJson(value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "None";
  return entries
    .map(([key, entry]) => `${key}: ${Array.isArray(entry) ? entry.join(", ") : typeof entry === "object" && entry !== null ? JSON.stringify(entry) : String(entry)}`)
    .join(" / ");
}

function flowText(flows: string[]): string {
  return flows.length ? flows.map((flow) => titleize(flow)).join(" + ") : "All flows";
}

function conditionConfigText(rule: CommodityCategoryRuleRow): string {
  const config = rule.conditionConfig;
  if (!config || typeof config !== "object" || Array.isArray(config)) return "Always applies";
  const record = config as Record<string, unknown>;
  const threshold = record["threshold"] ?? record["amount"] ?? record["min_amount"];
  if (threshold !== undefined) return `threshold ${String(threshold)}`;
  const supplier = record["supplier_code"] ?? record["supplier_id"];
  if (supplier !== undefined) return `supplier ${String(supplier)}`;
  const company = record["company_code"] ?? record["company_code_id"];
  if (company !== undefined) return `company ${String(company)}`;
  const docType = record["doc_type"] ?? record["document_type"];
  if (docType !== undefined) return `document ${String(docType)}`;
  const compact = compactJson(config);
  return compact === "None" ? "Always applies" : compact;
}

function conditionTitle(rule: CommodityCategoryRuleRow): string {
  const config = rule.conditionConfig && typeof rule.conditionConfig === "object" && !Array.isArray(rule.conditionConfig)
    ? rule.conditionConfig as Record<string, unknown>
    : {};
  const threshold = config["threshold"] ?? config["amount"] ?? config["min_amount"];

  switch (rule.conditionType) {
    case "AMOUNT_ABOVE":
      return threshold !== undefined ? `If amount > ${String(threshold)}` : "If amount is above limit";
    case "AMOUNT_BELOW":
      return threshold !== undefined ? `If amount < ${String(threshold)}` : "If amount is below limit";
    case "IS_RECURRING":
      return "If recurring";
    case "IS_ONE_TIME":
      return "If one-time";
    case "CROSS_BORDER":
      return "If cross-border";
    case "SUPPLIER_MATCH":
      return "If supplier matches";
    case "COMPANY_MATCH":
      return "If company matches";
    case "DOC_TYPE_MATCH":
      return "If document type matches";
    case "PROCUREMENT_METHOD":
      return "If procurement method matches";
    case "FALLBACK":
      return "Fallback";
    default:
      return titleize(rule.conditionType);
  }
}

function ruleTone(rule: CommodityCategoryRuleRow): string {
  if (rule.status !== "active") return "opacity-60";
  if (rule.conditionType === "FALLBACK") return "bg-muted/20";
  return "bg-background";
}

function explorerActionHref(entityCode: string, recordId?: string | null, query?: Record<string, string>): string {
  const path = recordId
    ? `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`
    : `/app/${encodeURIComponent(entityCode)}/new`;
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function entityListHref(entityCode: string, query?: Record<string, string>): string {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return `/app/${encodeURIComponent(entityCode)}${qs ? `?${qs}` : ""}`;
}

function CategoryHierarchyRail({
  items,
  totalCount,
  selectedId,
  searchValue,
  loadingIds,
  isServerSearch,
  onSelect,
  onSearchChange,
  onLoadChildren,
}: {
  items: CommodityCategoryRow[];
  totalCount?: number;
  selectedId?: string;
  searchValue?: string;
  loadingIds?: Iterable<string>;
  isServerSearch?: boolean;
  onSelect: (row: CommodityCategoryRow) => void;
  onSearchChange?: (value: string) => void;
  onLoadChildren?: (row: CommodityCategoryRow) => void | Promise<void>;
}) {
  const resultSummary = totalCount && totalCount > 0
    ? `Showing ${items.length.toLocaleString()} of ${totalCount.toLocaleString()} spend categories`
    : `Showing ${items.length.toLocaleString()} spend categories`;

  const rootStats = useMemo(() => {
    const stats = new Map<string, { children: number; linked: number }>();
    for (const root of items.filter((item) => item.parentId === null)) {
      const children = items.filter((item) => item.rootCategoryId === root.id && item.parentId !== null);
      stats.set(root.id, {
        children: children.length,
        linked: children.filter((item) => !!item.defaultIntentCode).length,
      });
    }
    return stats;
  }, [items]);

  const hierarchyMeta = useMemo<WorkbenchHierarchyMeta<CommodityCategoryRow>>(() => ({
    getId: (row) => row.id,
    getParentId: (row) => row.parentId,
    getLabel: (row) => row.name,
    getCode: (row) => row.code,
    getDescription: (row, node) => {
      if (node.depth === 0) {
        const stats = rootStats.get(row.id);
        const loadedLinked = stats && stats.children > 0 ? `/ ${displayPct(stats.linked, stats.children)} linked` : "/ load on expand";
        return `/ ${row.childCount.toLocaleString()} nodes ${loadedLinked}`;
      }
      return row.defaultIntentCode ? `/ ${row.defaultIntentCode}` : "/ inherits base";
    },
    getBadge: (row) => row.isRegulated ? (
      <Badge variant="outline" size="sm" className="shrink-0 border-warning/30 bg-warning/10 text-warning">
        regulated
      </Badge>
    ) : null,
    getSearchText: (row) => [
      row.code,
      row.name,
      row.rootName,
      row.defaultIntentCode,
      row.defaultIntentName,
      row.procurementType,
    ].filter(Boolean).join(" "),
    hasChildren: (row) => row.childCount > 0,
    compare: (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  }), [rootStats]);

  return (
    <WorkbenchHierarchyTree
      items={items}
      meta={hierarchyMeta}
      selectedId={selectedId}
      onSelect={onSelect}
      searchValue={searchValue}
      searchMode={isServerSearch ? "server" : "client"}
      loadingIds={loadingIds}
      onSearchChange={onSearchChange}
      onLoadChildren={onLoadChildren}
      title="Category hierarchy"
      searchPlaceholder="Find category"
      resultSummary={resultSummary}
      initiallyExpanded={onLoadChildren ? "none" : "roots"}
    />
  );
}

function ExplorerProjectionHeader({
  label,
  count,
  title,
  source,
  action,
}: {
  label: string;
  count?: number;
  title: string;
  source?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-doc-label font-semibold uppercase text-foreground">{label}</span>
          {typeof count === "number" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-doc-support font-semibold text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        <p className="mt-1 text-doc-support text-muted-foreground">{title}</p>
        {source && <p className="font-mono text-doc-support text-muted-foreground">{source}</p>}
      </div>
      {action}
    </div>
  );
}

function SelectedCommodityCategorySummary({
  row,
  rulesCount,
  countLabel = "Rule",
  countLabelPlural = `${countLabel}s`,
}: {
  row: CommodityCategoryRow;
  rulesCount: number;
  countLabel?: string;
  countLabelPlural?: string;
}) {
  return (
    <section className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary text-primary-foreground shadow-sm">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-doc-support text-muted-foreground">{row.code}</span>
              <Badge variant={row.status === "active" ? "success" : "muted"} size="sm" className="capitalize">
                {row.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="break-words text-doc-subtitle font-semibold text-foreground">{row.name}</h2>
              <span className="break-words text-doc-support text-muted-foreground">{row.description ?? "No description"}</span>
            </div>
          </div>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-base font-semibold leading-tight text-foreground">{rulesCount}</div>
          <div className="mt-1 text-doc-label font-medium uppercase text-muted-foreground">
            {rulesCount === 1 ? countLabel : countLabelPlural}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntentOutcomeCard({
  code,
  name,
  domain,
  effectiveFrom,
  effectiveTo,
  href,
  className,
}: {
  code?: string | null;
  name?: string | null;
  domain?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  href?: string;
  className?: string;
}) {
  const hasIntent = !!code || !!name;
  return (
    <div className={cn("min-w-0 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-foreground shadow-sm", className)}>
      <div className="flex h-full min-w-0 items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Target className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-doc-support font-semibold text-muted-foreground">{code ?? "No intent"}</span>
              {domain && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-doc-support font-semibold text-primary">
                  {domain}
                </span>
              )}
            </div>
            <div className="mt-1 break-words text-doc-subtitle font-semibold text-foreground">
              {hasIntent ? name ?? code : "No default intent configured"}
            </div>
            <div className="mt-1 text-doc-support font-medium text-muted-foreground">
              {effectiveWindowText(effectiveFrom, effectiveTo)}
            </div>
          </div>
        </div>
        {hasIntent && href && (
          <Link
            href={href}
            title="Open business intent"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

function DefaultIntentProjection({ row, returnToHref }: { row: CommodityCategoryRow; returnToHref?: string }) {
  const editHref = explorerActionHref("commodity_category", row.id, {
    mode: "edit",
    ...(returnToHref ? { returnTo: returnToHref } : {}),
  });
  const intentHref = row.defaultIntentId ? explorerActionHref("business_intent", row.defaultIntentId) : "/app/business_intent";

  return (
    <section className="rounded-lg border bg-card p-3">
      <ExplorerProjectionHeader
        label="Resolves to"
        title="Default intent used when no conditional rule fires."
        action={(
          <Link
            href={editHref}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-doc-action font-semibold text-foreground hover:bg-muted/60"
          >
            <Pencil className="size-3" aria-hidden="true" />
            Edit
          </Link>
        )}
      />

      <div className="mt-2.5 grid items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid items-stretch gap-2 md:grid-cols-[5rem_1rem_minmax(0,1fr)]">
          <div className="flex min-h-20 flex-col items-center justify-center rounded-lg border bg-muted/30 px-2 py-2.5 text-center">
            <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <div className="mt-1.5 font-mono text-doc-support font-semibold text-foreground">{row.code}</div>
            <div className="mt-1 text-doc-support text-muted-foreground">this category</div>
          </div>

          <div className="hidden items-center justify-center text-muted-foreground md:flex">
            <ArrowRight className="size-4" aria-hidden="true" />
          </div>

          <IntentOutcomeCard
            code={row.defaultIntentCode}
            name={row.defaultIntentName}
            domain={row.defaultIntentDomain}
            effectiveFrom={row.createdAt}
            href={intentHref}
            className="min-h-20"
          />
        </div>

        <CategoryAttributeGrid row={row} />
      </div>
    </section>
  );
}

function CategoryAttributeGrid({ row }: { row: CommodityCategoryRow }) {
  const controls = [row.isClassificationRequired, row.isRegulated, row.isHsRequired].some(Boolean)
    ? "Governed"
    : "Standard";

  return (
    <section className="grid h-full gap-2 sm:grid-cols-2">
      <div className="flex min-h-9 flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5">
        <div className="text-doc-label font-semibold uppercase text-muted-foreground">Procurement</div>
        <div className="mt-1 text-doc-subtitle font-semibold text-foreground">{titleize(row.procurementType)}</div>
      </div>
      <div className="flex min-h-9 flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5">
        <div className="text-doc-label font-semibold uppercase text-muted-foreground">Parent</div>
        <div className="mt-1 text-doc-subtitle font-semibold text-foreground">
          {row.parentId ? codeName(row.rootCode, row.rootName) : "Root category"}
        </div>
      </div>
      <div className="flex min-h-9 flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5">
        <div className="text-doc-label font-semibold uppercase text-muted-foreground">Visibility</div>
        <div className="mt-1 text-doc-subtitle font-semibold text-foreground">{titleize(row.visibility)}</div>
      </div>
      <div className="flex min-h-9 flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5">
        <div className="text-doc-label font-semibold uppercase text-muted-foreground">Controls</div>
        <div className="mt-1 text-doc-subtitle font-semibold text-foreground">{controls}</div>
      </div>
    </section>
  );
}

function GovernancePostureProjection({ row }: { row: CommodityCategoryRow }) {
  const activeCount = [row.isClassificationRequired, row.isRegulated, row.isHsRequired].filter(Boolean).length;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-doc-label font-semibold uppercase text-foreground">Governance posture</div>
          <p className="mt-1 text-doc-subtitle text-muted-foreground">
            What is enforced on every business spend transaction in this category / {activeCount} of 3 active
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <StampToggle
          label="Classification"
          pressed={row.isClassificationRequired}
          activeText="Required"
          inactiveText="Optional"
          icon={<Tag className="size-4" aria-hidden="true" />}
          className="min-h-16 px-2.5 py-2"
        />
        <StampToggle
          label="Regulated"
          pressed={row.isRegulated}
          activeText="On"
          inactiveText="Standard"
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          className="min-h-16 px-2.5 py-2"
        />
        <StampToggle
          label="HS Code"
          pressed={row.isHsRequired}
          activeText="Required"
          inactiveText="Optional"
          icon={<Globe2 className="size-4" aria-hidden="true" />}
          className="min-h-16 px-2.5 py-2"
        />
      </div>
    </section>
  );
}

function RuleProjectionRow({ rule, row, returnToHref }: { rule: CommodityCategoryRuleRow; row: CommodityCategoryRow; returnToHref?: string }) {
  const isFallback = rule.conditionType === "FALLBACK";

  return (
    <div className={cn("grid items-stretch gap-2 rounded-lg border px-2.5 py-2 md:grid-cols-[minmax(14rem,0.85fr)_1rem_minmax(15rem,0.8fr)_4rem_1.75rem]", ruleTone(rule))}>
      <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 text-foreground">
        <div className="flex h-full min-w-0 items-center gap-2.5">
          <span className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold leading-none",
            isFallback ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}>
            {isFallback ? "else" : rule.priority}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-doc-subtitle font-semibold text-foreground">{conditionTitle(rule)}</span>
            </div>
            <div className="mt-1 text-doc-support text-muted-foreground">
              {titleize(rule.conditionType)} / {titleize(rule.direction ?? "all directions")} / {flowText(rule.appliesToFlows)}
            </div>
            <div className="mt-1 text-doc-support text-muted-foreground">
              Config: {conditionConfigText(rule)}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden items-center justify-center text-muted-foreground md:flex">
        <ArrowRight className="size-4" aria-hidden="true" />
      </div>

      <IntentOutcomeCard
        code={rule.resolvedIntentCode}
        name={rule.resolvedIntentName}
        domain={rule.resolvedDomain}
        effectiveFrom={rule.effectiveFrom}
        effectiveTo={rule.effectiveTo}
        className="h-full min-h-16"
      />

      <div className="flex items-start justify-between gap-2 md:block md:text-right">
        <div className="text-doc-subtitle font-semibold text-foreground">{confidenceText(rule.confidence)}</div>
        <div className="mt-1 text-doc-support capitalize text-muted-foreground">{rule.status}</div>
      </div>

      <div className="flex justify-end gap-1">
        {isFallback && (
          <span title="Fallback rule" className="flex size-6 items-center justify-center text-muted-foreground">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
          </span>
        )}
        <Link
          href={explorerActionHref("commodity_classification_to_intent_rule", rule.id, {
            mode: "edit",
            ...(returnToHref ? { returnTo: returnToHref } : {}),
          })}
          title="Open rule"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <MoreVertical className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function RuleSequenceDivider() {
  return (
    <div className="relative flex items-center justify-center py-0.5">
      <div className="absolute inset-x-6 top-1/2 h-px bg-border" aria-hidden="true" />
      <span className="relative inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-doc-support font-medium text-muted-foreground">
        <ArrowDown className="size-3" aria-hidden="true" />
        if no match
      </span>
    </div>
  );
}

function ConditionalOverridesProjection({
  row,
  rules,
  rulesLoading,
  rulesError,
  returnToHref,
}: {
  row: CommodityCategoryRow;
  rules: CommodityCategoryRuleRow[];
  rulesLoading?: boolean;
  rulesError?: boolean;
  returnToHref?: string;
}) {
  const sortedRules = [...rules].sort((left, right) => left.priority - right.priority || left.conditionType.localeCompare(right.conditionType));

  return (
    <section className="rounded-lg border bg-card p-4">
      <ExplorerProjectionHeader
        label="Conditional overrides"
        count={sortedRules.length}
        title="Evaluated top-to-bottom by priority. First match wins."
        action={(
          <Link
            href={explorerActionHref("commodity_classification_to_intent_rule", null, {
              "filter.classification_source": "COMMODITY_CATEGORY",
              "filter.classification_id": row.id,
              ...(returnToHref ? { returnTo: returnToHref } : {}),
            })}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-doc-action font-semibold text-foreground hover:bg-muted/60"
          >
            <Plus className="size-3" aria-hidden="true" />
            Add rule
          </Link>
        )}
      />

      <div className="mt-2.5 grid gap-2">
        {rulesLoading ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-2 text-doc-support text-muted-foreground">
            Loading rule rows...
          </div>
        ) : rulesError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-doc-support text-destructive">
            Rule data is unavailable.
          </div>
        ) : sortedRules.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-2 text-doc-support text-muted-foreground">
            No conditional overrides. The default intent is the only active path.
          </div>
        ) : (
          sortedRules.map((rule, index) => (
            <Fragment key={rule.id}>
              <RuleProjectionRow rule={rule} row={row} returnToHref={returnToHref} />
              {index < sortedRules.length - 1 && <RuleSequenceDivider />}
            </Fragment>
          ))
        )}
      </div>
    </section>
  );
}

function SpendCategoryExplorerData({
  row,
  rules = [],
  rulesLoading,
  rulesError,
  returnToHref,
}: {
  row?: CommodityCategoryRow;
  rules?: CommodityCategoryRuleRow[];
  rulesLoading?: boolean;
  rulesError?: boolean;
  returnToHref?: string;
}) {
  if (!row) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Select a category.
      </section>
    );
  }

  return (
    <section className="h-full min-h-0 overflow-auto">
      <div className="grid gap-2.5">
        <SelectedCommodityCategorySummary row={row} rulesCount={rules.length} />
        <DefaultIntentProjection row={row} returnToHref={returnToHref} />
        <GovernancePostureProjection row={row} />
        <ConditionalOverridesProjection
          row={row}
          rules={rules}
          rulesLoading={rulesLoading}
          rulesError={rulesError}
          returnToHref={returnToHref}
        />
      </div>
    </section>
  );
}

function confidencePercentText(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not set";
  if (value <= 1) return value.toFixed(2);
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function compactRecordId(value?: string | null): string {
  if (!value) return "Not set";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function classificationCreateQuery(row: CommodityCategoryRow, returnToHref?: string): Record<string, string> {
  return {
    "filter.owner_type": "commodity_category",
    "filter.owner_id": row.id,
    ...(returnToHref ? { returnTo: returnToHref } : {}),
  };
}

function routingCreateQuery(row: CommodityCategoryRow, returnToHref?: string): Record<string, string> {
  return {
    "filter.commodity_category_id": row.id,
    ...(returnToHref ? { returnTo: returnToHref } : {}),
  };
}

function ClassificationConceptCard({ item, returnToHref }: { item: CommodityClassificationRow; returnToHref?: string }) {
  const codeLabel = item.systemLabel && item.systemLabel !== "Not set"
    ? item.systemLabel
    : item.systemCode ?? compactRecordId(item.codeId);

  return (
    <Link
      href={explorerActionHref("commodity_classification", item.id, returnToHref ? { returnTo: returnToHref } : undefined)}
      className="group block rounded-md border bg-card px-2.5 py-2 transition-colors hover:bg-muted/40"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Tag className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-doc-support font-semibold uppercase text-muted-foreground">
              {item.domainCode ?? "DOMAIN"}
            </span>
            {item.isPrimary && (
              <Badge variant="success" size="sm">
                Primary
              </Badge>
            )}
            <Badge variant={item.status === "active" ? "outline" : "muted"} size="sm" className="capitalize">
              {item.status}
            </Badge>
          </div>
          <div className="mt-1 truncate text-doc-subtitle font-semibold text-foreground">{codeLabel}</div>
          <div className="mt-1 text-doc-support text-muted-foreground">
            {titleize(item.classificationType)} / {titleize(item.mappingType)} / confidence {confidencePercentText(item.confidence)}
          </div>
          {item.description && (
            <div className="mt-1 line-clamp-2 text-doc-support text-muted-foreground">{item.description}</div>
          )}
        </div>
        <ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground opacity-70 group-hover:text-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}

function RoutingRuleCard({ item, returnToHref }: { item: CommodityRoutingRuleRow; returnToHref?: string }) {
  const codeRange = item.codeTo ? `${item.codeFrom ?? "Not set"} - ${item.codeTo}` : item.codeFrom ?? "Not set";

  return (
    <Link
      href={explorerActionHref("commodity_code_to_category_rule", item.id, returnToHref ? { returnTo: returnToHref } : undefined)}
      className="group block rounded-md border bg-card px-2.5 py-2 transition-colors hover:bg-muted/40"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Route className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-doc-support font-semibold uppercase text-muted-foreground">
              {item.commodityDomainCode ?? "DOMAIN"}
            </span>
            <Badge variant="outline" size="sm">
              {titleize(item.matchMode)}
            </Badge>
            <Badge variant={item.status === "active" ? "success" : "muted"} size="sm" className="capitalize">
              {item.status}
            </Badge>
          </div>
          <div className="mt-1 truncate text-doc-subtitle font-semibold text-foreground">{codeRange}</div>
          <div className="mt-1 text-doc-support text-muted-foreground">
            Priority {item.priority ?? 0} / level {item.codeLevel ?? "any"} / confidence {confidencePercentText(item.confidence)}
          </div>
        </div>
        <ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground opacity-70 group-hover:text-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}

function ClassificationColumn({
  title,
  detail,
  count,
  loading,
  error,
  empty,
  action,
  children,
}: {
  title: string;
  detail: string;
  count: number;
  loading?: boolean;
  error?: boolean;
  empty: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-background p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-doc-label font-semibold uppercase text-foreground">{title}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-doc-support font-semibold text-muted-foreground">
              {count}
            </span>
          </div>
          <p className="mt-1 text-doc-support text-muted-foreground">{detail}</p>
        </div>
        {action}
      </div>

      <div className="mt-2.5 grid gap-2">
        {loading ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-2.5 text-doc-support text-muted-foreground">
            Loading...
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2.5 text-doc-support text-destructive">
            Data is unavailable.
          </div>
        ) : count === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-2.5 text-doc-support text-muted-foreground">
            {empty}
          </div>
        ) : children}
      </div>
    </section>
  );
}

function SpendCategoryClassificationData({
  row,
  returnToHref,
}: {
  row?: CommodityCategoryRow;
  returnToHref?: string;
}) {
  const classificationsQuery = useCommodityClassifications(row?.id, { enabled: !!row });
  const routingRulesQuery = useCommodityRoutingRules(row?.id, { enabled: !!row });
  const classifications = classificationsQuery.data ?? [];
  const routingRules = routingRulesQuery.data ?? [];
  const totalItems = classifications.length + routingRules.length;

  if (!row) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Select a category.
      </section>
    );
  }

  return (
    <section className="h-full min-h-0 overflow-auto">
      <div className="grid gap-2.5">
        <SelectedCommodityCategorySummary
          row={row}
          rulesCount={totalItems}
          countLabel="Item"
          countLabelPlural="Items"
        />

        <section className="rounded-lg border bg-card p-3">
          <ExplorerProjectionHeader
            label="Classification"
            count={totalItems}
            title="Commodity concepts attached to this category and incoming code rules that route here."
            action={(
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={entityListHref("commodity_classification", classificationCreateQuery(row, returnToHref))}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-doc-action font-semibold text-foreground hover:bg-muted/60"
                >
                  Codes
                </Link>
                <Link
                  href={entityListHref("commodity_code_to_category_rule", routingCreateQuery(row, returnToHref))}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-doc-action font-semibold text-foreground hover:bg-muted/60"
                >
                  Rules
                </Link>
              </div>
            )}
          />

          <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]">
            <ClassificationColumn
              title="Commodity concepts"
              detail="Rows from commodity_classification for this category."
              count={classifications.length}
              loading={classificationsQuery.isLoading}
              error={classificationsQuery.isError}
              empty="No commodity concepts are attached to this category yet."
              action={(
                <Link
                  href={explorerActionHref("commodity_classification", null, classificationCreateQuery(row, returnToHref))}
                  className="inline-flex h-6 items-center gap-1 rounded-md border bg-card px-1.5 text-doc-support font-semibold text-foreground hover:bg-muted/60"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  Add
                </Link>
              )}
            >
              {classifications.map((item) => (
                <ClassificationConceptCard key={item.id} item={item} returnToHref={returnToHref} />
              ))}
            </ClassificationColumn>

            <div className="hidden items-center justify-center text-muted-foreground xl:flex">
              <ArrowRight className="size-4" aria-hidden="true" />
            </div>

            <ClassificationColumn
              title="Routing rules"
              detail="Rows from commodity_code_to_category_rule that resolve into this category."
              count={routingRules.length}
              loading={routingRulesQuery.isLoading}
              error={routingRulesQuery.isError}
              empty="No incoming commodity routing rules point to this category yet."
              action={(
                <Link
                  href={explorerActionHref("commodity_code_to_category_rule", null, routingCreateQuery(row, returnToHref))}
                  className="inline-flex h-6 items-center gap-1 rounded-md border bg-card px-1.5 text-doc-support font-semibold text-foreground hover:bg-muted/60"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  Add
                </Link>
              )}
            >
              {routingRules.map((item) => (
                <RoutingRuleCard key={item.id} item={item} returnToHref={returnToHref} />
              ))}
            </ClassificationColumn>
          </div>
        </section>
      </div>
    </section>
  );
}

function spendCategoryDisplayLabel(row?: CommodityCategoryRow): string | null {
  return row?.name ?? null;
}

function WorkbenchSpendCategoryField({
  selected,
  onSelectId,
}: {
  selected?: CommodityCategoryRow;
  onSelectId: (id: string | null) => void;
}) {
  return (
    <EntityPicker
      entityCode="commodity_category"
      value={selected?.id ?? null}
      displayLabel={spendCategoryDisplayLabel(selected)}
      onChange={onSelectId}
      optionConfig={WORKBENCH_SPEND_CATEGORY_PICKER_CONFIG}
      optionActionLabel="Open category"
      placeholder="Search category..."
      loadOnOpen
      clearable={false}
      className="min-w-0"
    />
  );
}

function WorkbenchCompanyCodeField({
  selected,
  companies,
  onSelect,
}: {
  selected?: CompanyOption | null;
  companies: CompanyOption[];
  onSelect: (company: CompanyOption | null) => void;
}) {
  const optionRef = useRef<CompanyOption | null>(null);

  return (
    <EntityPicker
      entityCode="company_code"
      value={selected?.id ?? null}
      displayLabel={companyDisplayLabel(selected)}
      onOptionSelect={(option) => {
        optionRef.current = option ? companyFromPickerOption(option) : null;
      }}
      onChange={(id) => {
        if (!id) {
          optionRef.current = null;
          onSelect(null);
          return;
        }
        const scopedCompany = companies.find((company) => company.id === id) ?? null;
        const optionCompany = optionRef.current?.id === id ? optionRef.current : null;
        onSelect(scopedCompany ?? optionCompany);
      }}
      searchParams={WORKBENCH_COMPANY_CODE_SEARCH_PARAMS}
      optionConfig={WORKBENCH_COMPANY_CODE_PICKER_CONFIG}
      optionActionLabel="Open company code"
      placeholder="Search company code..."
      loadOnOpen
      clearable={false}
      className="min-w-0"
    />
  );
}

function WorkbenchCurrencyField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const currentCode = normalizeCurrency(value);

  const { data: currencies, isLoading } = useQuery<CurrencyRow[]>({
    queryKey: ["ref", "currencies", query],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: "50", status: "active" });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, { signal });
      if (!res.ok) return [];
      const body = await res.json() as { data?: CurrencyRow[] };
      return body.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const all = currencies ?? [];
  const selectedFromPage = all.find((currency) => currency.code === currentCode);
  const shouldHydrateSelected = Boolean(currentCode) && !selectedFromPage;
  const { data: hydratedSelected } = useQuery<CurrencyRow | null>({
    queryKey: ["ref", "currencies", "selected", currentCode],
    enabled: shouldHydrateSelected,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ search: currentCode, limit: "20", status: "active" });
      const res = await fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, { signal });
      if (!res.ok) return null;
      const body = await res.json() as { data?: CurrencyRow[] };
      return (body.data ?? []).find((currency) => currency.code === currentCode) ?? null;
    },
    staleTime: 60 * 60 * 1000,
  });
  const selected = selectedFromPage ?? hydratedSelected ?? null;
  const options: ComboboxOption[] = all.map((currency) => ({
    value: currency.code,
    label: `${currency.code} - ${currency.name}`,
    description: currency.symbol ?? undefined,
  }));

  return (
    <AsyncCombobox
      value={currentCode || null}
      displayLabel={selected?.code ?? currentCode}
      options={options}
      loading={isLoading}
      onQueryChange={setQuery}
      onOpen={() => setQuery("")}
      onChange={(next) => onChange(normalizeCurrency(next))}
      placeholder="CCY"
      searchPlaceholder="Search currencies..."
      clearable={false}
      className={className}
    />
  );
}

function SpendCategorySimulator({
  rows,
  selected,
  onSelect,
}: {
  rows: CommodityCategoryRow[];
  selected?: CommodityCategoryRow;
  onSelect: (row: CommodityCategoryRow) => void;
}) {
  const [inputs, setInputs] = useState<SimulatorInputs>(DEFAULT_SIMULATOR_INPUTS);
  const [pins, setPins] = useState<PinnedScenario[]>([]);
  const scopeOptions = useScopeOptions();
  const sessionSnapshot = useWorkbenchSessionSnapshot();
  const companies = scopeOptions.data?.companies ?? [];
  const activeCompanyCode = parseActiveOrgCompanyCode(sessionSnapshot.data?.activeOrg);
  const sessionReady = sessionSnapshot.isFetched || sessionSnapshot.isError;
  const selectedCompany = useMemo<CompanyOption | null>(() => {
    const scopedCompany = companies.find((company) => company.id === inputs.companyCodeId);
    if (scopedCompany) return scopedCompany;
    if (!inputs.companyCodeId) return null;
    return {
      id: inputs.companyCodeId,
      code: inputs.companyCode,
      name: inputs.companyName || inputs.companyCode,
      functionalCurrency: normalizeCurrency(inputs.currency),
      legalEntityId: "",
      fiscalYearStartMonth: 1,
    };
  }, [companies, inputs.companyCode, inputs.companyCodeId, inputs.companyName, inputs.currency]);
  const defaultCompany = useMemo(() => {
    if (companies.length === 0) return null;
    if (activeCompanyCode) {
      return companies.find((company) => company.code.toLowerCase() === activeCompanyCode.toLowerCase())
        ?? companies[0]!;
    }
    return sessionReady ? companies[0]! : null;
  }, [activeCompanyCode, companies, sessionReady]);
  const simulation = useMemo(() => buildSimulation(selected, inputs), [inputs, selected]);

  function updateInput<K extends keyof SimulatorInputs>(key: K, value: SimulatorInputs[K]) {
    setInputs((current) => ({ ...current, [key]: value }));
  }

  function applyCompanySelection(company: CompanyOption | null) {
    setInputs((current) => ({
      ...current,
      companyCodeId: company?.id ?? null,
      companyCode: company?.code ?? "",
      companyName: company?.name ?? "",
      currency: company ? normalizeCurrency(company.functionalCurrency) : current.currency,
      supplierId: null,
      supplierName: "",
    }));
  }

  useEffect(() => {
    if (!defaultCompany) return;
    setInputs((current) => {
      if (current.companyCodeId) return current;
      return {
        ...current,
        companyCodeId: defaultCompany.id,
        companyCode: defaultCompany.code,
        companyName: defaultCompany.name,
        currency: normalizeCurrency(defaultCompany.functionalCurrency),
      };
    });
  }, [defaultCompany]);

  function pinScenario() {
    if (!selected) return;
    const id = `${selected.id}:${inputs.companyCodeId ?? ""}:${inputs.supplierId ?? ""}:${inputs.amount ?? ""}:${inputs.currency}:${inputs.documentType}:${inputs.recurring}:${inputs.crossBorder}`;
    setPins((current) => {
      if (current.some((item) => item.id === id)) return current;
      return [
        ...current.slice(-2),
        {
          id,
          title: `${selected.code} - ${inputs.currency} ${parseAmount(inputs.amount).toLocaleString()}`,
          result: simulation.sentence,
          detail: `${companyContextLabel(inputs)}${inputs.supplierName ? ` - ${inputs.supplierName}` : ""}`,
        },
      ];
    });
  }

  return (
    <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-auto rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          Scenario inputs
        </div>

        <div className="grid gap-3 text-sm">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Category</span>
            <WorkbenchSpendCategoryField
              selected={selected}
              onSelectId={(id) => {
                const next = rows.find((row) => row.id === id);
                if (next) onSelect(next);
              }}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Company Code</span>
            <WorkbenchCompanyCodeField
              selected={selectedCompany}
              companies={companies}
              onSelect={applyCompanySelection}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Supplier</span>
            <SupplierPicker
              value={inputs.supplierId}
              displayLabel={inputs.supplierName}
              onChange={(id, label) => {
                setInputs((current) => ({
                  ...current,
                  supplierId: id,
                  supplierName: label ?? "",
                }));
              }}
              field={WORKBENCH_SUPPLIER_FIELD}
              formData={{ company_code_id: inputs.companyCodeId }}
              disabled={!inputs.companyCodeId}
              placeholder={inputs.companyCodeId ? "Search supplier..." : "Select company first"}
              className="min-w-0"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Amount</span>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)]">
              <WorkbenchCurrencyField
                value={inputs.currency}
                onChange={(value) => updateInput("currency", value)}
                className="min-w-0 [&_[role=combobox]]:rounded-r-none [&_[role=combobox]]:px-2"
              />
              <MoneyInput
                value={inputs.amount}
                onChange={(value) => updateInput("amount", value)}
                scale={4}
                placeholder="0.0000"
                className="-ml-px min-w-0 [&_input]:rounded-l-none"
              />
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Document type</span>
            <select
              value={inputs.documentType}
              onChange={(event) => updateInput("documentType", event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {["Vendor invoice", "Purchase order", "Expense claim"].map((docType) => (
                <option key={docType} value={docType}>{docType}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-foreground">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={inputs.recurring}
                onChange={(event) => updateInput("recurring", event.target.checked)}
                className="size-4"
              />
              Recurring
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={inputs.crossBorder}
                onChange={(event) => updateInput("crossBorder", event.target.checked)}
                className="size-4"
              />
              Cross-border
            </label>
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className={cn(
          "m-3 rounded-lg border px-4 py-3",
          simulation.steps.some((step) => step.status === "review")
            ? "border-warning/30 bg-warning/10"
            : "border-success/30 bg-success/10",
        )}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {simulation.steps.some((step) => step.status === "review") ? (
                  <CircleAlert className="size-4 text-warning" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                )}
                Resolution preview
              </div>
              <p className="text-base font-semibold text-foreground">{simulation.sentence}</p>
              {simulation.inputsLine && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">Inputs used: {simulation.inputsLine}</p>
              )}
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{simulation.caption}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={pinScenario} disabled={!selected}>
              <Pin className="size-3.5" aria-hidden="true" />
              Pin
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resolution chain
          </div>
          <div className="grid gap-2 xl:grid-cols-4">
            {simulation.steps.map((step, index) => (
              <div key={step.key} className={cn("rounded-lg border p-3", stepTone(step.status))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">{step.label}</div>
                  <Badge variant="outline" className="capitalize">{statusLabel(step.status)}</Badge>
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">{step.value}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</div>
                {index < simulation.steps.length - 1 && (
                  <ChevronRight className="mt-3 hidden size-4 text-muted-foreground xl:block" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pinned scenarios
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {pins.length === 0 ? (
                <button
                  type="button"
                  className="flex h-10 items-center justify-center rounded-md border border-dashed bg-muted/20 px-3 text-sm text-muted-foreground hover:bg-muted/40"
                  onClick={pinScenario}
                  disabled={!selected}
                >
                  Pin this scenario to compare with others
                </button>
              ) : pins.map((pin) => (
                <div key={pin.id} className="rounded-lg border bg-background p-3">
                  <div className="text-sm font-semibold text-foreground">{pin.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{pin.result}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{pin.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function EditorSnapshot({ row }: { row: CommodityCategoryRow }) {
  const policyCount = row.companyPolicyCount + row.supplierPolicyCount;
  const blockerCount = row.companyDenyCount + row.supplierBlockCount;
  const guardrailCount = [
    row.isClassificationRequired,
    row.isHsRequired,
    row.isRegulated,
  ].filter(Boolean).length;
  const resolvesFromBase = policyCount === 0 && blockerCount === 0 && guardrailCount === 0;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">{row.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {row.description ?? "No description"}
          </p>
        </div>
        <Badge variant={row.status === "active" ? "success" : "muted"} className="capitalize">
          {row.status}
        </Badge>
      </div>

      {resolvesFromBase ? (
        <div className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          No overlays yet. This category resolves from the base seed and default intent.
        </div>
      ) : (
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">Default intent</div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{row.defaultIntentCode ?? "Not linked"}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{row.defaultIntentDomain ?? row.defaultIntentName ?? "Classification required"}</div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">Policy overlays</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{policyCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">{row.companyPolicyCount} company / {row.supplierPolicyCount} supplier</div>
        </div>
        <div className={cn("rounded-md border p-3", reviewTone(blockerCount))}>
          <div className="text-xs font-medium">Deny or block rows</div>
          <div className="mt-1 text-sm font-semibold">{blockerCount}</div>
          <div className="mt-1 text-xs opacity-80">{row.companyDenyCount} company / {row.supplierBlockCount} supplier</div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">Guardrails</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{guardrailCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">{row.glDefaultCount} GL defaults</div>
        </div>
      </div>
      )}
    </div>
  );
}

function GovernanceLayer({
  step,
  title,
  detail,
  badge,
  tone = "default",
  children,
}: {
  step: string;
  title: string;
  detail: string;
  badge: string;
  tone?: "default" | "success" | "warning";
  children: React.ReactNode;
}) {
  const toneClass = tone === "warning"
    ? "border-warning/30 bg-warning/10"
    : tone === "success"
      ? "border-success/30 bg-success/10"
      : "border-border bg-card";

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{step}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
        <Badge variant="outline" className="shrink-0">{badge}</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

function GovernanceFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function GovernanceCascade({ row }: { row: CommodityCategoryRow }) {
  const supplierReviews = row.supplierPolicyCount + row.supplierBlockCount;
  const companyReviews = row.companyPolicyCount + row.companyDenyCount + row.glDefaultCount;

  return (
    <div className="grid gap-3">
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
        L4 wins first. L1 is the fallback when no more-specific rule exists.
      </div>
      <GovernanceLayer
        step="Layer 4"
        title="Supplier x company override - wins first"
        detail="Most specific policy layer for vendor-sensitive controls."
        badge={supplierReviews ? "Specific" : "Inherits"}
        tone={row.supplierBlockCount ? "warning" : supplierReviews ? "success" : "default"}
      >
        {supplierReviews === 0 ? (
          <GovernanceFact label="Supplier-level rules" value="None yet" />
        ) : (
          <>
            <GovernanceFact label="Supplier overlays" value={countText(row.supplierPolicyCount, "row")} />
            <GovernanceFact label="Supplier blocks" value={countText(row.supplierBlockCount, "block")} />
          </>
        )}
      </GovernanceLayer>

      <GovernanceLayer
        step="Layer 3"
        title="Company policy"
        detail="Company-code controls, deny rules, and accounting defaults."
        badge={companyReviews ? "Applied" : "Inherited"}
        tone={row.companyDenyCount ? "warning" : companyReviews ? "success" : "default"}
      >
        <GovernanceFact label="Company policies" value={countText(row.companyPolicyCount, "row")} />
        <GovernanceFact label="Company deny rows" value={countText(row.companyDenyCount, "deny row")} />
        <GovernanceFact label="GL defaults" value={countText(row.glDefaultCount, "default")} />
        <GovernanceFact label="Procurement type" value={row.procurementType} />
      </GovernanceLayer>

      <GovernanceLayer
        step="Layer 2"
        title="Tenant taxonomy defaults"
        detail="Default intent and accounting profile for the selected commodity category."
        badge={row.defaultIntentCode ? "Resolved" : "Needs link"}
        tone={row.defaultIntentCode ? "success" : "warning"}
      >
        <GovernanceFact label="Intent" value={row.defaultIntentCode ?? "Not linked"} />
        <GovernanceFact label="Intent name" value={row.defaultIntentName ?? "No default intent"} />
        <GovernanceFact label="Intent domain" value={row.defaultIntentDomain ?? "No profile domain"} />
        <GovernanceFact label="Visibility" value={row.visibility} />
      </GovernanceLayer>

      <GovernanceLayer
        step="Layer 1"
        title="Base category definition - fallback"
        detail="Seeded category identity, hierarchy placement, and control flags."
        badge={row.parentId ? "Leaf" : "Root"}
      >
        <GovernanceFact label="Root" value={row.rootName ?? row.name} />
        <GovernanceFact label="Children" value={row.childCount} />
        <GovernanceFact label="Classification" value={row.isClassificationRequired ? "Required" : "Optional"} />
        <GovernanceFact label="Regulated or HS" value={row.isRegulated || row.isHsRequired ? "Yes" : "No"} />
      </GovernanceLayer>
    </div>
  );
}

function ConfigurePanel({ row }: { row: CommodityCategoryRow }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Category definition
        </div>
        <div className="grid gap-2">
          <GovernanceFact label="Code" value={row.code} />
          <GovernanceFact label="Name" value={row.name} />
          <GovernanceFact label="Status" value={row.status} />
          <GovernanceFact label="Sort order" value={row.sortOrder} />
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Control flags
        </div>
        <div className="grid gap-2">
          <GovernanceFact label="Visibility" value={row.visibility} />
          <GovernanceFact label="Procurement type" value={row.procurementType} />
          <GovernanceFact label="Commodity classification" value={row.isClassificationRequired ? "Required" : "Optional"} />
          <GovernanceFact label="HS and regulated" value={row.isHsRequired || row.isRegulated ? "Enabled" : "Standard"} />
        </div>
      </div>
    </div>
  );
}

function RoutePanel({ row }: { row: CommodityCategoryRow }) {
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Route className="size-4 text-muted-foreground" aria-hidden="true" />
          Routing preview
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <GovernanceFact label="Default intent" value={row.defaultIntentCode ?? "Not linked"} />
          <GovernanceFact label="Accounting domain" value={row.defaultIntentDomain ?? "No profile"} />
          <GovernanceFact label="GL defaults" value={countText(row.glDefaultCount, "default")} />
        </div>
      </div>
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
        Edits are made in intent defaults, company policies, supplier overrides, and classification rules.
      </div>
    </div>
  );
}

function LinkPanel({
  row,
  apps,
}: {
  row: CommodityCategoryRow;
  apps: TaxonomyRelatedApp[];
}) {
  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
          App links
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {apps.map((app) => (
            <a
              key={relatedAppKey(app)}
              href={relatedAppHref(app, row)}
              className="group rounded-md border bg-background p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{app.label}</div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{app.entityCode}</div>
                </div>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ row }: { row: CommodityCategoryRow }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="text-xs font-medium text-muted-foreground">Source table</div>
        <div className="mt-1 font-mono text-sm font-semibold text-foreground">master.commodity_category</div>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">Primary category definition for {row.code}.</div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="text-xs font-medium text-muted-foreground">Overlay tables</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{row.companyPolicyCount + row.supplierPolicyCount}</div>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">Company and supplier policy rows in the current read model.</div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="text-xs font-medium text-muted-foreground">Read model</div>
        <div className="mt-1 text-sm font-semibold text-foreground">Spend taxonomy API</div>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">Editor reads the same service payload as Explorer and Simulator.</div>
      </div>
    </div>
  );
}

function SpendCategoryOverview({
  summary,
  linkedPct,
  policyPct,
  apps,
}: {
  summary: CommodityCategorySummary;
  linkedPct: string;
  policyPct: string;
  apps: TaxonomyRelatedApp[];
}) {
  return (
    <div className="grid min-h-0 gap-3">
      <section className="shrink-0 rounded-lg border bg-card p-3 shadow-sm">
        <ReportMetricGrid className="lg:grid-cols-5">
          <ReportMetricCard label="Categories" value={summary.total.toLocaleString()} detail={`${summary.roots} roots / ${summary.leaves} leaves`} />
          <ReportMetricCard label="Intent Coverage" value={linkedPct} detail={`${summary.linkedIntent} selectable nodes`} tone="success" />
          <ReportMetricCard label="Procurement Nature" value={`Goods ${summary.goods}`} detail={`Services ${summary.services}`} />
          <ReportMetricCard label="Policy Overlay" value={policyPct} detail={`${summary.companyPolicies + summary.supplierPolicies} policy rows`} tone="warning" />
          <ReportMetricCard label="Regulated" value={summary.regulated.toLocaleString()} detail={`${summary.deniedPolicies} deny or block rows`} tone={summary.deniedPolicies ? "danger" : "neutral"} />
        </ReportMetricGrid>
      </section>

      <RelatedAppsUniverseSection
        apps={apps}
      />
    </div>
  );
}

function WorkbenchContractFooter({ mode }: { mode: TaxonomyWorkbenchMode }) {
  const notes: Record<TaxonomyWorkbenchMode, string[]> = {
    overview: [
      "Summary counts use current tenant data",
      "Policy overlay counts come from governed tables",
      "RLS filters by current tenant",
    ],
    explorer: [
      "020_base seeds roots and leaves",
      "022_base sets default_intent_id",
      "RLS filters by current tenant",
    ],
    classification: [
      "Commodity links come from master.commodity_classification",
      "Routing rules come from control.commodity_code_to_category_rule",
      "RLS filters by current tenant",
    ],
    simulator: [
      "Preview uses live taxonomy and overlays",
      "No transaction is created",
      "RLS filters by current tenant",
    ],
    editor: [
      "Base seeds stay protected",
      "Changes write to overlay tables",
      "RLS filters by current tenant",
    ],
    matrix: [
      "Empty cells inherit from L1 base",
      "Coverage counts selected rows",
      "RLS filters by current tenant",
    ],
  };

  return (
    <section className="shrink-0 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        {notes[mode].map((note, index) => (
          <span key={note} className="inline-flex items-center gap-1.5">
            {index === 0 ? <Layers3 className="h-3.5 w-3.5" /> : index === 1 ? <Link2 className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {note}
          </span>
        ))}
      </div>
    </section>
  );
}

function RelatedAppsUniverseSection({
  apps,
}: {
  apps: TaxonomyRelatedApp[];
}) {
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <AppWindow className="size-3.5" aria-hidden="true" />
          Apps in this universe
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {apps.map((app) => {
          return (
            <Link
              key={relatedAppKey(app)}
              href={app.href}
              className="group block rounded-md border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{app.label}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {app.description ?? app.entityCode}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EditorVerbBody({
  verb,
  row,
  apps,
}: {
  verb: EditorVerb;
  row: CommodityCategoryRow;
  apps: TaxonomyRelatedApp[];
}) {
  switch (verb) {
    case "configure":
      return <ConfigurePanel row={row} />;
    case "route":
      return <RoutePanel row={row} />;
    case "link":
      return <LinkPanel row={row} apps={apps} />;
    case "audit":
      return <AuditPanel row={row} />;
    case "govern":
    default:
      return <GovernanceCascade row={row} />;
  }
}

function editorScopeLabel(scope: SpendEditorScope, isSingleCompanyTenant: boolean): string {
  const definition = SPEND_EDITOR_SCOPES.find((item) => item.key === scope) ?? SPEND_EDITOR_SCOPES[0]!;
  return isSingleCompanyTenant ? definition.singleCompanyLabel : definition.multiCompanyLabel;
}

function editorScopeDetail(scope: SpendEditorScope, isSingleCompanyTenant: boolean, company?: CompanyOption): string {
  if (isSingleCompanyTenant) {
    if (scope === "supplier") return "Add this only when one vendor needs different routing from the company default.";
    return "This category applies to your company. Company-specific controls are folded into this default.";
  }

  if (scope === "company") {
    return company
      ? `Override the tenant default for ${company.code} - ${company.name}.`
      : "Choose a company to override the tenant default.";
  }

  if (scope === "supplier") {
    return company
      ? `Create the most specific exception for a supplier trading with ${company.code}.`
      : "Choose a company first, then open supplier overrides for vendor-specific routing.";
  }

  return "Set the default behavior used by every company unless a more specific exception exists.";
}

function relatedAppByCode(apps: TaxonomyRelatedApp[], entityCode: string): TaxonomyRelatedApp | undefined {
  return apps.find((app) => app.entityCode === entityCode);
}

function EditorActionLink({
  app,
  row,
  children,
  returnToHref,
}: {
  app?: TaxonomyRelatedApp;
  row: CommodityCategoryRow;
  children: React.ReactNode;
  returnToHref?: string;
}) {
  if (!app) return null;
  return (
    <Link
      href={relatedAppHref(app, row, { returnTo: returnToHref })}
      className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60"
    >
      {children}
    </Link>
  );
}

function EditorPolicyCard({
  title,
  value,
  detail,
  tone = "default",
  action,
}: {
  title: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone?: "default" | "success" | "warning";
  action?: React.ReactNode;
}) {
  const toneClass = tone === "warning"
    ? "border-warning/30 bg-warning/10"
    : tone === "success"
      ? "border-success/30 bg-success/10"
      : "bg-card";

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

function ScopeFirstEditorBody({
  row,
  scope,
  isSingleCompanyTenant,
  selectedCompany,
  apps,
  returnToHref,
}: {
  row: CommodityCategoryRow;
  scope: SpendEditorScope;
  isSingleCompanyTenant: boolean;
  selectedCompany?: CompanyOption;
  apps: TaxonomyRelatedApp[];
  returnToHref?: string;
}) {
  const companyPolicies = row.companyPolicyCount + row.companyDenyCount + row.glDefaultCount;
  const supplierExceptions = row.supplierPolicyCount + row.supplierBlockCount;
  const guardrails = [
    row.isClassificationRequired ? "classification required" : null,
    row.isHsRequired ? "HS required" : null,
    row.isRegulated ? "regulated" : null,
  ].filter(Boolean).join(", ") || "standard controls";
  const categoryApp = relatedAppByCode(apps, "commodity_category");
  const companyPolicyApp = apps.find((app) => app.entityCode === "commodity_category_buy_policy" && !app.href.includes("SUPPLIER_PROFILE"))
    ?? relatedAppByCode(apps, "commodity_category_buy_policy");
  const supplierPolicyApp = apps.find((app) => app.entityCode === "commodity_category_buy_policy" && app.href.includes("SUPPLIER_PROFILE"))
    ?? companyPolicyApp;
  const classificationApp = relatedAppByCode(apps, "commodity_classification_to_intent_rule");
  const scopeTitle = editorScopeLabel(scope, isSingleCompanyTenant);
  const scopeDetail = editorScopeDetail(scope, isSingleCompanyTenant, selectedCompany);

  return (
    <div className="grid gap-3">
      <section className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apply to</div>
            <h3 className="mt-1 text-base font-semibold text-foreground">{scopeTitle}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{scopeDetail}</p>
          </div>
          <Badge variant={scope === "tenant" ? "success" : "outline"}>
            {scope === "tenant" ? "Default" : "Exception"}
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <EditorPolicyCard
          title="Default intent"
          value={row.defaultIntentCode ?? "Not linked"}
          detail={row.defaultIntentName ?? "Choose the business intent this category should resolve to."}
          tone={row.defaultIntentCode ? "success" : "warning"}
          action={<EditorActionLink app={categoryApp} row={row} returnToHref={returnToHref}>Edit</EditorActionLink>}
        />
        <EditorPolicyCard
          title="Controls"
          value={guardrails}
          detail={`${row.procurementType} category / ${row.visibility.toLowerCase()} visibility`}
          tone={row.isRegulated || row.isHsRequired ? "warning" : "default"}
          action={<EditorActionLink app={classificationApp} row={row} returnToHref={returnToHref}>Rules</EditorActionLink>}
        />
      </section>

      {scope === "tenant" && (
        <section className="grid gap-3 lg:grid-cols-2">
          <EditorPolicyCard
            title={isSingleCompanyTenant ? "Company default" : "Company exceptions"}
            value={companyPolicies > 0 ? countText(companyPolicies, "row") : "None yet"}
            detail={isSingleCompanyTenant
              ? "Company setup is part of the default for this tenant."
              : "Only add company exceptions when one company must behave differently."}
            tone={companyPolicies > 0 ? "success" : "default"}
            action={<EditorActionLink app={companyPolicyApp} row={row} returnToHref={returnToHref}>{companyPolicies ? "Review" : "Add"}</EditorActionLink>}
          />
          <EditorPolicyCard
            title="Supplier exceptions"
            value={supplierExceptions > 0 ? countText(supplierExceptions, "row") : "None yet"}
            detail="Vendor-specific routing stays empty until a supplier needs different treatment."
            tone={row.supplierBlockCount ? "warning" : supplierExceptions ? "success" : "default"}
            action={<EditorActionLink app={supplierPolicyApp} row={row} returnToHref={returnToHref}>{supplierExceptions ? "Review" : "Add"}</EditorActionLink>}
          />
        </section>
      )}

      {scope === "company" && (
        <section className="grid gap-3 lg:grid-cols-2">
          <EditorPolicyCard
            title="Company exception"
            value={companyPolicies > 0 ? countText(companyPolicies, "row") : "No company exception yet"}
            detail="Use this when the selected company needs different GL defaults, thresholds, or deny rules."
            tone={row.companyDenyCount ? "warning" : companyPolicies ? "success" : "default"}
            action={<EditorActionLink app={companyPolicyApp} row={row} returnToHref={returnToHref}>{companyPolicies ? "Open" : "Add"}</EditorActionLink>}
          />
          <EditorPolicyCard
            title="Falls back to"
            value="Tenant default"
            detail="If no company rule exists, the category uses the default intent and base category setup."
          />
        </section>
      )}

      {scope === "supplier" && (
        <section className="grid gap-3 lg:grid-cols-2">
          <EditorPolicyCard
            title="Supplier exception"
            value={supplierExceptions > 0 ? countText(supplierExceptions, "row") : "No supplier exception yet"}
            detail="Use this only for vendor-specific routing, blocks, or invoice treatment."
            tone={row.supplierBlockCount ? "warning" : supplierExceptions ? "success" : "default"}
            action={<EditorActionLink app={supplierPolicyApp} row={row} returnToHref={returnToHref}>{supplierExceptions ? "Open" : "Add"}</EditorActionLink>}
          />
          <EditorPolicyCard
            title="Falls back to"
            value={isSingleCompanyTenant ? "Company default" : "Company, then tenant default"}
            detail="If no supplier rule exists, the selected company rule is used; otherwise the tenant default applies."
          />
        </section>
      )}
    </div>
  );
}

function SpendCategoryEditor({
  rows,
  selected,
  onSelect,
  returnToHref,
}: {
  rows: CommodityCategoryRow[];
  selected?: CommodityCategoryRow;
  onSelect: (row: CommodityCategoryRow) => void;
  returnToHref?: string;
}) {
  const [scope, setScope] = useState<SpendEditorScope>("tenant");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyOption, setSelectedCompanyOption] = useState<CompanyOption | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const scopeOptions = useScopeOptions();
  const definition = getTaxonomyWorkbenchDefinition("spend");
  const companies = scopeOptions.data?.companies ?? [];
  const companyContextKnown = !!scopeOptions.data;
  const isSingleCompanyTenant = companyContextKnown && companies.length <= 1;
  const visibleScopes = useMemo(
    () => SPEND_EDITOR_SCOPES.filter((item) => !isSingleCompanyTenant || item.key !== "company"),
    [isSingleCompanyTenant],
  );
  const selectedCompany = useMemo(() => {
    const scopedCompany = companies.find((company) => company.id === selectedCompanyId);
    if (scopedCompany) return scopedCompany;
    if (selectedCompanyOption?.id === selectedCompanyId) return selectedCompanyOption;
    return companies[0] ?? null;
  }, [companies, selectedCompanyId, selectedCompanyOption]);

  function applyEditorCompanySelection(company: CompanyOption | null) {
    setSelectedCompanyId(company?.id ?? null);
    setSelectedCompanyOption(company);
    setSelectedSupplierId(null);
    setSelectedSupplierName("");
  }

  useEffect(() => {
    if (isSingleCompanyTenant && scope === "company") setScope("tenant");
  }, [isSingleCompanyTenant, scope]);

  useEffect(() => {
    if (!selectedCompanyId && companies[0]) setSelectedCompanyId(companies[0].id);
  }, [companies, selectedCompanyId]);

  return (
    <section className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-auto rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Editor
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <WorkbenchSpendCategoryField
            selected={selected}
            onSelectId={(id) => {
              const next = rows.find((row) => row.id === id);
              if (next) onSelect(next);
            }}
          />
        </label>

        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground">Apply to</div>
          <div className="mt-2 grid gap-2">
          {visibleScopes.map((item) => {
            const Icon = item.icon;
            const active = scope === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted/60",
                )}
                aria-pressed={active}
                onClick={() => setScope(item.key)}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4" aria-hidden="true" />
                  {isSingleCompanyTenant ? item.singleCompanyLabel : item.multiCompanyLabel}
                </span>
                <span className={cn("mt-1 block text-xs leading-5", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {isSingleCompanyTenant ? item.singleCompanyDetail : item.multiCompanyDetail}
                </span>
              </button>
            );
          })}
          </div>
        </div>

        {(scope === "company" || scope === "supplier") && !isSingleCompanyTenant && (
          <label className="mt-4 grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Company</span>
            <WorkbenchCompanyCodeField
              selected={selectedCompany}
              companies={companies}
              onSelect={applyEditorCompanySelection}
            />
          </label>
        )}

        {scope === "supplier" && (
          <label className="mt-4 grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Supplier</span>
            <SupplierPicker
              value={selectedSupplierId}
              displayLabel={selectedSupplierName}
              onChange={(id, label) => {
                setSelectedSupplierId(id);
                setSelectedSupplierName(label ?? "");
              }}
              field={WORKBENCH_SUPPLIER_FIELD}
              formData={{ company_code_id: selectedCompany?.id ?? null }}
              disabled={!selectedCompany?.id}
              placeholder={selectedCompany?.id ? "Search supplier..." : "Select company first"}
              className="min-w-0"
            />
          </label>
        )}

        <div className="mt-4 rounded-md border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          {isSingleCompanyTenant
            ? "Single-company tenant: company-specific setup is folded into the default. Add supplier exceptions only when vendor routing differs."
            : "Multi-company tenant: start with all companies, then add company or supplier exceptions only where behavior differs."}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col gap-3 overflow-auto">
        {!selected ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            Select a commodity category.
          </div>
        ) : (
          <>
            <EditorSnapshot row={selected} />
            <ScopeFirstEditorBody
              row={selected}
              scope={scope}
              isSingleCompanyTenant={isSingleCompanyTenant}
              selectedCompany={selectedCompany ?? undefined}
              apps={definition.relatedApps}
              returnToHref={returnToHref}
            />
          </>
        )}
      </section>

    </section>
  );
}

function MatrixSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {children}
      </select>
    </label>
  );
}

function spendMatrixRowsForScope(rows: CommodityCategoryRow[], scope: string): CommodityCategoryRow[] {
  const leaves = rows.filter((row) => row.parentId !== null);

  if (scope === "regulated") {
    return leaves.filter((row) => row.isRegulated || row.isHsRequired || row.isClassificationRequired);
  }

  if (scope === "overrides") {
    return leaves.filter((row) => row.companyPolicyCount + row.supplierPolicyCount + row.glDefaultCount > 0);
  }

  if (scope === "all") return leaves;

  return leaves.filter((row) => row.rootCategoryId === scope);
}

function spendMatrixSourceHref(definitionApps: TaxonomyRelatedApp[], source: SpendMatrixCellSource, column?: SpendMatrixCompany): string {
  const app = definitionApps.find((item) => item.entityCode === source.entityCode);
  if (!app) return "/app";
  if (!column || source.entityCode === "commodity_category") return app.href;
  const [path = app.href, query = ""] = app.href.split("?");
  const params = new URLSearchParams(query);
  params.set("q", column.key);
  forceServerSearchForQueryParam(params, "q");
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function SpendCategoryMatrix({
  rows,
  roots,
  summary,
  selected,
  onSelect,
}: {
  rows: CommodityCategoryRow[];
  roots: CommodityCategoryRow[];
  summary: CommodityCategorySummary;
  selected?: CommodityCategoryRow;
  onSelect: (row: CommodityCategoryRow) => void;
}) {
  const [rowScope, setRowScope] = useState("all");
  const [cellSourceKey, setCellSourceKey] = useState<SpendMatrixSourceKey>("company");
  const [selectedColumnKey, setSelectedColumnKey] = useState(SPEND_MATRIX_COMPANIES[1]?.key ?? SPEND_MATRIX_COMPANIES[0]?.key ?? null);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [hideEmptyRows, setHideEmptyRows] = useState(false);
  const definition = getTaxonomyWorkbenchDefinition("spend");
  const source = getSpendMatrixSource(cellSourceKey);
  const selectedColumn = SPEND_MATRIX_COMPANIES.find((company) => company.key === selectedColumnKey);

  const rowScopeOptions = useMemo(() => [
    { key: "all", label: "All leaf categories" },
    { key: "regulated", label: "Regulated categories" },
    { key: "overrides", label: "Policy overlays" },
    ...roots.map((root) => ({ key: root.id, label: `${root.name} root` })),
  ], [roots]);

  const scopedMatrixRows = useMemo(
    () => spendMatrixRowsForScope(rows, rowScope).sort((left, right) => (
      (left.rootName ?? "").localeCompare(right.rootName ?? "") ||
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name)
    )),
    [rowScope, rows],
  );

  const matrixRows = useMemo(
    () => hideEmptyRows ? scopedMatrixRows.filter((row) => source.coverage(row) > 0) : scopedMatrixRows,
    [hideEmptyRows, scopedMatrixRows, source],
  );

  const matrixCells = useMemo(
    () => buildSpendMatrixCells(matrixRows, SPEND_MATRIX_COMPANIES, source),
    [matrixRows, source],
  );

  const matrixAxisRows = useMemo<WorkbenchMatrixAxisItem[]>(() => matrixRows.map((row) => ({
    key: row.id,
    label: row.name,
    subLabel: row.code,
    badge: row.isRegulated ? (
      <Badge variant="outline" size="sm" className="border-warning/30 bg-warning/10 text-warning">
        regulated
      </Badge>
    ) : undefined,
  })), [matrixRows]);

  const selectedScope = rowScopeOptions.find((option) => option.key === rowScope);
  const columnCoverage = selectedColumnKey
    ? matrixCells.filter((cell) => cell.columnKey === selectedColumnKey && cell.isCovered !== false).length
    : 0;
  const gapCount = Math.max(0, matrixRows.length - columnCoverage);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      {matrixCells.length === 0 && (
        <div className="shrink-0 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          This view has no explicit rules yet. Empty cells inherit from the base category setup.
        </div>
      )}
    <WorkbenchMatrix
      rows={matrixAxisRows}
      columns={SPEND_MATRIX_COMPANIES}
      cells={matrixCells}
      rowHeaderLabel="Category"
      coverageHeaderLabel="Cov"
      emptyCellLabel="base"
      selectedRowKey={selected?.id ?? null}
      selectedColumnKey={selectedColumnKey}
      selectedCellKey={selectedCellKey}
      onSelectRow={(row) => {
        const next = matrixRows.find((item) => item.id === row.key);
        if (next) onSelect(next);
      }}
      onSelectColumn={(column) => {
        setSelectedColumnKey(column.key);
        setSelectedCellKey(null);
      }}
      onSelectCell={(cell, row, column) => {
        const next = matrixRows.find((item) => item.id === row.key);
        if (next) onSelect(next);
        setSelectedColumnKey(column.key);
        setSelectedCellKey(cell?.key ?? null);
      }}
      controls={
        <>
          <MatrixSelect label="Rows" value={rowScope} onChange={setRowScope}>
            {rowScopeOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </MatrixSelect>
          <MatrixSelect label="Cols" value="company-codes" onChange={() => undefined}>
            <option value="company-codes">Company codes</option>
          </MatrixSelect>
          <MatrixSelect label="Cells" value={cellSourceKey} onChange={(value) => setCellSourceKey(value as SpendMatrixSourceKey)}>
            {SPEND_MATRIX_CELL_SOURCES.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </MatrixSelect>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={hideEmptyRows}
              onChange={(event) => setHideEmptyRows(event.target.checked)}
              className="size-4"
            />
            Hide empty rows
          </label>
        </>
      }
      summary={`${matrixRows.length} of ${summary.leaves} rows / ${SPEND_MATRIX_COMPANIES.length} companies`}
      legend={source.legend}
      selection={selectedColumn ? {
        title: `Column ${selectedColumn.key} selected - ${columnCoverage} explicit rules, ${gapCount} inherited cells`,
        detail: `${source.label} / ${selectedScope?.label ?? "Selected rows"}`,
        actions: [
          {
            key: "open-source",
            label: "Edit selected rows",
            href: spendMatrixSourceHref(definition.relatedApps, source, selectedColumn),
          },
          {
            key: "apply-pattern",
            label: "Apply pattern from...",
            disabled: true,
          },
          {
            key: "promote-default",
            label: "Promote to tenant default",
            disabled: true,
          },
          {
            key: "export-column",
            label: "Export column",
            disabled: true,
          },
        ],
      } : undefined}
    />
    </section>
  );
}

export function CommodityCategoryWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modeParam = modeFromParam(searchParams.get("mode"));
  const selectedParam = searchParams.get("selected");
  const [activeMode, setActiveMode] = useState<TaxonomyWorkbenchMode>(() => modeParam ?? "overview");
  const [selectedId, setSelectedId] = useState<string | null>(() => selectedParam || null);
  const [hierarchySearch, setHierarchySearch] = useState("");
  const lastSearchKeyRef = useRef(searchParams.toString());
  const didInitialHistoryRestoreRef = useRef(false);
  const hierarchyModeEnabled = activeMode === "explorer" || activeMode === "classification";
  const fullModeEnabled = activeMode === "simulator" || activeMode === "editor" || activeMode === "matrix";
  const hierarchyTreeBatchSizeQuery = useCommodityCategoryTreeBatchSize({ enabled: hierarchyModeEnabled });
  const hierarchyTreeBatchSize = hierarchyTreeBatchSizeQuery.data ?? DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE;
  const summaryQuery = useCommodityCategorySummary();
  const fullQuery = useCommodityCategories({ enabled: fullModeEnabled });
  const hierarchy = useLazyCommodityCategoryHierarchy({
    enabled: hierarchyModeEnabled,
    search: hierarchySearch,
    limit: hierarchyTreeBatchSize,
  });
  const detailQuery = useCommodityCategoryDetail(selectedId, {
    enabled: hierarchyModeEnabled && !!selectedId,
  });
  const items = fullQuery.data?.items ?? [];
  const hierarchyItems = hierarchy.items;
  const summary = summaryQuery.data?.summary ?? fullQuery.data?.summary ?? EMPTY_SUMMARY;

  const roots = useMemo(
    () => items.filter((item) => item.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const selectedFromFull = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items.find((item) => item.parentId !== null) ?? items[0],
    [items, selectedId],
  );
  const selectedFromHierarchy = useMemo(
    () => detailQuery.data?.items[0] ?? hierarchyItems.find((item) => item.id === selectedId) ?? hierarchyItems[0],
    [detailQuery.data?.items, hierarchyItems, selectedId],
  );
  const selected = hierarchyModeEnabled ? selectedFromHierarchy : selectedFromFull;
  const returnToHref = workbenchReturnHref(activeMode, selected?.id ?? selectedId);

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    const searchKey = searchParams.toString();
    if (lastSearchKeyRef.current === searchKey) return;
    lastSearchKeyRef.current = searchKey;

    const nextParams = new URLSearchParams(searchKey);
    const nextMode = modeFromParam(nextParams.get("mode"));
    const nextSelectedId = nextParams.get("selected");
    if (nextMode) setActiveMode(nextMode);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }, [searchParams]);

  useEffect(() => {
    const refetchWorkbenchData = () => {
      void summaryQuery.refetch();
      if (fullModeEnabled) void fullQuery.refetch();
    };

    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!didInitialHistoryRestoreRef.current && navEntry?.type === "back_forward") {
      didInitialHistoryRestoreRef.current = true;
      refetchWorkbenchData();
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refetchWorkbenchData();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [fullModeEnabled, fullQuery.refetch, summaryQuery.refetch]);

  function handleModeChange(mode: TaxonomyWorkbenchMode) {
    setActiveMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", mode);
    if (selectedId) params.set("selected", selectedId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const definition = getTaxonomyWorkbenchDefinition("spend");
  const linkedPct = displayPct(summary.linkedIntent, summary.leaves);
  const policyPct = displayPct(summary.policyCategories, summary.leaves);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden">
      <TaxonomyWorkbenchHeader
        active="spend"
        activeMode={activeMode}
        onModeChange={handleModeChange}
        subtitle="Classify spend, resolve intent defaults, and manage company or supplier policy overlays"
        actions={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            title="Refresh taxonomy"
            aria-label="Refresh taxonomy"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {activeMode === "overview" ? (
        <>
          <SpendCategoryOverview
            summary={summary}
            linkedPct={linkedPct}
            policyPct={policyPct}
            apps={definition.relatedApps}
          />
          <WorkbenchContractFooter mode="overview" />
        </>
      ) : activeMode === "simulator" ? (
        fullQuery.isLoading ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground animate-pulse">
            Loading simulator inputs...
          </section>
        ) : fullQuery.isError ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-destructive">
            Spend taxonomy service is unavailable.
          </section>
        ) : (
          <>
            <SpendCategorySimulator
              rows={items}
              selected={selected}
              onSelect={(row) => setSelectedId(row.id)}
            />
            <WorkbenchContractFooter mode="simulator" />
          </>
        )
      ) : activeMode === "editor" ? (
        fullQuery.isLoading ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground animate-pulse">
            Loading editor context...
          </section>
        ) : fullQuery.isError ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-destructive">
            Spend taxonomy service is unavailable.
          </section>
        ) : (
          <>
            <SpendCategoryEditor
              rows={items}
              selected={selected}
              onSelect={(row) => setSelectedId(row.id)}
              returnToHref={returnToHref}
            />
            <WorkbenchContractFooter mode="editor" />
          </>
        )
      ) : activeMode === "matrix" ? (
        fullQuery.isLoading ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground animate-pulse">
            Loading spend matrix...
          </section>
        ) : fullQuery.isError ? (
          <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-sm text-destructive">
            Spend matrix service is unavailable.
          </section>
        ) : (
          <>
            <SpendCategoryMatrix
              rows={items}
              roots={roots}
              summary={summary}
              selected={selected}
              onSelect={(row) => setSelectedId(row.id)}
            />
            <WorkbenchContractFooter mode="matrix" />
          </>
        )
      ) : (
        <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <CategoryHierarchyRail
            items={hierarchyItems}
            totalCount={summary.total}
            selectedId={selected?.id}
            searchValue={hierarchySearch}
            isServerSearch
            loadingIds={hierarchy.loadingIds}
            onSelect={(row) => setSelectedId(row.id)}
            onSearchChange={setHierarchySearch}
            onLoadChildren={(row) => hierarchy.loadChildren(row.id)}
          />

          <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
            <section className="min-h-0 flex-1 overflow-hidden">
              {hierarchy.isLoading ? (
                <section className="flex h-full min-h-[360px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground animate-pulse">
                  Loading spend taxonomy...
                </section>
              ) : hierarchy.isError ? (
                <section className="flex h-full min-h-[360px] items-center justify-center rounded-lg border bg-card text-sm text-destructive">
                  Spend taxonomy service is unavailable.
                </section>
              ) : (
                activeMode === "classification" ? (
                  <SpendCategoryClassificationData
                    row={selected}
                    returnToHref={returnToHref}
                  />
                ) : (
                  <SpendCategoryExplorerData
                    row={selected}
                    rules={detailQuery.data?.rules ?? []}
                    rulesLoading={detailQuery.isLoading}
                    rulesError={detailQuery.isError}
                    returnToHref={returnToHref}
                  />
                )
              )}
            </section>
          </section>
        </section>
      )}
    </div>
  );
}
