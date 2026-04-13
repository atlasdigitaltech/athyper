/**
 * @athyper/document-runtime — Process Chain Ribbon
 *
 * Rec 1: Shows the full document chain (PR → PO → GR → INV → PAY)
 * with clickable nodes. CONDITIONAL — only renders nodes that exist
 * in this document's FK chain. Non-PO invoices show INV → PAY.
 * Service POs show PO → SES → INV.
 *
 * Each node: doc number, status dot, amount, exception badge.
 * Lines between nodes show fulfilled percentage.
 */
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { Badge } from "@athyper/ui/primitives";
import { MoneySummary } from "@athyper/domain-widgets";
import { type ProcessChain, type ProcessChainNode, type ChainNodeType } from "@athyper/api-contracts/documents";

export interface ProcessChainRibbonProps {
  chain: ProcessChain;
  className?: string;
}

const NODE_LABELS: Record<ChainNodeType, string> = {
  PR: "Requisition", RFX: "RFx", CONTRACT: "Contract",
  PO: "Purchase Order", GR: "Goods Receipt", SES: "Service Entry",
  INV: "Invoice", CN: "Credit Note", DN: "Debit Note",
  PAY: "Payment", ADVANCE: "Advance", RETENTION: "Retention",
};

const NODE_SHORT: Record<ChainNodeType, string> = {
  PR: "PR", RFX: "RFx", CONTRACT: "CTR",
  PO: "PO", GR: "GR", SES: "SES",
  INV: "INV", CN: "CN", DN: "DN",
  PAY: "PAY", ADVANCE: "ADV", RETENTION: "RET",
};

function statusToIntent(status: string | null): SemanticIntent {
  if (!status) return "neutral";
  const s = status.toLowerCase();
  if (["posted", "approved", "completed", "paid", "fully_received", "fully_invoiced", "closed"].includes(s)) return "success";
  if (["pending", "pending_approval", "in_review", "partially_received", "partially_invoiced"].includes(s)) return "warning";
  if (["rejected", "cancelled", "reversed", "on_hold"].includes(s)) return "error";
  if (["draft"].includes(s)) return "muted";
  return "info";
}

export function ProcessChainRibbon({ chain, className }: ProcessChainRibbonProps) {
  const router = useRouter();

  if (chain.nodes.length === 0) return null;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-1 overflow-x-auto">
        {chain.nodes.map((node, i) => {
          const isCurrent = node.node_type === chain.current_node_type;
          const intent = statusToIntent(node.status);
          const colors = resolveSemanticColors(intent);

          return (
            <div key={`${node.node_type}-${i}`} className="flex items-center gap-1">
              {/* Connector line with fulfillment % */}
              {i > 0 && (
                <div className="flex flex-col items-center px-1">
                  <div className="relative h-0.5 w-8 bg-border">
                    {node.fulfilled_pct != null && (
                      <div
                        className="absolute inset-y-0 left-0 bg-primary"
                        style={{ width: `${node.fulfilled_pct}%` }}
                      />
                    )}
                  </div>
                  {node.fulfilled_pct != null && (
                    <span className="mt-0.5 text-[10px] text-muted-foreground">{node.fulfilled_pct}%</span>
                  )}
                </div>
              )}

              {/* Node */}
              <button
                onClick={() => {
                  if (node.document_id && !isCurrent) {
                    router.push(`/document/${node.node_type.toLowerCase()}/${node.document_id}`);
                  }
                }}
                disabled={!node.document_id || isCurrent}
                className={cn(
                  "flex flex-col items-center rounded-lg border px-3 py-2 text-center transition-colors min-w-[90px]",
                  isCurrent
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/50 hover:bg-accent/50",
                  !node.document_id && "opacity-50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                  <span className="text-xs font-semibold">{NODE_SHORT[node.node_type]}</span>
                  {node.count > 1 && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">×{node.count}</Badge>
                  )}
                </div>

                <span className="mt-1 text-[11px] text-muted-foreground truncate max-w-[80px]">
                  {node.document_number ?? "—"}
                </span>

                {node.amount && (
                  <span className="mt-0.5">
                    <MoneySummary
                      amount={node.amount.amount}
                      currencyCode={node.amount.currency_code}
                      className="text-[10px]"
                    />
                  </span>
                )}

                {node.has_exceptions && (
                  <span className="mt-0.5 text-[10px] text-destructive font-medium">⚠</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
