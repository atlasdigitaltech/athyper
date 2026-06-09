"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Filter as FilterIcon,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button,
  DrawerShell,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { parseFinanceScope, scopeToParams, type FinanceScope } from "../lib/scope";
import { periodLabel as formatFiscalPeriodLabel } from "../lib/period";
import { FinanceContextBar } from "../components/FinanceContextBar";
import { ReportChooserSuffix } from "../components/ReportScaffold";
import { RecordLinkContextMenu } from "../components/RecordLinkContextMenu";
import {
  useLedgerBookOptions,
  useScopeOptions,
  type LedgerBookOption,
  type ScopeOptionsData,
} from "../hooks/useScopeOptions";
import type { GlDetailData, GlDetailLine } from "../hooks/useGlDetail";
import type { JournalEntry } from "../hooks/useJournalList";
import { TrialBalanceView, type TrialBalanceViewMode } from "./TrialBalanceView";
import { BalanceSheetView } from "./BalanceSheetView";
import { ProfitLossView } from "./ProfitLossView";
import { GlDetailView } from "./GlDetailView";
import { ApWorkbenchView } from "./ApWorkbenchView";
import { BankReconciliationView } from "./BankReconciliationView";
import { PeriodCloseDashboardView } from "./PeriodCloseDashboardView";
import { JournalGrid } from "./JournalGrid";

const TABS = [
  { id: "trial-balance", label: "Trial Balance" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "gl-detail", label: "GL Detail" },
  { id: "journals", label: "Journals" },
  { id: "ap-ar", label: "AP / AR" },
  { id: "bank-recon", label: "Bank Reconciliation" },
  { id: "period-close", label: "Period Close" },
] as const;

type WorkbenchTab = (typeof TABS)[number]["id"];

const TAB_IDS = TABS.map((tab) => tab.id) as WorkbenchTab[];
const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_SCOPE: FinanceScope = {
  scopeType: "company",
  scopeId: "",
  fiscalYear: CURRENT_YEAR,
  period: null,
  comparative: false,
};

const GL_FILTER_SECTIONS = [
  {
    title: "Scope",
    description: "Controls the books and organizational boundary for every GL view.",
    fields: [
      { label: "Legal Entity", placeholder: "Search legal entities..." },
      { label: "Company Code", placeholder: "Search company codes..." },
      { label: "Ledger Book", placeholder: "Primary, local, tax, group..." },
      { label: "Reporting Currency", placeholder: "SAR, USD, EUR..." },
    ],
  },
  {
    title: "Period",
    description: "Fiscal time filters shared by trial balance, details, journals, and close.",
    fields: [
      { label: "Fiscal Year", placeholder: "FY 2026" },
      { label: "Fiscal Period", placeholder: "Period 1 - 12 or full year" },
      { label: "Period Range", placeholder: "From period - to period" },
      { label: "Date Preset", placeholder: "This period, quarter to date, year to date..." },
    ],
    quickValues: ["This period", "Quarter to date", "Year to date", "Prior year"],
  },
  {
    title: "Accounts",
    description: "Narrows the ledger by chart structure and account attributes.",
    fields: [
      { label: "GL Account", placeholder: "Search account number or name..." },
      { label: "Account Class", placeholder: "Asset, liability, revenue, expense..." },
      { label: "Account Range", placeholder: "From account - to account" },
      { label: "Reconciliation Account", placeholder: "Customer, supplier, asset..." },
    ],
  },
  {
    title: "Parties",
    description: "Filters transactions linked to subledgers, employees, and external parties.",
    fields: [
      { label: "Party Type", placeholder: "Supplier, customer, employee, bank..." },
      { label: "Supplier", placeholder: "Search suppliers..." },
      { label: "Customer", placeholder: "Search customers..." },
      { label: "Employee", placeholder: "Search employees..." },
    ],
  },
  {
    title: "Dimensions",
    description: "Filters management accounting, project, and allocation dimensions.",
    fields: [
      { label: "Cost Center", placeholder: "Search cost centers..." },
      { label: "Project", placeholder: "Search projects..." },
      { label: "Profit Center", placeholder: "Search profit centers..." },
      { label: "Business Area", placeholder: "Search business areas..." },
    ],
  },
  {
    title: "Subledger & Source",
    description: "Locates entries by originating process or operational object.",
    fields: [
      { label: "Asset", placeholder: "Search fixed assets..." },
      { label: "Journal Source", placeholder: "Manual, AP, AR, bank, asset..." },
      { label: "Document Type", placeholder: "JE, invoice, payment, accrual..." },
      { label: "Reference", placeholder: "Document number, external reference..." },
    ],
  },
  {
    title: "Amounts & Status",
    description: "Useful for exception review and period-close investigation.",
    fields: [
      { label: "Debit / Credit", placeholder: "Debit, credit, or net movement" },
      { label: "Amount Range", placeholder: "Minimum - maximum" },
      { label: "Currency", placeholder: "Transaction or reporting currency" },
      { label: "Posting Status", placeholder: "Posted, draft, reversed, parked..." },
    ],
  },
] as const;

interface GlWorkbenchProps {
  /** Initial scope to render. URL scope remains canonical once present. */
  defaultScope?: Partial<FinanceScope>;
  /** Initial tab to activate. Defaults to "trial-balance". */
  defaultTab?: WorkbenchTab;
  /** Retained for callers while comparison is owned by the finance context bar. */
  allowComparative?: boolean;
}

function isWorkbenchTab(value: string | null | undefined): value is WorkbenchTab {
  return !!value && (TAB_IDS as readonly string[]).includes(value);
}

function scopeLabel(scope: FinanceScope, options: ReturnType<typeof useScopeOptions>["data"]): string {
  if (!scope.scopeId) return "Select scope";

  if (scope.scopeType === "company") {
    const company = options?.companies.find((item) => item.code === scope.scopeId);
    return company ? `${company.code} - ${company.name}` : scope.scopeId;
  }

  if (scope.scopeType === "legal_entity") {
    const entity = options?.entities.find((item) => item.id === scope.scopeId);
    return entity ? `${entity.code} - ${entity.name}` : scope.scopeId;
  }

  return "Group";
}

function workbenchPeriodLabel(scope: FinanceScope, fiscalYearStartMonth: number): string {
  if (scope.period === null || scope.period === undefined) return "Full Year";
  if (scope.period === 0) return "Opening";
  return formatFiscalPeriodLabel(scope.fiscalYear, scope.period, fiscalYearStartMonth);
}

const SUMMARY_CONTEXT_PARAM_KEYS = new Set([
  "scopeType",
  "scopeId",
  "fiscalYear",
  "period",
  "comparative",
  "tab",
  "q",
  "limit",
  "offset",
]);

const FILTER_LABELS: Record<string, string> = {
  account: "GL Account",
  bookId: "Ledger Book",
  currency: "Reporting Currency",
  transactionCurrency: "Transaction Currency",
  companyCode: "Company Code",
  companyCodeId: "Company Code",
  legalEntityId: "Legal Entity",
  supplier: "Supplier",
  supplierId: "Supplier",
  customer: "Customer",
  customerId: "Customer",
  costCenter: "Cost Center",
  costCenterId: "Cost Center",
  project: "Project",
  projectId: "Project",
  partyType: "Party Type",
  employee: "Employee",
  employeeId: "Employee",
  asset: "Asset",
  assetId: "Asset",
  glAccount: "GL Account",
  glAccountId: "GL Account",
  postingStatus: "Posting Status",
  documentDate: "Document Date",
  postingDate: "Posting Date",
  dateFrom: "From Date",
  dateTo: "To Date",
  datePreset: "Date Preset",
  relativeRange: "Relative Range",
  groupBy: "Group By",
  accumulatedValues: "Accumulated Values",
  periodRange: "Period Range",
  sourceDocType: "Document Type",
  documentType: "Document Type",
  journalSource: "Journal Source",
};

const FILTER_VALUE_LABELS: Record<string, string> = {
  empty: "is empty",
  is_empty: "is empty",
  not_empty: "is not empty",
  is_not_empty: "is not empty",
  has_value: "has value",
  this_month: "This Month",
  this_week: "This Week",
  this_quarter: "This Quarter",
  this_year: "This Year",
  this_period: "This Period",
  last_month: "Last Month",
  last_quarter: "Last Quarter",
  last_year: "Last Year",
  ytd: "YTD",
  qtd: "QTD",
  mtd: "MTD",
  quarter_to_date: "Quarter to Date",
  year_to_date: "Year to Date",
  prior_year: "Prior Year",
  fiscal_ytd: "Fiscal YTD",
  custom: "Custom",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  rolling_12_months: "Rolling 12 Months",
  fiscal_year: "Year by Year",
  fiscal_quarter: "Quarter by Quarter",
  fiscal_period: "Fiscal Period",
  true: "Yes",
  false: "No",
};

interface ResultFilterChip {
  key: string;
  label: string;
  value: string;
}

function humanizeFilterKey(key: string): string {
  const stripped = key.replace(/Id$/, "");
  return stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFilterValue(key: string, value: string, ledgerBooks: LedgerBookOption[]): string {
  if (key === "bookId") {
    const book = ledgerBooks.find((item) => item.id === value);
    if (book) return `${book.code} - ${book.name}`;
  }

  const normalized = value.trim().toLowerCase();
  return FILTER_VALUE_LABELS[normalized] ?? value;
}

function buildResultFilterChips(searchKey: string, ledgerBooks: LedgerBookOption[]): ResultFilterChip[] {
  const params = new URLSearchParams(searchKey);
  const keys = [...new Set([...params.keys()])];

  return keys.flatMap((key) => {
    if (SUMMARY_CONTEXT_PARAM_KEYS.has(key)) return [];
    if (key.endsWith("Label") || key.endsWith("Name")) return [];

    const values = params.getAll(key).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) return [];

    const label = FILTER_LABELS[key] ?? humanizeFilterKey(key);
    const labelValue = params.get(`${key}Label`) ?? params.get(`${key}Name`);
    const value = labelValue?.trim()
      ? labelValue.trim()
      : values.map((item) => formatFilterValue(key, item, ledgerBooks)).join(", ");

    return [{ key, label, value }];
  });
}

type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const csv = [
    columns.map((column) => csvCell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

type GlAdditionalFilterKey =
  | "supplier"
  | "costCenter"
  | "account"
  | "postingStatus"
  | "datePreset"
  | "journalSource"
  | "sourceDocType";

const GL_ADDITIONAL_FILTER_KEYS: GlAdditionalFilterKey[] = [
  "supplier",
  "costCenter",
  "account",
  "postingStatus",
  "datePreset",
  "journalSource",
  "sourceDocType",
];

interface GlAdditionalFilterDefinition {
  key: GlAdditionalFilterKey;
  placeholder: string;
  options?: GlSelectOption[];
}

const LIVE_ADDITIONAL_FILTERS: Partial<Record<string, GlAdditionalFilterDefinition>> = {
  "GL Account": {
    key: "account",
    placeholder: "Account number or name...",
  },
  "Date Preset": {
    key: "datePreset",
    placeholder: "Any date preset",
    options: [
      { value: "this_period", label: "This period" },
      { value: "quarter_to_date", label: "Quarter to date" },
      { value: "year_to_date", label: "Year to date" },
      { value: "prior_year", label: "Prior year" },
      { value: "custom", label: "Custom" },
    ],
  },
  Supplier: {
    key: "supplier",
    placeholder: "Supplier name or code...",
  },
  "Cost Center": {
    key: "costCenter",
    placeholder: "Cost center name or code...",
  },
  "Journal Source": {
    key: "journalSource",
    placeholder: "Manual, AP, AR, bank, asset...",
    options: [
      { value: "manual", label: "Manual" },
      { value: "ap", label: "AP" },
      { value: "ar", label: "AR" },
      { value: "bank", label: "Bank" },
      { value: "asset", label: "Asset" },
    ],
  },
  "Document Type": {
    key: "sourceDocType",
    placeholder: "Any document type",
    options: [
      { value: "journal_entry", label: "Journal Entry" },
      { value: "purchase_invoice", label: "Purchase Invoice" },
      { value: "sales_invoice", label: "Sales Invoice" },
      { value: "payment", label: "Payment" },
      { value: "accrual", label: "Accrual" },
    ],
  },
  "Posting Status": {
    key: "postingStatus",
    placeholder: "Any posting status",
    options: [
      { value: "created", label: "Draft" },
      { value: "posted", label: "Posted" },
      { value: "reversed", label: "Reversed" },
      { value: "parked", label: "Parked" },
    ],
  },
};

interface GlWorkbenchSwitcherProps {
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  tabs: readonly (typeof TABS)[number][];
  onBack: () => void;
}

function GlWorkbenchSwitcher({ activeTab, onTabChange, tabs, onBack }: GlWorkbenchSwitcherProps) {
  return (
    <DropdownMenu>
      <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-sm font-medium text-background">
        <button
          type="button"
          onClick={onBack}
          className="flex h-full w-9 items-center justify-center border-r border-r-ring bg-inherit text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
          aria-label="Go back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-full items-center gap-1.5 bg-inherit px-3 text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
            aria-label="Switch GL Workbench view"
          >
            <span className="leading-none">GL WORKBENCH</span>
            <ReportChooserSuffix />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {tabs.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => onTabChange(item.id)}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span>{item.label}</span>
            {activeTab === item.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GlSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function currentLegalEntityId(scope: FinanceScope, scopeOptions?: ScopeOptionsData): string {
  if (scope.scopeType === "legal_entity") return scope.scopeId;
  if (scope.scopeType === "company") {
    return scopeOptions?.companies.find((company) => company.code === scope.scopeId)?.legalEntityId ?? "";
  }
  return "";
}

function currencyOptions(
  scope: FinanceScope,
  scopeOptions?: ScopeOptionsData,
  ledgerBooks: LedgerBookOption[] = [],
): GlSelectOption[] {
  const currencies = new Set<string>();

  for (const company of scopeOptions?.companies ?? []) {
    if (company.functionalCurrency) currencies.add(company.functionalCurrency);
  }
  for (const entity of scopeOptions?.entities ?? []) {
    if (entity.functionalCurrency) currencies.add(entity.functionalCurrency);
    if (entity.reportingCurrency) currencies.add(entity.reportingCurrency);
  }
  for (const book of ledgerBooks) {
    if (book.baseCurrencyCode) currencies.add(book.baseCurrencyCode);
  }
  for (const common of ["SAR", "USD", "EUR", "GBP"]) currencies.add(common);
  if (scope.currency) currencies.add(scope.currency);
  if (scope.transactionCurrency) currencies.add(scope.transactionCurrency);

  return [...currencies]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
}

interface GlFilterSelectProps {
  label: string;
  value?: string;
  placeholder: string;
  options: GlSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function GlFilterSelect({ label, value, placeholder, options, onChange, disabled }: GlFilterSelectProps) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-mediumr text-muted-foreground">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {value ? "has value" : "is empty"}
          </span>
        </div>
      </div>
      <div className="relative">
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

interface GlTextFilterFieldProps {
  label: string;
  value?: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function GlTextFilterField({ label, value, placeholder, onChange }: GlTextFilterFieldProps) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-mediumr text-muted-foreground">
          {label}
        </label>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {value ? "has value" : "is empty"}
        </span>
      </div>
      <input
        type="text"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </div>
  );
}

interface GlScopeFilterSectionProps {
  draftScope: FinanceScope;
  setDraftScope: Dispatch<SetStateAction<FinanceScope>>;
  scopeOptions?: ScopeOptionsData;
  ledgerBooks: LedgerBookOption[];
}

function GlScopeFilterSection({
  draftScope,
  setDraftScope,
  scopeOptions,
  ledgerBooks,
}: GlScopeFilterSectionProps) {
  const selectedLegalEntityId = currentLegalEntityId(draftScope, scopeOptions);
  const selectedCompanyCode = draftScope.scopeType === "company" ? draftScope.scopeId : "";

  const legalEntityOptions = (scopeOptions?.entities ?? []).map((entity) => ({
    value: entity.id,
    label: `${entity.code} - ${entity.name}`,
  }));

  const companyOptions = (scopeOptions?.companies ?? [])
    .filter((company) => !selectedLegalEntityId || company.legalEntityId === selectedLegalEntityId)
    .map((company) => ({
      value: company.code,
      label: `${company.code} - ${company.name}`,
    }));

  const ledgerBookOptions = ledgerBooks.map((book) => ({
    value: book.id,
    label: `${book.code} - ${book.name}${book.isPrimary ? " (primary)" : ""}`,
  }));

  const currencies = currencyOptions(draftScope, scopeOptions, ledgerBooks);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Scope</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Controls the legal boundary, ledger book, and currencies used by every GL Workbench tab.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          5
        </span>
      </div>

      <div className="divide-y divide-border">
        <GlFilterSelect
          label="Legal Entity"
          value={selectedLegalEntityId}
          placeholder="Select legal entity..."
          options={legalEntityOptions}
          disabled={!scopeOptions}
          onChange={(value) => {
            if (!value) return;
            setDraftScope((prev) => ({
              ...prev,
              scopeType: "legal_entity",
              scopeId: value,
              bookId: undefined,
            }));
          }}
        />

        <GlFilterSelect
          label="Company Code"
          value={selectedCompanyCode}
          placeholder={selectedLegalEntityId ? "All company codes in legal entity" : "Select company code..."}
          options={companyOptions}
          disabled={!scopeOptions}
          onChange={(value) => {
            setDraftScope((prev) => {
              if (value) {
                return {
                  ...prev,
                  scopeType: "company",
                  scopeId: value,
                  bookId: undefined,
                };
              }
              if (selectedLegalEntityId) {
                return {
                  ...prev,
                  scopeType: "legal_entity",
                  scopeId: selectedLegalEntityId,
                  bookId: undefined,
                };
              }
              return prev;
            });
          }}
        />

        <GlFilterSelect
          label="Ledger Book"
          value={draftScope.bookId}
          placeholder="Default ledger book"
          options={ledgerBookOptions}
          onChange={(value) => setDraftScope((prev) => ({ ...prev, bookId: value || undefined }))}
        />

        <GlFilterSelect
          label="Reporting Currency"
          value={draftScope.currency}
          placeholder="Company / ledger default"
          options={currencies}
          onChange={(value) => setDraftScope((prev) => ({ ...prev, currency: value || undefined }))}
        />

        <GlFilterSelect
          label="Transaction Currency"
          value={draftScope.transactionCurrency}
          placeholder="Any transaction currency"
          options={currencies}
          onChange={(value) => setDraftScope((prev) => ({ ...prev, transactionCurrency: value || undefined }))}
        />
      </div>
    </section>
  );
}

interface GlFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextLabel: string;
  scope: FinanceScope;
  scopeOptions?: ScopeOptionsData;
  ledgerBooks: LedgerBookOption[];
  additionalFilters: Partial<Record<GlAdditionalFilterKey, string>>;
  onApplyFilters: (scope: FinanceScope, filters: Partial<Record<GlAdditionalFilterKey, string>>) => void;
}

function GlFilterDrawer({
  open,
  onOpenChange,
  contextLabel,
  scope,
  scopeOptions,
  ledgerBooks,
  additionalFilters,
  onApplyFilters,
}: GlFilterDrawerProps) {
  const [draftScope, setDraftScope] = useState<FinanceScope>(scope);
  const [draftAdditionalFilters, setDraftAdditionalFilters] =
    useState<Partial<Record<GlAdditionalFilterKey, string>>>(additionalFilters);

  useEffect(() => {
    if (open) {
      setDraftScope(scope);
      setDraftAdditionalFilters(additionalFilters);
    }
  }, [additionalFilters, open, scope]);

  const clearOptionalScopeFilters = useCallback(() => {
    setDraftScope((prev) => ({
      ...prev,
      bookId: undefined,
      currency: undefined,
      transactionCurrency: undefined,
    }));
    setDraftAdditionalFilters({});
  }, []);

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      intent="context"
      widthKey="finance:gl-workbench:filters"
      defaultWidth={560}
      minWidth={420}
      maxWidth="92vw"
      expandedWidth="760px"
      expandable
      badge="GL"
      title="Filters"
      subtitle={contextLabel}
      headerBottom={
        <div className="px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search filters..."
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </div>
      }
      footerStart="Apply writes filters to the GL Workbench URL."
      footerEnd={
        <>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={clearOptionalScopeFilters}>
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => {
              onApplyFilters(draftScope, draftAdditionalFilters);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <section className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-mediumr text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Recommended starting filters
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Current scope", "Open period", "Posted only", "Material amounts", "My reviews"].map((label) => (
              <button
                key={label}
                type="button"
                className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <GlScopeFilterSection
          draftScope={draftScope}
          setDraftScope={setDraftScope}
          scopeOptions={scopeOptions}
          ledgerBooks={ledgerBooks}
        />

        {GL_FILTER_SECTIONS.filter((section) => section.title !== "Scope").map((section) => (
          <section key={section.title} className="rounded-lg border border-border bg-card">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">{section.title}</h3>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{section.description}</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {section.fields.length}
              </span>
            </div>

            {"quickValues" in section && section.quickValues && (
              <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
                {section.quickValues.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="divide-y divide-border">
              {section.fields.map((field) => {
                const liveFilter = LIVE_ADDITIONAL_FILTERS[field.label];
                if (liveFilter) {
                  if (liveFilter.options) {
                    return (
                      <GlFilterSelect
                        key={field.label}
                        label={field.label}
                        value={draftAdditionalFilters[liveFilter.key] ?? ""}
                        placeholder={liveFilter.placeholder}
                        options={liveFilter.options}
                        onChange={(value) => {
                          setDraftAdditionalFilters((prev) => ({
                            ...prev,
                            [liveFilter.key]: value,
                          }));
                        }}
                      />
                    );
                  }

                  return (
                    <GlTextFilterField
                      key={field.label}
                      label={field.label}
                      value={draftAdditionalFilters[liveFilter.key] ?? ""}
                      placeholder={liveFilter.placeholder}
                      onChange={(value) => {
                        setDraftAdditionalFilters((prev) => ({
                          ...prev,
                          [liveFilter.key]: value,
                        }));
                      }}
                    />
                  );
                }

                return (
                  <div key={field.label} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-xs font-mediumr text-muted-foreground">
                        {field.label}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          is empty
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          has value
                        </button>
                      </div>
                    </div>
                    <div className="flex h-9 items-center justify-between rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground">
                      <span>{field.placeholder}</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </DrawerShell>
  );
}

export function GlWorkbench({ defaultScope, defaultTab = "trial-balance" }: GlWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const { data: scopeOptions, isLoading: scopeLoading } = useScopeOptions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [trialBalanceViewMode, setTrialBalanceViewMode] = useState<TrialBalanceViewMode>("summary");

  const rawParams = useMemo(
    () => Object.fromEntries(new URLSearchParams(searchKey).entries()) as Record<string, string>,
    [searchKey],
  );

  const scope = useMemo(
    () => parseFinanceScope(rawParams, { ...DEFAULT_SCOPE, ...defaultScope }),
    [defaultScope, rawParams],
  );
  const { data: ledgerBooks = [] } = useLedgerBookOptions(scope);
  const additionalFilterValues = useMemo<Partial<Record<GlAdditionalFilterKey, string>>>(
    () => ({
      account: rawParams.account ?? "",
      postingStatus: rawParams.postingStatus ?? "",
      datePreset: rawParams.datePreset ?? "",
      journalSource: rawParams.journalSource ?? "",
      sourceDocType: rawParams.sourceDocType ?? rawParams.documentType ?? "",
      supplier: rawParams.supplier ?? "",
      costCenter: rawParams.costCenter ?? "",
    }),
    [rawParams],
  );

  const tab = isWorkbenchTab(searchParams.get("tab"))
    ? searchParams.get("tab") as WorkbenchTab
    : defaultTab;
  const isTrialBalance = tab === "trial-balance";
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];
  const accountCode = searchParams.get("account") ?? "";

  const activeCompany = useMemo(() => {
    const companies = scopeOptions?.companies ?? [];
    if (scope.scopeType === "company") {
      return companies.find((company) => company.code === scope.scopeId);
    }

    const entity = scopeOptions?.entities.find((item) => item.id === scope.scopeId);
    const firstCompanyCode = (entity as unknown as { companyCodes?: string[] })?.companyCodes?.[0];
    return firstCompanyCode
      ? companies.find((company) => company.code === firstCompanyCode)
      : undefined;
  }, [scope.scopeId, scope.scopeType, scopeOptions]);
  const fiscalYearStartMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const periodDisplayLabel = workbenchPeriodLabel(scope, fiscalYearStartMonth);

  const replaceParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchKey);
    mutate(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchKey]);

  const setTab = useCallback((next: WorkbenchTab) => {
    replaceParams((params) => {
      params.set("tab", next);
    });
  }, [replaceParams]);

  const handleDrillDown = useCallback((nextAccountCode: string) => {
    replaceParams((params) => {
      params.set("tab", "gl-detail");
      params.set("account", nextAccountCode);
    });
  }, [replaceParams]);

  const exportTrialBalance = useCallback(async () => {
    const res = await fetch("/api/finance/reports/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ reportCode: "trial-balance", scope, format: "csv" }),
    });
    if (!res.ok) return;
    const { downloadUrl } = await res.json() as { downloadUrl?: string };
    if (downloadUrl) window.open(downloadUrl, "_blank");
  }, [scope]);

  const exportJournals = useCallback(async () => {
    const params = scopeToParams(scope);
    params.set("limit", "1000");
    params.set("offset", "0");
    if (additionalFilterValues.postingStatus) params.set("status", additionalFilterValues.postingStatus);
    if (additionalFilterValues.sourceDocType) params.set("source_doc_type", additionalFilterValues.sourceDocType);

    const res = await fetch(`/api/finance/journals?${params}`);
    if (!res.ok) return;

    const data = await res.json() as { items?: JournalEntry[] };
    downloadCsv(`journals_${exportDateStamp()}.csv`, data.items ?? [], [
      { header: "JE Number", value: (row) => row.jeNumber },
      { header: "Status", value: (row) => row.status },
      { header: "Posting Date", value: (row) => row.postingDate },
      { header: "Fiscal Year", value: (row) => row.fiscalYear },
      { header: "Period", value: (row) => row.periodNumber },
      { header: "Currency", value: (row) => row.currencyCode },
      { header: "Source Document Type", value: (row) => row.sourceDocType },
      { header: "Source Document Ref", value: (row) => row.sourceDocRef },
      { header: "Description", value: (row) => row.description },
      { header: "Total Debit", value: (row) => row.totalDebit },
      { header: "Total Credit", value: (row) => row.totalCredit },
      { header: "Posted At", value: (row) => row.postedAt },
      { header: "Line Count", value: (row) => row.lineCount },
    ]);
  }, [additionalFilterValues.postingStatus, additionalFilterValues.sourceDocType, scope]);

  const exportGlDetail = useCallback(async () => {
    if (!accountCode) return;

    const params = scopeToParams(scope);
    params.set("accountCode", accountCode);
    const res = await fetch(`/api/finance/gl-detail?${params}`);
    if (!res.ok) return;

    const data = await res.json() as GlDetailData;
    downloadCsv<GlDetailLine>(`gl_detail_${accountCode}_${exportDateStamp()}.csv`, data.lines ?? [], [
      { header: "Account Code", value: () => data.accountCode },
      { header: "Account Name", value: () => data.accountName },
      { header: "Company Code", value: (row) => row.companyCode },
      { header: "Posting Date", value: (row) => row.postingDate },
      { header: "Entry Number", value: (row) => row.entryNumber },
      { header: "Narration", value: (row) => row.narration },
      { header: "Source Document Type", value: (row) => row.sourceDocType },
      { header: "Source Document Ref", value: (row) => row.sourceDocRef },
      { header: "Cost Center", value: (row) => row.costCenter },
      { header: "Project", value: (row) => row.project },
      { header: "Debit", value: (row) => row.debitAmount },
      { header: "Credit", value: (row) => row.creditAmount },
      { header: "Running Balance", value: (row) => row.runningBalance },
      { header: "Posted At", value: (row) => row.postedAt },
      { header: "Posted By", value: (row) => row.postedBy },
    ]);
  }, [accountCode, scope]);

  const applyFilters = useCallback((
    nextScope: FinanceScope,
    nextFilters: Partial<Record<GlAdditionalFilterKey, string>>,
  ) => {
    replaceParams((params) => {
      for (const key of [
        "scopeType",
        "scopeId",
        "fiscalYear",
        "period",
        "bookId",
        "currency",
        "transactionCurrency",
        "comparative",
      ]) {
        params.delete(key);
      }
      scopeToParams(nextScope).forEach((value, key) => params.set(key, value));

      params.delete("documentType");
      for (const key of GL_ADDITIONAL_FILTER_KEYS) {
        const value = nextFilters[key]?.trim();
        if (value) params.set(key, value);
        else params.delete(key);
      }
    });
  }, [replaceParams]);

  const resultFilterChips = useMemo(
    () => buildResultFilterChips(searchKey, ledgerBooks),
    [ledgerBooks, searchKey],
  );

  const activeScopeFilterCount = resultFilterChips.length;

  const removeResultFilter = useCallback((key: string) => {
    replaceParams((params) => {
      params.delete(key);
      params.delete(`${key}Label`);
      params.delete(`${key}Name`);
    });
  }, [replaceParams]);

  const clearResultFilters = useCallback(() => {
    replaceParams((params) => {
      for (const chip of resultFilterChips) {
        params.delete(chip.key);
        params.delete(`${chip.key}Label`);
        params.delete(`${chip.key}Name`);
      }
    });
  }, [replaceParams, resultFilterChips]);

  const resultSummaryLabel = activeTab.label;

  const filterContext = [
    activeTab.label,
    scopeLabel(scope, scopeOptions),
    `FY ${scope.fiscalYear}`,
    periodDisplayLabel,
  ].filter(Boolean).join(" / ");

  const activeExportAction =
    tab === "trial-balance"
      ? { label: "Export Trial Balance CSV", onSelect: exportTrialBalance }
      : tab === "journals"
        ? { label: "Export Journals CSV", onSelect: exportJournals }
        : tab === "gl-detail" && accountCode
          ? { label: "Export GL Detail CSV", onSelect: exportGlDetail }
          : null;

  let content: ReactNode;
  if (scopeLoading && !scopeOptions) {
    content = (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading finance scope...
      </div>
    );
  } else if (!scope.scopeId) {
    content = (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Select a scope to view GL Workbench results.
      </div>
    );
  } else if (isTrialBalance) {
    content = (
      <TrialBalanceView
        scope={scope}
        viewMode={trialBalanceViewMode}
        onViewModeChange={setTrialBalanceViewMode}
        hideViewModeToggle
      />
    );
  } else if (tab === "balance-sheet") {
    content = <BalanceSheetView scope={scope} onDrillDown={handleDrillDown} />;
  } else if (tab === "profit-loss") {
    content = <ProfitLossView scope={scope} onDrillDown={handleDrillDown} />;
  } else if (tab === "gl-detail") {
    content = <GlDetailView scope={scope} accountCode={accountCode} />;
  } else if (tab === "journals") {
    content = (
      <JournalGrid
        scope={scope}
        search=""
        statusFilter={additionalFilterValues.postingStatus || undefined}
        sourceDocTypeFilter={additionalFilterValues.sourceDocType || undefined}
        hideSearch
        hideCreateAction
        entityListStyle
        activeFilterChips={resultFilterChips}
        onRemoveFilter={removeResultFilter}
        onClearFilters={clearResultFilters}
      />
    );
  } else if (tab === "ap-ar") {
    content = <ApWorkbenchView scope={scope} />;
  } else if (tab === "bank-recon") {
    content = <BankReconciliationView scope={scope} />;
  } else {
    content = <PeriodCloseDashboardView scope={scope} />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden">
      <section className="shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 text-sm text-muted-foreground sm:px-3">
          <GlWorkbenchSwitcher
            activeTab={tab}
            onTabChange={setTab}
            tabs={TABS}
            onBack={() => router.push("/finance")}
          />
          <span className="hidden text-border/80 sm:inline">|</span>
          <span className="order-1 shrink-0 sm:order-none">
            {resultSummaryLabel}
          </span>
          <span className="hidden text-border/80 sm:inline">/</span>
          <FinanceContextBar
            variant="inline"
            className="order-3 w-full gap-x-2 sm:order-none sm:min-w-0 sm:flex-1"
            hideGrouping={isTrialBalance}
            hideCompare={isTrialBalance}
          />
          {activeScopeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearResultFilters}
              className="order-4 shrink-0 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline sm:order-none"
            >
              Clear all
            </button>
          )}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-none">
            {isTrialBalance && (
              <div className="flex shrink-0 items-center gap-1">
                {(["summary", "detailed"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={trialBalanceViewMode === mode ? "primary" : "outline"}
                    size="sm"
                    className="h-8 rounded-md px-3 text-sm capitalize"
                    onClick={() => setTrialBalanceViewMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                "relative size-8 shrink-0",
                activeScopeFilterCount > 0 && "border-primary/50 bg-primary/10 text-primary",
              )}
              title="Filters"
              aria-label="Filters"
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen(true)}
            >
              <FilterIcon className="h-3.5 w-3.5" />
              {activeScopeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium leading-none text-primary-foreground">
                  {activeScopeFilterCount}
                </span>
              )}
            </Button>

            {activeExportAction && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    title="More actions"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[190px]">
                  <DropdownMenuItem onSelect={() => void activeExportAction.onSelect()}>
                    <Download className="h-3.5 w-3.5" />
                    {activeExportAction.label}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-none flex-col overflow-visible rounded-lg border bg-card shadow-sm sm:flex-1 sm:overflow-hidden">
        <div className="min-h-0 px-2 pb-3 pt-2 sm:flex-1 sm:overflow-auto sm:px-4 sm:pb-4">
          {content}
        </div>
      </section>

      <GlFilterDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        contextLabel={filterContext}
        scope={scope}
        scopeOptions={scopeOptions}
        ledgerBooks={ledgerBooks}
        additionalFilters={additionalFilterValues}
        onApplyFilters={applyFilters}
      />
      <RecordLinkContextMenu />
    </div>
  );
}
