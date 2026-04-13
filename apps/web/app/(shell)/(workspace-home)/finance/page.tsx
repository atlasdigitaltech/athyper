/**
 * Finance Workspace — /finance
 *
 * Domain launcher for the Finance workspace.
 * This page is the entry point — it shows action cards that route users
 * into bespoke finance workbenches at /finance/*.
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
  FileText,
  Landmark,
  Scale,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

// ── Workbench action cards ────────────────────────────────────────────────────

const WORKBENCH_ACTIONS = [
  {
    href: "/finance/coa",
    title: "Chart of Accounts",
    description: "Account hierarchy explorer — browse, filter, drill by segment",
    icon: BookOpen,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    href: "/finance/gl",
    title: "GL Workbench",
    description: "Journal review, posting context, period filters, drill-through",
    icon: ScrollText,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    href: "/finance/views/trial-balance",
    title: "Trial Balance",
    description: "Period debit/credit balances — parameterised, drill-capable",
    icon: Scale,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    href: "/finance/views/ledger-inquiry",
    title: "Ledger Inquiry",
    description: "Account-level transaction drill-through with date range",
    icon: Landmark,
    color: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    href: "/finance/reports",
    title: "Financial Reports",
    description: "P&L, Balance Sheet, Cash Flow — generate and export",
    icon: BarChart3,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    href: "/finance/close",
    title: "Period Close",
    description: "Month-end cycle checklist, sign-off, inter-company elimination",
    icon: ClipboardCheck,
    color: "text-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/30",
  },
  {
    href: "/finance/admin",
    title: "Finance Administration",
    description: "Legal entities, company controls, COA mapping, period management",
    icon: Building2,
    color: "text-slate-600",
    bg: "bg-slate-100 dark:bg-slate-900/60",
  },
  {
    href: "/finance/views/account-analysis",
    title: "Account Analysis",
    description: "Deep-dive account activity, balance movement, period comparison",
    icon: Calculator,
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
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

        {/* ── Workbench action cards ───────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Finance Workbenches
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
