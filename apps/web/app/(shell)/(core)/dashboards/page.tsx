"use client";

/**
 * Dashboards Gallery — /dashboards
 *
 * Financial overview: live KPI tiles + workbench shortcuts.
 * KPIs use the session's default company and current accounting period.
 */

import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  GitBranch,
  Landmark,
  Scale,
  ScrollText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@athyper/ui/primitives";
import { useFinanceDashboardKpis } from "@athyper/finance-workbench/hooks";
import { fmtCompact } from "@athyper/finance-workbench/components";

// ── KPI tile definitions ──────────────────────────────────────────────────────

type KpiKey = "revenueMtd" | "expensesMtd" | "openAp" | "openAr" | "cashBalance" | "journalCount";

const KPI_DEFS: {
  key:   KpiKey;
  label: string;
  sub:   string;
  color: string;
  bg:    string;
  icon:  React.ElementType;
  href:  string;
}[] = [
  {
    key:   "revenueMtd",
    label: "Revenue (MTD)",
    sub:   "month-to-date",
    color: "text-success",
    bg:    "bg-success/10",
    icon:  TrendingUp,
    href:  "/finance/gl?tab=profit-loss",
  },
  {
    key:   "expensesMtd",
    label: "Expenses (MTD)",
    sub:   "month-to-date",
    color: "text-destructive",
    bg:    "bg-destructive/10",
    icon:  TrendingDown,
    href:  "/finance/gl?tab=profit-loss",
  },
  {
    key:   "openAp",
    label: "Open AP",
    sub:   "payables outstanding",
    color: "text-warning",
    bg:    "bg-warning/10",
    icon:  CreditCard,
    href:  "/finance/reports?report=ap-aging",
  },
  {
    key:   "openAr",
    label: "Open AR",
    sub:   "receivables outstanding",
    color: "text-info",
    bg:    "bg-info/10",
    icon:  CreditCard,
    href:  "/finance/reports?report=ar-aging",
  },
  {
    key:   "cashBalance",
    label: "Cash Balance",
    sub:   "across all bank accounts",
    color: "text-primary",
    bg:    "bg-primary/10",
    icon:  Landmark,
    href:  "/finance/gl?tab=bank-recon",
  },
  {
    key:   "journalCount",
    label: "Journal Entries",
    sub:   "posted this period",
    color: "text-muted-foreground",
    bg:    "bg-muted",
    icon:  ScrollText,
    href:  "/finance/views/journal",
  },
];

// ── Finance module shortcuts ──────────────────────────────────────────────────

const FINANCE_MODULES = [
  {
    title:       "Trial Balance",
    description: "Period debit/credit balances across all accounts",
    icon:  Scale,
    href:  "/finance/views/trial-balance",
    color: "text-primary",
    bg:    "bg-primary/10",
  },
  {
    title:       "Profit & Loss",
    description: "Revenue, cost, and net income summary",
    icon:  TrendingUp,
    href:  "/finance/gl?tab=profit-loss",
    color: "text-success",
    bg:    "bg-success/10",
  },
  {
    title:       "Balance Sheet",
    description: "Assets, liabilities, and equity position",
    icon:  Building2,
    href:  "/finance/gl?tab=balance-sheet",
    color: "text-accent-foreground",
    bg:    "bg-accent/10",
  },
  {
    title:       "AP / AR Aging",
    description: "Payables and receivables by aging bucket",
    icon:  CreditCard,
    href:  "/finance/reports?report=ap-aging",
    color: "text-warning",
    bg:    "bg-warning/10",
  },
  {
    title:       "Bank Reconciliation",
    description: "Statement vs. ledger — uncleared items",
    icon:  Landmark,
    href:  "/finance/gl?tab=bank-recon",
    color: "text-info",
    bg:    "bg-info/10",
  },
  {
    title:       "Period Close",
    description: "Month-end cycle status and task checklist",
    icon:  ClipboardCheck,
    href:  "/finance/close",
    color: "text-destructive",
    bg:    "bg-destructive/10",
  },
];

// ── Quick links ───────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: "Journal Entries",    icon: ScrollText, href: "/finance/views/journal" },
  { label: "Posting Trace",      icon: GitBranch,  href: "/finance/views/posting-trace" },
  { label: "Chart of Accounts",  icon: BookOpen,   href: "/finance/coa" },
  { label: "Finance Admin",      icon: Building2,  href: "/finance/admin" },
];

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label, sub, icon: Icon, color, bg, href, value, isCount, loading,
}: {
  label:   string;
  sub:     string;
  icon:    React.ElementType;
  color:   string;
  bg:      string;
  href:    string;
  value:   number | null | undefined;
  isCount: boolean;
  loading: boolean;
}) {
  const display = loading
    ? null
    : value == null
      ? "—"
      : isCount
        ? value.toLocaleString()
        : fmtCompact(value);

  return (
    <a
      href={href}
      className="group relative rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold">{display}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={`shrink-0 rounded-md p-2 ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <ArrowRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardsPage() {
  const { data: kpis, isLoading } = useFinanceDashboardKpis();

  return (
    <PageFrame
      title="Dashboards"
      description={
        kpis?.period
          ? `Financial overview · ${kpis.period}`
          : "Financial overview — KPIs, P&L, and ledger highlights"
      }
    >
      <div className="space-y-6">

        {/* ── KPI tiles ───────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KPI_DEFS.map(({ key, label, sub, icon, color, bg, href }) => (
            <KpiTile
              key={key}
              label={label}
              sub={sub}
              icon={icon}
              color={color}
              bg={bg}
              href={href}
              value={kpis?.[key]}
              isCount={key === "journalCount"}
              loading={isLoading}
            />
          ))}
        </div>

        {/* ── Finance workbench views ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Finance Workbench Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FINANCE_MODULES.map(({ title, description, icon: Icon, href, color, bg }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent group"
                >
                  <div className={`mt-0.5 shrink-0 rounded-md p-1.5 ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</div>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Quick links ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Finance Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_LINKS.map(({ label, icon: Icon, href }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PageFrame>
  );
}
