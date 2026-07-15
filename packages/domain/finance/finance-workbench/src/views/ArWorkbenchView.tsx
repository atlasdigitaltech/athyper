"use client";

import { Fragment, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, PlusCircle, Receipt } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Skeleton,
} from "@athyper/ui/primitives";
import { DatePicker } from "@athyper/ui/composites";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import { statusTextClass } from "../lib/statusColors";
import { fmtCurrency, fmtDate, fmtFull, fmtCompact } from "../components/format";
import {
  useArAging,
  useArReceipts,
  useArInvoices,
  useArPaymentMethods,
  useCreateArReceipt,
  type ArAgingRow,
  type ArReceipt,
  type ArInvoice,
  type ArPaymentMethod,
} from "../hooks/useApWorkbench";

type ArTab = "invoices" | "receipts" | "aging";

// ── AR Aging tab ──────────────────────────────────────────────────────────────

const BUCKETS: { key: keyof ArAgingRow; label: string }[] = [
  { key: "current",    label: "Current"    },
  { key: "days1to30",  label: "1–30 days"  },
  { key: "days31to60", label: "31–60 days" },
  { key: "days61to90", label: "61–90 days" },
  { key: "over90",     label: "Over 90"    },
];

function AgingTab({ scope }: { scope: FinanceScope }) {
  const { data, isLoading, isError } = useArAging(scope);

  if (!scope.scopeId) return <EmptyState message="Select a scope to view AR aging." />;
  if (isLoading) return <TableSkeleton cols={7} />;
  if (isError || !data) return <ErrorState message="Failed to load AR aging data." />;

  const rows = data.rows;
  const totals = BUCKETS.reduce<Record<string, number>>((acc, b) => {
    acc[b.key] = rows.reduce((s, r) => s + (r[b.key] as number), 0);
    return acc;
  }, {});
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>As at {data.asAt ? fmtDate(data.asAt) : "period end"} · {rows.length} customer{rows.length !== 1 ? "s" : ""}</span>
        <span>Total outstanding: <span className="font-medium text-foreground">{fmtCompact(grandTotal)}</span></span>
      </div>

      {/* Bucket summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {BUCKETS.map((b) => {
          const val = totals[b.key] ?? 0;
          const pct = grandTotal > 0 ? (val / grandTotal) * 100 : 0;
          return (
            <div key={b.key} className="rounded-lg border p-2.5 space-y-1">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className={cn("text-sm font-medium tabular-nums", b.key !== "current" && val > 0 ? "text-warning" : "")}>
                {fmtCompact(val)}
              </div>
              <div className="text-xs text-muted-foreground">{pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-xs text-muted-foreground rounded-xl border border-dashed">
          No outstanding receivables for the selected scope.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Customer</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="py-2 px-3 text-right font-medium text-muted-foreground">{b.label}</th>
                ))}
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.customerId ?? i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-3">
                    <div className="font-medium">{row.customerName ?? "Unknown"}</div>
                  </td>
                  {BUCKETS.map((b) => {
                    const val = row[b.key] as number;
                    return (
                      <td key={b.key} className={cn("py-1.5 px-3 text-right tabular-nums", b.key !== "current" && val > 0 ? "text-warning" : "")}>
                        {val ? fmtFull(val) : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-right tabular-nums font-medium">{fmtFull(row.total)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 border-t-2">
                  <td className="py-2 px-3 font-medium">Total</td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="py-2 px-3 text-right tabular-nums font-medium">
                      {totals[b.key] ? fmtFull(totals[b.key]!) : "—"}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtFull(grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── AR Invoices tab ───────────────────────────────────────────────────────────

function InvoicesTab({ scope }: { scope: FinanceScope }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useArInvoices(scope, { page, limit: 50 });

  if (!scope.scopeId) return <EmptyState message="Select a scope to view AR invoices." />;
  if (isLoading) return <TableSkeleton cols={7} />;
  if (isError) return <ErrorState message="Failed to load AR invoices." />;

  // Sales module not yet activated — show informative empty state
  if (data?._inactive || (data?.items.length === 0 && data?.total === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 rounded-xl border border-dashed text-center">
        <Receipt className="size-8 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">No AR invoices</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data?._inactive
              ? "The sales module is not yet activated for this tenant."
              : "No invoices match the current scope and period."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground text-right">
        {data?.total ?? 0} invoice{data?.total !== 1 ? "s" : ""}
      </div>
      <div className="rounded-xl border overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Invoice #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Customer</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Invoice Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Due Date</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Total</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Outstanding</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No invoices</td></tr>
            )}
            {(data?.items ?? []).map((inv: ArInvoice) => (
              <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 px-3 tabular-nums text-muted-foreground">{inv.invoiceNumber}</td>
                <td className="py-1.5 px-3">{inv.customerName ?? "—"}</td>
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(inv.invoiceDate)}</td>
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">{fmtCurrency(inv.totalAmount)}</td>
                <td className={cn("py-1.5 px-3 text-right tabular-nums font-medium",
                  inv.outstandingAmount > 0 ? "text-warning" : "text-success")}>
                  {fmtCurrency(inv.outstandingAmount)}
                </td>
                <td className={cn("py-1.5 px-3 capitalize", statusTextClass(inv.status))}>{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
          <span className="text-muted-foreground">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={(data?.items.length ?? 0) < 50}
            className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

// ── Receive Payment dialog ────────────────────────────────────────────────────

interface ReceivePaymentDialogProps {
  scope: FinanceScope;
  onClose: () => void;
  onSuccess: () => void;
}

function ReceivePaymentDialog({ scope, onClose, onSuccess }: ReceivePaymentDialogProps) {
  const { data: methodsData } = useArPaymentMethods();
  const createReceipt = useCreateArReceipt(scope);

  const [methodId,    setMethodId]    = useState("");
  const [amount,      setAmount]      = useState("");
  const [currency,    setCurrency]    = useState(scope.bookId ? "" : "USD");
  const [counterparty, setCounterparty] = useState("");
  const [valueDate,   setValueDate]   = useState(new Date().toISOString().slice(0, 10));
  const [reference,   setReference]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [error,       setError]       = useState("");

  const methods: ArPaymentMethod[] = methodsData?.items ?? [];

  const handleSubmit = useCallback(async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!methodId) { setError("Please select a payment method."); return; }
    if (isNaN(amt) || amt <= 0) { setError("Please enter a valid amount greater than 0."); return; }
    if (!currency.trim()) { setError("Please enter a currency code."); return; }
    if (!counterparty.trim()) { setError("Please enter the payer name."); return; }

    try {
      await createReceipt.mutateAsync({
        payment_method_id:  methodId,
        payment_amount:     amt,
        currency_code:      currency.trim().toUpperCase(),
        counterparty_name:  counterparty.trim(),
        value_date:         valueDate || undefined,
        payment_reference:  reference.trim() || undefined,
        notes:              notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record receipt");
    }
  }, [methodId, amount, currency, counterparty, valueDate, reference, notes, createReceipt, onSuccess]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Receipt</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Create a draft inbound payment entry for a cash receipt.
        </p>

        <div className="space-y-3">
          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Select method…</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Amount + currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <input
                type="text"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums"
              />
            </div>
          </div>

          {/* Payer / counterparty */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Payer Name</label>
            <input
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Customer or payer name"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>

          {/* Value date */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Value Date</label>
            <div className="mt-1">
              <DatePicker
                kind="businessDate"
                value={valueDate || null}
                onChange={(next) => setValueDate(next ?? "")}
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Payment Reference <span className="text-xs font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice # or bank reference"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Notes <span className="text-xs font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive rounded-md bg-destructive/10 px-2 py-1.5">{error}</p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={createReceipt.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-success text-success-foreground rounded-md hover:bg-success/90 disabled:opacity-60 transition-colors"
          >
            <PlusCircle className="size-3.5" />
            {createReceipt.isPending ? "Recording…" : "Record Receipt"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AR Receipts tab ───────────────────────────────────────────────────────────

function ReceiptsTab({ scope, onRecordReceipt }: { scope: FinanceScope; onRecordReceipt: () => void }) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useArReceipts(scope, { page, limit: 50 });

  if (!scope.scopeId) return <EmptyState message="Select a scope to view receipts." />;
  if (isLoading) return <TableSkeleton cols={7} />;
  if (isError) return <ErrorState message="Failed to load receipts." />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data?.total ?? 0} receipt{data?.total !== 1 ? "s" : ""}
        </div>
        <button
          type="button"
          onClick={onRecordReceipt}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 border border-success/30 text-xs text-success font-medium hover:bg-success/20 transition-colors"
        >
          <PlusCircle className="size-3.5" />
          Record Receipt
        </button>
      </div>
      <div className="rounded-xl border overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-2 w-6"></th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Receipt #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Counterparty</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Value Date</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Reference</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No receipts</td></tr>
            )}
            {(data?.items ?? []).map((r: ArReceipt) => {
              const isExpanded = expandedId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    className={cn(
                      "border-b hover:bg-muted/30 cursor-pointer",
                      isExpanded && "bg-muted/20",
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <td className="py-1.5 px-2 text-muted-foreground">
                      {isExpanded
                        ? <ChevronDown className="size-3" />
                        : <ChevronRight className="size-3" />}
                    </td>
                    <td className="py-1.5 px-3 tabular-nums text-muted-foreground">{r.paymentNumber}</td>
                    <td className="py-1.5 px-3">{r.counterpartyName ?? "—"}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(r.valueDate)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-success font-medium">{fmtCurrency(r.paymentAmount)}</td>
                    <td className="py-1.5 px-3 tabular-nums text-muted-foreground text-xs">{r.paymentReference ?? "—"}</td>
                    <td className={cn("py-1.5 px-3 capitalize", statusTextClass(r.status))}>{r.status}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b bg-muted/10">
                      <td colSpan={7} className="px-6 py-3">
                        <ReceiptDetailPanel receipt={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
          <span className="text-muted-foreground">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={(data?.items.length ?? 0) < 50}
            className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

// ── Receipt detail panel ──────────────────────────────────────────────────────

function ReceiptDetailPanel({ receipt: r }: { receipt: ArReceipt }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
      <div>
        <div className="text-xs text-muted-foreground">Receipt #</div>
        <div className="tabular-nums mt-0.5">{r.paymentNumber}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Payment Type</div>
        <div className="capitalize mt-0.5">{r.paymentType ?? "Standard"}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Value Date</div>
        <div className="mt-0.5">{fmtDate(r.valueDate)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Posting Date</div>
        <div className="mt-0.5">{fmtDate(r.postingDate)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Counterparty</div>
        <div className="mt-0.5">{r.counterpartyName ?? "—"}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Currency</div>
        <div className="tabular-nums mt-0.5">{r.currencyCode}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Amount</div>
        <div className="tabular-nums font-medium text-success mt-0.5">{fmtCurrency(r.paymentAmount)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Status</div>
        <div className={cn("capitalize mt-0.5", statusTextClass(r.status))}>{r.status}</div>
      </div>
      {r.paymentReference && (
        <div className="col-span-2">
          <div className="text-xs text-muted-foreground">Payment Reference</div>
          <div className="tabular-nums mt-0.5">{r.paymentReference}</div>
        </div>
      )}
      {r.isPosted && (
        <div>
          <div className="text-xs text-muted-foreground">Posted</div>
          <div className="text-success mt-0.5">Yes</div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">{message}</div>;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/50 border-b px-3 py-2">
          <Skeleton className="h-4 w-full" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b px-3 py-2 last:border-0">
            <Skeleton className="h-4" style={{ width: `${60 + (i % 4) * 10}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-destructive rounded-xl border border-destructive/20 bg-destructive/5">
      {message}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ArWorkbenchViewProps {
  scope: FinanceScope;
}

export function ArWorkbenchView({ scope }: ArWorkbenchViewProps) {
  const [tab, setTab] = useState<ArTab>("invoices");
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0 border-b">
        {([
          { id: "invoices" as const, label: "Invoices"  },
          { id: "receipts" as const, label: "Receipts"  },
          { id: "aging"    as const, label: "AR Aging"  },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 text-xs border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "invoices" && <InvoicesTab scope={scope} />}
      {tab === "receipts" && (
        <ReceiptsTab scope={scope} onRecordReceipt={() => setShowReceiveDialog(true)} />
      )}
      {tab === "aging" && <AgingTab scope={scope} />}

      {showReceiveDialog && (
        <ReceivePaymentDialog
          scope={scope}
          onClose={() => setShowReceiveDialog(false)}
          onSuccess={() => { setShowReceiveDialog(false); }}
        />
      )}
    </div>
  );
}
