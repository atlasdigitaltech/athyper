/**
 * Finance Workspace — /finance
 *
 * Domain launcher for the Finance workspace.
 * This page is the entry point — it shows live KPI tiles and action cards
 * that route users into bespoke finance workbenches at /finance/*.
 *
 * Rule: No data entry on this page. Operational launcher only.
 * Workbench rule: Finance workbenches at /finance/* use query-state navigation,
 * no [id] routes. All record focus via drawers, panels, or query params.
 */

import {
  ArrowRight,
  BookOpen,
  BarChart3,
  Building2,
  Calculator,
  ClipboardCheck,
  CreditCard,
  FileText,
  Landmark,
  Scale,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { FinanceKpiCards } from "./_components/FinanceKpiCards";

// ── Workbench action cards ────────────────────────────────────────────────────

const WORKBENCH_ACTIONS = [
  {
    href: "/finance/ap",
    title: "AP Workbench",
    description: "Payables invoices, aging buckets, outbound payments",
    icon: FileText,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    href: "/finance/ar",
    title: "AR Workbench",
    description: "Receivables aging, inbound receipts, customer balances",
    icon: CreditCard,
    color: "text-info",
    bg: "bg-info/10",
  },
  {
    href: "/finance/bank-recon",
    title: "Bank Reconciliation",
    description: "Bank statement review, mark cleared, unreconciled items",
    icon: Landmark,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    href: "/finance/gl",
    title: "GL Workbench",
    description: "Journal review, posting context, period filters, drill-through",
    icon: ScrollText,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    href: "/finance/coa",
    title: "Chart of Accounts",
    description: "Account hierarchy explorer — browse, filter, drill by segment",
    icon: BookOpen,
    color: "text-info",
    bg: "bg-info/10",
  },
  {
    href: "/finance/views/trial-balance",
    title: "Trial Balance",
    description: "Period debit/credit balances — parameterised, drill-capable",
    icon: Scale,
    color: "text-accent-foreground",
    bg: "bg-accent/10",
  },
  {
    href: "/finance/reports",
    title: "Financial Reports",
    description: "P&L, Balance Sheet, Cash Flow — generate and export",
    icon: BarChart3,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    href: "/finance/close",
    title: "Period Close",
    description: "Month-end cycle checklist, sign-off, inter-company elimination",
    icon: ClipboardCheck,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    href: "/finance/admin",
    title: "Finance Administration",
    description: "Legal entities, company controls, COA mapping, period management",
    icon: Building2,
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
  {
    href: "/finance/views/account-analysis",
    title: "Account Analysis",
    description: "Deep-dive account activity, balance movement, period comparison",
    icon: Calculator,
    color: "text-info",
    bg: "bg-info/10",
  },
] as const;

// ── Document shortcuts ────────────────────────────────────────────────────────

const DOCUMENT_SHORTCUTS = [
  { href: "/app/purchase-invoice", label: "Purchase Invoices", icon: FileText },
  { href: "/app/journal-entry",    label: "Journal Entries",   icon: ScrollText },
  { href: "/app/purchase-order",   label: "Purchase Orders",   icon: FileText },
  { href: "/app/payment-entry",    label: "Payment Entries",   icon: Landmark },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceWorkspacePage() {
  return (
    <PageFrame
      title="Finance"
      description="Accounting, general ledger, period management, and financial reporting"
    >
      <div className="space-y-6">

        {/* ── KPI tiles ────────────────────────────────────────────────────── */}
        <FinanceKpiCards />

        {/* ── Workbench action cards ───────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Finance Workbenches
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {WORKBENCH_ACTIONS.map(({ href, title, description, icon: Icon, color, bg }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 hover:border-border/80"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
                </div>
                <ArrowRight className="mt-auto h-3.5 w-3.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Document shortcuts ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Finance Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DOCUMENT_SHORTCUTS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PageFrame>
  );
}
