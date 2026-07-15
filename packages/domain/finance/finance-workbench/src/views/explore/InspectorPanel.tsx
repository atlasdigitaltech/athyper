"use client";

import { CheckCircle2, ExternalLink, Info } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { useAccountPostability } from "../../hooks/useAccountPostability";
import { PostabilityChip } from "../company-hub/PostabilityChip";
import { DefinitionStateChip } from "../company-hub/DefinitionStateChip";
import type { ExploreChartNode } from "../../hooks/useFinanceExplore";

export interface InspectorPanelProps {
  companyCode: string;
  node?: ExploreChartNode | null;
  className?: string;
}

export function InspectorPanel({ companyCode, node, className }: InspectorPanelProps) {
  const hub = useCompanyHub({ companyCode });
  const postability = useAccountPostability({
    companyCode,
    fiscalYear:     hub.data?.currentFiscalYear ?? 0,
    period:         hub.data?.currentPeriodNumber ?? 0,
    bookId:         hub.data?.currentBookId,
    glAccountCode:  node?.code,
  });

  if (!node) {
    return (
      <div className={cn("flex h-full items-center justify-center rounded-lg border bg-card p-8 text-center", className)}>
        <div className="max-w-sm text-sm text-muted-foreground">
          <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <p className="font-medium text-foreground">Select an account</p>
          <p className="mt-1">
            Choose a node in the chart tree to see its definition, postability, and where it's used.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col gap-4 overflow-auto pb-4 pr-2", className)}>
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{node.code}</span>
            <DefinitionStateChip
              state={node.status as "draft" | "active" | "inactive"}
              vocabulary={["draft", "active", "inactive"]}
              objectKind="gl_account"
              size="sm"
            />
            {!node.isPosting ? (
              <Badge variant="outline" size="sm">Header</Badge>
            ) : (
              <Badge variant="info" size="sm">Posting</Badge>
            )}
          </div>
          <CardTitle className="text-base">{node.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <MetaRow label="Class"          value={node.accountClass} />
          <MetaRow label="Normal balance" value={node.normalBalance} />
          <MetaRow label="Subledger"      value={node.subledgerType ?? "—"} />
          <MetaRow label="Level"          value={String(node.levelNo)} />
        </CardContent>
      </Card>

      {node.isPosting ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Postability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {postability.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : postability.data?.accountPostability ? (
              <PostabilityChip
                chip={postability.data.accountPostability.chip}
                reasonCodes={postability.data.accountPostability.reasonCodes}
                showReason
              />
            ) : (
              <p className="text-xs text-muted-foreground">No data.</p>
            )}
            <div className="pt-2 text-xs">
              <MetaRow
                label="Company control"
                value={node.hasCompanyControl ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Configured
                  </span>
                ) : (
                  <span className="text-warning">Missing</span>
                )}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/finance/setup/company/${encodeURIComponent(companyCode)}/configure?tab=gl_controls&code=${encodeURIComponent(node.code)}`}>
              Configure company control
              <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
            </Link>
          </Button>
          {node.isPosting ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/finance/gl?account=${encodeURIComponent(node.code)}`}>
                Open in GL Workbench
                <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
