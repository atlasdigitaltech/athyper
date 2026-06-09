"use client";

import { Card, CardContent, CardHeader, CardTitle, Separator, Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { GlAccountNode } from "../data/types";
import { AccountClassBadge, AccountClassDot, NodeTypeBadge } from "./ChartBadge";
import { fmtFull } from "./format";

interface AccountDetailProps {
  node: GlAccountNode;
  chartCode: string;
  onSelectChild?: (id: string) => void;
}

export function AccountDetail({ node, chartCode, onSelectChild }: AccountDetailProps) {
  const net = node.closingDebit - node.closingCredit;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="tabular-nums text-xs text-muted-foreground">{node.code}</span>
          <AccountClassBadge cls={node.accountClass} />
          <NodeTypeBadge type={node.nodeType} />
          {node.subledgerType && (
            <Badge variant="info" className="text-xs py-0">
              SL: {node.subledgerType}
            </Badge>
          )}
        </div>
        <h2 className="text-sm font-medium">{node.name}</h2>
      </div>

      {/* Balance cards for posting accounts */}
      {node.nodeType === "posting" && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 bg-muted/50 shadow-none">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Debit</div>
              <div className="text-sm font-medium tabular-nums">{fmtFull(node.closingDebit)}</div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-muted/50 shadow-none">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Credit</div>
              <div className="text-sm font-medium tabular-nums">{fmtFull(node.closingCredit)}</div>
            </CardContent>
          </Card>
          <Card className={cn("border-0 shadow-none", net >= 0 ? "bg-success/10" : "bg-destructive/5")}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Net</div>
              <div className={cn("text-sm font-medium tabular-nums", net >= 0 ? "text-success" : "text-destructive")}>
                {fmtFull(Math.abs(net))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Properties */}
      <div>
        <h3 className="text-xs text-muted-foreground mb-2">Properties</h3>
        <div className="space-y-1.5">
          {[
            ["Normal balance", node.normalBalance],
            ["Level", String(node.level)],
            ["Subledger", node.subledgerType ?? "None"],
            ["Chart", chartCode],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center text-xs">
              <span className="text-muted-foreground w-28">{label}</span>
              <span className="text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Children list for headers */}
      {node.children && node.children.length > 0 && (
        <div>
          <Separator className="mb-3" />
          <h3 className="text-xs text-muted-foreground mb-2">
            Children ({node.children.length})
          </h3>
          <div className="space-y-0.5">
            {node.children.map((child) => (
              <div
                key={child.id}
                onClick={() => onSelectChild?.(child.id)}
                className="flex items-center gap-2 py-1 px-1 rounded-md text-xs cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <AccountClassDot cls={child.accountClass} />
                <span className="tabular-nums text-xs text-muted-foreground w-28">
                  {child.code}
                </span>
                <span className="flex-1 text-foreground/80">{child.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
