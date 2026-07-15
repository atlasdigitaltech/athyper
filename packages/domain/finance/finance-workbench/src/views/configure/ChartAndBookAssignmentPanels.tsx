"use client";

import { Star } from "lucide-react";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { DefinitionStateChip } from "../company-hub/DefinitionStateChip";
import {
  useConfigureChartAssignments,
  useConfigureBookAssignments,
} from "../../hooks/useFinanceConfigure";
import {
  useSetPrimaryChartAssignment,
  useSetPrimaryBook,
} from "../../hooks/useFinanceSetupMutations";


// ─── Chart Assignments panel ────────────────────────────────────────────────

export function ChartAssignmentPanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useConfigureChartAssignments(companyCode);
  const setPrimary = useSetPrimaryChartAssignment();

  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Chart assignments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Operating chart drives postability; reporting charts drive statements.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled title="Assign additional charts lands in a follow-up sprint.">
          Assign chart
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-destructive">Failed to load assignments.</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No chart assignments configured.</p>
      ) : (
        <ul role="list" className="divide-y">
          {q.data!.map((a) => (
            <li key={a.assignmentId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" size="sm">{a.assignmentType}</Badge>
                  <span className="text-sm font-medium">{a.chartName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{a.chartCode}</span>
                  {a.isPrimary && <Badge variant="info" size="sm">primary</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Effective {a.effectiveFrom ?? "—"}
                  {a.effectiveTo ? ` → ${a.effectiveTo}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DefinitionStateChip
                  state={a.chartStatus as "draft" | "active" | "inactive"}
                  vocabulary={["draft", "active", "inactive"]}
                  objectKind="chart_of_account"
                  size="sm"
                />
                <DefinitionStateChip
                  state={a.status as "active" | "inactive"}
                  vocabulary={["active", "inactive"]}
                  objectKind="company_code_chart_assignment"
                  size="sm"
                />
                {!a.isPrimary && a.status === "active" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPrimary.mutate({ assignmentId: a.assignmentId, companyCode })}
                    disabled={setPrimary.isPending}
                    aria-label="Make primary"
                    title="Make this assignment the primary for its type"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


// ─── Book Assignments panel ─────────────────────────────────────────────────

export function BookAssignmentPanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useConfigureBookAssignments(companyCode);
  const setPrimary = useSetPrimaryBook();

  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Book assignments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ledger books determine postability windows and reporting currency.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled title="New books are provisioned by Setup Admin in a follow-up sprint.">
          Assign book
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-destructive">Failed to load books.</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No books assigned.</p>
      ) : (
        <ul role="list" className="divide-y">
          {q.data!.map((b) => (
            <li key={b.bookId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.bookName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{b.bookCode}</span>
                  {b.isPrimary && <Badge variant="info" size="sm">primary</Badge>}
                  {b.currencyCode && <Badge variant="outline" size="sm">{b.currencyCode}</Badge>}
                </div>
                {b.purpose && (
                  <p className="mt-1 text-xs text-muted-foreground">{b.purpose}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {b.isPostingEnabled ? (
                  <Badge variant="success" size="sm">posting enabled</Badge>
                ) : (
                  <Badge variant="muted" size="sm">posting disabled</Badge>
                )}
                <DefinitionStateChip
                  state={b.status as "draft" | "active" | "inactive"}
                  vocabulary={["draft", "active", "inactive"]}
                  objectKind="ledger_book"
                  size="sm"
                />
                {!b.isPrimary && b.isPostingEnabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPrimary.mutate({ bookId: b.bookId, companyCode })}
                    disabled={setPrimary.isPending}
                    aria-label="Make primary book"
                    title="Make this book the primary for this company"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
