"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, CreditCard } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import {
  useApInvoices, useApPayments, useApAging, useArReceipts,
  useApInvoiceDetail, useApPaymentMethods, useCreateApPayment,
} from "../hooks/useApWorkbench";
import type { ApInvoice } from "../hooks/useApWorkbench";

type ApTab = "invoices" | "aging" | "payments" | "ar-receipts";

const TABS: Array<{ id: ApTab; label: string }> = [
  { id: "invoices",    label: "AP Invoices" },
  { id: "aging",       label: "Aging" },
  { id: "payments",    label: "AP Payments" },
  { id: "ar-receipts", label: "AR Receipts" },
];

const STATUS_COLORS: Record<string, string> = {
  draft:     "text-muted-foreground",
  submitted: "text-primary",
  approved:  "text-success",
  posted:    "text-success font-medium",
  paid:      "text-success",
  overdue:   "text-destructive font-medium",
  voided:    "text-muted-foreground line-through",
  cancelled: "text-muted-foreground",
};

function fmt(n: number, currency?: string): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
    style: currency ? "currency" : "decimal",
    currency,
  }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

interface ApWorkbenchViewProps {
  scope: FinanceScope;
}

// ── Pay Invoice dialog ────────────────────────────────────────────────────────

function PayInvoiceDialog({
  invoiceId,
  outstandingAmount,
  currencyCode,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  outstandingAmount: number;
  currencyCode: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: methods } = useApPaymentMethods();
  const createPayment = useCreateApPayment();
  const today = new Date().toISOString().slice(0, 10);

  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [valueDate, setValueDate]             = useState(today);
  const [notes, setNotes]                     = useState("");
  const [error, setError]                     = useState<string | null>(null);

  function reset() {
    setPaymentMethodId("");
    setValueDate(today);
    setNotes("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!paymentMethodId) { setError("Select a payment method"); return; }

    try {
      await createPayment.mutateAsync({
        invoice_id:        invoiceId,
        payment_method_id: paymentMethodId,
        value_date:        valueDate,
        notes:             notes.trim() || undefined,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment");
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/40",
        open ? "" : "hidden",
      )}
      onClick={(e) => { if (e.target === e.currentTarget) { reset(); onOpenChange(false); } }}
    >
      <div className="bg-background rounded-xl shadow-xl border p-5 w-full max-w-sm space-y-4">
        <div className="font-semibold text-sm">Pay Invoice</div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Amount</div>
            <div className="font-mono font-medium text-sm">
              {fmt(outstandingAmount, currencyCode)}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Payment Method</div>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            >
              <option value="">Select…</option>
              {(methods?.items ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Value Date</div>
            <input
              type="date"
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
              className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            />
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Notes (optional)</div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment reference or memo"
              className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted/40"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={createPayment.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={createPayment.isPending}
          >
            {createPayment.isPending ? "Creating…" : "Create Payment Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice detail panel ──────────────────────────────────────────────────────

function InvoiceDetailPanel({ invoiceId }: { invoiceId: string }) {
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const { data, isLoading, isError } = useApInvoiceDetail(invoiceId);

  if (isLoading) {
    return <div className="py-4 text-xs text-muted-foreground animate-pulse">Loading invoice details…</div>;
  }
  if (isError || !data) {
    return <div className="py-4 text-xs text-destructive">Failed to load invoice details.</div>;
  }

  return (
    <div className="space-y-3 p-3">
      {/* Header meta */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Currency: </span>
          <span className="font-mono">{data.currencyCode}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Period: </span>
          <span>FY{data.fiscalYear} / P{data.periodNumber}</span>
        </div>
        {data.tax_amount > 0 && (
          <div>
            <span className="text-muted-foreground">Tax: </span>
            <span className="font-mono">{fmt(data.tax_amount)}</span>
          </div>
        )}
        {data.outstandingAmount > 0 && (
          <div>
            <span className="text-muted-foreground">Outstanding: </span>
            <span className="font-mono text-warning font-medium">{fmt(data.outstandingAmount)}</span>
          </div>
        )}
      </div>

      {data.description && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{data.description}</p>
      )}

      {/* Lines table */}
      {data.lines.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="py-1.5 px-2 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="py-1.5 px-2 text-left font-medium text-muted-foreground">Description</th>
                <th className="py-1.5 px-2 text-right font-medium text-muted-foreground w-20">Qty</th>
                <th className="py-1.5 px-2 text-right font-medium text-muted-foreground w-28">Unit Price</th>
                <th className="py-1.5 px-2 text-right font-medium text-muted-foreground w-28">Net Amount</th>
                <th className="py-1.5 px-2 text-right font-medium text-muted-foreground w-24">Tax</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-1 px-2 text-muted-foreground">{l.line_no}</td>
                  <td className="py-1 px-2">{l.item_description}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-1 px-2 text-right tabular-nums font-mono">{fmt(Number(l.unit_price))}</td>
                  <td className="py-1 px-2 text-right tabular-nums font-mono font-medium">{fmt(Number(l.net_amount))}</td>
                  <td className="py-1 px-2 text-right tabular-nums font-mono text-muted-foreground">
                    {Number(l.tax_amount) > 0 ? fmt(Number(l.tax_amount)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 border-t">
                <td colSpan={4} className="py-1.5 px-2 text-right font-medium text-muted-foreground">Total Payable</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-mono font-bold">{fmt(data.payableAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Allocations */}
      {data.allocations.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Payment Allocations</p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="py-1 px-2 text-left font-medium text-muted-foreground">Payment #</th>
                  <th className="py-1 px-2 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-1 px-2 text-right font-medium text-muted-foreground">Allocated</th>
                  <th className="py-1 px-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-1 px-2 font-mono text-[10px]">{a.paymentNumber}</td>
                    <td className="py-1 px-2 text-muted-foreground">{fmtDate(a.postingDate)}</td>
                    <td className="py-1 px-2 text-right tabular-nums font-mono">{fmt(Number(a.allocatedAmount))}</td>
                    <td className={cn("py-1 px-2 capitalize", STATUS_COLORS[a.paymentStatus] ?? "")}>{a.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pay action — only when outstanding balance remains */}
      {data.outstandingAmount > 0 && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            onClick={() => setPayDialogOpen(true)}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Pay Invoice
          </button>
        </div>
      )}

      {payDialogOpen && (
        <PayInvoiceDialog
          invoiceId={invoiceId}
          outstandingAmount={data.outstandingAmount}
          currencyCode={data.currencyCode}
          open={payDialogOpen}
          onOpenChange={setPayDialogOpen}
        />
      )}
    </div>
  );
}

// ── AP Invoices tab ───────────────────────────────────────────────────────────

function InvoicesTab({ scope }: { scope: FinanceScope }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useApInvoices(scope, {
    status: statusFilter || undefined,
    page,
    limit: 50,
  });

  if (!scope.scopeId) return <EmptyState message="Select a scope to view invoices." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-7 rounded-md border px-2 text-xs bg-background"
        >
          <option value="">All statuses</option>
          {["draft","submitted","approved","posted","paid","overdue","voided"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {data?.total ?? 0} invoice{data?.total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="w-7" />
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Invoice #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Supplier</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Due</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Payable</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Outstanding</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">No invoices</td></tr>
            )}
            {(data?.items ?? []).map((inv) => (
              <Fragment key={inv.id}>
                <tr
                  className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(inv.id)}
                >
                  <td className="py-1.5 px-2 w-7">
                    {expandedId === inv.id
                      ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </td>
                  <td className="py-1.5 px-3 font-mono text-muted-foreground">{inv.invoiceNumber}</td>
                  <td className="py-1.5 px-3">{inv.supplierName ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(inv.invoiceDate)}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                  <td className="py-1.5 px-3 text-right font-mono">{fmt(inv.payableAmount)}</td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {inv.outstandingAmount > 0
                      ? <span className="text-warning font-medium">{fmt(inv.outstandingAmount)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className={cn("py-1.5 px-3 capitalize", STATUS_COLORS[inv.status] ?? "")}>
                    {inv.status}
                  </td>
                </tr>
                {expandedId === inv.id && (
                  <tr className="border-b bg-muted/10">
                    <td colSpan={8}>
                      <InvoiceDetailPanel invoiceId={inv.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
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

// ── Aging tab ─────────────────────────────────────────────────────────────────

function AgingTab({ scope }: { scope: FinanceScope }) {
  const { data, isLoading, isError } = useApAging(scope);

  if (!scope.scopeId) return <EmptyState message="Select a scope to view aging." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  const rows = data?.rows ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      days1to30: acc.days1to30 + r.days1to30,
      days31to60: acc.days31to60 + r.days31to60,
      days61to90: acc.days61to90 + r.days61to90,
      over90: acc.over90 + r.over90,
      total: acc.total + r.total,
    }),
    { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
  );

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground">As at {data?.asAt ? fmtDate(data.asAt) : "—"}</div>
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Supplier</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Current</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">1–30 days</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">31–60 days</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">61–90 days</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground text-destructive/80">&gt;90 days</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No outstanding payables</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.supplierId ?? i} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 px-3">{r.supplierName ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                <td className="py-1.5 px-3 text-right font-mono">{r.current > 0 ? fmt(r.current) : "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{r.days1to30 > 0 ? fmt(r.days1to30) : "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{r.days31to60 > 0 ? <span className="text-warning">{fmt(r.days31to60)}</span> : "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{r.days61to90 > 0 ? <span className="text-warning/80">{fmt(r.days61to90)}</span> : "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{r.over90 > 0 ? <span className="text-destructive font-medium">{fmt(r.over90)}</span> : "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono font-medium">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/50 border-t-2">
                <td className="py-2 px-3 font-medium">Total</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmt(totals.current)}</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmt(totals.days1to30)}</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmt(totals.days31to60)}</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmt(totals.days61to90)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-destructive">{fmt(totals.over90)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold">{fmt(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Payments tab ──────────────────────────────────────────────────────────────

function PaymentsTab({ scope }: { scope: FinanceScope }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useApPayments(scope, { page, limit: 50 });

  if (!scope.scopeId) return <EmptyState message="Select a scope to view payments." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground text-right">
        {data?.total ?? 0} payment{data?.total !== 1 ? "s" : ""}
      </div>
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Payment #</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Supplier</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Value Date</th>
              <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Reference</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No payments</td></tr>
            )}
            {(data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 px-3 font-mono text-muted-foreground">{p.paymentNumber}</td>
                <td className="py-1.5 px-3">{p.supplierName ?? "—"}</td>
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(p.valueDate)}</td>
                <td className="py-1.5 px-3 text-right font-mono">{fmt(p.paymentAmount)}</td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">{p.paymentReference ?? "—"}</td>
                <td className={cn("py-1.5 px-3 capitalize", STATUS_COLORS[p.status] ?? "")}>{p.status}</td>
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

// ── AR Receipts tab ───────────────────────────────────────────────────────────

function ArReceiptsTab({ scope }: { scope: FinanceScope }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useArReceipts(scope, { page, limit: 50 });

  if (!scope.scopeId) return <EmptyState message="Select a scope to view receipts." />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground text-right">
        {data?.total ?? 0} receipt{data?.total !== 1 ? "s" : ""}
      </div>
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
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
              <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No receipts</td></tr>
            )}
            {(data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-1.5 px-3 font-mono text-muted-foreground">{r.paymentNumber}</td>
                <td className="py-1.5 px-3">{r.counterpartyName ?? "—"}</td>
                <td className="py-1.5 px-3 text-muted-foreground">{fmtDate(r.valueDate)}</td>
                <td className="py-1.5 px-3 text-right font-mono text-success font-medium">{fmt(r.paymentAmount)}</td>
                <td className="py-1.5 px-3 font-mono text-muted-foreground text-[10px]">{r.paymentReference ?? "—"}</td>
                <td className={cn("py-1.5 px-3 capitalize", STATUS_COLORS[r.status] ?? "")}>{r.status}</td>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">{message}</div>
  );
}
function LoadingState() {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-muted-foreground animate-pulse">Loading…</div>
  );
}
function ErrorState() {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-destructive">Failed to load data.</div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApWorkbenchView({ scope }: ApWorkbenchViewProps) {
  const [tab, setTab] = useState<ApTab>("invoices");

  return (
    <div className="space-y-2">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-0 border-b">
        {TABS.map((t) => (
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

      {tab === "invoices"    && <InvoicesTab   scope={scope} />}
      {tab === "aging"       && <AgingTab       scope={scope} />}
      {tab === "payments"    && <PaymentsTab    scope={scope} />}
      {tab === "ar-receipts" && <ArReceiptsTab  scope={scope} />}
    </div>
  );
}
