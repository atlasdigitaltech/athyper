"use client";

/**
 * JournalLinesGrid — read-only GL line view for posted journal entries.
 *
 * Columns: #, GL Account, Description, Subledger, Debit, Credit
 * Financial footer: Total Debit | Total Credit
 *
 * Data arrives via the GET /records/journal_entry/:id/lines endpoint which
 * normalises document.journal_line rows into DocumentLine format:
 *   item_code        = gl_account.code
 *   description      = journal_line.description
 *   data.gl_account_name  = gl_account.name
 *   data.transaction_debit / data.transaction_credit
 *   data.subledger_type
 */

import type { DocumentLine } from "@athyper/api-contracts/documents";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

function fmtAmt(v: unknown): string {
  const n = Number(v);
  if (!n) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AmtCell({ value, side }: { value: unknown; side: "debit" | "credit" }) {
  const n = Number(value);
  if (!n) return <span className="text-muted-foreground/30">—</span>;
  return (
    <span className={cn("tabular-nums font-medium", side === "debit" ? "text-foreground" : "text-foreground")}>
      {fmtAmt(n)}
    </span>
  );
}

function SubledgerBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <span className="text-muted-foreground/30 text-xs">—</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
      {type}
    </span>
  );
}

export interface JournalLinesGridProps {
  lines:     DocumentLine[];
  isLoading?: boolean;
  currencyCode?: string;
}

export function JournalLinesGrid({ lines, isLoading, currencyCode = "USD" }: JournalLinesGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.data?.transaction_debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.data?.transaction_credit) || 0), 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">
          {lines.length} line{lines.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col style={{ width: 130 }} />
            <col />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">GL Account</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">Description</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">Subledger</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Debit</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No journal lines</p>
                  </div>
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const d = line.data as Record<string, unknown> | null | undefined ?? {};
                const isDebit = Boolean(d["is_debit"]);
                return (
                  <tr key={line.id} className={cn("hover:bg-muted/20 transition-colors", isDebit ? "" : "bg-muted/5")}>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="font-mono text-xs text-foreground truncate" title={String(d["gl_account_name"] ?? "")}>
                        {line.item_code ?? <span className="text-muted-foreground/30 italic">—</span>}
                      </div>
                      {!!d["gl_account_name"] && (
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                          {String(d["gl_account_name"])}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="text-sm text-foreground truncate">{line.description || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SubledgerBadge type={d["subledger_type"] as string | null | undefined} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={d["transaction_debit"]} side="debit" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={d["transaction_credit"]} side="credit" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
        <div className="flex gap-6">
          <span>
            <span className="text-muted-foreground mr-1.5">Total Debit</span>
            <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalDebit)}</span>
          </span>
          <span>
            <span className="text-muted-foreground mr-1.5">Total Credit</span>
            <span className="font-semibold tabular-nums">{currencyCode} {fmtAmt(totalCredit)}</span>
          </span>
        </div>
        <span className={cn(
          "text-xs font-medium",
          Math.abs(totalDebit - totalCredit) < 0.001 ? "text-success" : "text-destructive",
        )}>
          {Math.abs(totalDebit - totalCredit) < 0.001 ? "Balanced" : `Imbalance: ${fmtAmt(Math.abs(totalDebit - totalCredit))}`}
        </span>
      </div>
    </div>
  );
}
