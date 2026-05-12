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
import { type ProcessChain } from "@athyper/api-contracts/documents";
import { statusToIntent } from "@athyper/runtime-shared/core";
import {
  normalizeStatusKey,
  renderTemplate,
  resolveProcessChainPresentation,
} from "../documentRuntimeDefaults";

export interface ProcessChainRibbonProps {
  chain: ProcessChain;
  displayConfig?: Record<string, unknown> | null;
  className?: string;
}

function chainNodeHref(
  nodeType: string,
  documentId: string | null,
  template: string | undefined,
): string | null {
  if (!documentId || !template) return null;
  return renderTemplate(template, {
    node_type: nodeType,
    node_type_lower: nodeType.toLowerCase(),
    document_id: documentId,
  });
}

export function ProcessChainRibbon({ chain, displayConfig, className }: ProcessChainRibbonProps) {
  const router = useRouter();
  const presentation = resolveProcessChainPresentation(displayConfig);

  if (chain.nodes.length === 0) return null;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-1 overflow-x-auto">
        {chain.nodes.map((node, i) => {
          const isCurrent = node.node_type === chain.current_node_type;
          const statusKey = normalizeStatusKey(node.status);
          const intent: SemanticIntent = presentation.statusIntents[statusKey] ?? statusToIntent(node.status);
          const colors = resolveSemanticColors(intent);
          const nodeLabel = presentation.nodeLabels[node.node_type] ?? node.node_type;
          const nodeShortLabel = presentation.nodeShortLabels[node.node_type] ?? node.node_type;
          const routeTemplate = presentation.routeTemplatesByNode[node.node_type] ?? presentation.routeTemplate;
          const href = isCurrent ? null : chainNodeHref(node.node_type, node.document_id, routeTemplate);

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
                    <span className="mt-0.5 text-2xs text-muted-foreground">{node.fulfilled_pct}%</span>
                  )}
                </div>
              )}

              {/* Node */}
              <button
                onClick={() => {
                  if (href) router.push(href);
                }}
                disabled={!href}
                title={nodeLabel}
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
                  <span className="text-xs font-semibold">{nodeShortLabel}</span>
                  {node.count > 1 && (
                    <Badge variant="outline" className="h-4 px-1 text-2xs">×{node.count}</Badge>
                  )}
                </div>

                <span className="mt-1 text-xs text-muted-foreground truncate max-w-[80px]">
                  {node.document_number ?? "—"}
                </span>

                {node.amount && (
                  <span className="mt-0.5">
                    <MoneySummary
                      amount={node.amount.amount}
                      currencyCode={node.amount.currency_code}
                      className="text-2xs"
                    />
                  </span>
                )}

                {node.has_exceptions && (
                  <span className="mt-0.5 text-2xs text-destructive font-medium">⚠</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
