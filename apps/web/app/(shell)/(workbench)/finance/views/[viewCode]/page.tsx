"use client";

/**
 * Finance Ledger Views — /finance/views/[viewCode]
 *
 * Parameterised analytical views — all context in query state.
 *
 * Supported viewCodes:
 *   trial-balance    → TrialBalanceView (scope-driven)
 *   ledger-inquiry   → GlDetailView with account selector
 *   account-analysis → AccountAnalysisView (period-by-period movements)
 *   journal          → JournalGrid
 *   posting-trace    → PostingTrace
 *
 * Canonical URL patterns:
 *   /finance/views/trial-balance?scopeType=company&scopeId=AUKA&fiscalYear=2026&period=3
 *   /finance/views/ledger-inquiry?account=400100&scopeId=AUKA&fiscalYear=2026&period=3
 *   /finance/views/account-analysis?account=400100&scopeId=AUKA&fiscalYear=2026
 *   /finance/views/journal?scopeType=company&scopeId=AUKA&fiscalYear=2026
 *   /finance/views/posting-trace?jeId=<journal-entry-id>
 */

import { useCallback } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Input } from "@athyper/ui/primitives";
import {
  JournalGrid,
  PostingTrace,
  TrialBalanceView,
  AccountAnalysisView,
} from "@athyper/finance-workbench/views";
import { GlDetailView } from "@athyper/finance-workbench/views";
import type { FinanceScope } from "@athyper/finance-workbench";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatName(code: string): string {
  return code.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function scopeFromParams(sp: URLSearchParams): FinanceScope {
  const scopeType  = (sp.get("scopeType") ?? "company") as FinanceScope["scopeType"];
  const scopeId    = sp.get("scopeId") ?? "";
  const fyRaw      = sp.get("fiscalYear");
  const fiscalYear = fyRaw ? parseInt(fyRaw, 10) : new Date().getFullYear();
  const pRaw       = sp.get("period");
  const period: number | null =
    pRaw !== null && pRaw !== "" ? parseInt(pRaw, 10) : null;
  return {
    scopeType,
    scopeId,
    fiscalYear: isNaN(fiscalYear) ? new Date().getFullYear() : fiscalYear,
    period:     period !== null && !isNaN(period) ? period : null,
    bookId:     sp.get("bookId") ?? undefined,
  };
}

// ── Account selector shared by ledger-inquiry and account-analysis ─────────

function AccountInput({
  value,
  onChange,
  placeholder,
}: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <label className="text-xs text-muted-foreground whitespace-nowrap">Account code</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-52 text-xs font-mono"
      />
    </div>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function JournalView({ scope }: { scope: FinanceScope }) {
  return (
    <div className="space-y-4">
      {!scope.scopeId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
          Pass <code className="font-mono text-xs">?scopeType=company&amp;scopeId=AUKA&amp;fiscalYear=2026</code> to filter by company and period.
        </div>
      )}
      <JournalGrid scope={scope} />
    </div>
  );
}

function PostingTraceView({ jeId }: { jeId: string | null }) {
  if (!jeId) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Pass <code className="font-mono text-xs">?jeId=&lt;journal-entry-id&gt;</code> to view a posting trace.
        </p>
      </div>
    );
  }
  return <PostingTrace jeId={jeId} />;
}

function LedgerInquiryView({
  scope,
  accountCode,
  onAccountChange,
}: {
  scope:           FinanceScope;
  accountCode:     string;
  onAccountChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0">
      <AccountInput
        value={accountCode}
        onChange={onAccountChange}
        placeholder="e.g. 400100"
      />
      <GlDetailView scope={scope} accountCode={accountCode} />
    </div>
  );
}

function AccountAnalysisViewWrapper({
  scope,
  accountCode,
  onAccountChange,
}: {
  scope:           FinanceScope;
  accountCode:     string;
  onAccountChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0">
      <AccountInput
        value={accountCode}
        onChange={onAccountChange}
        placeholder="e.g. 400100"
      />
      <AccountAnalysisView scope={scope} accountCode={accountCode} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceLedgerViewPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const viewCode    = params["viewCode"] as string;
  const scope       = scopeFromParams(searchParams);
  const jeId        = searchParams.get("jeId");
  const accountCode = searchParams.get("account") ?? "";

  const setAccount = useCallback(
    (value: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set("account", value);
      else p.delete("account");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [searchParams, router, pathname],
  );

  let content: React.ReactNode;
  switch (viewCode) {
    case "journal":
      content = <JournalView scope={scope} />;
      break;
    case "posting-trace":
      content = <PostingTraceView jeId={jeId} />;
      break;
    case "trial-balance":
      content = <TrialBalanceView scope={scope} />;
      break;
    case "ledger-inquiry":
      content = (
        <LedgerInquiryView
          scope={scope}
          accountCode={accountCode}
          onAccountChange={setAccount}
        />
      );
      break;
    case "account-analysis":
      content = (
        <AccountAnalysisViewWrapper
          scope={scope}
          accountCode={accountCode}
          onAccountChange={setAccount}
        />
      );
      break;
    default:
      content = (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Unknown view: <code className="ml-1 font-mono text-xs">{viewCode}</code>
        </div>
      );
  }

  return (
    <PageFrame
      title={formatName(viewCode)}
      description={`Finance / ${viewCode}`}
      actions={<Badge variant="muted">finance / views</Badge>}
    >
      {content}
    </PageFrame>
  );
}
