"use client";

import { useMemo } from "react";
import { ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveReferenceTabConfig, resolveLineQuantityProgress } from "../../variants/procure";
import { recordValue } from "../../meta";
import type { LineItemPanelProps } from "../../types";
import type { LineRecord } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// ReferencePanel
//
// Renders procurement document chain links for a line item:
// purchase_request → purchase_order → goods_receipt → purchase_invoice
//
// Shows match status badge, quantity progress bar, and a link to the
// referenced document when a foreign-key field is populated.
// ─────────────────────────────────────────────────────────────────────────────

function QuantityBar({ ordered, received, invoiced, unitCode }: {
  ordered:  number | null;
  received: number | null;
  invoiced: number | null;
  unitCode: string | null;
}) {
  if (!ordered || ordered <= 0) return null;
  const receivedPct = Math.min(((received ?? 0) / ordered) * 100, 100);
  const invoicedPct = Math.min(((invoiced ?? 0) / ordered) * 100, 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Quantity Progress</span>
        <span className="tabular-nums">{ordered} {unitCode ?? ""}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/40 transition-all"
          style={{ width: `${receivedPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
          style={{ width: `${invoicedPct}%` }}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-primary/40" />
          Received: {received ?? 0}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-primary" />
          Invoiced: {invoiced ?? 0}
        </span>
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "none") return null;
  const isException = status === "exception" || status === "mismatch";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
      isException
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-success/30 bg-success/10 text-success",
    )}>
      {isException
        ? <AlertCircle className="size-3" aria-hidden />
        : <CheckCircle2 className="size-3" aria-hidden />}
      {isException ? "Exception" : "Matched"}
    </span>
  );
}

export function ReferencePanel({
  entity,
  line,
  draft,
}: LineItemPanelProps) {
  const refConfig = useMemo(() => resolveReferenceTabConfig(entity), [entity]);
  const progress  = useMemo(
    () => (line ? resolveLineQuantityProgress(line as LineRecord) : null),
    [line],
  );

  const lineRecord = (line ?? {}) as Record<string, unknown>;
  const matchStatus = lineRecord["match_status"] as string | null | undefined;

  if (refConfig.links.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No reference document links configured for this entity.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 divide-y divide-border/40">
      {/* Match status */}
      {refConfig.showMatchStatus && (
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-medium text-foreground">Match Status</span>
          <MatchStatusBadge status={matchStatus} />
        </div>
      )}

      {/* Document chain links */}
      <div className="flex flex-col gap-0 divide-y divide-border/40">
        {refConfig.links.map((link) => {
          const idValue = lineRecord[link.idField];
          const numberValue = link.numberField ? lineRecord[link.numberField] : null;
          const rawStatus = link.statusField ? lineRecord[link.statusField] : null;
          const statusValue = rawStatus != null ? String(rawStatus) : null;
          const draftId = draft[link.idField];
          const hasValue = Boolean(idValue ?? draftId);

          return (
            <div key={link.entityCode} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex flex-col gap-0.5">
                <span className={cn("text-sm font-medium", hasValue ? "text-foreground" : "text-muted-foreground/50")}>
                  {link.entityLabel}
                </span>
                {hasValue && (
                  <span className="text-xs text-muted-foreground">
                    {numberValue ? String(numberValue) : String(idValue ?? "").slice(0, 8) + "…"}
                    {statusValue && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs">
                        {String(statusValue)}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {hasValue ? (
                <a
                  href={`/app/${link.entityCode}/${String(idValue ?? draftId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  View <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground/40">Not linked</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Quantity progress */}
      {progress && (
        <div className="px-5 py-4">
          <QuantityBar
            ordered={progress.ordered}
            received={progress.received}
            invoiced={progress.invoiced}
            unitCode={progress.unitCode}
          />
        </div>
      )}
    </div>
  );
}
