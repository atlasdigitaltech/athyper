"use client";

import { useEffect, useState } from "react";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import {
  useBankAccounts,
  useBankStatement,
  useBankUnreconciled,
  type BankAccount,
} from "../hooks/useBankReconciliation";

type BankTab = "statement" | "unreconciled";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Account selector ──────────────────────────────────────────────────────────

function AccountSelector({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: BankAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-2 border rounded-lg">
        No house bank accounts found for this scope.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((acct) => (
        <button
          key={acct.id}
          type="button"
          onClick={() => onSelect(acct.id)}
          className={cn(
            "flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-colors",
            selectedId === acct.id
              ? "border-primary bg-primary/5 text-primary"
              : "hover:bg-muted/40 text-foreground",
          )}
        >
          <div className="text-xs font-medium">{acct.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {acct.accountIdType ?? ""} ····{acct.accountLast4 ?? ""}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {acct.currencyCode}{acct.isPrimary ? " · Primary" : ""}
            {acct.glAccountCode ? ` · GL ${acct.glAccountCode}` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Statement tab ─────────────────────────────────────────────────────────────

function StatementTab({ scope, bankAccountId }: { scope: FinanceScope; bankAccountId: string | null }) {
  const { data, isLoading, isError } = useBankStatement(scope, bankAccountId);

  if (!bankAccountId) return <EmptyState message="Select a bank account above." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground">
        As at {data?.asAt ? fmtDate(data.asAt) : "—"} · {data?.items.length ?? 0} entries
      </div>
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Payment #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Counterparty</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Reference</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Debit</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Credit</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Balance</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">No entries for this period</td></tr>
            )}
            {(data?.items ?? []).map((item) => {
              const isInbound = item.paymentDirection === "INBOUND";
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(item.valueDate)}</td>
                  <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">{item.paymentNumber}</td>
                  <td className="py-1.5 px-3">{item.counterpartyName ?? "—"}</td>
                  <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">
                    {item.bankReference ?? item.paymentReference ?? "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {isInbound ? "—" : <span className="text-destructive">{fmt(item.paymentAmount)}</span>}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {isInbound ? <span className="text-emerald-600">{fmt(item.paymentAmount)}</span> : "—"}
                  </td>
                  <td className={cn("py-1.5 px-3 text-right font-mono font-medium",
                    item.runningBalance >= 0 ? "text-emerald-700" : "text-destructive")}>
                    {fmt(Math.abs(item.runningBalance))}{item.runningBalance < 0 ? " DR" : ""}
                  </td>
                  <td className="py-1.5 px-3 capitalize text-muted-foreground">{item.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Unreconciled tab ──────────────────────────────────────────────────────────

function UnreconciledTab({ scope, bankAccountId }: { scope: FinanceScope; bankAccountId: string | null }) {
  const { data, isLoading, isError } = useBankUnreconciled(scope, bankAccountId);

  if (!bankAccountId) return <EmptyState message="Select a bank account above." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const unreconTotal = data?.totalUnreconciled ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="text-[10px] text-muted-foreground">
          {data?.count ?? 0} unreconciled item{data?.count !== 1 ? "s" : ""}
        </div>
        <div className={cn(
          "ml-auto text-xs font-mono font-medium",
          unreconTotal >= 0 ? "text-amber-600" : "text-destructive",
        )}>
          Net unreconciled: {fmt(Math.abs(unreconTotal))}{unreconTotal < 0 ? " DR" : ""}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Value Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Payment #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Direction</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Counterparty</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Bank Ref</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">All payments reconciled</td></tr>
            )}
            {(data?.items ?? []).map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(item.valueDate)}</td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">{item.paymentNumber}</td>
                <td className="py-1.5 px-3">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    item.paymentDirection === "INBOUND"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-blue-50 text-blue-700",
                  )}>
                    {item.paymentDirection}
                  </span>
                </td>
                <td className="py-1.5 px-3">{item.counterpartyName ?? "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono font-medium">
                  {item.paymentDirection === "INBOUND"
                    ? <span className="text-emerald-600">{fmt(item.paymentAmount)}</span>
                    : <span>{fmt(item.paymentAmount)}</span>
                  }
                </td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">
                  {item.bankReference ?? "—"}
                </td>
                <td className="py-1.5 px-3 capitalize text-amber-600 font-medium">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">{message}</div>;
}
function LoadingState() {
  return <div className="flex items-center justify-center h-32 text-xs text-muted-foreground animate-pulse">Loading…</div>;
}
function ErrorState() {
  return <div className="flex items-center justify-center h-32 text-xs text-destructive">Failed to load data.</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface BankReconciliationViewProps {
  scope: FinanceScope;
}

export function BankReconciliationView({ scope }: BankReconciliationViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [tab, setTab] = useState<BankTab>("statement");

  const { data: accounts = [], isLoading: accountsLoading } = useBankAccounts(scope);

  // Auto-select primary account when accounts first load
  useEffect(() => {
    if (selectedAccountId || accounts.length === 0) return;
    const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
    if (primary) setSelectedAccountId(primary.id);
  }, [accounts, selectedAccountId]);

  if (!scope.scopeId) {
    return <EmptyState message="Select a scope to view bank reconciliation." />;
  }

  return (
    <div className="space-y-3">
      {/* Account selector */}
      <div>
        <div className="text-[9px] text-muted-foreground uppercase mb-1.5">House Bank Accounts</div>
        {accountsLoading
          ? <div className="text-xs text-muted-foreground animate-pulse">Loading accounts…</div>
          : <AccountSelector
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={setSelectedAccountId}
            />
        }
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-0 border-b">
        {(["statement", "unreconciled"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-xs border-b-2 capitalize transition-colors",
              tab === t
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "unreconciled" ? "Unreconciled" : "Statement"}
          </button>
        ))}
      </div>

      {tab === "statement"    && <StatementTab    scope={scope} bankAccountId={selectedAccountId} />}
      {tab === "unreconciled" && <UnreconciledTab scope={scope} bankAccountId={selectedAccountId} />}
    </div>
  );
}
