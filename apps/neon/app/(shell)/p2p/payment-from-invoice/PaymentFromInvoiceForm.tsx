"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@athyper/platform-ui/composites";
import { csrfFetch } from "@athyper/runtime-shared/client";

export interface OpenInvoiceDto {
  invoiceId:             string;
  invoiceNumber:         string;
  supplierInvoiceNumber: string | null;
  documentDate:          string;
  status:                string;
  currencyCode:          string;
  payableAmount:         number;
  alreadyAllocated:      number;
  remainingAmount:       number;
}

interface AllocationFormState {
  selected:              boolean;
  allocatedAmount:       string;
  discountAmount:        string;
  withholdingTaxAmount:  string;
  advanceRecoveryAmount: string;
  retentionAmount:       string;
  notes:                 string;
}

export interface PaymentFromInvoiceFormProps {
  seedInvoiceId:  string;
  invoices:       OpenInvoiceDto[];
  invoicesError?: string | null;
}

interface SubmitError {
  message:     string;
  fieldErrors?: Record<string, string>;
}

export function PaymentFromInvoiceForm({ seedInvoiceId, invoices, invoicesError }: PaymentFromInvoiceFormProps) {
  const router = useRouter();
  const [documentDate, setDocumentDate] = useState<string>(todayIso());
  const [notes,        setNotes]        = useState<string>("");

  // Default-select the seed invoice; pre-fill its allocated_amount to its remaining.
  const [allocState, setAllocState] = useState<Record<string, AllocationFormState>>(() =>
    Object.fromEntries(invoices.map((inv) => [inv.invoiceId, {
      selected:              inv.invoiceId === seedInvoiceId,
      allocatedAmount:       inv.invoiceId === seedInvoiceId ? inv.remainingAmount.toString() : "",
      discountAmount:        "",
      withholdingTaxAmount:  "",
      advanceRecoveryAmount: "",
      retentionAmount:       "",
      notes:                 "",
    }])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<SubmitError | null>(null);

  const headerCurrency = invoices[0]?.currencyCode ?? "USD";

  const selectedRows = useMemo(
    () => invoices.filter((inv) => allocState[inv.invoiceId]?.selected),
    [invoices, allocState],
  );

  // Detect cross-currency mismatch — server rejects but UX should warn early.
  const currencyMismatch = useMemo(() => {
    const currencies = new Set(selectedRows.map((r) => r.currencyCode));
    return currencies.size > 1 ? Array.from(currencies) : null;
  }, [selectedRows]);

  const previewTotal = useMemo(() => {
    let total = 0;
    for (const inv of selectedRows) {
      const s = allocState[inv.invoiceId]!;
      total += parseAmt(s.allocatedAmount);
    }
    return total;
  }, [selectedRows, allocState]);

  function updateAlloc(invoiceId: string, patch: Partial<AllocationFormState>) {
    setAllocState((prev) => ({ ...prev, [invoiceId]: { ...prev[invoiceId]!, ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (currencyMismatch) {
      setError({ message: `Selected invoices use different currencies (${currencyMismatch.join(", ")}). One payment can only target one currency.` });
      return;
    }

    const allocations = invoices
      .map((inv) => {
        const s = allocState[inv.invoiceId];
        if (!s || !s.selected) return null;
        const allocated = parseAmt(s.allocatedAmount);
        if (allocated <= 0) return null;
        const discount   = parseAmt(s.discountAmount);
        const wht        = parseAmt(s.withholdingTaxAmount);
        const advRecover = parseAmt(s.advanceRecoveryAmount);
        const retention  = parseAmt(s.retentionAmount);
        const notesValue = s.notes.trim();
        return {
          invoiceId:               inv.invoiceId,
          allocatedAmount:         allocated,
          ...(discount   > 0 ? { discountAmount:        discount }   : {}),
          ...(wht        > 0 ? { withholdingTaxAmount:  wht }        : {}),
          ...(advRecover > 0 ? { advanceRecoveryAmount: advRecover } : {}),
          ...(retention  > 0 ? { retentionAmount:       retention }  : {}),
          ...(notesValue     ? { notes: notesValue }                 : {}),
        };
      })
      .filter((x): x is {
        invoiceId: string; allocatedAmount: number;
        discountAmount?: number; withholdingTaxAmount?: number;
        advanceRecoveryAmount?: number; retentionAmount?: number;
        notes?: string;
      } => x !== null);

    if (allocations.length === 0) {
      setError({ message: "Select at least one invoice and enter an allocated amount > 0." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/runtime/v1/entities/payment_entry/op/payment_from_invoice", {
        method:  "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          documentDate,
          notes:       notes.trim() || undefined,
          allocations,
        }),
      });
      const json = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError({
          message:     String(json["message"] ?? json["error"] ?? `Request failed (HTTP ${res.status}).`),
          fieldErrors: (json["fieldErrors"] ?? undefined) as Record<string, string> | undefined,
        });
        setSubmitting(false);
        return;
      }
      const paymentId = String(json["paymentId"] ?? "");
      if (!paymentId) {
        setError({ message: "Server returned no paymentId — open the payments list to find the new draft." });
        setSubmitting(false);
        return;
      }
      router.push(`/app/payment_entry/${paymentId}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Payment Date</span>
          <DatePicker
            kind="businessDate"
            value={documentDate || null}
            onChange={(next) => setDocumentDate(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Notes <span className="text-muted-foreground">(optional)</span></span>
          <input
            type="text"
            value={notes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
            placeholder="Header-level notes…"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Invoices for this Supplier</h2>
          <p className="text-xs text-muted-foreground">
            {invoices.length} payable invoice{invoices.length === 1 ? "" : "s"} · {selectedRows.length} selected
          </p>
        </div>

        {invoicesError && (
          <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{invoicesError}</p>
        )}
        {currencyMismatch && (
          <p className="mb-2 rounded-md border border-amber-400/40 bg-amber-100/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
            Selected invoices span multiple currencies ({currencyMismatch.join(", ")}). Pick a single currency before submitting.
          </p>
        )}

        {invoices.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No open invoices remain for this supplier.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left">Invoice #</th>
                  <th className="px-3 py-2 text-left">Supplier Ref</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Payable</th>
                  <th className="px-3 py-2 text-right">Allocated</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Pay Amount</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">WHT</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const s         = allocState[inv.invoiceId]!;
                  const lineError = error?.fieldErrors?.[inv.invoiceId];
                  return (
                    <tr key={inv.invoiceId} className={lineError ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={s.selected}
                          onChange={(e) => updateAlloc(inv.invoiceId, {
                            selected:        e.target.checked,
                            allocatedAmount: e.target.checked && !s.allocatedAmount ? inv.remainingAmount.toString() : s.allocatedAmount,
                          })}
                          className="h-4 w-4 rounded border"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-foreground">{inv.invoiceNumber}</div>
                        {lineError && <div className="mt-1 text-xs text-destructive">{lineError}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{inv.supplierInvoiceNumber ?? "—"}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{inv.documentDate}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{inv.status}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatMoney(inv.payableAmount, inv.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums text-muted-foreground">{formatMoney(inv.alreadyAllocated, inv.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatMoney(inv.remainingAmount, inv.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} max={inv.remainingAmount} step="any"
                          value={s.allocatedAmount}
                          onChange={(e) => updateAlloc(inv.invoiceId, { allocatedAmount: e.target.value })}
                          disabled={!s.selected}
                          className="h-8 w-28 rounded-md border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} step="any" placeholder="—"
                          value={s.discountAmount}
                          onChange={(e) => updateAlloc(inv.invoiceId, { discountAmount: e.target.value })}
                          disabled={!s.selected}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} step="any" placeholder="—"
                          value={s.withholdingTaxAmount}
                          onChange={(e) => updateAlloc(inv.invoiceId, { withholdingTaxAmount: e.target.value })}
                          disabled={!s.selected}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 text-sm">
                  <td colSpan={8} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Payment total (sum of allocated amounts)
                  </td>
                  <td colSpan={3} className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatMoney(previewTotal, headerCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {error && !error.fieldErrors && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {error?.fieldErrors && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message} <span className="text-xs">(see invoice-level notes above)</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(`/app/purchase_invoice/${seedInvoiceId}`)}
          disabled={submitting}
          className="h-9 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || invoices.length === 0 || !!currencyMismatch}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Payment"}
        </button>
      </div>
    </form>
  );
}

function parseAmt(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMoney(value: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
