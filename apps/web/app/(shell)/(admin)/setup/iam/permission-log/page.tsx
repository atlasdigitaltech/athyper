"use client";

/**
 * Permission Decision Log Viewer — /setup/iam/permission-log
 *
 * Paginated read-only view of log.permission_decision_log.
 * Filters: principal, permission code, entity type, decision, date range.
 *
 * All entries are read-only — no mutations on this page.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, RefreshCw, Search, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@athyper/ui/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PdlEntry {
  id: string;
  principal_id: string;
  principal_code: string | null;
  principal_display_name: string | null;
  permission_code: string | null;
  entity_type: string | null;
  entity_id: string | null;
  module_code: string | null;
  decision: string;
  decision_reason: string;
  scope_applied: string | null;
  evaluation_ms: number | null;
  ip_address: string | null;
  request_id: string | null;
  created_at: string;
}

// ── Decision badge ─────────────────────────────────────────────────────────────

const DECISION_VARIANT: Record<string, "success" | "destructive" | "warning" | "muted" | "outline"> = {
  allow:                "success",
  deny:                 "destructive",
  not_found:            "muted",
  not_in_plan:          "warning",
  addon_required:       "warning",
  override_denied:      "destructive",
  not_entitled:         "muted",
  not_granted:          "muted",
  module_not_subscribed: "muted",
};

function DecisionBadge({ decision }: { decision: string }) {
  return (
    <Badge variant={DECISION_VARIANT[decision] ?? "outline"} className="text-doc-support capitalize whitespace-nowrap">
      {decision.replace(/_/g, " ")}
    </Badge>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const DECISIONS = [
  "allow", "deny", "not_found", "not_in_plan", "addon_required",
  "override_denied", "not_entitled", "not_granted", "module_not_subscribed",
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PermissionLogPage() {
  const qc = useQueryClient();

  // Filter state
  const [principalSearch, setPrincipalSearch] = useState("");
  const [permissionCode, setPermissionCode]   = useState("");
  const [entityType, setEntityType]           = useState("");
  const [decision, setDecision]               = useState("");
  const [dateFrom, setDateFrom]               = useState("");
  const [dateTo, setDateTo]                   = useState("");
  const [filtersOpen, setFiltersOpen]         = useState(true);

  // Applied filters (only committed when clicking Apply)
  const [applied, setApplied] = useState({
    principalSearch: "",
    permissionCode: "",
    entityType: "",
    decision: "",
    dateFrom: "",
    dateTo: "",
  });

  const [offset, setOffset] = useState(0);

  function applyFilters() {
    setApplied({ principalSearch, permissionCode, entityType, decision, dateFrom, dateTo });
    setOffset(0);
  }

  function clearFilters() {
    setPrincipalSearch(""); setPermissionCode(""); setEntityType("");
    setDecision(""); setDateFrom(""); setDateTo("");
    setApplied({ principalSearch: "", permissionCode: "", entityType: "", decision: "", dateFrom: "", dateTo: "" });
    setOffset(0);
  }

  const { data, isLoading } = useQuery<{ items: PdlEntry[]; total: number }>({
    queryKey: ["iam-permission-log", applied, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (applied.permissionCode) params.set("permission_code", applied.permissionCode);
      if (applied.entityType)     params.set("entity_type",     applied.entityType);
      if (applied.decision)       params.set("decision",        applied.decision);
      if (applied.dateFrom)       params.set("date_from",       applied.dateFrom);
      if (applied.dateTo)         params.set("date_to",         applied.dateTo);
      const res = await fetch(`/api/iam/admin/permission-log?${params}`);
      return res.ok ? res.json() : { items: [], total: 0 };
    },
    staleTime: 15_000,
  });

  const entries = data?.items ?? [];
  const total   = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Client-side principal filter (not sent to server — principal search is by code/name text)
  const filtered = applied.principalSearch
    ? entries.filter((e) => {
        const hay = `${e.principal_code ?? ""} ${e.principal_display_name ?? ""}`.toLowerCase();
        return hay.includes(applied.principalSearch.toLowerCase());
      })
    : entries;

  const hasActiveFilters = Object.values(applied).some(Boolean);

  return (
    <PageFrame
      title="Permission Decision Log"
      description="Read-only audit log of IAM permission check decisions"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-permission-log"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />Clear filters
            </Button>
          )}
        </div>
      }
    >
      {/* Filter panel */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-4">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs mb-2">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {filtersOpen ? "Hide Filters" : "Show Filters"}
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1.5 text-doc-field-label px-1">active</Badge>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-md border p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Principal (name / code)</Label>
              <Input
                value={principalSearch}
                onChange={(e) => setPrincipalSearch(e.target.value)}
                placeholder="Filter principal…"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Permission Code</Label>
              <Input
                value={permissionCode}
                onChange={(e) => setPermissionCode(e.target.value)}
                placeholder="e.g. FIN.JOURNALS.CREATE"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Entity Type</Label>
              <Input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                placeholder="e.g. journal_entry"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Decision</Label>
              <Select value={decision || "_all"} onValueChange={(v) => setDecision(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All decisions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All decisions</SelectItem>
                  {DECISIONS.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <Button size="sm" className="h-8" onClick={applyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-muted-foreground/30" />}
          title="No log entries found."
          description={hasActiveFilters ? "Try adjusting or clearing the filters." : "Permission decisions will appear here once recorded."}
          className="py-20"
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Principal</th>
                  <th className="py-2 pr-4 font-medium">Permission</th>
                  <th className="py-2 pr-4 font-medium">Entity</th>
                  <th className="py-2 pr-4 font-medium">Decision</th>
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 font-medium">ms</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                    {/* Time */}
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString(undefined, {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </td>

                    {/* Principal */}
                    <td className="py-2 pr-4">
                      <div className="max-w-[140px]">
                        <p className="truncate text-xs font-medium">
                          {e.principal_display_name ?? e.principal_code ?? e.principal_id.slice(0, 8)}
                        </p>
                        {e.principal_code && e.principal_display_name && (
                          <p className="font-mono text-doc-support text-muted-foreground">{e.principal_code}</p>
                        )}
                      </div>
                    </td>

                    {/* Permission */}
                    <td className="py-2 pr-4">
                      <span className="font-mono text-xs">{e.permission_code ?? "—"}</span>
                      {e.module_code && (
                        <span className="ml-1.5 text-doc-support text-muted-foreground">{e.module_code}</span>
                      )}
                    </td>

                    {/* Entity */}
                    <td className="py-2 pr-4 text-xs">
                      {e.entity_type ? (
                        <div>
                          <Badge variant="outline" className="text-doc-field-label px-1">{e.entity_type}</Badge>
                          {e.entity_id && (
                            <p className="font-mono text-doc-support text-muted-foreground mt-0.5">
                              {e.entity_id.slice(0, 8)}…
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Decision */}
                    <td className="py-2 pr-4">
                      <DecisionBadge decision={e.decision} />
                    </td>

                    {/* Reason */}
                    <td className="py-2 pr-4 max-w-[200px]">
                      <p className="text-xs text-muted-foreground truncate" title={e.decision_reason}>
                        {e.decision_reason}
                      </p>
                      {e.scope_applied && (
                        <p className="text-doc-support text-muted-foreground/70 mt-0.5">{e.scope_applied}</p>
                      )}
                    </td>

                    {/* Eval ms */}
                    <td className="py-2 text-xs text-right tabular-nums text-muted-foreground">
                      {e.evaluation_ms != null ? e.evaluation_ms : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total} total · page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </PageFrame>
  );
}
