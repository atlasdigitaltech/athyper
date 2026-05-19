"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { FinanceContextBar } from "@athyper/finance-workbench/components";

/**
 * Finance workbench layout — (workbench)/finance
 *
 * Wraps all finance bespoke control surfaces:
 *   /finance/coa        — Chart of Accounts workbench
 *   /finance/gl         — GL Workbench
 *   /finance/ap         — AP / AR Workbench (invoices, aging, payments, receipts)
 *   /finance/ar         — AR Workbench (aging + receipts)
 *   /finance/bank-recon — Bank Reconciliation (statement + mark-cleared)
 *   /finance/admin      — Finance Administration console
 *   /finance/close      — Period Close workbench
 *   /finance/reports    — Financial Reports hub
 *   /finance/views/*    — Ledger-style analytical views (trial balance, inquiry, analysis)
 *
 * ── Scope state model ─────────────────────────────────────────────────────────
 *
 * FinanceContextBar owns scope state via URL query params (scopeType, scopeId,
 * fiscalYear, period). All child pages call parseFinanceScope(searchParams) to
 * read scope — no prop drilling, no context provider needed.
 *
 * ── URL ownership ─────────────────────────────────────────────────────────────
 *
 * /finance        → owned by (workspace-home)/finance/page.tsx (launcher)
 * /finance/coa    → owned by this group (workbench surface)
 * /finance/gl     → owned by this group (workbench surface)
 * etc.
 *
 * Both resolve correctly via Next.js route groups — no URL conflict.
 */
export default function FinanceWorkbenchLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showContextBar = ![
    "/finance/gl",
    "/finance/reports",
    "/finance/spend-categories",
    "/finance/commodity-categories",
    "/finance/business-intents",
    "/finance/accounting-profiles",
  ].includes(pathname);

  return (
    <div className="flex h-full flex-col">
      {showContextBar && (
        <Suspense fallback={<div className="h-9 shrink-0 border-b bg-muted/30" />}>
          <FinanceContextBar />
        </Suspense>
      )}
      <div className={showContextBar ? "min-h-0 flex-1 overflow-auto" : "min-h-0 flex-1 overflow-hidden"}>
        {children}
      </div>
    </div>
  );
}
