"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Pencil, Plus, Search } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton,
} from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import { useConfigureGlControls, type ConfigureGlControlRow } from "../../hooks/useFinanceConfigure";
import { GlControlAssignDialog, GlControlEditDialog } from "./GlControlDialogs";
import { useBulkGlControls } from "../../hooks/useFinanceSetupMutations";

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
  const [accountClass, setAccountClass] = useState("all");
  const [assignTarget, setAssignTarget] = useState<ConfigureGlControlRow | null>(null);
  const [editTarget,   setEditTarget]   = useState<ConfigureGlControlRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useBulkGlControls();

  const filtered = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (mode === "controlled" && !r.hasCompanyControl) return false;
      if (mode === "missing" && r.hasCompanyControl) return false;
      if (accountClass !== "all" && r.accountClass !== accountClass) return false;
      if (!term) return true;
      return r.accountCode.toLowerCase().includes(term) || r.accountName.toLowerCase().includes(term);
    });
  }, [q.data?.rows, search, mode, accountClass]);
  const accountClasses = useMemo(
    () => [...new Set((q.data?.rows ?? []).map((row) => row.accountClass))].sort(),
    [q.data?.rows],
  );

  return (
    <section id="gl-controls" className={cn("scroll-mt-24 rounded-lg border bg-card", className)}>
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
            <Button variant="secondary" size="sm" disabled={filtered.length === 0}
              onClick={() => setSelected(new Set(filtered.filter((row) => !row.hasCompanyControl).map((row) => row.glAccountId)))}>
              Select unconfigured
            </Button>
          </div>
        </div>
        <CoverageBar
          controlled={q.data?.totalControlled ?? 0}
          total={q.data?.totalPostable ?? 0}
          pct={q.data?.coveragePct ?? 0}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2">
          <CheckSquare className="h-4 w-4 text-primary" aria-hidden />
          <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="secondary" disabled={bulk.isPending}
            onClick={() => bulk.mutate({ companyCode, glAccountIds: [...selected], postingAllowed: true }, { onSuccess: () => setSelected(new Set()) })}>
            Activate
          </Button>
          {(["requiresCostCenter", "requiresProfitCenter", "requiresProject"] as const).map((field) => (
            <Button key={field} size="sm" variant="outline" disabled={bulk.isPending}
              onClick={() => bulk.mutate({ companyCode, glAccountIds: [...selected], [field]: true }, { onSuccess: () => setSelected(new Set()) })}>
              Require {field === "requiresCostCenter" ? "Cost Center" : field === "requiresProfitCenter" ? "Profit Center" : "Project"}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          {bulk.isError && <span className="w-full text-xs text-destructive">{(bulk.error as Error).message}</span>}
        </div>
      )}

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
        <Select value={accountClass} onValueChange={setAccountClass}>
          <SelectTrigger className="h-7 w-40"><SelectValue placeholder="Account class" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All classes</SelectItem>{accountClasses.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
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
                <th className="w-10 p-2">
                  <input type="checkbox" aria-label="Select visible accounts"
                    checked={filtered.length > 0 && filtered.every((row) => selected.has(row.glAccountId))}
                    onChange={(event) => setSelected(event.target.checked ? new Set(filtered.map((row) => row.glAccountId)) : new Set())} />
                </th>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Class</th>
                <th className="p-2">Control</th>
                <th className="p-2">Posting</th>
                <th className="p-2">Requires</th>
                <th className="p-2">Reconciliation / Tax</th>
                <th className="p-2">Defaults</th>
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
                    <td className="p-2"><input type="checkbox" checked={selected.has(row.glAccountId)} aria-label={`Select ${row.accountCode}`}
                      onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.glAccountId); else next.delete(row.glAccountId); return next; })} /></td>
                    <td className="p-2 font-mono text-xs tabular-nums text-muted-foreground">{row.accountCode}</td>
                    <td className="p-2"><div>{row.accountName}</div><div className="text-xs text-muted-foreground">{row.chartCode}{row.currencyCode ? ` · ${row.currencyCode}` : ""}</div></td>
                    <td className="p-2 text-xs text-muted-foreground"><div>{row.accountClass}</div><div>{row.nodeType}</div></td>
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
                    <td className="p-2 text-xs text-muted-foreground"><div>{row.reconciliationType || "—"}</div><div>{row.taxCategory || "—"}</div></td>
                    <td className="p-2 text-xs text-muted-foreground"><div>CC: {row.defaultCostCenterId || "—"}</div><div>Site: {row.defaultSiteId || "—"}</div></td>
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
          glAccountId={assignTarget.glAccountId}
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
