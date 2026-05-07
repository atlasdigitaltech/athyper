"use client";

/**
 * PaymentAllocationLinesGrid — read-only allocation view for payment entries.
 *
 * Columns: #, Invoice, Allocated, Discount, WHT, Net Payment
 *
 * Data arrives via GET /records/payment_entry/:id/lines which normalises
 * document.payment_entry_allocation rows into DocumentLine format:
 *   item_code        = purchase_invoice.invoice_number
 *   description      = "Invoice <number>" | "On Account"
 *   line_amount      = allocated_amount
 *   net_amount       = net_payment_amount
 *   data.*           = all allocation fields
 */

import type { DocumentLine } from "@athyper/api-contracts/documents";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

function fmtAmt(v: unknown, hide = false): string {
  const n = Number(v);
  if (hide && !n) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DeductionCell({ value }: { value: unknown }) {
  const n = Number(value);
  if (!n) return <span className="text-muted-foreground/30 text-right">—</span>;
  return (
    <span className="tabular-nums text-warning text-right">
      ({fmtAmt(n)})
    </span>
  );
}

export interface PaymentAllocationLinesGridProps {
  lines:        DocumentLine[];
  isLoading?:   boolean;
  currencyCode?: string;
}

export function PaymentAllocationLinesGrid({
  lines,
  isLoading,
  currencyCode = "USD",
}: PaymentAllocationLinesGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  const totalAllocated   = lines.reduce((s, l) => s + (Number((l.data as Record<string,unknown>)?.["allocated_amount"])   || 0), 0);
  const totalDiscount    = lines.reduce((s, l) => s + (Number((l.data as Record<string,unknown>)?.["discount_amount"])    || 0), 0);
  const totalWht         = lines.reduce((s, l) => s + (Number((l.data as Record<string,unknown>)?.["withholding_tax_amount"]) || 0), 0);
  const totalAdvRec      = lines.reduce((s, l) => s + (Number((l.data as Record<string,unknown>)?.["advance_recovery_amount"]) || 0), 0);
  const totalNet         = lines.reduce((s, l) => s + (Number(l.net_amount) || 0), 0);
  const hasDeductions    = totalDiscount > 0 || totalWht > 0 || totalAdvRec > 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">
          {lines.length} allocation{lines.length !== 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {currencyCode}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col />
            <col style={{ width: 110 }} />
            {hasDeductions && <col style={{ width: 90 }} />}
            {hasDeductions && <col style={{ width: 90 }} />}
            {hasDeductions && <col style={{ width: 90 }} />}
            <col style={{ width: 120 }} />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Invoice</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Allocated</th>
              {hasDeductions && <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Discount</th>}
              {hasDeductions && <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">WHT</th>}
              {hasDeductions && <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Adv. Rec.</th>}
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Net Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={hasDeductions ? 7 : 4}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No allocations — payment is on account</p>
                  </div>
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const d = (line.data as Record<string, unknown> | null | undefined) ?? {};
                const invoiceDate = d["invoice_date"] ? new Date(d["invoice_date"] as string).toLocaleDateString() : null;
                return (
                  <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      {line.item_code ? (
                        <>
                          <div className="font-mono text-xs font-medium text-foreground truncate">
                            {line.item_code}
                          </div>
                          {invoiceDate && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{invoiceDate}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">On Account</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {fmtAmt(d["allocated_amount"])}
                    </td>
                    {hasDeductions && (
                      <td className="px-3 py-2.5 text-right">
                        <DeductionCell value={d["discount_amount"]} />
                      </td>
                    )}
                    {hasDeductions && (
                      <td className="px-3 py-2.5 text-right">
                        <DeductionCell value={d["withholding_tax_amount"]} />
                      </td>
                    )}
                    {hasDeductions && (
                      <td className="px-3 py-2.5 text-right">
                        <DeductionCell value={d["advance_recovery_amount"]} />
                      </td>
                    )}
                    <td className={cn(
                      "px-3 py-2.5 text-right tabular-nums font-semibold",
                      Number(d["allocated_amount"]) !== Number(line.net_amount) ? "text-primary" : "text-foreground",
                    )}>
                      {fmtAmt(line.net_amount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-t border-border/40 bg-muted/20 text-xs">
        <span>
          <span className="text-muted-foreground mr-1.5">Total Allocated</span>
          <span className="font-semibold tabular-nums">{fmtAmt(totalAllocated)}</span>
        </span>
        {hasDeductions && totalDiscount > 0 && (
          <span>
            <span className="text-muted-foreground mr-1.5">Discount</span>
            <span className="font-semibold tabular-nums text-warning">({fmtAmt(totalDiscount)})</span>
          </span>
        )}
        {hasDeductions && totalWht > 0 && (
          <span>
            <span className="text-muted-foreground mr-1.5">WHT</span>
            <span className="font-semibold tabular-nums text-warning">({fmtAmt(totalWht)})</span>
          </span>
        )}
        <span className="ml-auto">
          <span className="text-muted-foreground mr-1.5">Net Payment</span>
          <span className="font-bold tabular-nums text-primary">{fmtAmt(totalNet)}</span>
        </span>
      </div>
    </div>
  );
}
