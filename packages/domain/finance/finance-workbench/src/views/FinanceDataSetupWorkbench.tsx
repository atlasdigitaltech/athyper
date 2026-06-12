"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  GitBranch,
  Grid3X3,
  Layers,
  ListTree,
  Lock,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@athyper/ui/primitives";
import type { ChartOfAccount, LegalEntity } from "../data/types";
import { useCharts, useCompanyList } from "../hooks/useCharts";
import { useFiscalPeriods, type FiscalPeriodRow } from "../hooks/useFiscalPeriods";
import { useLegalEntities, useLedgerBookOptions, type LedgerBookOption } from "../hooks/useScopeOptions";
import { usePeriodStatus, type PeriodStatusData } from "../hooks/usePeriodStatus";
import type { FinanceScope } from "../lib/scope";

type SetupArea = "master" | "control" | "governance";
type ScopeClass = "T" | "C" | "O" | "T/O";
type ScenarioId = "single-company" | "multi-single-access" | "multi-multi-access" | "tenant-admin";
type DetailMode = "standard" | "profile-workbench" | "period-matrix" | "cycle-board";

interface ScenarioProfile {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  contextLabel: string;
  description: string;
  companyControl: "locked" | "dropdown" | "admin";
  legalEntityAccess: "hidden" | "read-only" | "editable";
  companyAccess: "read-only" | "editable";
  canCreateCompany: boolean;
  canUseAllCompanies: boolean;
}

interface CompanyOption {
  id?: string;
  code: string;
  name: string;
  tenant: string;
  currency: string;
  region: string;
}

interface SmartColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
}

interface SmartRow {
  id: string;
  code: string;
  name: string;
  status: string;
  company?: string;
  owner?: string;
  updated?: string;
  impact?: string;
  scopeDetail?: string;
  due?: string;
  [key: string]: string | undefined;
}

interface ChildSurface {
  id: string;
  label: string;
  table: string;
  scope: ScopeClass;
  rows: SmartRow[];
}

interface SmartEntity {
  id: string;
  label: string;
  table: string;
  scope: ScopeClass;
  description: string;
  detailMode?: DetailMode;
  defaultView?: "grid" | "tree" | "matrix" | "board";
  hiddenFor?: ScenarioId[];
  readOnlyFor?: ScenarioId[];
  columns?: SmartColumn[];
  rows: SmartRow[];
  children?: ChildSurface[];
  connectedHref?: string;
}

interface SetupSection {
  id: string;
  area: SetupArea;
  label: string;
  description: string;
  icon: LucideIcon;
  entities: SmartEntity[];
  recommendedPattern: string;
  improvement?: string;
}

const SCOPE_META: Record<ScopeClass, { label: string; shortLabel: string; className: string; reload: string }> = {
  T: {
    label: "Shared",
    shortLabel: "T",
    className: "border-primary/25 bg-primary/10 text-primary",
    reload: "Stable across company switches",
  },
  C: {
    label: "Company",
    shortLabel: "C",
    className: "border-info/25 bg-info/10 text-info",
    reload: "Reloads when company changes",
  },
  O: {
    label: "Operational",
    shortLabel: "O",
    className: "border-warning/30 bg-warning/10 text-warning",
    reload: "Runtime record, filtered by company and cycle",
  },
  "T/O": {
    label: "Shared + Runtime",
    shortLabel: "T/O",
    className: "border-success/30 bg-success/10 text-success",
    reload: "Shared definition with operational evidence",
  },
};

const SCENARIOS: ScenarioProfile[] = [
  {
    id: "single-company",
    label: "Scenario A: Single Company",
    shortLabel: "Single Co",
    contextLabel: "One company, fixed scope",
    description: "One tenant and one company code. Company is shown as a locked badge.",
    companyControl: "locked",
    legalEntityAccess: "hidden",
    companyAccess: "read-only",
    canCreateCompany: false,
    canUseAllCompanies: false,
  },
  {
    id: "multi-single-access",
    label: "Scenario B: Multi Company, Single Access",
    shortLabel: "Single Access",
    contextLabel: "Multi-company tenant, one granted company",
    description: "Company is locked, with tenant shown for orientation.",
    companyControl: "locked",
    legalEntityAccess: "hidden",
    companyAccess: "read-only",
    canCreateCompany: false,
    canUseAllCompanies: false,
  },
  {
    id: "multi-multi-access",
    label: "Scenario C: Multi Company, Multi Access",
    shortLabel: "Multi Access",
    contextLabel: "Company switcher with scoped reload",
    description: "User can switch among granted companies. Only C-scoped data reloads.",
    companyControl: "dropdown",
    legalEntityAccess: "read-only",
    companyAccess: "read-only",
    canCreateCompany: false,
    canUseAllCompanies: false,
  },
  {
    id: "tenant-admin",
    label: "Scenario D: Tenant Admin",
    shortLabel: "Tenant Admin",
    contextLabel: "All companies, rollout, and create",
    description: "Tenant administrator can create companies and manage shared setup.",
    companyControl: "admin",
    legalEntityAccess: "editable",
    companyAccess: "editable",
    canCreateCompany: true,
    canUseAllCompanies: true,
  },
];

const AREA_META: Record<SetupArea, { label: string; icon: LucideIcon; defaultSection: string; badge?: string }> = {
  master: { label: "Master", icon: Layers, defaultSection: "company" },
  control: { label: "Control", icon: SlidersHorizontal, defaultSection: "profiles" },
  governance: { label: "Governance", icon: ShieldCheck, defaultSection: "periods", badge: "3" },
};

const DEFAULT_COLUMNS: SmartColumn[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "company", label: "Company" },
  { key: "impact", label: "Impact" },
];

function row(id: string, code: string, name: string, status = "Active", extra: Omit<SmartRow, "id" | "code" | "name" | "status"> = {}): SmartRow {
  return { id, code, name, status, updated: "2026-05-18", ...extra };
}

function generatedRows(id: string, label: string, scope: ScopeClass): SmartRow[] {
  const company = scope === "T" ? "Shared" : scope === "O" ? "Runtime" : "ACME01";
  const impact = scope === "T" ? "All companies" : scope === "O" ? "Active cycle" : "Current company";
  return [
    row(`${id}-1`, `${id.toUpperCase().replaceAll("-", "_")}_01`, `${label} Default`, "Active", { company, impact, scopeDetail: SCOPE_META[scope].label }),
    row(`${id}-2`, `${id.toUpperCase().replaceAll("-", "_")}_02`, `${label} Regional`, scope === "O" ? "In Progress" : "Draft", {
      company,
      impact,
      scopeDetail: SCOPE_META[scope].label,
    }),
  ];
}

function entity(
  id: string,
  label: string,
  table: string,
  scope: ScopeClass,
  description: string,
  options: Partial<SmartEntity> = {},
): SmartEntity {
  return {
    id,
    label,
    table,
    scope,
    description,
    rows: options.rows ?? generatedRows(id, label, scope),
    detailMode: options.detailMode ?? "standard",
    columns: options.columns ?? DEFAULT_COLUMNS,
    children: options.children,
    hiddenFor: options.hiddenFor,
    readOnlyFor: options.readOnlyFor,
    defaultView: options.defaultView,
    connectedHref: options.connectedHref,
  };
}

const SETUP_SECTIONS: SetupSection[] = [
  {
    id: "company",
    area: "master",
    label: "Company Structure",
    icon: Building2,
    description: "Legal entity tree, company codes, assignments, and activations.",
    recommendedPattern: "Company is the anchor. Tenant admins edit legal structure; company users see scoped reference.",
    improvement: "Hide legal entities for Scenario A/B, but keep the company profile visible as read-only context.",
    entities: [
      entity("legal-entities", "Legal Entities", "master.legal_entity", "T", "Tenant legal hierarchy and consolidation ownership.", {
        hiddenFor: ["single-company", "multi-single-access"],
        readOnlyFor: ["multi-multi-access"],
        defaultView: "tree",
        rows: [
          row("le-root", "ATLAS", "Atlas Holdings", "Active", { company: "Shared", impact: "Group root", scopeDetail: "Shared" }),
          row("le-emea", "ATLAS-EMEA", "Atlas EMEA Holdings", "Active", { company: "Shared", impact: "4 companies", scopeDetail: "Shared" }),
          row("le-apac", "ATLAS-APAC", "Atlas APAC Holdings", "Active", { company: "Shared", impact: "3 companies", scopeDetail: "Shared" }),
        ],
      }),
      entity("companies", "Companies", "master.company_code", "C", "Company-code anchor record and status.", {
        readOnlyFor: ["single-company", "multi-single-access", "multi-multi-access"],
        rows: [],
      }),
      entity("company-coa-assignments", "COA Assignments", "master.company_code_chart_assignment", "C", "Operating, group, and local chart assignment by company."),
      entity("company-book-assignments", "Book Assignments", "master.company_code_book_assignment", "C", "Ledger books assigned to each company."),
      entity("company-gl-activations", "GL Activations", "master.company_code_gl_account", "C", "Company-specific GL account activation and posting flags."),
    ],
  },
  {
    id: "coa",
    area: "master",
    label: "Chart of Accounts",
    icon: ListTree,
    description: "COA headers, GL accounts, company activation, and chart mapping.",
    recommendedPattern: "Use tree and flat modes. Keep company GL activation as a sub-tab of GL account detail.",
    improvement: "Add impact badges so users know COA and GL edits are shared across companies.",
    entities: [
      entity("coa-headers", "COA Headers", "master.chart_of_account", "T", "Tenant-level chart catalogs.", {
        defaultView: "tree",
        connectedHref: "/workbench/finance/coa",
        rows: [
          row("coa-ifrs", "COA-IFRS", "IFRS Operating Chart", "Active", { company: "Shared", impact: "13 companies", scopeDetail: "Shared" }),
          row("coa-group", "COA-IFRS-GROUP", "IFRS Group Consolidation Chart", "Locked", { company: "Shared", impact: "All companies", scopeDetail: "Shared" }),
          row("coa-hgb", "COA-HGB", "HGB Local Chart", "Active", { company: "Shared", impact: "DE companies", scopeDetail: "Shared" }),
        ],
      }),
      entity("gl-accounts", "GL Accounts", "master.gl_account", "T", "Shared GL account definitions across charts.", {
        connectedHref: "/workbench/finance/coa?tab=explorer",
        children: [
          {
            id: "company-activations",
            label: "Company Activations",
            table: "master.company_code_gl_account",
            scope: "C",
            rows: generatedRows("company-activations", "Company Activations", "C"),
          },
        ],
      }),
      entity("coa-mappings", "COA Mapping", "control.book_posting_rule", "T", "Cross-chart translation and split allocations.", {
        connectedHref: "/workbench/finance/coa?tab=mapping",
        rows: [
          row("map-1", "SOCPA-A-CASH-OPER", "Operating Cash to Group Cash", "Active", { company: "Shared", impact: "Group reporting", scopeDetail: "Shared" }),
          row("map-2", "HGB-6300", "Rent split to SG&A and IT", "Active", { company: "Shared", impact: "Split 70/30", scopeDetail: "Shared" }),
        ],
      }),
    ],
  },
  {
    id: "books",
    area: "master",
    label: "Ledger Books",
    icon: BookOpenCheck,
    description: "Ledger books, company book assignments, and fiscal periods.",
    recommendedPattern: "Show book master as shared and fiscal periods as company scoped.",
    entities: [
      entity("ledger-books", "Books", "master.ledger_book", "T", "Shared ledger book definitions.", {
        rows: [
          row("book-local", "LOCAL", "Local Statutory Book", "Active", { company: "Shared", impact: "All companies", scopeDetail: "Shared" }),
          row("book-group", "GROUP", "Group Reporting Book", "Active", { company: "Shared", impact: "Consolidation", scopeDetail: "Shared" }),
        ],
      }),
      entity("fiscal-periods", "Fiscal Periods", "master.fiscal_period", "C", "Company-book fiscal periods and open/close status.", {
        rows: [
          row("fp-2026-01", "2026-01", "January 2026", "Open", { company: "ACME01", impact: "Posting allowed", scopeDetail: "Company" }),
          row("fp-2026-02", "2026-02", "February 2026", "Soft Close", { company: "ACME01", impact: "Controller only", scopeDetail: "Company" }),
        ],
      }),
      entity("book-assignments", "Company Assignments", "master.company_code_book_assignment", "C", "Which companies use which books."),
    ],
  },
  {
    id: "dimensions",
    area: "master",
    label: "Dimensions",
    icon: Network,
    description: "Dimension sets, cost/profit centers, projects, sites, and warehouses.",
    recommendedPattern: "Reload every grid on company switch. Tenant admin gets copy-from-company bulk action.",
    improvement: "Add coverage cards for required dimensions before posting rules are activated.",
    entities: [
      entity("dimension-sets", "Dimension Sets", "master.dimension_set", "C", "Active dimension combinations by company."),
      entity("cost-centers", "Cost Centers", "master.cost_center", "C", "Cost accounting responsibility centers."),
      entity("profit-centers", "Profit Centers", "master.profit_center", "C", "Profit reporting centers."),
      entity("projects", "Projects", "master.project", "C", "Project master with project items.", {
        children: [{ id: "project-items", label: "Project Items", table: "master.project_item", scope: "C", rows: generatedRows("project-items", "Project Items", "C") }],
      }),
      entity("sites", "Sites", "master.site", "C", "Operational sites by company."),
      entity("warehouses", "Warehouses", "master.warehouse", "C", "Storage locations by company."),
    ],
  },
  {
    id: "banking",
    area: "master",
    label: "Banking",
    icon: CreditCard,
    description: "Bank party registry, company bank accounts, links, and house config.",
    recommendedPattern: "Show bank parties as shared; bank accounts and house config reload by company.",
    entities: [
      entity("bank-parties", "Bank Parties", "master.bank_party", "T", "Bank institutions and branches."),
      entity("bank-accounts", "Bank Accounts", "master.bank_account", "C", "Company-owned bank accounts.", {
        children: [
          { id: "bank-links", label: "Links", table: "master.bank_account_link", scope: "C", rows: generatedRows("bank-links", "Bank Links", "C") },
          { id: "house-config", label: "House Config", table: "master.bank_account_house_config", scope: "C", rows: generatedRows("house-config", "House Config", "C") },
        ],
      }),
    ],
  },
  {
    id: "payment",
    area: "master",
    label: "Payment",
    icon: Wallet,
    description: "Payment methods and terms with clauses and discounts.",
    recommendedPattern: "Use parent detail panels for payment terms, clauses, and discount tiers.",
    entities: [
      entity("payment-methods", "Payment Methods", "master.payment_method", "T", "Cash, transfer, card, check, and gateway methods."),
      entity("payment-terms", "Payment Terms", "master.payment_term", "T", "Due dates, installments, and settlement terms.", {
        children: [
          { id: "term-clauses", label: "Clauses", table: "master.payment_term_clause", scope: "T", rows: generatedRows("term-clauses", "Payment Term Clauses", "T") },
          { id: "discount-tiers", label: "Discount Tiers", table: "master.payment_term_discount_tier", scope: "T", rows: generatedRows("discount-tiers", "Discount Tiers", "T") },
        ],
      }),
    ],
  },
  {
    id: "calendars",
    area: "master",
    label: "Calendars and Profiles",
    icon: CalendarDays,
    description: "Holiday calendars, holiday days, and print output profiles.",
    recommendedPattern: "Use list and month views for calendar days; keep print profiles in the same lane.",
    entities: [
      entity("holiday-calendars", "Holiday Calendars", "master.holiday_calendar", "T", "Tenant holiday calendar headers.", {
        children: [{ id: "holiday-days", label: "Calendar Days", table: "master.holiday_calendar_day", scope: "T", rows: generatedRows("holiday-days", "Holiday Days", "T") }],
      }),
      entity("print-profiles", "Print Profiles", "master.print_profile", "T", "Output format and print defaults."),
    ],
  },
  {
    id: "profiles",
    area: "control",
    label: "Accounting Profiles",
    icon: FileCheck2,
    description: "Parent profile plus commitment, revenue, settlement, events, templates, book rules, and dimension rules.",
    recommendedPattern: "This must be a 3-pane workbench, not eight flat pages.",
    improvement: "Add a test drawer that simulates the final debit/credit lines by event and company.",
    entities: [
      entity("acct-profiles", "Accounting Profiles", "control.acct_profile_config", "T", "Parent accounting profile configuration.", {
        detailMode: "profile-workbench",
        connectedHref: "/workbench/finance/accounting-profiles",
        children: [
          { id: "commitment", label: "Commitment", table: "control.acct_profile_commitment_config", scope: "T", rows: generatedRows("commitment", "Commitment Config", "T") },
          { id: "revenue", label: "Revenue", table: "control.acct_profile_revenue_config", scope: "T", rows: generatedRows("revenue", "Revenue Config", "T") },
          { id: "settlement", label: "Settlement", table: "control.acct_profile_settlement_config", scope: "T", rows: generatedRows("settlement", "Settlement Config", "T") },
          { id: "events", label: "Events", table: "control.acct_profile_event", scope: "T", rows: generatedRows("profile-events", "Profile Events", "T") },
          { id: "entry-templates", label: "Entry Templates", table: "control.acct_profile_entry_template", scope: "T", rows: generatedRows("entry-templates", "Entry Templates", "T") },
          { id: "book-rules", label: "Book Rules", table: "control.acct_profile_book_rule", scope: "T", rows: generatedRows("book-rules", "Book Rules", "T") },
          { id: "dimension-rules", label: "Dimension Rules", table: "control.acct_profile_dimension_rule", scope: "T", rows: generatedRows("dimension-rules", "Dimension Rules", "T") },
        ],
      }),
      entity("book-posting-rules", "Book Posting Rules", "control.book_posting_rule", "C", "Company-book posting behavior."),
      entity("supplier-overrides", "Supplier Overrides", "control.supplier_posting_override", "C", "Supplier-specific posting overrides."),
    ],
  },
  {
    id: "events",
    area: "control",
    label: "Transaction Events",
    icon: GitBranch,
    description: "Event catalog and transaction flow templates.",
    recommendedPattern: "Author events once, then bind profile tests and flow steps.",
    entities: [
      entity("event-catalog", "Event Catalog", "control.transaction_event_catalog", "T", "Known transaction events."),
      entity("flow-templates", "Flow Templates", "control.transaction_flow_template", "T", "Flow steps and accounting trigger mapping."),
    ],
  },
  {
    id: "intent-rules",
    area: "control",
    label: "Intent Rules",
    icon: Split,
    description: "Intent routing, company overrides, and supplier exceptions.",
    recommendedPattern: "Show a deterministic decision trace from intent to final profile.",
    entities: [
      entity("intent-profile-rules", "Intent to Profile Rules", "control.intent_to_accounting_profile_rule", "T", "Intent to accounting profile routing."),
      entity("intent-overrides", "Intent Overrides", "control.intent_profile_override", "C", "Company-level intent override."),
      entity("supplier-posting-overrides", "Supplier Overrides", "control.supplier_posting_override", "C", "Supplier-specific exception."),
    ],
  },
  {
    id: "dimension-controls",
    area: "control",
    label: "Dimension Controls",
    icon: Lock,
    description: "Dimension policies and allowed values by company.",
    recommendedPattern: "Policy detail should show allowed values, defaults, and violation examples.",
    entities: [
      entity("dimension-policies", "Dimension Policies", "control.dimension_policy", "C", "Company-level dimension requirement policy.", {
        children: [
          {
            id: "allowed-values",
            label: "Allowed Values",
            table: "control.dimension_policy_allowed_value",
            scope: "C",
            rows: generatedRows("allowed-values", "Allowed Dimension Values", "C"),
          },
        ],
      }),
      entity("company-posting-controls", "Company GL Posting Controls", "master.company_code_gl_account", "C", "Posting flags, reconciliation, subledger, and dimension requirements."),
    ],
  },
  {
    id: "tax",
    area: "control",
    label: "Tax",
    icon: ShieldCheck,
    description: "Tax schedules, groups, WHT thresholds, and rounding.",
    recommendedPattern: "Separate shared tax definitions from company thresholds and rounding rules.",
    entities: [
      entity("tax-rate-schedules", "Tax Rate Schedules", "control.tax_rate_schedule", "T", "Effective-dated rate schedules."),
      entity("tax-groups", "Tax Groups", "control.tax_group", "T", "Tax grouping definitions.", {
        children: [{ id: "tax-components", label: "Components", table: "control.tax_group_component", scope: "T", rows: generatedRows("tax-components", "Tax Components", "T") }],
      }),
      entity("wht-thresholds", "WHT Thresholds", "control.wht_threshold_config", "C", "Withholding threshold by company."),
      entity("rounding-rules", "Rounding Rules", "control.rounding_rule", "C", "Company-level rounding behavior."),
    ],
  },
  {
    id: "matching",
    area: "control",
    label: "Matching",
    icon: ArrowLeftRight,
    description: "Match tolerances for invoices, receipts, and payments.",
    recommendedPattern: "Use a compact tolerance grid with warning previews.",
    entities: [entity("match-tolerances", "Tolerance Configs", "control.match_tolerance_config", "C", "Company-level match tolerance configuration.")],
  },
  {
    id: "banking-controls",
    area: "control",
    label: "Banking Controls",
    icon: CreditCard,
    description: "Bank format rules, interfaces, method policies, bindings, settlement, and connectors.",
    recommendedPattern: "Treat connector type as shared catalog and settlement rules as company-specific rollout.",
    entities: [
      entity("bank-format-rules", "Bank Format Rules", "control.bank_format_rule", "T", "File format definitions."),
      entity("bank-interface-profiles", "Bank Interface Profiles", "control.bank_interface_profile", "T", "ERP to bank interface profiles."),
      entity("payment-method-policies", "Payment Method Policies", "control.payment_method_company_policy", "C", "Per-company payment method policy."),
      entity("method-interface-bindings", "Method Interface Bindings", "control.payment_method_interface_binding", "T", "Payment method to interface binding."),
      entity("settlement-rules", "Settlement Rules", "control.payment_settlement_rule", "C", "Payment settlement behavior by company."),
      entity("connector-types", "Connector Types", "control.connector_type", "T", "Connector registry.", { connectedHref: "/setup/integrations/connectors" }),
    ],
  },
  {
    id: "periods",
    area: "governance",
    label: "Period Close",
    icon: CalendarDays,
    description: "Book period status matrix with inline transitions.",
    recommendedPattern: "Use a books by periods matrix instead of a flat grid.",
    entities: [
      entity("book-period-status", "Book Period Status", "governance.book_period_status", "C", "Open, soft close, hard close, archived status.", {
        detailMode: "period-matrix",
        defaultView: "matrix",
        connectedHref: "/workbench/finance/close",
      }),
    ],
  },
  {
    id: "cycle-templates",
    area: "governance",
    label: "Cycle Templates",
    icon: FileText,
    description: "Cycle types, phases, categories, task templates, dependencies, and carryforward rules.",
    recommendedPattern: "Keep cycle template design separate from active cycle execution.",
    entities: [
      entity("cycle-types", "Cycle Types", "governance.cycle_type", "T", "Monthly close, year-end, and special cycle types."),
      entity("cycle-phases", "Cycle Phases", "governance.cycle_phase", "T", "Phase ordering per cycle type."),
      entity("task-categories", "Task Categories", "governance.cycle_task_category", "T", "Task grouping definitions."),
      entity("task-templates", "Task Templates", "governance.cycle_task_template", "T", "Reusable close task templates.", {
        connectedHref: "/setup/governance",
        children: [
          { id: "task-dependencies", label: "Dependencies", table: "governance.cycle_task_dependency", scope: "T", rows: generatedRows("task-dependencies", "Task Dependencies", "T") },
          { id: "carryforward", label: "Carryforward Rules", table: "governance.cycle_carryforward_rule", scope: "T", rows: generatedRows("carryforward", "Carryforward Rules", "T") },
        ],
      }),
    ],
  },
  {
    id: "cycle-runs",
    area: "governance",
    label: "Active Cycles",
    icon: Grid3X3,
    description: "Cycle runs, tasks, deviations, certifications, and cross dependencies.",
    recommendedPattern: "Use board and timeline views for phase progression and blockers.",
    entities: [
      entity("cycle-runs", "Cycle Runs", "governance.cycle_run", "O", "Runtime close cycle instances.", {
        detailMode: "cycle-board",
        defaultView: "board",
        connectedHref: "/governance/cycle-runs",
        children: [
          { id: "cycle-tasks", label: "Tasks", table: "governance.cycle_task", scope: "O", rows: generatedRows("cycle-tasks", "Cycle Tasks", "O") },
          { id: "deviations", label: "Deviations", table: "governance.cycle_deviation", scope: "O", rows: generatedRows("deviations", "Cycle Deviations", "O") },
          { id: "certifications", label: "Certifications", table: "governance.cycle_certification", scope: "O", rows: generatedRows("certifications", "Cycle Certifications", "O") },
          { id: "cross-dependencies", label: "Cross Dependencies", table: "governance.cycle_cross_dependency", scope: "O", rows: generatedRows("cross-dependencies", "Cross Dependencies", "O") },
        ],
      }),
    ],
  },
  {
    id: "reports",
    area: "governance",
    label: "Reports",
    icon: BarChart3,
    description: "Report pack definitions and close evidence output.",
    recommendedPattern: "Bind report packs to close cycles and legal evidence.",
    entities: [entity("report-packs", "Report Packs", "governance.report_pack", "T", "Report package definitions.")],
  },
  {
    id: "legal",
    area: "governance",
    label: "Legal",
    icon: ShieldCheck,
    description: "Legal holds and manifests for affected records.",
    recommendedPattern: "Treat legal holds as shared instructions with operational manifests.",
    entities: [
      entity("legal-holds", "Legal Holds", "governance.legal_hold", "T/O", "Legal hold definitions and active status.", {
        connectedHref: "/setup/governance/legal-holds",
        children: [{ id: "legal-hold-manifest", label: "Manifest", table: "governance.legal_hold_manifest", scope: "O", rows: generatedRows("legal-hold-manifest", "Legal Hold Manifest", "O") }],
      }),
    ],
  },
  {
    id: "moderation",
    area: "governance",
    label: "Moderation",
    icon: Users,
    description: "Flagged comment queue and moderation outcome.",
    recommendedPattern: "Keep operational moderation close to legal and audit governance.",
    entities: [entity("comment-moderation", "Comment Moderation", "governance.comment_moderation", "O", "Flagged comments and moderation state.", { connectedHref: "/setup/moderation" })],
  },
];

const SECTION_ALIASES: Record<string, string> = {
  intent_rules: "intent-rules",
  dimension_controls: "dimension-controls",
  banking_controls: "banking-controls",
  cycle_templates: "cycle-templates",
  cycle_runs: "cycle-runs",
  company_structure: "company",
  company_structure_old: "company",
  company: "company",
  accounting: "coa",
};

const LEGACY_FOCUS_MAP: Record<string, { area: SetupArea; section: string; entity?: string }> = {
  "company-structure": { area: "master", section: "company" },
  "books-periods": { area: "master", section: "books" },
  "dimensions-sites": { area: "master", section: "dimensions" },
  "banking-payments": { area: "master", section: "banking" },
  "posting-event-rules": { area: "control", section: "events" },
  "accounting-profiles": { area: "control", section: "profiles" },
  "intent-overrides": { area: "control", section: "intent-rules" },
  "dimension-tax-matching": { area: "control", section: "dimension-controls" },
  "posting-controls": { area: "master", section: "coa", entity: "company-gl-activations" },
  "bank-payment-interfaces": { area: "control", section: "banking-controls" },
  "coa-mapping": { area: "master", section: "coa", entity: "coa-mappings" },
};

function getSections(area: SetupArea): SetupSection[] {
  return SETUP_SECTIONS.filter((section) => section.area === area);
}

function getSection(area: SetupArea, id: string | null | undefined): SetupSection {
  const normalizedId = id ? SECTION_ALIASES[id] ?? id : AREA_META[area].defaultSection;
  return getSections(area).find((section) => section.id === normalizedId)
    ?? getSections(area)[0]!;
}

function isArea(value: string | undefined): value is SetupArea {
  return value === "master" || value === "control" || value === "governance";
}

function isScenario(value: string | null): value is ScenarioId {
  return SCENARIOS.some((scenario) => scenario.id === value);
}

function routeFromPath(pathname: string, searchParams: URLSearchParams): { area: SetupArea; section: string; entity?: string } {
  const parts = pathname.split("/").filter(Boolean);
  const setupIndex = parts.indexOf("setup");
  if (setupIndex >= 0) {
    const maybeArea = parts[setupIndex + 1];
    const area = isArea(maybeArea) ? maybeArea : "master";
    const rawSection = parts[setupIndex + 2] ?? AREA_META[area].defaultSection;
    const section = SECTION_ALIASES[rawSection] ?? rawSection;
    return { area, section };
  }

  const legacyFocus = searchParams.get("focus");
  if (legacyFocus && LEGACY_FOCUS_MAP[legacyFocus]) return LEGACY_FOCUS_MAP[legacyFocus];

  const legacyTab = searchParams.get("tab");
  if (legacyTab === "legal-entities") return { area: "master", section: "company", entity: "legal-entities" };
  if (legacyTab === "controls") return { area: "master", section: "coa", entity: "company-gl-activations" };
  if (legacyTab === "mapping") return { area: "master", section: "coa", entity: "coa-mappings" };
  if (isArea(legacyTab ?? undefined)) return { area: legacyTab as SetupArea, section: AREA_META[legacyTab as SetupArea].defaultSection };

  return { area: "master", section: "company" };
}

function ScopeBadge({ scope }: { scope: ScopeClass }) {
  const meta = SCOPE_META[scope];
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-medium text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function tableCount(area?: SetupArea) {
  return SETUP_SECTIONS
    .filter((section) => !area || section.area === area)
    .reduce((sum, section) => sum + section.entities.length + section.entities.reduce((childSum, entityConfig) => childSum + (entityConfig.children?.length ?? 0), 0), 0);
}

function tableSlug(table: string) {
  return table.split(".").pop() ?? table;
}

function entityAppHref(table: string) {
  return `/app/${tableSlug(table)}`;
}

function entitySurfaceHref(entityConfig: SmartEntity) {
  if (entityConfig.connectedHref) return entityConfig.connectedHref;
  if (entityConfig.id === "companies" || entityConfig.id.startsWith("company-")) return "/finance/setup/master/company";
  return entityAppHref(entityConfig.table);
}

function childSurfaceHref(parent: SmartEntity, surface: ChildSurface) {
  if (parent.detailMode === "profile-workbench" || parent.detailMode === "period-matrix" || parent.detailMode === "cycle-board") {
    return entitySurfaceHref(parent);
  }
  return entityAppHref(surface.table);
}

function surfaceTier(entityConfig: SmartEntity): "Tier 1" | "Tier 2" | "Tier 3" {
  if (entityConfig.id === "companies" || entityConfig.id.startsWith("company-")) return "Tier 3";
  const href = entitySurfaceHref(entityConfig);
  return href.startsWith("/app/") ? "Tier 1" : "Tier 2";
}

function surfaceTierDetail(entityConfig: SmartEntity) {
  const tier = surfaceTier(entityConfig);
  if (tier === "Tier 1") return "Entity app";
  if (tier === "Tier 2") return "Dedicated workbench";
  return "Setup-guided company surface";
}

function makeFallbackCompany(): CompanyOption {
  return {
    code: "COMPANY",
    name: "Current Company",
    tenant: "Current Tenant",
    currency: "USD",
    region: "Session scope",
  };
}

function fiscalYearNumber(label: string | null | undefined) {
  const parsed = Number(String(label ?? "").replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed >= 2000 ? parsed : new Date().getFullYear();
}

function fiscalYearLabel(year: number) {
  return `FY${year}`;
}

function fallbackFiscalYears(selectedYear: number) {
  const currentYear = new Date().getFullYear();
  return Array.from(new Set([selectedYear, currentYear, currentYear - 1, currentYear - 2]))
    .sort((a, b) => b - a)
    .map(fiscalYearLabel);
}

function displayStatus(status: string | null | undefined) {
  if (!status) return "Not Configured";
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function periodLabel(periodNumber: number) {
  if (periodNumber === 0) return "Open";
  if (periodNumber >= 13) return `Adj ${periodNumber - 12}`;
  return new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(2026, periodNumber - 1, 1));
}

function normalizeCompanyRows(rows: Array<{ id: string; code: string; name: string; functionalCurrency: string }>, tenant = "Current Tenant"): CompanyOption[] {
  return rows.map((company) => ({
    id: company.id,
    code: company.code,
    name: company.name,
    tenant,
    currency: company.functionalCurrency || "USD",
    region: "Granted company",
  }));
}

function companyRows(companies: CompanyOption[]): SmartRow[] {
  return companies.map((company) =>
    row(`co-${company.code}`, company.code, company.name, "Active", {
      company: company.code,
      impact: company.region,
      currency: company.currency,
      scopeDetail: "Company",
    }),
  );
}

function legalEntityRows(entities: LegalEntity[]): SmartRow[] {
  const childrenByParent = new Map<string, LegalEntity[]>();
  const roots: LegalEntity[] = [];
  const entityIds = new Set(entities.map((item) => item.id));

  for (const item of entities) {
    const parentId = item.parentId && entityIds.has(item.parentId) ? item.parentId : "";
    if (!parentId) roots.push(item);
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(item);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.code.localeCompare(b.code));
  }

  const ordered: SmartRow[] = [];
  const visited = new Set<string>();
  const makeRow = (item: LegalEntity, depth: number) =>
    row(item.id, item.code, item.name, displayStatus(item.status), {
      company: item.companyCodes.length > 0 ? item.companyCodes.join(", ") : "Shared",
      impact: item.entityType,
      currency: item.functionalCurrency,
      hasChildren: String((childrenByParent.get(item.id)?.length ?? 0) > 0),
      parentId: item.parentId ?? "",
      scopeDetail: "Shared",
      treeDepth: String(depth),
    });

  const visit = (item: LegalEntity, depth: number, ancestry: Set<string>) => {
    if (visited.has(item.id) || ancestry.has(item.id)) return;
    visited.add(item.id);
    ordered.push(makeRow(item, depth));
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(item.id);
    for (const child of childrenByParent.get(item.id) ?? []) {
      visit(child, depth + 1, nextAncestry);
    }
  };

  for (const root of roots.sort((a, b) => a.code.localeCompare(b.code))) {
    visit(root, 0, new Set());
  }

  for (const item of entities) {
    if (!visited.has(item.id)) ordered.push(makeRow(item, 0));
  }

  return ordered;
}

function chartRows(charts: ChartOfAccount[]): SmartRow[] {
  return charts.map((chart) =>
    row(chart.id, chart.code, chart.name, chart.isLocked ? "Locked" : "Active", {
      company: "Shared",
      impact: `${chart.accountCount} accounts`,
      scopeDetail: chart.tier,
      framework: chart.framework,
      country: chart.country ?? "Global",
    }),
  );
}

function ledgerBookRows(books: LedgerBookOption[]): SmartRow[] {
  return books.map((book) =>
    row(book.id, book.code, book.name, book.isPrimary ? "Primary" : "Active", {
      company: "Shared",
      impact: book.reportingStandard ?? book.category ?? "Ledger book",
      currency: book.baseCurrencyCode ?? "",
      scopeDetail: "Shared",
    }),
  );
}

function fiscalPeriodRows(periods: FiscalPeriodRow[], companyCode: string, fiscalYear: number): SmartRow[] {
  return periods.map((period) =>
    row(`fp-${fiscalYear}-${period.periodNumber}`, `${fiscalYear}-${String(period.periodNumber).padStart(2, "0")}`, periodLabel(period.periodNumber), displayStatus(period.status), {
      company: companyCode,
      impact: `${period.startDate} to ${period.endDate}`,
      scopeDetail: period.periodType === "adjustment" ? "Adjustment period" : "Company",
    }),
  );
}

interface LiveSetupContext {
  companies: CompanyOption[];
  legalEntities: LegalEntity[];
  charts: ChartOfAccount[];
  ledgerBooks: LedgerBookOption[];
  fiscalPeriods: FiscalPeriodRow[];
  companyCode: string;
  fiscalYear: number;
}

function withLiveRows(section: SetupSection, context: LiveSetupContext): SetupSection {
  return {
    ...section,
    entities: section.entities.map((entityConfig) => {
      let rows = entityConfig.rows;
      if (entityConfig.id === "companies") rows = companyRows(context.companies);
      else if (entityConfig.id === "legal-entities") rows = legalEntityRows(context.legalEntities);
      else if (entityConfig.id === "coa-headers") rows = chartRows(context.charts);
      else if (entityConfig.id === "ledger-books") rows = ledgerBookRows(context.ledgerBooks);
      else if (entityConfig.id === "fiscal-periods") rows = fiscalPeriodRows(context.fiscalPeriods, context.companyCode, context.fiscalYear);
      else if (entityConfig.scope === "C") {
        rows = entityConfig.rows.map((item) => ({ ...item, company: context.companyCode }));
      }
      return { ...entityConfig, rows };
    }),
  };
}

function useTenantAdminAccess(enabled: boolean) {
  return useQuery({
    queryKey: ["finance", "setup", "tenant-admin-access"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenant");
      return res.ok;
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

function deriveScenario(companyCount: number, tenantAdmin: boolean, devMode: boolean, mode: string | null): ScenarioProfile {
  if (devMode && isScenario(mode)) return SCENARIOS.find((scenario) => scenario.id === mode)!;
  if (tenantAdmin) return SCENARIOS.find((scenario) => scenario.id === "tenant-admin")!;
  if (companyCount > 1) return SCENARIOS.find((scenario) => scenario.id === "multi-multi-access")!;
  return SCENARIOS.find((scenario) => scenario.id === "single-company")!;
}

function statusVariant(status: string): "success" | "warning" | "muted" | "info" {
  const normalized = status.toLowerCase();
  if (normalized.includes("active") || normalized.includes("open") || normalized.includes("complete")) return "success";
  if (normalized.includes("draft") || normalized.includes("soft") || normalized.includes("progress")) return "warning";
  if (normalized.includes("locked")) return "info";
  return "muted";
}

function isEntityVisible(entityConfig: SmartEntity, scenario: ScenarioProfile) {
  return !(entityConfig.hiddenFor ?? []).includes(scenario.id);
}

function isEntityReadOnly(entityConfig: SmartEntity, scenario: ScenarioProfile) {
  if ((entityConfig.readOnlyFor ?? []).includes(scenario.id)) return true;
  if (entityConfig.id === "legal-entities" && scenario.legalEntityAccess !== "editable") return true;
  if (entityConfig.id === "companies" && scenario.companyAccess !== "editable") return true;
  if (entityConfig.scope === "C" && scenario.id !== "tenant-admin" && entityConfig.id.includes("assignment")) return true;
  return false;
}

function valueFor(rowValue: string | undefined) {
  return rowValue && rowValue.length > 0 ? rowValue : "-";
}

function makeSetupHref(area: SetupArea, section: string, searchParams: URLSearchParams, nextEntity?: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("tab");
  params.delete("focus");
  if (nextEntity) params.set("entity", nextEntity);
  else params.delete("entity");
  params.delete("row");
  const query = params.toString();
  return `/finance/setup/${area}/${section}${query ? `?${query}` : ""}`;
}

function TopTabs({
  activeArea,
  searchParams,
  onNavigate,
}: {
  activeArea: SetupArea;
  searchParams: URLSearchParams;
  onNavigate: (href: string) => void;
}) {
  return (
    <section className="shrink-0 border-b bg-card px-3 py-2">
      <Tabs value={activeArea} onValueChange={(value) => onNavigate(makeSetupHref(value as SetupArea, AREA_META[value as SetupArea].defaultSection, searchParams))}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {(Object.entries(AREA_META) as Array<[SetupArea, typeof AREA_META[SetupArea]]>).map(([area, meta]) => {
            const Icon = meta.icon;
            return (
              <TabsTrigger
                key={area}
                value={area}
                className="h-8 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Icon className="size-3.5" />
                {meta.label}
                {meta.badge && (
                  <span className="ml-0.5 rounded bg-warning px-1 text-xs leading-4 text-warning-foreground">
                    {meta.badge}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </section>
  );
}

function AdaptiveContextBar({
  scenario,
  companies,
  selectedCompany,
  fiscalYears,
  fiscalYear,
  allCompanies,
  devMode,
  onScenarioChange,
  onCompanyChange,
  onFiscalYearChange,
  onAllCompaniesChange,
  onNavigate,
}: {
  scenario: ScenarioProfile;
  companies: CompanyOption[];
  selectedCompany: CompanyOption;
  fiscalYears: string[];
  fiscalYear: string;
  allCompanies: boolean;
  devMode: boolean;
  onScenarioChange?: (scenario: ScenarioId) => void;
  onCompanyChange: (companyCode: string) => void;
  onFiscalYearChange: (year: string) => void;
  onAllCompaniesChange: (enabled: boolean) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <section className="shrink-0 border-b bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 min-w-0">
          <div className="text-xs font-medium text-foreground">{scenario.contextLabel}</div>
          <div className="text-xs text-muted-foreground">{scenario.description}</div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {devMode && onScenarioChange ? (
            <Select value={scenario.id} onValueChange={(value) => onScenarioChange(value as ScenarioId)}>
              <SelectTrigger className="h-8 w-[230px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="h-8 px-2">
              {scenario.shortLabel}
            </Badge>
          )}

          {scenario.canUseAllCompanies && (
            <Button
              type="button"
              variant={allCompanies ? "primary" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => onAllCompaniesChange(!allCompanies)}
            >
              <Layers className="size-3.5" />
              All Companies
            </Button>
          )}

          {scenario.companyControl === "locked" ? (
            <Badge variant="muted" className="h-8 px-2">
              Company: {selectedCompany.name} ({selectedCompany.code})
            </Badge>
          ) : (
            <Select value={selectedCompany.code} onValueChange={onCompanyChange}>
              <SelectTrigger className="h-8 w-[230px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.code} value={company.code}>
                    {company.name} ({company.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {scenario.id === "multi-single-access" && (
            <Badge variant="outline" className="h-8 px-2">
              Tenant: {selectedCompany.tenant}
            </Badge>
          )}

          <Select value={fiscalYear} onValueChange={onFiscalYearChange}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" size="sm" className="h-8">
            <RefreshCw className="size-3.5" />
            Sync
          </Button>

          {scenario.canCreateCompany && (
            <Button type="button" size="sm" className="h-8" onClick={() => onNavigate("/finance/setup/master/company?entity=companies")}>
              <Plus className="size-3.5" />
              Company Setup
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionSidebar({
  activeArea,
  activeSection,
  searchParams,
  onNavigate,
}: {
  activeArea: SetupArea;
  activeSection: SetupSection;
  searchParams: URLSearchParams;
  onNavigate: (href: string) => void;
}) {
  return (
    <aside className="min-h-0 border-r bg-card">
      <div className="border-b px-3 py-3">
        <div className="text-sm font-medium text-foreground">{AREA_META[activeArea].label} Sections</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {tableCount(activeArea)} tables across {getSections(activeArea).length} lanes
        </div>
      </div>
      <div className="min-h-0 p-2">
        {getSections(activeArea).map((section) => {
          const Icon = section.icon;
          const active = section.id === activeSection.id;
          const scopes = Array.from(new Set(section.entities.map((entityConfig) => entityConfig.scope)));
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onNavigate(makeSetupHref(activeArea, section.id, searchParams))}
              className={cn(
                "mb-1 w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                active ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-muted/60",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{section.label}</span>
                <ChevronRight className={cn("size-4 text-muted-foreground", active && "text-primary")} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1 pl-6">
                {scopes.map((scope) => (
                  <span key={scope} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {scope}
                  </span>
                ))}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {section.entities.length} views
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ReadinessStrip({ section, scenario, selectedCompany, allCompanies }: { section: SetupSection; scenario: ScenarioProfile; selectedCompany: CompanyOption; allCompanies: boolean }) {
  const sharedCount = section.entities
    .filter((entityConfig) => entityConfig.scope === "T" || entityConfig.scope === "T/O")
    .reduce((sum, entityConfig) => sum + entityConfig.rows.length, 0);
  const companyCount = section.entities
    .filter((entityConfig) => entityConfig.scope === "C")
    .reduce((sum, entityConfig) => sum + entityConfig.rows.length, 0);
  const operationalCount = section.entities
    .filter((entityConfig) => entityConfig.scope === "O" || entityConfig.scope === "T/O")
    .reduce((sum, entityConfig) => sum + entityConfig.rows.length, 0);
  const queryKey = allCompanies && scenario.id === "tenant-admin" ? "all-companies" : selectedCompany.code;

  return (
    <section className="grid gap-2 border-b bg-background p-3 md:grid-cols-4">
      <MetricCard label="Shared" value={String(sharedCount)} detail="T-scoped records loaded" />
      <MetricCard label="Company" value={String(companyCount)} detail={`C-scoped key: ${queryKey}`} />
      <MetricCard label="Operational" value={String(operationalCount)} detail="Runtime records loaded" />
      <MetricCard label="Mode" value={scenario.shortLabel} detail={scenario.companyControl === "admin" ? "Admin routing enabled" : "Navigator only"} />
    </section>
  );
}

function EntityTabs({
  section,
  activeEntity,
  scenario,
  searchParams,
  activeArea,
  onNavigate,
}: {
  section: SetupSection;
  activeEntity: SmartEntity;
  scenario: ScenarioProfile;
  searchParams: URLSearchParams;
  activeArea: SetupArea;
  onNavigate: (href: string) => void;
}) {
  const visibleEntities = section.entities.filter((entityConfig) => isEntityVisible(entityConfig, scenario));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibleEntities.map((entityConfig) => (
        <button
          key={entityConfig.id}
          type="button"
          onClick={() => onNavigate(makeSetupHref(activeArea, section.id, searchParams, entityConfig.id))}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            entityConfig.id === activeEntity.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted",
          )}
        >
          {entityConfig.label}
          <span
            className={cn(
              "rounded px-1 text-xs",
              entityConfig.id === activeEntity.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {entityConfig.scope}
          </span>
        </button>
      ))}
    </div>
  );
}

function EntityToolbar({
  section,
  activeEntity,
  scenario,
  selectedCompany,
  allCompanies,
  search,
  view,
  searchParams,
  activeArea,
  onSearch,
  onNavigate,
  onViewChange,
}: {
  section: SetupSection;
  activeEntity: SmartEntity;
  scenario: ScenarioProfile;
  selectedCompany: CompanyOption;
  allCompanies: boolean;
  search: string;
  view: string;
  searchParams: URLSearchParams;
  activeArea: SetupArea;
  onSearch: (value: string) => void;
  onNavigate: (href: string) => void;
  onViewChange: (value: string) => void;
}) {
  const readOnly = isEntityReadOnly(activeEntity, scenario);
  return (
    <div className="space-y-2 border-b bg-card px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium text-foreground">{section.label}</h2>
            <ScopeBadge scope={activeEntity.scope} />
            {readOnly && <Badge variant="muted">Read-only</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scenario.id === "tenant-admin" && section.id === "dimensions" && (
            <Badge variant="info" className="h-8 px-2">
              Copy from company available in entity app
            </Badge>
          )}
          <Button type="button" size="sm" className="h-8" onClick={() => onNavigate(entitySurfaceHref(activeEntity))}>
            Open
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EntityTabs
          section={section}
          activeEntity={activeEntity}
          scenario={scenario}
          searchParams={searchParams}
          activeArea={activeArea}
          onNavigate={onNavigate}
        />
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search setup..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button type="button" variant={view === "grid" ? "primary" : "outline"} size="icon" className="size-8" title="Grid view" onClick={() => onViewChange("grid")}>
            <Grid3X3 className="size-3.5" />
          </Button>
          <Button type="button" variant={view === "tree" ? "primary" : "outline"} size="icon" className="size-8" title="Tree view" onClick={() => onViewChange("tree")}>
            <ListTree className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
        {SCOPE_META[activeEntity.scope].reload}. Active company scope is{" "}
        <span className="font-medium text-foreground">{allCompanies && scenario.id === "tenant-admin" ? "All Companies" : selectedCompany.code}</span>.
        This portal is navigator-only; editing opens in {surfaceTier(activeEntity)} ({surfaceTierDetail(activeEntity)}).
      </div>
    </div>
  );
}

function SmartTable({
  entityConfig,
  rows,
  selectedRow,
  onSelectRow,
}: {
  entityConfig: SmartEntity;
  rows: SmartRow[];
  selectedRow: SmartRow | null;
  onSelectRow: (rowId: string) => void;
}) {
  const columns = entityConfig.columns ?? DEFAULT_COLUMNS;
  return (
    <div className="min-h-0 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="w-10 px-2 py-2 text-left text-xs font-medium text-muted-foreground">Scope</th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-2 py-2 text-xs font-medium text-muted-foreground",
                  column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No records found for this setup surface.
              </td>
            </tr>
          )}
          {rows.map((item) => {
            const active = selectedRow?.id === item.id;
            return (
              <tr
                key={item.id}
                className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/40", active && "bg-primary/10")}
                onClick={() => onSelectRow(item.id)}
              >
                <td className="px-2 py-2">
                  <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", SCOPE_META[entityConfig.scope].className)}>
                    {SCOPE_META[entityConfig.scope].shortLabel}
                  </span>
                </td>
                {columns.map((column) => (
                  <td
                    key={`${item.id}-${column.key}`}
                    className={cn(
                      "px-2 py-2 text-xs",
                      column.key === "code" && "tabular-nums font-medium text-foreground",
                      column.key === "name" && "font-medium text-foreground",
                      column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {column.key === "status" ? (
                      <Badge variant={statusVariant(item.status)} size="sm">
                        {item.status}
                      </Badge>
                    ) : (
                      <span className={column.key === "impact" ? "text-muted-foreground" : undefined}>{valueFor(item[column.key])}</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChildSurfaceList({
  parent,
  childrenSurfaces,
  onNavigate,
}: {
  parent: SmartEntity;
  childrenSurfaces: ChildSurface[];
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="space-y-3">
      {childrenSurfaces.map((surface) => (
        <div key={surface.id} className="rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <div className="text-sm font-medium text-foreground">{surface.label}</div>
            <ScopeBadge scope={surface.scope} />
            <span className="ml-auto tabular-nums text-xs text-muted-foreground">{surface.table}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => onNavigate(childSurfaceHref(parent, surface))}>
              Open
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
          <div className="divide-y">
            {surface.rows.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="tabular-nums text-foreground">{item.code}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.name}</span>
                <Badge variant={statusVariant(item.status)} size="sm">{item.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StandardDetailPanel({
  entityConfig,
  selectedRow,
  scenario,
  onNavigate,
}: {
  entityConfig: SmartEntity;
  selectedRow: SmartRow | null;
  scenario: ScenarioProfile;
  onNavigate: (href: string) => void;
}) {
  const readOnly = isEntityReadOnly(entityConfig, scenario);
  const href = entitySurfaceHref(entityConfig);
  return (
    <aside className="min-h-0 border-l bg-card">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{entityConfig.label} Surface</h3>
            <ScopeBadge scope={entityConfig.scope} />
            <Badge variant="muted">{surfaceTier(entityConfig)}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{entityConfig.description}</p>
        </div>
      </div>
      <div className="min-h-0 p-4">
        {selectedRow ? (
          <div className="space-y-4">
            <div className={cn("rounded-lg border p-3", entityConfig.scope === "T" || entityConfig.scope === "T/O" ? "border-primary/20 bg-primary/5" : "bg-background")}>
              <div className="text-xs font-medium text-muted-foreground">Navigation Impact</div>
              <p className="mt-1 text-sm text-foreground">
                {entityConfig.scope === "T" || entityConfig.scope === "T/O"
                  ? "Shared setup. Open the owning surface before making tenant-wide changes."
                  : entityConfig.scope === "C"
                    ? "Company setup. The linked surface opens with the active company context."
                    : "Operational record. Use the runtime workbench for task or cycle actions."}
              </p>
            </div>

            <div className="grid gap-3">
              {[
                ["Code", selectedRow.code],
                ["Name", selectedRow.name],
                ["Status", selectedRow.status],
                ["Table", entityConfig.table],
                ["Tier", `${surfaceTier(entityConfig)} - ${surfaceTierDetail(entityConfig)}`],
                ["Route", href],
                ["Company", selectedRow.company ?? SCOPE_META[entityConfig.scope].label],
                ["Owner", selectedRow.owner ?? "Finance setup owner"],
                ["Updated", selectedRow.updated ?? "2026-05-18"],
              ].map(([label, value]) => (
                <label key={label} className="block">
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <div className="mt-1 rounded-md border bg-background px-3 py-2 text-sm text-foreground">{value}</div>
                </label>
              ))}
            </div>

            {entityConfig.children && <ChildSurfaceList parent={entityConfig} childrenSurfaces={entityConfig.children} onNavigate={onNavigate} />}

            <div className="rounded-lg border bg-background p-3">
              <div className="text-sm font-medium text-foreground">Portal Rule</div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <div>No inline edits are saved here.</div>
                <div>Tier 1 opens the generic entity app.</div>
                <div>Tier 2 opens a dedicated finance or governance workbench.</div>
              </div>
            </div>

            <Button type="button" size="sm" className="h-8" onClick={() => onNavigate(href)}>
              Open {surfaceTier(entityConfig)} Surface
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
            <div>No row is selected for this surface.</div>
            <Button type="button" size="sm" className="h-8" onClick={() => onNavigate(href)}>
              Open {surfaceTier(entityConfig)} Surface
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <Badge variant={readOnly ? "muted" : "info"}>{readOnly ? "Controlled surface" : "Editable in target"}</Badge>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onNavigate(href)}>
          Open
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </aside>
  );
}

function AccountingProfileWorkbench({
  entityConfig,
  selectedRow,
  activeSubtab,
  onSubtabChange,
  onNavigate,
}: {
  entityConfig: SmartEntity;
  selectedRow: SmartRow | null;
  activeSubtab: string;
  onSubtabChange: (value: string) => void;
  onNavigate: (href: string) => void;
}) {
  const childTabs = entityConfig.children ?? [];
  const selectedChild = childTabs.find((child) => child.id === activeSubtab) ?? childTabs[0];
  const href = entitySurfaceHref(entityConfig);

  return (
    <div className="grid min-h-0 overflow-visible lg:grid-cols-[250px_minmax(0,1fr)_340px]">
      <div className="min-h-0 border-r bg-card p-2">
        <div className="px-2 py-2 text-xs font-medium text-muted-foreground">Profile catalog</div>
        {entityConfig.rows.map((profile) => (
          <button key={profile.id} type="button" className="mb-1 w-full rounded-md border border-transparent bg-background px-2 py-2 text-left hover:bg-muted">
            <div className="tabular-nums text-xs font-medium text-foreground">{profile.code}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{profile.name}</div>
          </button>
        ))}
      </div>
      <div className="min-h-0 border-r bg-background">
        <div className="border-b bg-card px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{selectedRow?.name ?? "Accounting Profile Workbench"}</h3>
            <ScopeBadge scope="T" />
            <Badge variant="muted">Tier 2</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This portal shows the owning child surfaces. Editing, posting simulation, and test runs live in the dedicated workbench.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 border-b bg-card px-3 py-2">
          {childTabs.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onSubtabChange(child.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium",
                (selectedChild?.id ?? "") === child.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {child.label}
            </button>
          ))}
        </div>
        <div className="p-3">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div className="text-sm font-medium text-foreground">{selectedChild?.label}</div>
              {selectedChild && <ScopeBadge scope={selectedChild.scope} />}
              <span className="ml-auto tabular-nums text-xs text-muted-foreground">{selectedChild?.table}</span>
            </div>
            <div className="divide-y">
              {(selectedChild?.rows ?? []).map((item) => (
                <div key={item.id} className="grid grid-cols-[120px_minmax(0,1fr)_90px] items-center gap-2 px-3 py-2 text-xs">
                  <span className="tabular-nums font-medium text-foreground">{item.code}</span>
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <Badge variant={statusVariant(item.status)} size="sm">{item.status}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-lg border bg-card p-3">
            <div className="text-sm font-medium text-foreground">Tier 2 Ownership</div>
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
              <div className="rounded-md bg-muted px-2 py-2">Parent profile plus 7 children</div>
              <div className="rounded-md bg-muted px-2 py-2">Posting simulation in workbench</div>
              <div className="rounded-md bg-success/10 px-2 py-2 text-success">No portal saves</div>
            </div>
          </div>
        </div>
      </div>
      <aside className="min-h-0 bg-card p-4">
        <div className="text-sm font-medium text-foreground">Open Dedicated Workbench</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Accounting profiles are an IDE-style surface. The setup portal keeps the map visible, then hands off to the real editor.
        </p>
        <div className="mt-4 space-y-3">
          {[
            ["Tier", `${surfaceTier(entityConfig)} - ${surfaceTierDetail(entityConfig)}`],
            ["Route", href],
            ["Selected", selectedRow?.code ?? "None"],
            ["Child Surface", selectedChild?.table ?? "Overview"],
          ].map(([label, value]) => (
            <label key={label} className="block">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <div className="mt-1 rounded-md border bg-background px-3 py-2 text-sm text-foreground">
                {value}
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" className="h-8" onClick={() => onNavigate(href)}>
            Open Workbench
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </aside>
    </div>
  );
}

function PeriodMatrix({
  selectedCompany,
  fiscalYear,
  allCompanies,
  scenario,
  onNavigate,
}: {
  selectedCompany: CompanyOption;
  fiscalYear: number;
  allCompanies: boolean;
  scenario: ScenarioProfile;
  onNavigate: (href: string) => void;
}) {
  const scope = useMemo<FinanceScope>(() => ({
    scopeType: allCompanies && scenario.id === "tenant-admin" ? "group" : "company",
    scopeId: allCompanies && scenario.id === "tenant-admin" ? "GROUP" : selectedCompany.code,
    fiscalYear,
    period: null,
    currency: selectedCompany.currency,
  }), [allCompanies, fiscalYear, scenario.id, selectedCompany.code, selectedCompany.currency]);
  const { data: periodStatuses = [], isLoading } = usePeriodStatus(scope);
  const periodNumbers = useMemo(() => {
    const values = Array.from(new Set(periodStatuses.map((item) => item.periodNumber))).sort((a, b) => a - b);
    return values.length > 0 ? values : Array.from({ length: 12 }, (_, index) => index + 1);
  }, [periodStatuses]);
  const statusByPeriod = useMemo(() => {
    return periodStatuses.reduce<Record<number, PeriodStatusData>>((acc, item) => {
      acc[item.periodNumber] = item;
      return acc;
    }, {});
  }, [periodStatuses]);
  return (
    <div className="min-h-0 bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="muted">{allCompanies && scenario.id === "tenant-admin" ? "All companies matrix" : selectedCompany.code}</Badge>
        <Badge variant="outline">FY{fiscalYear}</Badge>
        <Button type="button" size="sm" className="h-8" onClick={() => onNavigate("/workbench/finance/close")}>
          Open Close Workbench
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Scope</th>
              {periodNumbers.map((period) => (
                <th key={period} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{periodLabel(period)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b last:border-0">
              <td className="px-3 py-2 tabular-nums text-xs font-medium text-foreground">
                {allCompanies && scenario.id === "tenant-admin" ? "GROUP" : selectedCompany.code}
              </td>
              {periodNumbers.map((period) => {
                const rowStatus = statusByPeriod[period];
                const status = displayStatus(rowStatus?.effectiveStatus ?? rowStatus?.bookPeriodStatus ?? rowStatus?.fiscalPeriodStatus);
                return (
                  <td key={period} className="px-3 py-2 text-center">
                    <Badge variant={statusVariant(status)} size="sm">{isLoading ? "Loading" : status}</Badge>
                  </td>
                );
              })}
            </tr>
            {periodStatuses.length === 0 && !isLoading && (
              <tr>
                <td colSpan={periodNumbers.length + 1} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No period status rows returned for this scope. Open the close workbench to initialize or inspect book-specific status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CycleBoard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const lanes = [
    { label: "Not Started", items: ["Intercompany confirmation", "Tax provision refresh"] },
    { label: "In Progress", items: ["Bank reconciliation", "Accrual review"] },
    { label: "Blocked", items: ["AP cutoff certification"] },
    { label: "Certified", items: ["Trial balance review", "Report pack draft"] },
  ];

  return (
    <div className="min-h-0 bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="muted">Operational preview</Badge>
        <Button type="button" size="sm" className="h-8" onClick={() => onNavigate("/governance/cycle-runs")}>
          Open Cycle Runs
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
      <div className="grid min-w-[860px] gap-3 lg:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.label} className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-sm font-medium text-foreground">{lane.label}</div>
            <div className="space-y-2 p-2">
              {lane.items.map((item) => (
                <div key={item} className="rounded-md border bg-background p-3">
                  <div className="text-sm font-medium text-foreground">{item}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Owner: Controller</span>
                    <span>Due May 28</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkbenchBody({
  activeArea,
  activeSection,
  activeEntity,
  selectedRow,
  scenario,
  selectedCompany,
  fiscalYear,
  allCompanies,
  search,
  view,
  subtab,
  searchParams,
  onSearch,
  onNavigate,
  onViewChange,
  onSelectRow,
  onSubtabChange,
}: {
  activeArea: SetupArea;
  activeSection: SetupSection;
  activeEntity: SmartEntity;
  selectedRow: SmartRow | null;
  scenario: ScenarioProfile;
  selectedCompany: CompanyOption;
  fiscalYear: string;
  allCompanies: boolean;
  search: string;
  view: string;
  subtab: string;
  searchParams: URLSearchParams;
  onSearch: (value: string) => void;
  onNavigate: (href: string) => void;
  onViewChange: (value: string) => void;
  onSelectRow: (rowId: string) => void;
  onSubtabChange: (value: string) => void;
}) {
  const filteredRows = activeEntity.rows.filter((item) => {
    const haystack = `${item.code} ${item.name} ${item.status} ${item.company ?? ""} ${item.impact ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  if (activeEntity.detailMode === "profile-workbench") {
    return (
      <main className="grid items-start overflow-visible xl:grid-cols-[260px_minmax(0,1fr)]">
        <SectionSidebar activeArea={activeArea} activeSection={activeSection} searchParams={searchParams} onNavigate={onNavigate} />
        <div className="min-w-0 overflow-visible">
          <EntityToolbar
            section={activeSection}
            activeEntity={activeEntity}
            scenario={scenario}
            selectedCompany={selectedCompany}
            allCompanies={allCompanies}
            search={search}
            view={view}
            searchParams={searchParams}
            activeArea={activeArea}
            onSearch={onSearch}
            onNavigate={onNavigate}
            onViewChange={onViewChange}
          />
          <AccountingProfileWorkbench
            entityConfig={activeEntity}
            selectedRow={selectedRow}
            activeSubtab={subtab}
            onSubtabChange={onSubtabChange}
            onNavigate={onNavigate}
          />
        </div>
      </main>
    );
  }

  if (activeEntity.detailMode === "period-matrix") {
    return (
      <main className="grid items-start overflow-visible xl:grid-cols-[260px_minmax(0,1fr)]">
        <SectionSidebar activeArea={activeArea} activeSection={activeSection} searchParams={searchParams} onNavigate={onNavigate} />
        <div className="min-w-0 overflow-visible">
          <EntityToolbar
            section={activeSection}
            activeEntity={activeEntity}
            scenario={scenario}
            selectedCompany={selectedCompany}
            allCompanies={allCompanies}
            search={search}
            view={view}
            searchParams={searchParams}
            activeArea={activeArea}
            onSearch={onSearch}
            onNavigate={onNavigate}
            onViewChange={onViewChange}
          />
          <PeriodMatrix selectedCompany={selectedCompany} fiscalYear={fiscalYearNumber(fiscalYear)} allCompanies={allCompanies} scenario={scenario} onNavigate={onNavigate} />
        </div>
      </main>
    );
  }

  if (activeEntity.detailMode === "cycle-board") {
    return (
      <main className="grid items-start overflow-visible xl:grid-cols-[260px_minmax(0,1fr)]">
        <SectionSidebar activeArea={activeArea} activeSection={activeSection} searchParams={searchParams} onNavigate={onNavigate} />
        <div className="min-w-0 overflow-visible">
          <EntityToolbar
            section={activeSection}
            activeEntity={activeEntity}
            scenario={scenario}
            selectedCompany={selectedCompany}
            allCompanies={allCompanies}
            search={search}
            view={view}
            searchParams={searchParams}
            activeArea={activeArea}
            onSearch={onSearch}
            onNavigate={onNavigate}
            onViewChange={onViewChange}
          />
          <CycleBoard onNavigate={onNavigate} />
        </div>
      </main>
    );
  }

  return (
    <main className="grid items-start overflow-visible xl:grid-cols-[260px_minmax(0,1fr)]">
      <SectionSidebar activeArea={activeArea} activeSection={activeSection} searchParams={searchParams} onNavigate={onNavigate} />
      <div className="grid min-w-0 items-start overflow-visible lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 overflow-visible">
          <EntityToolbar
            section={activeSection}
            activeEntity={activeEntity}
            scenario={scenario}
            selectedCompany={selectedCompany}
            allCompanies={allCompanies}
            search={search}
            view={view}
            searchParams={searchParams}
            activeArea={activeArea}
            onSearch={onSearch}
            onNavigate={onNavigate}
            onViewChange={onViewChange}
          />
          <ReadinessStrip section={activeSection} scenario={scenario} selectedCompany={selectedCompany} allCompanies={allCompanies} />
          {view === "tree" ? (
            <div className="min-h-0 bg-background p-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="mb-3 text-sm font-medium text-foreground">Tree Preview</div>
                {filteredRows.map((item) => {
                  const depth = Math.min(Number(item.treeDepth ?? "0") || 0, 5);
                  const hasChildren = item.hasChildren === "true";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectRow(item.id)}
                      className={cn(
                        "mb-1 grid w-full grid-cols-[1rem_minmax(7rem,10rem)_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted",
                        selectedRow?.id === item.id && "bg-primary/10",
                      )}
                      style={{ paddingLeft: `${12 + depth * 20}px` }}
                    >
                      <ChevronRight className={cn("size-3.5 text-muted-foreground", !hasChildren && "opacity-0")} />
                      <span className="truncate tabular-nums text-xs text-foreground">{item.code}</span>
                      <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <SmartTable entityConfig={activeEntity} rows={filteredRows} selectedRow={selectedRow} onSelectRow={onSelectRow} />
          )}
        </div>
        <StandardDetailPanel entityConfig={activeEntity} selectedRow={selectedRow} scenario={scenario} onNavigate={onNavigate} />
      </div>
    </main>
  );
}

export function FinanceDataSetupWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const route = routeFromPath(pathname, searchParams);
  const activeArea = route.area;
  const baseSection = getSection(activeArea, route.section);
  const requestedFiscalYear = fiscalYearNumber(searchParams.get("fy"));
  const fiscalYear = fiscalYearLabel(requestedFiscalYear);
  const devMode = searchParams.get("__devMode") === "1";
  const { data: companyList = [] } = useCompanyList();
  const { data: charts = [] } = useCharts();
  const { data: legalEntities = [] } = useLegalEntities();
  const companyOptions = useMemo(() => {
    const liveCompanies = normalizeCompanyRows(companyList);
    return liveCompanies.length > 0 ? liveCompanies : [makeFallbackCompany()];
  }, [companyList]);
  const selectedCompany = companyOptions.find((company) => company.code === searchParams.get("company")) ?? companyOptions[0]!;
  const tenantAdminAccess = useTenantAdminAccess(!devMode);
  const scenario = deriveScenario(companyList.length, tenantAdminAccess.data ?? false, devMode, searchParams.get("mode"));
  const scope = useMemo<FinanceScope>(() => ({
    scopeType: "company",
    scopeId: selectedCompany.code,
    fiscalYear: requestedFiscalYear,
    period: null,
    currency: selectedCompany.currency,
  }), [requestedFiscalYear, selectedCompany.code, selectedCompany.currency]);
  const { data: fiscalPeriods = [] } = useFiscalPeriods(selectedCompany.code, requestedFiscalYear);
  const { data: ledgerBooks = [] } = useLedgerBookOptions(scope);
  const fiscalYears = useMemo(() => fallbackFiscalYears(requestedFiscalYear), [requestedFiscalYear]);
  const activeSection = useMemo(() => withLiveRows(baseSection, {
    companies: companyOptions,
    legalEntities,
    charts,
    ledgerBooks,
    fiscalPeriods,
    companyCode: selectedCompany.code,
    fiscalYear: requestedFiscalYear,
  }), [baseSection, charts, companyOptions, fiscalPeriods, ledgerBooks, legalEntities, requestedFiscalYear, selectedCompany.code]);
  const allCompanies = searchParams.get("allCompanies") === "true";
  const search = searchParams.get("q") ?? "";
  const visibleEntities = activeSection.entities.filter((entityConfig) => isEntityVisible(entityConfig, scenario));
  const routeEntity = route.entity ?? searchParams.get("entity");
  const activeEntity = visibleEntities.find((entityConfig) => entityConfig.id === routeEntity) ?? visibleEntities[0] ?? activeSection.entities[0]!;
  const view = searchParams.get("view") ?? activeEntity.defaultView ?? "grid";
  const selectedRow = activeEntity.rows.find((item) => item.id === searchParams.get("row")) ?? activeEntity.rows[0] ?? null;
  const subtab = searchParams.get("subtab") ?? activeEntity.children?.[0]?.id ?? "overview";

  const navigate = useCallback((href: string) => {
    router.replace(href, { scroll: false });
  }, [router]);

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchKey);
    next.delete("tab");
    next.delete("focus");
    mutate(next);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, searchKey]);

  const setScenario = useCallback((nextScenario: ScenarioId) => {
    replaceParams((params) => {
      params.set("mode", nextScenario);
      if (nextScenario !== "tenant-admin") params.delete("allCompanies");
    });
  }, [replaceParams]);

  const setCompany = useCallback((companyCode: string) => {
    replaceParams((params) => {
      params.set("company", companyCode);
      params.delete("row");
    });
  }, [replaceParams]);

  const setFiscalYear = useCallback((year: string) => {
    replaceParams((params) => {
      params.set("fy", year);
    });
  }, [replaceParams]);

  const setAllCompanies = useCallback((enabled: boolean) => {
    replaceParams((params) => {
      if (enabled) params.set("allCompanies", "true");
      else params.delete("allCompanies");
      params.delete("row");
    });
  }, [replaceParams]);

  const setSearch = useCallback((value: string) => {
    replaceParams((params) => {
      if (value) params.set("q", value);
      else params.delete("q");
    });
  }, [replaceParams]);

  const setView = useCallback((value: string) => {
    replaceParams((params) => {
      params.set("view", value);
    });
  }, [replaceParams]);

  const setSelectedRow = useCallback((rowId: string) => {
    replaceParams((params) => {
      params.set("row", rowId);
    });
  }, [replaceParams]);

  const setSubtab = useCallback((value: string) => {
    replaceParams((params) => {
      params.set("subtab", value);
    });
  }, [replaceParams]);

  const scopeCounts = useMemo(() => ({
    tenant: tableCount(),
    master: tableCount("master"),
    control: tableCount("control"),
    governance: tableCount("governance"),
  }), []);

  return (
    <PageFrame
      width="full"
      className="min-h-0 p-0"
      title="Finance Setup"
      description="Master, control, and governance workbench with company-scope aware setup"
      actions={
        <>
          <Badge variant="muted">{scopeCounts.tenant} setup surfaces</Badge>
          <Badge variant="info">T/C/O scoped</Badge>
        </>
      }
    >
      <div className="overflow-visible rounded-lg border bg-background">
        <AdaptiveContextBar
          scenario={scenario}
          companies={companyOptions}
          selectedCompany={selectedCompany}
          fiscalYears={fiscalYears}
          fiscalYear={fiscalYear}
          allCompanies={allCompanies}
          devMode={devMode}
          onScenarioChange={devMode ? setScenario : undefined}
          onCompanyChange={setCompany}
          onFiscalYearChange={setFiscalYear}
          onAllCompaniesChange={setAllCompanies}
          onNavigate={navigate}
        />
        <TopTabs activeArea={activeArea} searchParams={searchParams} onNavigate={navigate} />
        <WorkbenchBody
          activeArea={activeArea}
          activeSection={activeSection}
          activeEntity={activeEntity}
          selectedRow={selectedRow}
          scenario={scenario}
          selectedCompany={selectedCompany}
          fiscalYear={fiscalYear}
          allCompanies={allCompanies}
          search={search}
          view={view}
          subtab={subtab}
          searchParams={searchParams}
          onSearch={setSearch}
          onNavigate={navigate}
          onViewChange={setView}
          onSelectRow={setSelectedRow}
          onSubtabChange={setSubtab}
        />
      </div>
    </PageFrame>
  );
}
