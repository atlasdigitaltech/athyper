"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@athyper/platform-ui/composites";
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
  quantity:       string;
  completionPct:  string;
  milestoneName:  string;
}

export interface ServiceSheetFromCommitmentFormProps {
  header:      CommitmentHeaderDto;
  lines:       CommitmentLineDto[];
  linesError?: string | null;
}

interface SubmitError {
  message:     string;
  fieldErrors?: Record<string, string>;
}

export function ServiceSheetFromCommitmentForm({ header, lines, linesError }: ServiceSheetFromCommitmentFormProps) {
  const router = useRouter();
  const [documentDate,      setDocumentDate]      = useState<string>(todayIso());
  const [servicePeriodFrom, setServicePeriodFrom] = useState<string>(firstOfMonthIso());
  const [servicePeriodTo,   setServicePeriodTo]   = useState<string>(todayIso());
  const [notes,             setNotes]             = useState<string>("");
  const [lineState, setLineState] = useState<Record<string, LineFormState>>(() =>
    Object.fromEntries(lines.map((l) => [l.commitmentLineId, {
      quantity:      l.remainingQty.toString(),
      completionPct: "",
      milestoneName: "",
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
      const s = lineState[line.commitmentLineId];
      if (!s) continue;
      total += parseQty(s.quantity) * line.unitPrice;
    }
    return total;
  }, [lines, lineState]);

  function updateLine(lineId: string, patch: Partial<LineFormState>) {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (servicePeriodFrom && servicePeriodTo && servicePeriodFrom > servicePeriodTo) {
      setError({ message: "Service Period From must be on or before Service Period To." });
      return;
    }

    const lineEntries = lines
      .map((l) => {
        const s = lineState[l.commitmentLineId];
        if (!s) return null;
        const qty = parseQty(s.quantity);
        if (qty <= 0) return null;
        const completionPct = s.completionPct.trim() === "" ? undefined : Number(s.completionPct);
        const milestoneName = s.milestoneName.trim();
        return {
          commitmentLineId: l.commitmentLineId,
          quantity:         qty,
          ...(Number.isFinite(completionPct as number) ? { completionPct } : {}),
          ...(milestoneName ? { milestoneName } : {}),
        };
      })
      .filter((x): x is { commitmentLineId: string; quantity: number; completionPct?: number; milestoneName?: string } => x !== null);

    if (lineEntries.length === 0) {
      setError({ message: "Enter a quantity > 0 on at least one line." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/runtime/v1/entities/service_sheet/op/service_sheet_from_commitment", {
        method:  "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body:    JSON.stringify({
          commitmentId:      header.commitmentId,
          documentDate,
          servicePeriodFrom,
          servicePeriodTo,
          notes:             notes.trim() || undefined,
          lineEntries,
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
      const sesId = String(json["serviceSheetId"] ?? "");
      if (!sesId) {
        setError({ message: "Server returned no serviceSheetId — open the service sheets list to find the new draft." });
        setSubmitting(false);
        return;
      }
      router.push(`/app/service_sheet/${sesId}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="rounded-md border bg-card px-4 py-3 text-sm">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase Order</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <SummaryItem label="PO Number" value={header.poNumber} />
          <SummaryItem label="Status"    value={header.poStatus} />
          {header.poType       && <SummaryItem label="Type"     value={header.poType} />}
          {header.documentDate && <SummaryItem label="Doc Date" value={header.documentDate} />}
          {header.supplierName && <SummaryItem label="Supplier" value={header.supplierName} />}
          <SummaryItem label="Currency"  value={header.currencyCode} />
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Document Date</span>
          <DatePicker
            kind="businessDate"
            value={documentDate || null}
            onChange={(next) => setDocumentDate(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Service Period From <span className="text-destructive">*</span></span>
          <DatePicker
            kind="businessDate"
            value={servicePeriodFrom || null}
            onChange={(next) => setServicePeriodFrom(next ?? "")}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Service Period To <span className="text-destructive">*</span></span>
          <DatePicker
            kind="businessDate"
            value={servicePeriodTo || null}
            onChange={(next) => setServicePeriodTo(next ?? "")}
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
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service Line Entries</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} open line{lines.length === 1 ? "" : "s"} · {selectedCount} selected
          </p>
        </div>

        {linesError && (
          <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{linesError}</p>
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
                  <th className="px-3 py-2 text-left">Service Item</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-left">UOM</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2 text-right">% Complete</th>
                  <th className="px-3 py-2 text-left">Milestone</th>
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
                          type="number" inputMode="decimal" min={0} max={line.remainingQty} step="any"
                          value={s.quantity}
                          onChange={(e) => updateLine(line.commitmentLineId, { quantity: e.target.value })}
                          className="h-8 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <input
                          type="number" inputMode="decimal" min={0} max={100} step="any" placeholder="—"
                          value={s.completionPct}
                          onChange={(e) => updateLine(line.commitmentLineId, { completionPct: e.target.value })}
                          className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text" placeholder="—"
                          value={s.milestoneName}
                          onChange={(e) => updateLine(line.commitmentLineId, { milestoneName: e.target.value })}
                          className="h-8 w-full min-w-[8rem] rounded-md border bg-background px-2 text-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 text-sm">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Preview total (quantity × unit price)
                  </td>
                  <td colSpan={3} className="px-3 py-2 text-right font-medium tabular-nums">
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
          {submitting ? "Creating…" : "Create Service Sheet"}
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

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatMoney(value: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
