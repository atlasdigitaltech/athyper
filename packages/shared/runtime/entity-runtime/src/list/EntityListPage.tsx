/**
 * @athyper/entity-runtime — EntityListPage
 *
 * Renders a master record list from compiled metadata.
 * Columns, filters, sort, and search are all driven by the descriptor.
 *
 * View modes:
 *   list      — DataTable (default)
 *   board     — KanbanView grouped by status/groupable field, with inline transitions
 *   compact   — Card grid
 *   dashboard — Aggregate KPI tiles + status distribution + numeric aggregates
 *
 * Board and dashboard modes are gated:
 *   board     — only shown when the entity has a groupable field
 *   dashboard — always available (falls back to total/today counts only)
 *
 * URL state — all list params (search, filters, sort, view, saved view) are in
 * the URL. The URL is the single source of truth. No component-local state for
 * list query params.
 *
 * Sort — controlled / server-side:
 *   - DataTable headers write to URL via setSort (server-side sort).
 *   - Default sort comes from display_config (via resolvePresentationConfig)
 *     and is applied when no URL sort param is present.
 *
 * Saved views — loading a view sets savedViewId + baseSavedViewId in URL.
 *   Subsequent changes clear savedViewId → "Modified from <name>" indicator.
 *
 * Semantic badges — status chips use theme resolvers (kanbanStatusIntent,
 *   apArStatusIntent, etc.) driven by ColumnPresentation.semanticResolver.
 *   No local badge maps.
 *
 * Bulk ops — selection bar when 1+ rows selected in list mode.
 */
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutList,
  LayoutGrid,
  Trash2,
  Download,
  Tag,
  Kanban,
  BarChart2,
  AlertCircle,
  RotateCcw,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  MoreHorizontal,
  TableProperties,
  AlignJustify,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews, useSaveView, useUpdateView } from "@athyper/query";
import { resolveActionsForSurface } from "@athyper/metadata-client/operation-reader";
import type { ResolvedAction } from "@athyper/metadata-client/operation-reader";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import { FilterPillBar } from "@athyper/ui/composites";
import { resolveListConfig, resolvePresentationConfig } from "@athyper/metadata-client/compiled-reader";
import { DataTable, type ColumnDef, type RowSelectionState, type SortingState } from "@athyper/ui/data";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@athyper/ui/primitives";
import { SearchInput } from "@athyper/ui/composites";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import {
  kanbanStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  adminStatusIntent,
} from "@athyper/theme/domain-intents";
import { stateToApiParams } from "@athyper/api-contracts/entity-list";
import type {
  EntityListQueryState,
  EntityListFilters,
  BulkPreflightResult,
  BulkActionResult,
} from "@athyper/api-contracts/entity-list";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";
import { KanbanView, findKanbanGroupField } from "./KanbanView";
import { DashboardView } from "./DashboardView";
import { ExcelView } from "./ExcelView";
import { useEntityListUrl } from "./useEntityListUrl";

export interface EntityListPageProps {
  entityCode: string;
}

type ViewMode = "list" | "board" | "compact" | "dashboard" | "excel";

// ── Status badge (semantic — driven by ColumnPresentation.semanticResolver) ───

// Registry of named intent resolvers — matches ColumnPresentation.semanticResolver values.
// Adding a new resolver: add it here and in @athyper/theme/domain-intents.
const SEMANTIC_RESOLVERS: Record<string, (value: string) => SemanticIntent> = {
  kanbanStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  adminStatusIntent,
};

function StatusBadge({ value, resolverName }: { value: string; resolverName?: string }) {
  if (!value) return null;
  const resolverFn = resolverName ? SEMANTIC_RESOLVERS[resolverName] : undefined;
  const intent = resolverFn ? resolverFn(value) : kanbanStatusIntent(value);
  const colors = resolveSemanticColors(intent);
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] capitalize", colors.subtleBadge)}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function getStatusValue(row: Record<string, unknown>): string {
  return String(row.status ?? row.record_status ?? row.state ?? "");
}

// ── Compact card grid ─────────────────────────────────────────────────────────

function CompactView({
  rows,
  titleKey,
  entityCode,
  onRowClick,
  statusResolverName,
  compactColumns,
}: {
  rows:               Record<string, unknown>[];
  titleKey:           string;
  entityCode:         string;
  onRowClick?:        (row: Record<string, unknown>) => void;
  statusResolverName?: string;
  /** Presentation-config columns filtered to compactVisible !== false. Max 4 shown. */
  compactColumns:     import("@athyper/api-contracts/entity-list").ColumnPresentation[];
}) {
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No records</div>
    );
  }

  // Extra fields to show on the card body — skip the title key and status fields to avoid duplication
  const STATUS_KEYS = new Set(["status", "record_status", "state", "lifecycle_state"]);
  const extraFields = compactColumns
    .filter((c) => c.fieldName !== titleKey && !STATUS_KEYS.has(c.fieldName))
    .slice(0, 4);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => {
        const id    = String(row.id ?? "");
        const title = String(row[titleKey] ?? row.name ?? row.code ?? id);
        const status = getStatusValue(row);
        return (
          <div
            key={id}
            onClick={() => onRowClick?.(row)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
              onRowClick && "cursor-pointer",
            )}
          >
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{title}</p>
              <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0.5 font-mono">
                {entityCode}
              </Badge>
            </div>

            {/* Status + id */}
            <div className="flex items-center gap-2">
              {status && (
                <StatusBadge value={status} resolverName={statusResolverName} />
              )}
              {id && (
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  {id.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Extra fields from compactVisible config */}
            {extraFields.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t pt-2">
                {extraFields.map((col) => {
                  const val = row[col.fieldName];
                  if (val === undefined || val === null || val === "") return null;
                  return (
                    <div key={col.fieldName} className="contents">
                      <dt className="text-[10px] text-muted-foreground truncate">
                        {col.label ?? col.fieldName}
                      </dt>
                      <dd className="text-[10px] font-medium truncate">
                        {String(val)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── View mode switcher ────────────────────────────────────────────────────────

function ViewModeSwitcher({
  mode,
  onChange,
  hasGroupable,
}: {
  mode:         ViewMode;
  onChange:     (m: ViewMode) => void;
  hasGroupable: boolean;
}) {
  type Option = { value: ViewMode; Icon: typeof LayoutList; label: string; gated?: boolean };

  const options: Option[] = [
    { value: "list",      Icon: LayoutList,      label: "List" },
    { value: "board",     Icon: Kanban,          label: "Board",     gated: !hasGroupable },
    { value: "compact",   Icon: LayoutGrid,      label: "Compact" },
    { value: "dashboard", Icon: BarChart2,       label: "Dashboard" },
    { value: "excel",     Icon: TableProperties, label: "Spreadsheet" },
  ];

  return (
    <div className="flex rounded-md border overflow-hidden">
      {options
        .filter((o) => !o.gated)
        .map(({ value, Icon, label }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            title={label}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
              mode === value
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
    </div>
  );
}

// ── Saved view modified indicator ─────────────────────────────────────────────

function ModifiedIndicator({
  baseName,
  onDiscard,
}: {
  baseName:  string | undefined;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs text-warning">
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>Modified{baseName ? ` from "${baseName}"` : ""}</span>
      <button
        onClick={onDiscard}
        className="ml-1 flex items-center gap-1 underline-offset-2 hover:underline"
        title="Discard changes and reload saved view"
      >
        <RotateCcw className="h-3 w-3" />
        Discard
      </button>
    </div>
  );
}

// ── Save view bar ─────────────────────────────────────────────────────────────

function SaveViewBar({
  entityCode,
  state,
  isModified,
  baseSavedViewId,
  baseName,
}: {
  entityCode:     string;
  state:          EntityListQueryState;
  isModified:     boolean;
  baseSavedViewId?: string;
  baseName?:      string;
}) {
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState("");
  const nameInputRef        = useRef<HTMLInputElement>(null);

  const saveView   = useSaveView();
  const updateView = useUpdateView(entityCode);

  const handleSaveNew = () => {
    if (!name.trim()) return;
    saveView.mutate(
      {
        entity_code: entityCode,
        name:        name.trim(),
        is_default:  false,
        is_shared:   false,
        config:      state,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
        },
      },
    );
  };

  const handleUpdate = () => {
    if (!baseSavedViewId) return;
    updateView.mutate({ viewId: baseSavedViewId, config: state });
  };

  const saving = saveView.isPending || updateView.isPending;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Update (overwrite base view) — only when modified from a saved view */}
        {isModified && baseSavedViewId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={saving}
            onClick={handleUpdate}
          >
            {updateView.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Update{baseName ? ` "${baseName}"` : ""}
          </Button>
        )}

        {/* Save as new view */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => { setName(""); setOpen(true); }}
        >
          <Save className="h-3 w-3" />
          Save as View
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Give this filter/sort configuration a name to recall it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              ref={nameInputRef}
              placeholder="e.g. Open AP invoices"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveNew(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveNew}
              disabled={!name.trim() || saving}
            >
              {saveView.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Bulk action dialog ────────────────────────────────────────────────────────
//
// Full pre-flight → confirm → execute → result flow.
// Phase:
//   idle       — bar shown, user hasn't clicked an action yet
//   preflight  — POST /bulk-preflight in flight
//   confirm    — dialog with eligible/skipped/denied summary; Confirm gated by canProceed
//   executing  — POST /bulk-action in flight
//   done       — result summary shown; Close clears selection

type BulkPhase = "preflight" | "confirm" | "executing" | "done";

function BulkActionDialog({
  entityCode,
  selectedIds,
  operations,
  onClear,
}: {
  entityCode:  string;
  selectedIds: string[];
  operations:  EntityOperation[];
  onClear:     () => void;
}) {
  const [phase,        setPhase]        = useState<BulkPhase | null>(null);
  const [preflight,    setPreflight]    = useState<BulkPreflightResult | null>(null);
  const [result,       setResult]       = useState<BulkActionResult | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showRecords,  setShowRecords]  = useState(false);

  // Always-on background preflight — fires whenever selection changes (debounced 300 ms).
  // Provides "Post (8 of 15 eligible)" counts on each button before the user clicks.
  const [preflightMap,     setPreflightMap]     = useState<Record<string, BulkPreflightResult | null>>({});
  const [preflightLoading, setPreflightLoading] = useState(false);
  const preflightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = selectedIds.length;

  // Derive bulk action buttons from operations (memoised — stable dep for the effect below).
  // LIST non-record-required ops (export, import) + DETAIL record-required non-NAVIGATE ops.
  const displayOps = useMemo<ResolvedAction[]>(() => {
    const bulkListOps   = resolveActionsForSurface(operations, "LIST").filter(
      (a) => !a.requiresRecord && a.handlerType !== "NAVIGATE",
    );
    const bulkRecordOps = resolveActionsForSurface(operations, "DETAIL").filter(
      (a) => a.requiresRecord && a.handlerType !== "NAVIGATE",
    );
    const all = [...bulkListOps, ...bulkRecordOps].slice(0, 6);
    if (all.length > 0) return all;
    // Fallback when no ops seeded
    return [{ permissionCode: "export", label: "Export", handlerType: "API" as const, icon: null, handlerTarget: null, placement: "TOOLBAR" as const, requiresRecord: false, sortOrder: 0 }];
  }, [operations]);

  // Stable list of action codes for the effect dep (avoids object-identity churn)
  const displayOpCodes = useMemo(
    () => displayOps.map((op) => op.permissionCode.split(".").pop() ?? op.permissionCode),
    [displayOps],
  );

  // Background preflight: re-run for every op whenever selection changes
  useEffect(() => {
    if (selectedIds.length === 0) {
      setPreflightMap({});
      return;
    }
    if (preflightTimerRef.current) clearTimeout(preflightTimerRef.current);
    preflightTimerRef.current = setTimeout(() => {
      setPreflightLoading(true);
      Promise.all(
        displayOpCodes.map(async (actionCode) => {
          try {
            const res = await fetch(`/api/records/${entityCode}/bulk-preflight`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ action: actionCode, recordIds: selectedIds }),
            });
            if (!res.ok) return [actionCode, null] as const;
            const data = (await res.json()) as BulkPreflightResult;
            return [actionCode, data] as const;
          } catch {
            return [actionCode, null] as const;
          }
        }),
      )
        .then((entries) => {
          setPreflightMap(Object.fromEntries(entries));
          setPreflightLoading(false);
        })
        .catch(() => { setPreflightLoading(false); });
    }, 300);

    return () => {
      if (preflightTimerRef.current) clearTimeout(preflightTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(","), entityCode, displayOpCodes.join(",")]);

  const runPreflight = async (action: string) => {
    setActiveAction(action);
    setPhase("preflight");
    setError(null);
    try {
      const res = await fetch(`/api/records/${entityCode}/bulk-preflight`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, recordIds: selectedIds }),
      });
      if (!res.ok) throw new Error(`Preflight failed: ${res.status}`);
      const data = (await res.json()) as BulkPreflightResult;
      setPreflight(data);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight failed");
      setPhase(null);
    }
  };

  // On click: use cached preflight result to skip the network round-trip.
  // Falls back to runPreflight only when the background check hasn't resolved yet.
  const handleActionClick = (actionCode: string) => {
    const cached = preflightMap[actionCode];
    if (cached) {
      setActiveAction(actionCode);
      setPreflight(cached);
      setPhase("confirm");
      setError(null);
    } else {
      void runPreflight(actionCode);
    }
  };

  const runAction = async () => {
    if (!activeAction || !preflight) return;
    setPhase("executing");
    setError(null);
    try {
      const res = await fetch(`/api/records/${entityCode}/bulk-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: activeAction, recordIds: selectedIds }),
      });
      if (!res.ok) throw new Error(`Action failed: ${res.status}`);
      const data = (await res.json()) as BulkActionResult;
      setResult(data);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setPhase("confirm"); // keep confirm open so user can retry
    }
  };

  const closeDialog = () => {
    setPhase(null);
    setPreflight(null);
    setResult(null);
    setActiveAction(null);
    setError(null);
    setShowRecords(false);
    if (phase === "done") onClear();
  };

  return (
    <>
      {/* Selection bar */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
        <span className="text-sm font-medium">{count} selected</span>
        <div className="ml-auto flex items-center gap-2">
          {displayOps.map((op) => {
            const actionCode  = op.permissionCode.split(".").pop() ?? op.permissionCode;
            const isDestruct  = ["delete","cancel","deny","reject","void"].includes(actionCode);
            const pf          = preflightMap[actionCode];
            // "Post (8 of 15 eligible)" — shown once background preflight resolves
            const countSuffix = preflightLoading
              ? " (…)"
              : pf != null
              ? ` (${pf.eligible} of ${count})`
              : "";
            // Disable when preflight confirms 0 eligible records
            const isIneligible = !preflightLoading && pf?.canProceed === false;
            const isRunningThis = phase === "preflight" && activeAction === actionCode;
            return (
              <Button
                key={op.permissionCode}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 gap-1.5 text-xs",
                  isDestruct && "text-destructive hover:text-destructive",
                )}
                disabled={isIneligible || phase === "preflight"}
                onClick={() => handleActionClick(actionCode)}
              >
                {isRunningThis
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : isDestruct
                  ? <Trash2 className="h-3.5 w-3.5" />
                  : <Download className="h-3.5 w-3.5" />}
                {op.label}{countSuffix}
              </Button>
            );
          })}
          <button
            onClick={onClear}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Pre-flight confirm / result dialog */}
      <Dialog open={phase === "confirm" || phase === "executing" || phase === "done"} onOpenChange={() => { if (phase !== "executing") closeDialog(); }}>
        <DialogContent className="max-w-md">
          {phase === "done" && result ? (
            <>
              <DialogHeader>
                <DialogTitle>Action Complete</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat icon={CheckCircle2} label="Succeeded" value={result.summary.success} variant="success" />
                  <Stat icon={XCircle}     label="Failed"     value={result.summary.error}   variant="error"   />
                  <Stat icon={ChevronRight} label="Skipped"   value={result.summary.skipped} variant="neutral" />
                  <Stat icon={ChevronRight} label="Workflow"  value={result.summary.requiresWorkflow} variant="neutral" />
                </div>
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                {result.records.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setShowRecords((s) => !s)}
                      className="text-xs text-primary hover:underline underline-offset-2"
                    >
                      {showRecords ? "Hide details" : `Show details (${result.records.length} records)`}
                    </button>
                    {showRecords && (
                      <ul className="max-h-44 overflow-auto rounded-md border bg-muted/30 p-2 space-y-1">
                        {result.records.map((rec) => {
                          const pa = rec.policyAction;
                          const paPill = pa && pa !== "allow" ? (
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium",
                              pa === "deny"              ? "bg-destructive/10 text-destructive" :
                              pa === "warn"              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                              pa === "require_workflow"  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                              /* escalate */               "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                            )}>
                              {pa.replace(/_/g, " ")}
                            </span>
                          ) : null;
                          const statusColor =
                            rec.status === "success" ? "text-emerald-600" :
                            rec.status === "error"   ? "text-destructive" :
                                                       "text-muted-foreground";
                          return (
                            <li key={rec.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                {rec.id.slice(0, 8)}
                              </span>
                              <span className={cn("shrink-0 capitalize", statusColor)}>
                                {rec.status.replace(/_/g, " ")}
                              </span>
                              {paPill}
                              {rec.reason && (
                                <span className="text-muted-foreground truncate">{rec.reason}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm: {activeAction}</DialogTitle>
                <DialogDescription>
                  {preflight?.eligible} of {preflight?.total} records will be processed.
                </DialogDescription>
              </DialogHeader>
              {preflight && (
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Stat icon={CheckCircle2} label="Eligible"         value={preflight.eligible}         variant="success" />
                    <Stat icon={ChevronRight} label="Already done"     value={preflight.skipped}          variant="neutral" />
                    <Stat icon={XCircle}      label="Denied"           value={preflight.denied}           variant="error"   />
                    <Stat icon={ChevronRight} label="Needs workflow"   value={preflight.requiresWorkflow} variant="neutral" />
                  </div>
                  {!preflight.canProceed && (
                    <p className="text-xs text-muted-foreground">
                      No records are eligible — nothing to do.
                    </p>
                  )}
                  {error && (
                    <p className="text-xs text-destructive">{error}</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog} disabled={phase === "executing"}>
                  Cancel
                </Button>
                <Button
                  onClick={runAction}
                  disabled={!preflight?.canProceed || phase === "executing"}
                >
                  {phase === "executing"
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : null}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Small stat cell used inside BulkActionDialog
function Stat({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon:    typeof CheckCircle2;
  label:   string;
  value:   number;
  variant: "success" | "error" | "neutral";
}) {
  const color = variant === "success"
    ? "text-emerald-600"
    : variant === "error"
    ? "text-destructive"
    : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ── Quick status filter bar ───────────────────────────────────────────────────
//
// A compact FilterPillBar row for the status field's enum values.
// Populated from ?facets=cheap data so counts stay live.
// Shows only when the entity has a semantic status field and facet data is available.

function QuickStatusBar({
  statusField,
  facets,
  filters,
  onSetStatus,
}: {
  statusField: string;
  facets:      Record<string, { value: string; count: number }[]>;
  filters:     EntityListFilters;
  onSetStatus: (value: string) => void;
}) {
  const values = facets[statusField];
  if (!values || values.length === 0) return null;

  const activeStatus = filters[statusField]?.[0] ?? "";

  const items = values.map(({ value, count }) => ({
    value,
    label: value.replace(/_/g, " "),
    count,
  }));

  return (
    <FilterPillBar
      items={items}
      value={activeStatus}
      onChange={onSetStatus}
      allItem={{ label: "All" }}
      compact
    />
  );
}

// ── Row action menu ────────────────────────────────────────────────────────────
//
// A ⋯ dropdown showing record-required operations for a single row.
// Renders DETAIL operations; handler dispatch mirrors ActionBar logic.

function RowActionMenu({
  row,
  entityCode,
  operations,
}: {
  row:         Record<string, unknown>;
  entityCode:  string;
  operations:  EntityOperation[];
}) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  const recordId = String(row.id ?? "");

  // Record-required DETAIL operations that make sense in a row context
  const rowOps = resolveActionsForSurface(operations, "DETAIL").filter(
    (a) => a.requiresRecord && a.handlerType !== "NAVIGATE",
  );

  if (rowOps.length === 0) return null;

  const dispatch = async (action: ReturnType<typeof resolveActionsForSurface>[number]) => {
    setOpen(false);
    if (!recordId) return;
    setLoading(true);
    try {
      const code = action.permissionCode.split(".").pop() ?? action.permissionCode;
      await fetch(`/api/relay/api/records/${entityCode}/${recordId}/action/${code}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex justify-end">
      <button
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-label="Row actions"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-0.5 w-44 rounded-lg border bg-popover py-1 shadow-md">
            {rowOps.map((action) => (
              <button
                key={action.permissionCode}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                onClick={() => void dispatch(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Active filter chips ────────────────────────────────────────────────────────
//
// Shows one chip per active filter field with a × to remove it.
// "Clear all" removes all filters at once.

function ActiveFilterChips({
  filters,
  fieldLabels,
  onRemoveField,
  onClearAll,
}: {
  filters:        EntityListFilters;
  fieldLabels:    Record<string, string>;
  onRemoveField:  (field: string) => void;
  onClearAll:     () => void;
}) {
  const entries = Object.entries(filters).filter(([, vals]) => vals.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(([field, values]) => (
        <span
          key={field}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-foreground"
        >
          <span className="text-muted-foreground">{fieldLabels[field] ?? field}:</span>
          {values.join(", ")}
          <button
            onClick={() => onRemoveField(field)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
            aria-label={`Remove filter for ${field}`}
          >
            <XCircle className="h-3 w-3" />
          </button>
        </span>
      ))}
      {entries.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// ── Facet filter panel ────────────────────────────────────────────────────────
//
// A toggleable side panel that renders per-field checkboxes populated from
// ?facets=cheap API data. Opens/closes via the Filter button in the toolbar.

function FacetFilterPanel({
  facets,
  filters,
  fieldLabels,
  onToggleValue,
}: {
  facets:        Record<string, { value: string; count: number }[]>;
  filters:       EntityListFilters;
  fieldLabels:   Record<string, string>;
  onToggleValue: (field: string, value: string, checked: boolean) => void;
}) {
  const fields = Object.keys(facets);
  if (fields.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No filterable fields
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {fields.map((field) => {
        const values  = facets[field] ?? [];
        const active  = filters[field] ?? [];
        const label   = fieldLabels[field] ?? field;
        return (
          <div key={field} className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            {values.map(({ value, count }) => {
              const checked = active.includes(value);
              return (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    checked={checked}
                    onChange={(e) => onToggleValue(field, value, e.target.checked)}
                  />
                  <span className="flex-1 capitalize">{value.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Column picker ─────────────────────────────────────────────────────────────
//
// A popover-style dropdown listing available columns with checkboxes.
// Writes selections to URL ?cols= via onChangeColumns.

function ColumnPickerButton({
  allColumns,
  visibleColumns,
  onChangeColumns,
}: {
  allColumns:      { name: string; label: string }[];
  visibleColumns:  string[];
  onChangeColumns: (cols: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (name: string, checked: boolean) => {
    const next = checked
      ? [...visibleColumns, name]
      : visibleColumns.filter((c) => c !== name);
    onChangeColumns(next.length > 0 ? next : allColumns.map((c) => c.name));
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen((o) => !o)}
        title="Choose columns"
      >
        <LayoutList className="h-3.5 w-3.5" />
        Columns
      </Button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border bg-popover p-2 shadow-md">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Columns
            </p>
            {allColumns.map(({ name, label }) => {
              const visible = visibleColumns.length === 0 || visibleColumns.includes(name);
              return (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50 transition-colors text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                    checked={visible}
                    onChange={(e) => toggle(name, e.target.checked)}
                  />
                  {label}
                </label>
              );
            })}
            {visibleColumns.length > 0 && (
              <button
                onClick={() => { onChangeColumns([]); setOpen(false); }}
                className="mt-2 w-full rounded-sm px-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Reset to default
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntityListPage({ entityCode }: EntityListPageProps) {
  const router = useRouter();
  const [rowSelection,   setRowSelection]   = useState<RowSelectionState>({});
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // URL is the single source of truth for list state
  const {
    state,
    setSearch,
    setSort,
    setFilters,
    setGroup,
    setPage,
    setColumns,
    setViewMode,
    setDensity,
    loadSavedView,
    reset,
    isModified,
    hasActiveQuery,
  } = useEntityListUrl(entityCode);

  const viewMode = (state.viewMode ?? "list") as ViewMode;

  const { data: entity,     isLoading: metaLoading, error: metaError } = useCompiledEntity(entityCode);
  const { data: operations }                                            = useEntityOperations(entityCode);
  const { data: savedViews = [] }                                       = useSavedViews(entityCode);

  // Derive presentation config from metadata (memoized — entity rarely changes)
  const presentationConfig = useMemo(
    () => entity ? resolvePresentationConfig(entity) : undefined,
    [entity],
  );

  // Resolve active sort: URL state → metadata default → undefined
  const activeSort = state.sort ?? presentationConfig?.defaultSort;

  // Build server request params from canonical URL state.
  // Always request cheap facets (used for quick-status bar + filter panel).
  const apiParams = useMemo(() => {
    const base = stateToApiParams({ ...state, sort: activeSort });
    base.facets = "cheap";
    // Convert EntityListFilters (string[]) to Record<string, unknown> for the API client
    if (base.filters) {
      const flatFilters: Record<string, unknown> = {};
      for (const [field, values] of Object.entries(base.filters)) {
        if (Array.isArray(values)) {
          if (values.length === 1) flatFilters[field] = values[0];
          else if (values.length > 1) flatFilters[field] = values;
        }
      }
      return { ...base, filters: flatFilters };
    }
    return base;
  }, [state, activeSort]);

  const { data: listData, isLoading: dataLoading } = useEntityList(entityCode, apiParams);

  // Controlled sort state for DataTable (server-side sort)
  const tableSortingState = useMemo<SortingState>(
    () => activeSort ? [{ id: activeSort.key, desc: activeSort.dir === "desc" }] : [],
    [activeSort],
  );

  const handleSortChange = useCallback(
    (sorting: SortingState) => {
      if (sorting.length > 0) {
        const { id, desc } = sorting[0]!;
        setSort({ key: id, dir: desc ? "desc" : "asc" });
      } else {
        setSort(undefined);
      }
    },
    [setSort],
  );

  // Find the active saved view object (for "Modified from <name>" indicator)
  const baseSavedView = useMemo(
    () => state.baseSavedViewId ? savedViews.find((v) => v.id === state.baseSavedViewId) : undefined,
    [state.baseSavedViewId, savedViews],
  );


  // ── Hooks that must not appear after early returns ───────────────────────────

  // Field label map for filter chips and facet panel headers
  const fieldLabelMap = useMemo(
    () =>
      entity
        ? Object.fromEntries(resolveListConfig(entity).columns.map((f) => [f.name, f.label ?? f.name]))
        : {},
    [entity],
  );

  // Quick status filter — the first status-like field that has a semanticResolver
  const statusFieldName = presentationConfig?.columns.find(
    (c) => c.semanticResolver,
  )?.fieldName;

  // Handlers for filter panel
  const handleToggleFacetValue = useCallback(
    (field: string, value: string, checked: boolean) => {
      const current = state.filters?.[field] ?? [];
      const next    = checked ? [...current, value] : current.filter((v) => v !== value);
      const updated = { ...(state.filters ?? {}), [field]: next };
      // Remove field entirely if no values selected
      if (next.length === 0) delete updated[field];
      setFilters(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [state.filters, setFilters],
  );

  const handleRemoveFilterField = useCallback(
    (field: string) => {
      const updated = { ...(state.filters ?? {}) };
      delete updated[field];
      setFilters(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [state.filters, setFilters],
  );

  const handleSetStatus = useCallback(
    (value: string) => {
      if (!statusFieldName) return;
      const updated = { ...(state.filters ?? {}) };
      if (value) {
        updated[statusFieldName] = [value];
      } else {
        delete updated[statusFieldName];
      }
      setFilters(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [statusFieldName, state.filters, setFilters],
  );

  // ── Hooks that MUST appear before any early return ───────────────────────────
  // (Rules of Hooks: hooks must be called unconditionally on every render)

  const allRows = (listData?.data ?? []) as Record<string, unknown>[];

  // Compact view columns — filtered to compactVisible !== false.
  const compactColumns = useMemo(
    () => presentationConfig?.columns.filter((c) => c.compactVisible !== false) ?? [],
    [presentationConfig],
  );

  // Aggregation footer values — sum all aggregatable columns over the current page of rows.
  const aggregations = useMemo<Record<string, number | null> | undefined>(() => {
    if (!presentationConfig || allRows.length === 0) return undefined;
    const agg: Record<string, number | null> = {};
    let any = false;
    for (const colPres of presentationConfig.columns) {
      if (colPres.aggregation !== "sum") continue;
      const field = entity?.fields.find((f) => f.name === colPres.fieldName);
      if (!field?.is_aggregatable) continue;
      const sum = allRows.reduce((acc, row) => {
        const v = row[colPres.fieldName];
        return acc + (typeof v === "number" ? v : 0);
      }, 0);
      agg[colPres.fieldName] = sum;
      any = true;
    }
    return any ? agg : undefined;
  }, [presentationConfig, allRows, entity]);

  // Pinned columns — columns where pinnedByDefault = true in presentation config.
  const pinnedColumns = useMemo<string[]>(
    () => presentationConfig?.columns.filter((c) => c.pinnedByDefault).map((c) => c.fieldName) ?? [],
    [presentationConfig],
  );

  // ── Error / loading ──────────────────────────────────────────────────────────

  if (metaError) {
    return (
      <PageFrame title="Entity Not Found">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Entity <code className="font-mono">{entityCode}</code> not found in compiled metadata.
          </p>
        </div>
      </PageFrame>
    );
  }

  if (metaLoading || !entity) {
    return (
      <PageFrame>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageFrame>
    );
  }

  const listConfig   = resolveListConfig(entity);
  const titleKey     = listConfig.columns[0]?.name ?? "name";
  const hasGroupable = !!findKanbanGroupField(entity);

  // Status field resolver from presentation config (for compact view badges)
  const statusResolverName = presentationConfig?.columns.find(
    (c) => c.semanticResolver && ["status","record_status","state"].includes(c.fieldName),
  )?.semanticResolver;

  const selectedCount = Object.keys(rowSelection).length;

  // Selected record IDs — derived from DataTable row-index selection keys.
  // TanStack Table uses row index as key by default; map back to record IDs.
  const selectedIds = Object.keys(rowSelection)
    .map((idx) => String(allRows[Number(idx)]?.id ?? ""))
    .filter(Boolean);

  // Server pagination from API response (server emits snake_case keys)
  const pagination     = listData?.pagination as { total?: number; page?: number; total_pages?: number } | undefined;
  const serverTotal    = pagination?.total;
  const serverPage     = pagination?.page;
  const serverTotalPgs = pagination?.total_pages;

  // Facets from API response — populated when filterPanelOpen = true and facets=cheap
  const facetData = (listData?.facets ?? {}) as Record<string, { value: string; count: number }[]>;

  // Column visibility: if URL ?cols= is set, only show those fields
  const visibleColumnNames = state.columns ?? [];
  const allDescriptorColumns = listConfig.columns;

  // Build TanStack Table columns from descriptor fields
  const columns: ColumnDef<Record<string, unknown>>[] = allDescriptorColumns
    .filter((f) => visibleColumnNames.length === 0 || visibleColumnNames.includes(f.name))
    .map((field) => {
    const colPres = presentationConfig?.columns.find((c) => c.fieldName === field.name);
    return {
      accessorKey:   field.name,
      header:        field.label ?? field.name,
      enableSorting: field.is_sortable,
      cell: ({ getValue }) => {
        const value = getValue();
        // If this field has a semantic resolver, render as a status badge
        if (colPres?.semanticResolver && typeof value === "string" && value) {
          return <StatusBadge value={value} resolverName={colPres.semanticResolver} />;
        }
        const Renderer = resolveFieldRenderer(field);
        return <Renderer value={value} field={field} mode="view" />;
      },
    };
  });

  const handleRowClick = (row: Record<string, unknown>) => {
    const id = row.id as string;
    if (id) router.push(`/app/${entityCode}/${id}`);
  };

  // Determine which saved view tab is "active" based on URL state
  const activeSavedViewId = state.savedViewId ?? "__all";

  const handleSavedViewClick = (viewId: string) => {
    if (viewId === "__all") {
      reset();
      return;
    }
    const view = savedViews.find((v) => v.id === viewId);
    if (view) {
      loadSavedView(viewId, view.config as EntityListQueryState);
      setRowSelection({});
    }
  };

  const activeFilters = state.filters ?? {};
  const hasActiveFilters = Object.values(activeFilters).some((v) => v.length > 0);

  return (
    <PageFrame
      title={entity.entity_name}
      actions={
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder={`Search ${entity.entity_name}…`}
            value={state.search ?? ""}
            onSearch={setSearch}
            loading={dataLoading && !!state.search}
            className="w-48 sm:w-64"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Escape") setSearch("");
            }}
          />
          {/* Filter toggle button — badge when filters active */}
          <Button
            variant={filterPanelOpen || hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            className="relative h-8 gap-1.5 text-xs"
            onClick={() => setFilterPanelOpen((o) => !o)}
          >
            <Tag className="h-3.5 w-3.5" />
            Filter
            {hasActiveFilters && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {Object.keys(activeFilters).length}
              </span>
            )}
          </Button>
          {/* Column picker — list and excel modes */}
          {(viewMode === "list" || viewMode === "excel") && (
            <ColumnPickerButton
              allColumns={allDescriptorColumns.map((f) => ({ name: f.name, label: f.label ?? f.name }))}
              visibleColumns={visibleColumnNames}
              onChangeColumns={setColumns}
            />
          )}
          {/* Density picker — list mode only */}
          {viewMode === "list" && (
            <div className="flex rounded-md border overflow-hidden" title="Row density">
              {(["compact", "comfortable", "spacious"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(state.density === d ? undefined : d)}
                  title={d.charAt(0).toUpperCase() + d.slice(1)}
                  className={cn(
                    "flex items-center px-2 py-1.5 text-xs transition-colors",
                    (state.density ?? "comfortable") === d
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <AlignJustify className={cn(
                    "h-3.5 w-3.5",
                    d === "compact"   && "scale-y-75",
                    d === "spacious"  && "scale-y-125",
                  )} />
                </button>
              ))}
            </div>
          )}
          {/* Group-by picker — board mode only; restricted to enum/low-cardinality fields */}
          {viewMode === "board" && entity && (() => {
            const groupableFields = entity.fields.filter(
              (f) => f.is_groupable && (f.data_type === "enum" || !!f.enum_domain_code),
            );
            if (groupableFields.length < 2) return null;
            return (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Group</span>
                <select
                  value={state.group ?? ""}
                  onChange={(e) => setGroup(e.target.value || undefined)}
                  className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {groupableFields.map((f) => (
                    <option key={f.name} value={f.name}>{f.label ?? f.name}</option>
                  ))}
                </select>
              </div>
            );
          })()}
          <ViewModeSwitcher
            mode={viewMode}
            onChange={setViewMode}
            hasGroupable={hasGroupable}
          />
          {(hasActiveQuery || isModified) && (
            <SaveViewBar
              entityCode={entityCode}
              state={state}
              isModified={isModified}
              baseSavedViewId={state.baseSavedViewId}
              baseName={baseSavedView?.name}
            />
          )}
          {operations ? (
            <ActionBar operations={operations} surface="LIST" entityCode={entityCode} />
          ) : null}
        </div>
      }
    >
      {/* Main layout: optional filter panel sidebar + content */}
      <div className={cn("flex gap-4", filterPanelOpen ? "items-start" : "")}>

        {/* Filter panel — left sidebar */}
        {filterPanelOpen && (
          <div className="w-56 shrink-0 rounded-lg border bg-card p-3 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Filters
              </span>
              <button
                onClick={() => setFilterPanelOpen(false)}
                className="rounded p-0.5 hover:bg-muted transition-colors"
              >
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            {dataLoading && Object.keys(facetData).length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ) : (
              <FacetFilterPanel
                facets={facetData}
                filters={activeFilters}
                fieldLabels={fieldLabelMap}
                onToggleValue={handleToggleFacetValue}
              />
            )}
          </div>
        )}

        {/* Content area */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Saved views tabs */}
          {savedViews.length > 0 && (
            <div className="flex gap-1 border-b pb-0">
              <button
                onClick={() => handleSavedViewClick("__all")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                  activeSavedViewId === "__all"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {savedViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => handleSavedViewClick(view.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeSavedViewId === view.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {view.name}
                </button>
              ))}
            </div>
          )}

          {/* Quick status filter pills — shown when facets are loaded */}
          {statusFieldName && Object.keys(facetData).length > 0 && (
            <QuickStatusBar
              statusField={statusFieldName}
              facets={facetData}
              filters={activeFilters}
              onSetStatus={handleSetStatus}
            />
          )}

          {/* Active filter chips */}
          {hasActiveFilters && (
            <ActiveFilterChips
              filters={activeFilters}
              fieldLabels={fieldLabelMap}
              onRemoveField={handleRemoveFilterField}
              onClearAll={() => setFilters(undefined)}
            />
          )}

          {/* Modified indicator */}
          {isModified && (
            <ModifiedIndicator
              baseName={baseSavedView?.name}
              onDiscard={() => {
                if (state.baseSavedViewId) {
                  const baseView = savedViews.find((v) => v.id === state.baseSavedViewId);
                  if (baseView) {
                    loadSavedView(state.baseSavedViewId, baseView.config as EntityListQueryState);
                  } else {
                    reset();
                  }
                } else {
                  reset();
                }
                setRowSelection({});
              }}
            />
          )}

          {/* Bulk action bar + dialog (list mode only) */}
          {selectedCount > 0 && viewMode === "list" && (
            <BulkActionDialog
              entityCode={entityCode}
              selectedIds={selectedIds}
              operations={operations ?? []}
              onClear={() => setRowSelection({})}
            />
          )}

          {/* ── Views ── */}
          {viewMode === "list" && (
            <DataTable
              columns={columns}
              data={allRows}
              loading={dataLoading}
              tableContainerClassName="overflow-auto min-h-[50dvh] max-h-[calc(100dvh-10rem)]"
              selectable
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              pageSize={state.pageSize ?? presentationConfig?.defaultPageSize ?? 25}
              onRowClick={handleRowClick}
              sortingState={tableSortingState}
              onSortingChange={handleSortChange}
              density={state.density ?? "comfortable"}
              aggregations={aggregations}
              pinnedColumns={pinnedColumns.length > 0 ? pinnedColumns : undefined}
              totalCount={serverTotal}
              currentPage={serverPage}
              totalPages={serverTotalPgs}
              onPageChange={setPage}
              rowActions={operations && operations.length > 0
                ? (row) => (
                    <RowActionMenu
                      row={row as Record<string, unknown>}
                      entityCode={entityCode}
                      operations={operations}
                    />
                  )
                : undefined}
            />
          )}

          {viewMode === "board" && (
            <KanbanView
              rows={allRows}
              entity={entity}
              titleKey={titleKey}
              entityCode={entityCode}
              onRowClick={handleRowClick}
              groupFieldOverride={state.group ?? undefined}
            />
          )}

          {viewMode === "compact" && (
            <CompactView
              rows={allRows}
              titleKey={titleKey}
              entityCode={entityCode}
              onRowClick={handleRowClick}
              statusResolverName={statusResolverName}
              compactColumns={compactColumns}
            />
          )}

          {viewMode === "dashboard" && (
            <DashboardView
              rows={allRows}
              entity={entity}
            />
          )}

          {viewMode === "excel" && (
            <ExcelView
              rows={allRows}
              entity={entity}
              visibleColumns={visibleColumnNames.length > 0 ? visibleColumnNames : undefined}
              presentationConfig={presentationConfig ?? undefined}
              onRowClick={handleRowClick}
              aggregations={aggregations}
              loading={dataLoading}
            />
          )}
        </div>
      </div>
    </PageFrame>
  );
}
