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
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";
import { FinanceKpiCards } from "./_components/FinanceKpiCards";

// ── Workbench action cards ────────────────────────────────────────────────────

const WORKBENCH_ACTIONS = [
  {
    href: "/finance/ap",
    title: "AP Workbench",
    description: "Payables invoices, aging buckets, outbound payments",
    icon: FileText,
  },
  {
    href: "/finance/ar",
    title: "AR Workbench",
    description: "Receivables aging, inbound receipts, customer balances",
    icon: CreditCard,
  },
  {
    href: "/finance/bank-recon",
    title: "Bank Reconciliation",
    description: "Bank statement review, mark cleared, unreconciled items",
    icon: Landmark,
  },
  {
    href: "/finance/gl",
    title: "GL Workbench",
    description: "Journal review, posting context, period filters, drill-through",
    icon: ScrollText,
  },
  {
    href: "/finance/coa",
    title: "Chart of Accounts",
    description: "Account hierarchy explorer — browse, filter, drill by segment",
    icon: BookOpen,
  },
  {
    href: "/finance/views/trial-balance",
    title: "Trial Balance",
    description: "Period debit/credit balances — parameterised, drill-capable",
    icon: Scale,
  },
  {
    href: "/finance/reports",
    title: "Financial Reports",
    description: "P&L, Balance Sheet, Cash Flow — generate and export",
    icon: BarChart3,
  },
  {
    href: "/finance/close",
    title: "Period Close",
    description: "Month-end cycle checklist, sign-off, inter-company elimination",
    icon: ClipboardCheck,
  },
  {
    href: "/finance/admin",
    title: "Finance Administration",
    description: "Legal entities, company controls, COA mapping, period management",
    icon: Building2,
  },
  {
    href: "/finance/views/account-analysis",
    title: "Account Analysis",
    description: "Deep-dive account activity, balance movement, period comparison",
    icon: Calculator,
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
          <SectionLabel>Finance Workbenches</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {WORKBENCH_ACTIONS.map((action) => (
              <ActionLinkCard key={action.href} layout="vertical" {...action} />
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
