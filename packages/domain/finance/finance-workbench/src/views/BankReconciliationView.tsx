"use client";

import { useEffect, useState } from "react";
import { cn, resolveSemanticColors, paymentDirectionIntent } from "@athyper/theme";
import type { FinanceScope } from "../lib/scope";
import { fmtCurrency, fmtDate } from "../components/format";
import {
  useBankAccounts,
  useBankStatement,
  useBankUnreconciled,
  useBankReconcile,
  type BankAccount,
} from "../hooks/useBankReconciliation";

type BankTab = "statement" | "unreconciled";

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
          <div className="text-doc-support text-muted-foreground font-mono">
            {acct.accountIdType ?? ""} ····{acct.accountLast4 ?? ""}
          </div>
          <div className="text-doc-support text-muted-foreground">
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
      <div className="text-doc-support text-muted-foreground">
        As at {data?.asAt ? fmtDate(data.asAt) : "—"} · {data?.items.length ?? 0} entries
      </div>
      <div className="rounded-xl border overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[920px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Payment #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Counterparty</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Reference</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Debit</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Credit</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Balance</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Cleared</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-xs text-muted-foreground">No entries for this period</td></tr>
            )}
            {(data?.items ?? []).map((item) => {
              const isInbound = item.paymentDirection === "INBOUND";
              const isCleared = Boolean(item.clearedDate) || item.status === "cleared";
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(item.valueDate)}</td>
                  <td className="py-1.5 px-3 font-mono text-muted-foreground text-doc-support">{item.paymentNumber}</td>
                  <td className="py-1.5 px-3">{item.counterpartyName ?? "—"}</td>
                  <td className="py-1.5 px-3 font-mono text-muted-foreground text-doc-support">
                    {item.bankReference ?? item.paymentReference ?? "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {isInbound ? "—" : <span className="text-destructive">{fmtCurrency(item.paymentAmount)}</span>}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {isInbound ? <span className="text-success">{fmtCurrency(item.paymentAmount)}</span> : "—"}
                  </td>
                  <td className={cn("py-1.5 px-3 text-right font-mono font-medium",
                    item.runningBalance >= 0 ? "text-success" : "text-destructive")}>
                    {fmtCurrency(Math.abs(item.runningBalance))}{item.runningBalance < 0 ? " DR" : ""}
                  </td>
                  <td className="py-1.5 px-3 text-muted-foreground text-doc-support">
                    {isCleared ? fmtDate(item.clearedDate) : "—"}
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
  const reconcile = useBankReconcile(bankAccountId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when account changes or data reloads
  useEffect(() => { setSelected(new Set()); }, [bankAccountId, data]);

  if (!bankAccountId) return <EmptyState message="Select a bank account above." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const items      = data?.items ?? [];
  const allIds     = items.map((i) => i.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const unreconTotal = data?.totalUnreconciled ?? 0;

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleMarkCleared() {
    if (selected.size === 0) return;
    await reconcile.mutateAsync({ payment_ids: Array.from(selected) });
    setSelected(new Set());
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="text-doc-support text-muted-foreground">
          {data?.count ?? 0} unreconciled item{data?.count !== 1 ? "s" : ""}
        </div>
        <div className={cn(
          "text-xs font-mono font-medium",
          unreconTotal >= 0 ? "text-warning" : "text-destructive",
        )}>
          Net: {fmtCurrency(Math.abs(unreconTotal))}{unreconTotal < 0 ? " DR" : ""}
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkCleared()}
            disabled={reconcile.isPending}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-success px-3 py-1 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-60"
          >
            {reconcile.isPending ? "Clearing…" : `Mark ${selected.size} Cleared`}
          </button>
        )}
        {reconcile.isSuccess && selected.size === 0 && (
          <span className="ml-auto text-doc-support text-success">
            {reconcile.data?.cleared} payment{reconcile.data?.cleared !== 1 ? "s" : ""} cleared
          </span>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[960px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-2 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer"
                  title="Select all"
                />
              </th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Value Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Payment #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Direction</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Counterparty</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Bank Ref</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Cleared</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-xs text-muted-foreground">All payments reconciled</td></tr>
            )}
            {items.map((item) => (
              <tr
                key={item.id}
                className={cn(
                  "border-b last:border-0 hover:bg-muted/30 cursor-pointer",
                  selected.has(item.id) ? "bg-success/10" : "",
                )}
                onClick={() => toggleOne(item.id)}
              >
                <td className="py-1.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                </td>
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(item.valueDate)}</td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-doc-support">{item.paymentNumber}</td>
                <td className="py-1.5 px-3">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-doc-support font-medium border",
                    resolveSemanticColors(paymentDirectionIntent(item.paymentDirection)).subtleBadge,
                  )}>
                    {item.paymentDirection}
                  </span>
                </td>
                <td className="py-1.5 px-3">{item.counterpartyName ?? "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono font-medium">
                  {item.paymentDirection === "INBOUND"
                    ? <span className="text-success">{fmtCurrency(item.paymentAmount)}</span>
                    : <span>{fmtCurrency(item.paymentAmount)}</span>
                  }
                </td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-doc-support">
                  {item.bankReference ?? "—"}
                </td>
                <td className="py-1.5 px-3 text-muted-foreground text-doc-support">
                  {item.clearedDate ? fmtDate(item.clearedDate) : "—"}
                </td>
                <td className="py-1.5 px-3 capitalize text-warning font-medium">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reconcile.isError && (
        <p className="text-xs text-destructive">Failed to mark payments as cleared. Try again.</p>
      )}
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
        <div className="text-doc-label text-muted-foreground uppercase mb-1.5">House Bank Accounts</div>
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
