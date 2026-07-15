"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@athyper/ui/composites";
import { csrfFetch } from "@athyper/runtime-shared/client";

export interface CommitmentHeaderDto {
  commitmentId: string;
  poNumber:     string;
  poStatus:     string;
  poType?:      string;
  supplierName?: string;
  documentDate?: string;
  currencyCode: string;
  totalAmount?: number;
}

export interface CommitmentLineDto {
  commitmentLineId: string;
  lineNumber:       number;
  itemCode:         string | null;
  description:      string;
  uomCode:          string;
  remainingQty:     number;
  unitPrice:        number;
  currencyCode:     string;
}

interface LineFormState {
  acceptedQty:  string;
  rejectedQty:  string;
  rejectReason: string;
}

export interface ReceiptFromCommitmentFormProps {
  header:      CommitmentHeaderDto;
  lines:       CommitmentLineDto[];
  linesError?: string | null;
}

interface SubmitError {
  message:     string;
  fieldErrors?: Record<string, string>;
}

export function ReceiptFromCommitmentForm({ header, lines, linesError }: ReceiptFromCommitmentFormProps) {
  const router = useRouter();
  const [documentDate, setDocumentDate] = useState<string>(todayIso());
  const [notes,        setNotes]        = useState<string>("");
  const [lineState,    setLineState]    = useState<Record<string, LineFormState>>(() =>
    Object.fromEntries(lines.map((l) => [l.commitmentLineId, {
      acceptedQty:  l.remainingQty.toString(),
      rejectedQty:  "0",
      rejectReason: "",
    }])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<SubmitError | null>(null);

  const selectedCount = useMemo(
    () => Object.values(lineState).filter((s) => parseQty(s.acceptedQty) > 0).length,
    [lineState],
  );

  const previewTotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const s = lineState[line.commitmentLineId];
      if (!s) continue;
      total += parseQty(s.acceptedQty) * line.unitPrice;
    }
    return total;
  }, [lines, lineState]);

  function updateLine(lineId: string, patch: Partial<LineFormState>) {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const lineAcceptances = lines
      .map((l) => {
        const s = lineState[l.commitmentLineId];
        if (!s) return null;
        const accepted = parseQty(s.acceptedQty);
        if (accepted <= 0) return null;
        const rejected = parseQty(s.rejectedQty);
        const notesValue = s.rejectReason.trim();
        return {
          commitmentLineId: l.commitmentLineId,
          acceptedQty:      accepted,
          ...(rejected > 0 ? { rejectedQty: rejected } : {}),
          ...(notesValue   ? { notes: notesValue }     : {}),
        };
      })
      .filter((x): x is { commitmentLineId: string; acceptedQty: number; rejectedQty?: number; notes?: string } => x !== null);

    if (lineAcceptances.length === 0) {
      setError({ message: "Enter an accepted quantity > 0 on at least one line." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/runtime/v1/entities/receipt/op/receipt_from_commitment", {
        method:  "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          commitmentId: header.commitmentId,
          documentDate,
          notes:        notes.trim() || undefined,
          lineAcceptances,
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
      const receiptId = String(json["receiptId"] ?? "");
      if (!receiptId) {
        setError({ message: "Server returned no receiptId — open the receipts list to find the new draft." });
        setSubmitting(false);
        return;
      }
      router.push(`/app/receipt/${receiptId}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* PO summary card */}
      <section className="rounded-md border bg-card px-4 py-3 text-sm">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase Order</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <SummaryItem label="PO Number"   value={header.poNumber} />
          <SummaryItem label="Status"      value={header.poStatus} />
          {header.poType       && <SummaryItem label="Type"     value={header.poType} />}
          {header.documentDate && <SummaryItem label="Doc Date" value={header.documentDate} />}
          {header.supplierName && <SummaryItem label="Supplier" value={header.supplierName} />}
          <SummaryItem label="Currency"     value={header.currencyCode} />
          {header.totalAmount !== undefined && (
            <SummaryItem label="Total" value={formatMoney(header.totalAmount, header.currencyCode)} />
          )}
        </dl>
      </section>

      {/* Receipt header inputs */}
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Receipt Date</span>
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

      {/* Line acceptance grid */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Line Acceptance</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} open line{lines.length === 1 ? "" : "s"} on this PO · {selectedCount} selected
          </p>
        </div>

        {linesError && (
          <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {linesError}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No open commitment lines remain on this PO.
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
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Accepted Qty</th>
                  <th className="px-3 py-2 text-right">Rejected Qty</th>
                  <th className="px-3 py-2 text-left">Reject Reason</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const s         = lineState[line.commitmentLineId]!;
                  const lineError = error?.fieldErrors?.[line.commitmentLineId];
                  return (
                    <tr key={line.commitmentLineId} className={lineError ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2 align-top text-muted-foreground">{line.lineNumber}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-sm text-foreground">{line.description}</div>
                        {line.itemCode && <div className="text-xs text-muted-foreground">{line.itemCode}</div>}
                        {lineError && <div className="mt-1 text-xs text-destructive">{lineError}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatQty(line.remainingQty)}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{line.uomCode}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{formatMoney(line.unitPrice, line.currencyCode)}</td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={line.remainingQty}
                          step="any"
                          value={s.acceptedQty}
                          onChange={(e) => updateLine(line.commitmentLineId, { acceptedQty: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={line.remainingQty}
                          step="any"
                          value={s.rejectedQty}
                          onChange={(e) => updateLine(line.commitmentLineId, { rejectedQty: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={s.rejectReason}
                          onChange={(e) => updateLine(line.commitmentLineId, { rejectReason: e.target.value })}
                          placeholder="—"
                          className="h-8 w-full min-w-[10rem] rounded-md border bg-background px-2 text-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 text-sm">
                  <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Preview total (accepted × unit price)
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
          onClick={() => router.push(`/app/purchase_order/${header.commitmentId}`)}
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
          {submitting ? "Creating…" : "Create Receipt"}
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
