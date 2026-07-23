"use client";

import { AlertTriangle, Building, Globe, RefreshCw } from "lucide-react";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { cn } from "@athyper/theme/utils";
import { useFinanceRollup, type RollupScopeType } from "../../hooks/useFinanceRollup";
import { NeedsAttentionInbox } from "../company-hub/NeedsAttentionInbox";
import { RollupAggregateStrip } from "./RollupAggregateStrip";
import { RollupCompanyMatrix } from "./RollupCompanyMatrix";
import { useCertificationReadinessRollup } from "../../hooks/useCertificationReadiness";

export interface RollupViewProps {
  scopeType: RollupScopeType;
  scopeCode: string;
}

export function RollupView({ scopeType, scopeCode }: RollupViewProps) {
  const q = useFinanceRollup({ scopeType, scopeCode });
  const certification = useCertificationReadinessRollup(scopeType,scopeCode);

  if (q.isLoading && !q.data) {
    return (
      <PageFrame>
        <div className="flex flex-col gap-4 pb-10">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </PageFrame>
    );
  }

  if (q.isError) {
    return (
      <PageFrame>
        <ErrorState message={String(q.error)} onRetry={() => q.refetch()} />
      </PageFrame>
    );
  }

  const rollup = q.data;
  if (!rollup) {
    return (
      <PageFrame>
        <ErrorState message={`No rollup payload for ${scopeType} ${scopeCode}.`} onRetry={() => q.refetch()} />
      </PageFrame>
    );
  }

  const isTenant = scopeType === "tenant";
  const scopeLabel = isTenant ? "Tenant" : "Legal entity";
  const ScopeIcon  = isTenant ? Globe : Building;

  return (
    <PageFrame>
      <div className="flex flex-col gap-4 pb-10">
        <header className="flex flex-col gap-3 rounded-lg border bg-card p-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Finance Setup · {scopeLabel} rollup
            </span>
            <div className="flex items-center gap-2">
              <ScopeIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
              <h1 className="text-xl font-semibold">
                {rollup.scopeName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">· {rollup.scope.code}</span>
              </h1>
              <Badge variant="outline" size="sm">{rollup.aggregate.totalCompanies} companies</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Last checked · {new Date(rollup.computedAt).toLocaleString()}
            </span>
            <Button variant="ghost" size="sm" onClick={() => q.refetch()} aria-label="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} aria-hidden />
            </Button>
          </div>
        </header>

        <RollupAggregateStrip
          completeCompanies={rollup.aggregate.completeCompanies}
          totalCompanies={rollup.aggregate.totalCompanies}
          avgCoveragePct={rollup.aggregate.avgCoveragePct}
          conflictCount={rollup.aggregate.conflictCount}
        />

        {Object.keys(rollup.aggregate.conflictsByCategory).length > 0 && (
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Issues by category
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(rollup.aggregate.conflictsByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, n]) => (
                  <Badge key={cat} variant={n > 10 ? "destructive" : n > 3 ? "warning" : "muted"} size="sm">
                    {cat.replace(/_/g, " ")} · {n}
                  </Badge>
                ))}
            </div>
          </section>
        )}

        <RollupCompanyMatrix
          companies={rollup.companies}
          isLoading={q.isFetching && !q.data}
          showLegalEntityColumn={isTenant}
        />

        {certification.data&&<section className="rounded-lg border bg-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><h2 className="font-semibold">Four-domain certification roll-up</h2><p className="text-xs text-muted-foreground">Independent readiness by Company; multi-currency, Book, House Bank, and jurisdiction gaps remain visible.</p></div><Badge variant={certification.data.summary.blockedCount?"warning":"outline"} size="sm">{certification.data.summary.readyCount}/{certification.data.summary.companyCount} ready</Badge></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 text-left"><tr>{["Company","Currency & FX","Tax","Payments","Banking","Certification","Gate"].map(label=><th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{certification.data.companies.map(company=><tr key={company.company.code}><td className="p-3 font-medium">{company.company.code}</td>{company.domains.map(domain=><td className="p-3" key={domain.domain}><span className={domain.state==="ready"?"text-emerald-700":"text-amber-700"}>{domain.passed}/{domain.total} · {domain.state.replaceAll("_"," ")}</span></td>)}<td className="p-3 capitalize">{company.status.replaceAll("_"," ")}</td><td className="p-3 capitalize">{company.rollout.mode}</td></tr>)}</tbody></table></div></section>}

        <NeedsAttentionInbox
          conflicts={rollup.inbox}
          totalCount={rollup.aggregate.conflictCount}
        />
      </div>
    </PageFrame>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <div>
        <h2 className="text-base font-semibold">Couldn't load rollup</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}
