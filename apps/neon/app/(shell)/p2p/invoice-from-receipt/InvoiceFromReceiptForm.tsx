"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@athyper/platform-ui/composites";
import { csrfFetch } from "@athyper/runtime-shared/client";

export interface ReceiptHeaderDto {
  receiptId:    string;
  receiptNumber: string;
  status:       string;
  documentDate?: string;
  supplierName?: string;
  currencyCode: string;
  commitmentId?: string;
}

export interface ReceiptLineDto {
  receiptLineId: string;
  lineNumber:    number;
  poNumber:      string | null;
  poLineNumber:  number | null;
  itemCode:      string | null;
  description:   string;
  uomCode:       string;
  acceptedQty:   number;       // remaining accepted (server has already netted invoiced)
  unitCost:      number;
  currencyCode:  string;
}

interface LineFormState {
  quantity:    string;
  unitPrice:   string;
  notes:       string;
}

export interface InvoiceFromReceiptFormProps {
  header:      ReceiptHeaderDto;
  lines:       ReceiptLineDto[];
  linesError?: string | null;
}

interface SubmitError {
  message:     string;
  fieldErrors?: Record<string, string>;
}

export function InvoiceFromReceiptForm({ header, lines, linesError }: InvoiceFromReceiptFormProps) {
  const router = useRouter();
  const [supplierInvNo,   setSupplierInvNo]   = useState<string>("");
  const [supplierInvDate, setSupplierInvDate] = useState<string>(todayIso());
  const [documentDate,    setDocumentDate]    = useState<string>(todayIso());
  const [notes,           setNotes]           = useState<string>("");
  const [lineState, setLineState] = useState<Record<string, LineFormState>>(() =>
    Object.fromEntries(lines.map((l) => [l.receiptLineId, {
      quantity:  l.acceptedQty.toString(),
      unitPrice: "",
      notes:     "",
    }])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<SubmitError | null>(null);

  const selectedCount = useMemo(
    () => Object.values(lineState).filter((s) => parseQty(s.quantity) > 0).length,
    [lineState],
  );

  const previewTotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const s = lineState[line.receiptLineId];
      if (!s) continue;
      const qty   = parseQty(s.quantity);
      const price = s.unitPrice.trim() === "" ? line.unitCost : Number(s.unitPrice);
      if (Number.isFinite(price)) total += qty * price;
    }
    return total;
  }, [lines, lineState]);

  function updateLine(lineId: string, patch: Partial<LineFormState>) {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supplierInvNo.trim()) {
      setError({ message: "Supplier Invoice Number is required." });
      return;
    }
    if (!supplierInvDate) {
      setError({ message: "Supplier Invoice Date is required." });
      return;
    }

    const lineSelections = lines
      .map((l) => {
        const s = lineState[l.receiptLineId];
        if (!s) return null;
        const qty = parseQty(s.quantity);
        if (qty <= 0) return null;
        const unitPriceOverride = s.unitPrice.trim() === "" ? undefined : Number(s.unitPrice);
        const notesValue = s.notes.trim();
        return {
          receiptLineId: l.receiptLineId,
          quantity:      qty,
          ...(Number.isFinite(unitPriceOverride as number) ? { unitPrice: unitPriceOverride } : {}),
          ...(notesValue ? { notes: notesValue } : {}),
        };
      })
      .filter((x): x is { receiptLineId: string; quantity: number; unitPrice?: number; notes?: string } => x !== null);

    if (lineSelections.length === 0) {
      setError({ message: "Enter a quantity > 0 on at least one line." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/runtime/v1/entities/purchase_invoice/op/invoice_from_receipt", {
        method:  "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          receiptId:             header.receiptId,
          supplierInvoiceNumber: supplierInvNo.trim(),
          supplierInvoiceDate:   supplierInvDate,
          documentDate,
          notes:                 notes.trim() || undefined,
          lineSelections,
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
      const invoiceId = String(json["invoiceId"] ?? "");
      if (!invoiceId) {
        setError({ message: "Server returned no invoiceId — open the invoices list to find the new draft." });
        setSubmitting(false);
        return;
      }
      router.push(`/app/purchase_invoice/${invoiceId}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="rounded-md border bg-card px-4 py-3 text-sm">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Receipt</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <SummaryItem label="Receipt #" value={header.receiptNumber} />
          <SummaryItem label="Status"    value={header.status} />
          {header.documentDate && <SummaryItem label="Doc Date" value={header.documentDate} />}
          {header.supplierName && <SummaryItem label="Supplier" value={header.supplierName} />}
          <SummaryItem label="Currency" value={header.currencyCode} />
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Supplier Invoice # <span className="text-destructive">*</span></span>
          <input
            type="text"
            value={supplierInvNo}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSupplierInvNo(e.target.value)}
            required
            placeholder="From the supplier's invoice document"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Supplier Invoice Date <span className="text-destructive">*</span></span>
          <DatePicker
            kind="businessDate"
            value={supplierInvDate || null}
            onChange={(next) => setSupplierInvDate(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Our Document Date</span>
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
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice Line Selections</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} open line{lines.length === 1 ? "" : "s"} · {selectedCount} selected
          </p>
        </div>

        {linesError && (
          <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{linesError}</p>
        )}

        {lines.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No open receipt lines remain to be invoiced.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">PO Ref</th>
                  <th className="px-3 py-2 text-right">Accepted</th>
                  <th className="px-3 py-2 text-left">UOM</th>
                  <th className="px-3 py-2 text-right">PO Unit Cost</th>
                  <th className="px-3 py-2 text-right">Invoice Qty</th>
                  <th className="px-3 py-2 text-right">Unit Price Override</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const s         = lineState[line.receiptLineId]!;
                  const lineError = error?.fieldErrors?.[line.receiptLineId];
                  return (
                    <tr key={line.receiptLineId} className={lineError ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2 align-top text-muted-foreground">{line.lineNumber}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-sm text-foreground">{line.description}</div>
                        {line.itemCode && <div className="text-xs text-muted-foreground">{line.itemCode}</div>}
                        {lineError && <div className="mt-1 text-xs text-destructive">{lineError}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                        {line.poNumber ? `${line.poNumber} · L${line.poLineNumber ?? "?"}` : "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatQty(line.acceptedQty)}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{line.uomCode}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatMoney(line.unitCost, line.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} max={line.acceptedQty} step="any"
                          value={s.quantity}
                          onChange={(e) => updateLine(line.receiptLineId, { quantity: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} step="any" placeholder="—"
                          value={s.unitPrice}
                          onChange={(e) => updateLine(line.receiptLineId, { unitPrice: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 text-sm">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Preview subtotal (qty × price)
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatMoney(previewTotal, header.currencyCode)}
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
          {error.message} <span className="text-xs">(see line-level notes above)</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(`/app/receipt/${header.receiptId}`)}
          disabled={submitting}
          className="h-9 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || lines.length === 0}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function parseQty(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatMoney(value: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
