"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useConfigureGlControls, type ConfigureGlControlRow } from "../../hooks/useFinanceConfigure";
import { GlControlAssignDialog, GlControlEditDialog } from "./GlControlDialogs";

type FilterMode = "all" | "controlled" | "missing";

export interface GlControlsGridProps {
  companyCode: string;
  className?:  string;
}

/**
 * GL Controls Grid — Phase 1.5 read-only.
 * Row actions are visible-but-disabled so users see what will be available in
 * Phase 2 (Assign · Set effective date · Deactivate).
 */
export function GlControlsGrid({
  companyCode,
  className,
}: GlControlsGridProps) {
  const q = useConfigureGlControls(companyCode);
  const [search, setSearch] = useState("");
  const [mode, setMode]     = useState<FilterMode>("all");
  const [assignTarget, setAssignTarget] = useState<ConfigureGlControlRow | null>(null);
  const [editTarget,   setEditTarget]   = useState<ConfigureGlControlRow | null>(null);

  const filtered = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (mode === "controlled" && !r.hasCompanyControl) return false;
      if (mode === "missing" && r.hasCompanyControl) return false;
      if (!term) return true;
      return r.accountCode.toLowerCase().includes(term) || r.accountName.toLowerCase().includes(term);
    });
  }, [q.data?.rows, search, mode]);

  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {/* Header + coverage bar */}
      <div className="border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              GL controls · {companyCode}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Every posting GL account should have one company control row.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="Bulk assign lands in a follow-up sprint. Use per-row assign for now."
            >
              Bulk assign
            </Button>
          </div>
        </div>
        <CoverageBar
          controlled={q.data?.totalControlled ?? 0}
          total={q.data?.totalPostable ?? 0}
          pct={q.data?.coveragePct ?? 0}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name…"
            className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
            aria-label="Search"
          />
        </div>
        <Select value={mode} onValueChange={(v) => setMode(v as FilterMode)}>
          <SelectTrigger className="h-7 w-40">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="controlled">Controlled</SelectItem>
            <SelectItem value="missing">Missing control</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="muted" size="sm">{filtered.length}</Badge>
      </div>

      {/* Grid body */}
      <div className="max-h-[560px] overflow-auto">
        {q.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : q.isError ? (
          <p className="p-6 text-sm text-destructive">Failed to load GL controls.</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No accounts match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Class</th>
                <th className="p-2">Control</th>
                <th className="p-2">Posting</th>
                <th className="p-2">Requires</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const chips = [];
                if (row.blockedForManual) chips.push({ label: "manual blocked", tone: "warning" as const });
                if (row.blockedForAuto)   chips.push({ label: "auto blocked",   tone: "warning" as const });
                if (!row.postingAllowed)  chips.push({ label: "disallowed",     tone: "destructive" as const });
                const requires = [
                  row.requiresCostCenter && "cost center",
                  row.requiresProfitCenter && "profit center",
                  row.requiresProject && "project",
                ].filter(Boolean).join(", ");
                return (
                  <tr key={row.glAccountId} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs tabular-nums text-muted-foreground">{row.accountCode}</td>
                    <td className="p-2">{row.accountName}</td>
                    <td className="p-2 text-xs text-muted-foreground">{row.accountClass}</td>
                    <td className="p-2">
                      {row.hasCompanyControl
                        ? <Badge variant="success" size="sm">assigned</Badge>
                        : <Badge variant="warning" size="sm">missing</Badge>}
                    </td>
                    <td className="p-2 space-x-1">
                      {chips.length === 0 && row.hasCompanyControl
                        ? <Badge variant="success" size="sm">allowed</Badge>
                        : chips.map((c) => <Badge key={c.label} variant={c.tone} size="sm">{c.label}</Badge>)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{requires || "—"}</td>
                    <td className="p-2 text-right">
                      {row.hasCompanyControl && row.controlId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(row)}
                          aria-label={`Edit control for ${row.accountCode}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setAssignTarget(row)}
                          aria-label={`Assign control to ${row.accountCode}`}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Assign
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs */}
      {assignTarget && (
        <GlControlAssignDialog
          open
          onClose={() => setAssignTarget(null)}
          companyCode={companyCode}
          glAccountCode={assignTarget.accountCode}
          accountName={assignTarget.accountName}
        />
      )}
      {editTarget && editTarget.controlId && (
        <GlControlEditDialog
          open
          onClose={() => setEditTarget(null)}
          companyCode={companyCode}
          row={editTarget}
        />
      )}
    </section>
  );
}

function CoverageBar({ controlled, total, pct }: { controlled: number; total: number; pct: number }) {
  const tone = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Coverage</span>
        <span>{controlled} of {total} posting accounts · <span className="font-semibold text-foreground">{pct}%</span></span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className={cn("h-full transition-all", tone)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
