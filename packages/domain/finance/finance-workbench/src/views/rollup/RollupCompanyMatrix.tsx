"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Circle, CircleAlert, MinusCircle, Search,
} from "lucide-react";
import { Badge, Button, Input, Skeleton } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import type { JourneyStepKey, JourneyStepState, JourneyStep } from "../../lib/finance-setup.types";
import type { RollupCompanyRow } from "../../hooks/useFinanceRollup";

const STEP_ORDER: JourneyStepKey[] = ["foundation", "chart", "books", "gl_controls", "house_banks", "fiscal_period"];
const STEP_LABEL: Record<JourneyStepKey, string> = {
  foundation:    "Foundation",
  chart:         "Chart",
  books:         "Books",
  gl_controls:   "Controls",
  house_banks:   "Banks",
  fiscal_period: "Period",
};

const STATE_ICON: Record<JourneyStepState, React.ComponentType<{ className?: string }>> = {
  complete:    CheckCircle2,
  in_progress: Circle,
  blocked:     CircleAlert,
  not_started: MinusCircle,
};
const STATE_TONE: Record<JourneyStepState, string> = {
  complete:    "text-success",
  in_progress: "text-warning",
  blocked:     "text-destructive",
  not_started: "text-muted-foreground/50",
};

export interface RollupCompanyMatrixProps {
  companies: RollupCompanyRow[];
  isLoading?: boolean;
  className?: string;
  showLegalEntityColumn?: boolean;
}

export function RollupCompanyMatrix({
  companies,
  isLoading,
  className,
  showLegalEntityColumn = false,
}: RollupCompanyMatrixProps) {
  const [q, setQ] = useState("");
  const [showReadyOnly, setShowReadyOnly] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return companies.filter((c) => {
      if (showReadyOnly && !c.isReady) return false;
      if (!needle) return true;
      return c.companyCode.toLowerCase().includes(needle)
          || c.companyName.toLowerCase().includes(needle)
          || (c.legalEntityCode ?? "").toLowerCase().includes(needle);
    });
  }, [companies, q, showReadyOnly]);

  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Company readiness matrix
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each cell shows the state of one journey step. Click a row to drill into that company's Hub.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 text-xs">
              <Search className="h-3 w-3 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search company"
                className="h-7 w-48 border-none px-0 shadow-none focus-visible:ring-0"
                aria-label="Search companies"
              />
            </div>
            <Button
              variant={showReadyOnly ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowReadyOnly((v) => !v)}
              aria-pressed={showReadyOnly}
            >
              {showReadyOnly ? "Show all" : "Ready only"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No companies match the current filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2">Company</th>
                {showLegalEntityColumn && <th className="p-2">Legal entity</th>}
                {STEP_ORDER.map((key) => (
                  <th key={key} className="p-2 text-center">{STEP_LABEL[key]}</th>
                ))}
                <th className="p-2 text-right">Coverage</th>
                <th className="p-2 text-right">Issues</th>
                <th className="p-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <MatrixRow
                  key={row.companyCode}
                  row={row}
                  showLegalEntityColumn={showLegalEntityColumn}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function MatrixRow({
  row,
  showLegalEntityColumn,
}: {
  row: RollupCompanyRow;
  showLegalEntityColumn: boolean;
}) {
  const hubHref = `/finance/setup/company/${encodeURIComponent(row.companyCode)}`;
  const stepsByKey = new Map<JourneyStepKey, JourneyStep>();
  for (const s of row.journey) stepsByKey.set(s.key as JourneyStepKey, s);

  return (
    <tr className={cn("border-b last:border-0 hover:bg-muted/40", row.isReady && "bg-success/5")}>
      <td className="p-2">
        <Link href={hubHref} className="group flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <span className="font-medium group-hover:underline">{row.companyName}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.companyCode}</span>
        </Link>
      </td>
      {showLegalEntityColumn && (
        <td className="p-2 text-xs text-muted-foreground">
          {row.legalEntityName ?? "—"}
          {row.legalEntityCode ? <span className="ml-1 font-mono">({row.legalEntityCode})</span> : null}
        </td>
      )}
      {STEP_ORDER.map((key) => (
        <td key={key} className="p-2 text-center">
          <StateCell step={stepsByKey.get(key)} />
        </td>
      ))}
      <td className="p-2 text-right">
        <span className="tabular-nums">{row.overallCoveragePct}%</span>
      </td>
      <td className="p-2 text-right">
        {row.conflictCount === 0
          ? <Badge variant="success" size="sm">0</Badge>
          : <Badge variant={row.conflictCount > 5 ? "destructive" : "warning"} size="sm">{row.conflictCount}</Badge>}
      </td>
      <td className="p-2 text-right">
        <Button asChild variant="ghost" size="sm" aria-label={`Open Hub for ${row.companyCode}`}>
          <Link href={hubHref}>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function StateCell({ step }: { step: JourneyStep | undefined }) {
  if (!step) {
    return <MinusCircle className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not evaluated" />;
  }
  const Icon = STATE_ICON[step.state];
  return (
    <div
      className="mx-auto inline-flex flex-col items-center gap-0.5"
      role="status"
      aria-label={`${step.label}: ${step.state.replace(/_/g, " ")}${step.conflictCount ? `, ${step.conflictCount} issues` : ""}`}
      title={`${step.label} — ${step.state}${step.coveragePct !== null ? ` (${step.coveragePct}%)` : ""}`}
    >
      <Icon className={cn("h-4 w-4", STATE_TONE[step.state])} />
      {step.coveragePct !== null && step.state !== "complete" && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{step.coveragePct}%</span>
      )}
    </div>
  );
}
