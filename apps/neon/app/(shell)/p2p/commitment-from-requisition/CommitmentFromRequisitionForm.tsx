"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@athyper/ui/composites";
import { csrfFetch } from "@athyper/runtime-shared/client";

export interface RequisitionHeaderDto {
  requisitionId:         string;
  prNumber:              string;
  prStatus:              string;
  requestedByName?:      string;
  documentDate?:         string;
  requiredByDate?:       string;
  currencyCode:          string;
  totalEstimated?:       number;
  suggestedSupplierId?:  string;
  suggestedSupplierName?: string;
}

export interface RequisitionLineDto {
  requisitionLineId:   string;
  lineNumber:          number;
  itemCode:            string | null;
  description:         string;
  uomCode:             string;
  remainingQty:        number;
  estimatedUnitPrice:  number;
  currencyCode:        string;
  requiredByDate:      string | null;
  suggestedSupplierId: string | null;
}

interface LineFormState {
  quantity:       string;
  unitPriceOverride: string;
  requiredByDate: string;
}

export interface CommitmentFromRequisitionFormProps {
  header:      RequisitionHeaderDto;
  lines:       RequisitionLineDto[];
  linesError?: string | null;
}

interface SubmitError {
  message:     string;
  fieldErrors?: Record<string, string>;
}

export function CommitmentFromRequisitionForm({ header, lines, linesError }: CommitmentFromRequisitionFormProps) {
  const router = useRouter();
  const [documentDate,  setDocumentDate]  = useState<string>(todayIso());
  const [effectiveDate, setEffectiveDate] = useState<string>(todayIso());
  const [supplierId,    setSupplierId]    = useState<string>(header.suggestedSupplierId ?? "");
  const [notes,         setNotes]         = useState<string>("");
  const [lineState,     setLineState]     = useState<Record<string, LineFormState>>(() =>
    Object.fromEntries(lines.map((l) => [l.requisitionLineId, {
      quantity:          l.remainingQty.toString(),
      unitPriceOverride: "",
      requiredByDate:    l.requiredByDate ?? "",
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
      const s = lineState[line.requisitionLineId];
      if (!s) continue;
      const qty   = parseQty(s.quantity);
      const price = s.unitPriceOverride.trim() ? parseQty(s.unitPriceOverride) : line.estimatedUnitPrice;
      total += qty * price;
    }
    return total;
  }, [lines, lineState]);

  function updateLine(lineId: string, patch: Partial<LineFormState>) {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!supplierId.trim()) {
      setError({ message: "Supplier is required. Paste a supplier UUID, or set a suggested_supplier_id on the requisition." });
      return;
    }

    const lineSelections = lines
      .map((l) => {
        const s = lineState[l.requisitionLineId];
        if (!s) return null;
        const quantity = parseQty(s.quantity);
        if (quantity <= 0) return null;
        const unitPriceRaw = s.unitPriceOverride.trim();
        const unitPrice    = unitPriceRaw ? parseQty(unitPriceRaw) : undefined;
        const requiredByDate = s.requiredByDate.trim() || undefined;
        return {
          requisitionLineId: l.requisitionLineId,
          quantity,
          ...(unitPrice !== undefined ? { unitPrice } : {}),
          ...(requiredByDate ? { requiredByDate } : {}),
        };
      })
      .filter((x): x is { requisitionLineId: string; quantity: number; unitPrice?: number; requiredByDate?: string } => x !== null);

    if (lineSelections.length === 0) {
      setError({ message: "Enter a quantity > 0 on at least one line." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/runtime/v1/entities/purchase_order/op/commitment_from_requisition", {
        method:  "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          requisitionId:  header.requisitionId,
          supplierId:     supplierId.trim(),
          documentDate,
          effectiveDate,
          notes:          notes.trim() || undefined,
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
      const commitmentId = String(json["commitmentId"] ?? "");
      if (!commitmentId) {
        setError({ message: "Server returned no commitmentId — open the purchase orders list to find the new draft." });
        setSubmitting(false);
        return;
      }
      router.push(`/app/purchase_order/${commitmentId}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* PR summary card */}
      <section className="rounded-md border bg-card px-4 py-3 text-sm">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase Requisition</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <SummaryItem label="PR Number" value={header.prNumber} />
          <SummaryItem label="Status"    value={header.prStatus} />
          {header.requestedByName && <SummaryItem label="Requester"    value={header.requestedByName} />}
          {header.documentDate    && <SummaryItem label="Doc Date"     value={header.documentDate} />}
          {header.requiredByDate  && <SummaryItem label="Required By"  value={header.requiredByDate} />}
          <SummaryItem label="Currency" value={header.currencyCode} />
          {header.totalEstimated !== undefined && (
            <SummaryItem label="Est. Total" value={formatMoney(header.totalEstimated, header.currencyCode)} />
          )}
        </dl>
      </section>

      {/* PO header inputs */}
      <section className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-3">
          <span className="font-medium text-foreground">Supplier <span className="text-destructive">*</span></span>
          <input
            type="text"
            value={supplierId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSupplierId(e.target.value)}
            placeholder="supplier UUID (paste from supplier list, or accept the PR's suggested supplier)"
            required
            className="h-9 rounded-md border bg-background px-3 text-sm font-mono"
          />
          {header.suggestedSupplierName && header.suggestedSupplierId && (
            <span className="text-xs text-muted-foreground">
              Suggested by PR: {header.suggestedSupplierName} ({header.suggestedSupplierId.slice(0, 8)}…)
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">PO Date</span>
          <DatePicker
            kind="businessDate"
            value={documentDate || null}
            onChange={(next) => setDocumentDate(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Effective Date</span>
          <DatePicker
            kind="businessDate"
            value={effectiveDate || null}
            onChange={(next) => setEffectiveDate(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Notes <span className="text-muted-foreground">(optional)</span></span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Header-level notes…"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </label>
      </section>

      {/* Line selection grid */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Line Selection</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} open line{lines.length === 1 ? "" : "s"} on this PR · {selectedCount} selected
          </p>
        </div>

        {linesError && (
          <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {linesError}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No open requisition lines remain on this PR.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-left">UOM</th>
                  <th className="px-3 py-2 text-right">Est. Unit Price</th>
                  <th className="px-3 py-2 text-right">Order Qty</th>
                  <th className="px-3 py-2 text-right">Override Unit Price</th>
                  <th className="px-3 py-2 text-left">Required By</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const s         = lineState[line.requisitionLineId]!;
                  const lineError = error?.fieldErrors?.[line.requisitionLineId];
                  return (
                    <tr key={line.requisitionLineId} className={lineError ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2 align-top text-muted-foreground">{line.lineNumber}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-sm text-foreground">{line.description}</div>
                        {line.itemCode && <div className="text-xs text-muted-foreground">{line.itemCode}</div>}
                        {lineError && <div className="mt-1 text-xs text-destructive">{lineError}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatQty(line.remainingQty)}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{line.uomCode}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatMoney(line.estimatedUnitPrice, line.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={line.remainingQty}
                          step="any"
                          value={s.quantity}
                          onChange={(e) => updateLine(line.requisitionLineId, { quantity: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={s.unitPriceOverride}
                          onChange={(e) => updateLine(line.requisitionLineId, { unitPriceOverride: e.target.value })}
                          placeholder={line.estimatedUnitPrice.toString()}
                          className="h-8 w-28 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <DatePicker
                          kind="businessDate"
                          value={s.requiredByDate || null}
                          onChange={(next) => updateLine(line.requisitionLineId, { requiredByDate: next ?? "" })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 text-sm">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Preview total (qty × effective unit price)
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

      {/* Submission errors */}
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

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(`/app/purchase_requisition/${header.requisitionId}`)}
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
          {submitting ? "Creating…" : "Create Purchase Order"}
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
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
