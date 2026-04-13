"use client";

/**
 * EntityBulkPage — /app/[entity]/bulk
 *
 * Composes EntityListPage internals in always-on bulk mode.
 * Adds three fully-implemented bulk operations:
 *   Export  — download selected rows as CSV or XLSX
 *   Update  — apply a single field change to all selected rows
 *   Delete  — soft-delete all selected rows
 *
 * All three return BulkOperationResult and handle partial success: some rows
 * may fail while others succeed. The result panel shows per-row outcomes and
 * allows retrying only the failed subset.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CheckCircle2, ChevronDown,
  Download, Loader2, Trash2, X,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews } from "@athyper/query";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { DataTable, type ColumnDef, type RowSelectionState } from "@athyper/ui/data";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton, Textarea,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveFieldRenderer } from "../field-renderers/registry";
import type {
  BulkOperationResult,
  BulkExportRequest,
  BulkUpdateRequest,
  BulkDeleteRequest,
} from "./types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface EntityBulkPageProps {
  entityCode: string;
}

// ── Bulk API helpers ──────────────────────────────────────────────────────────

async function bulkExport(entityCode: string, req: BulkExportRequest): Promise<{ downloadUrl: string }> {
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }
  return res.json() as Promise<{ downloadUrl: string }>;
}

async function bulkUpdate(entityCode: string, req: BulkUpdateRequest): Promise<BulkOperationResult> {
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Bulk update failed (${res.status})`);
  }
  return res.json() as Promise<BulkOperationResult>;
}

async function bulkDelete(entityCode: string, req: BulkDeleteRequest): Promise<BulkOperationResult> {
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Bulk delete failed (${res.status})`);
  }
  return res.json() as Promise<BulkOperationResult>;
}

// ── Result panel ──────────────────────────────────────────────────────────────

function BulkResultPanel({
  result,
  onRetry,
  onDismiss,
}: {
  result:    BulkOperationResult;
  onRetry:   (failedIds: string[]) => void;
  onDismiss: () => void;
}) {
  const failedIds = result.rows.filter((r) => !r.success).map((r) => r.id);
  return (
    <div className={cn(
      "rounded-lg border px-4 py-3 space-y-2",
      result.failed > 0 ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          {result.succeeded > 0 && (
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {result.succeeded} succeeded
            </span>
          )}
          {result.failed > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              {result.failed} failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result.failed > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onRetry(failedIds)}
            >
              Retry {result.failed} failed
            </Button>
          )}
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {result.failed > 0 && (
        <div className="max-h-32 overflow-auto space-y-1">
          {result.rows
            .filter((r) => !r.success)
            .map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-amber-700">
                <span className="font-mono shrink-0">{r.id.slice(0, 12)}</span>
                <span className="text-muted-foreground">{r.error?.message ?? "Unknown error"}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Update modal ──────────────────────────────────────────────────────────────

interface UpdateField {
  name:  string;
  label: string;
}

function BulkUpdateModal({
  open,
  count,
  fields,
  onConfirm,
  onClose,
  isPending,
}: {
  open:      boolean;
  count:     number;
  fields:    UpdateField[];
  onConfirm: (field: string, value: string) => void;
  onClose:   () => void;
  isPending: boolean;
}) {
  const [field, setField] = useState(fields[0]?.name ?? "");
  const [value, setValue] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Update — {count} records</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Field to update</Label>
            <Select value={field} onValueChange={setField}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.name} value={f.name} className="text-xs">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">New value</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter new value…"
              className="h-8 text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This will update <strong>{field}</strong> on all {count} selected records.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => { if (field && value) onConfirm(field, value); }}
            disabled={!field || !value || isPending}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Apply to {count} records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete dialog ─────────────────────────────────────────────────────────────

function BulkDeleteDialog({
  open,
  count,
  entityName,
  onConfirm,
  onClose,
  isPending,
}: {
  open:       boolean;
  count:      number;
  entityName: string;
  onConfirm:  () => void;
  onClose:    () => void;
  isPending:  boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} {entityName} records?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          This will soft-delete {count} selected records. They can be restored by an administrator.
        </p>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Delete {count} records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk ops bar ──────────────────────────────────────────────────────────────

function BulkOpsBar({
  count,
  onExport,
  onUpdate,
  onDelete,
  onClear,
  isExporting,
}: {
  count:      number;
  onExport:   (format: "csv" | "xlsx") => void;
  onUpdate:   () => void;
  onDelete:   () => void;
  onClear:    () => void;
  isExporting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        {/* Export dropdown */}
        <div className="relative group">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={isExporting}>
            {isExporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
            Export
            <ChevronDown className="h-3 w-3" />
          </Button>
          <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[80px] rounded-lg border bg-popover p-1 shadow-md group-hover:block">
            <button onClick={() => onExport("csv")}  className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-muted">CSV</button>
            <button onClick={() => onExport("xlsx")} className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-muted">Excel</button>
          </div>
        </div>

        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUpdate}>
          Update
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>
        <button onClick={onClear} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntityBulkPage({ entityCode }: EntityBulkPageProps) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [activeView, setActiveView]     = useState<string>("__all");
  const [showUpdate, setShowUpdate]     = useState(false);
  const [showDelete, setShowDelete]     = useState(false);
  const [result, setResult]             = useState<BulkOperationResult | null>(null);
  const [opError, setOpError]           = useState<string | null>(null);
  const [isPending, setIsPending]       = useState(false);
  const [isExporting, setIsExporting]   = useState(false);

  const { data: entity, isLoading: metaLoading, error: metaError } = useCompiledEntity(entityCode);
  const { data: listData, isLoading: dataLoading, refetch }        = useEntityList(entityCode);
  const { data: operations }                                        = useEntityOperations(entityCode);
  const { data: savedViews = [] }                                   = useSavedViews(entityCode);

  const allRows      = (listData?.data ?? []) as Record<string, unknown>[];
  const selectedIds  = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const handleRowClick = (row: Record<string, unknown>) => {
    const id = row.id as string;
    if (id) router.push(`/app/${entityCode}/${id}`);
  };

  const handleExport = useCallback(async (format: "csv" | "xlsx") => {
    if (selectedIds.length === 0) return;
    setIsExporting(true);
    setOpError(null);
    try {
      const req: BulkExportRequest = { selectionMode: "ids", ids: selectedIds, format };
      const { downloadUrl } = await bulkExport(entityCode, req);
      window.open(downloadUrl, "_blank");
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [entityCode, selectedIds]);

  const handleUpdate = useCallback(async (field: string, value: string) => {
    if (selectedIds.length === 0) return;
    setIsPending(true);
    setOpError(null);
    try {
      const req: BulkUpdateRequest = { selectionMode: "ids", ids: selectedIds, patch: { [field]: value } };
      const res = await bulkUpdate(entityCode, req);
      setResult(res);
      setShowUpdate(false);
      if (res.succeeded > 0) {
        setRowSelection({});
        void refetch();
      }
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setIsPending(false);
    }
  }, [entityCode, selectedIds, refetch]);

  const handleDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setIsPending(true);
    setOpError(null);
    try {
      const req: BulkDeleteRequest = { selectionMode: "ids", ids: selectedIds };
      const res = await bulkDelete(entityCode, req);
      setResult(res);
      setShowDelete(false);
      if (res.succeeded > 0) {
        setRowSelection({});
        void refetch();
      }
    } catch (e) {
      setOpError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsPending(false);
    }
  }, [entityCode, selectedIds, refetch]);

  const handleRetry = useCallback((failedIds: string[]) => {
    const nextSelection: RowSelectionState = {};
    failedIds.forEach((id) => { nextSelection[id] = true; });
    setRowSelection(nextSelection);
    setResult(null);
  }, []);

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

  const listConfig = resolveListConfig(entity);

  // Updatable fields: not computed, not read-only
  const updatableFields = listConfig.columns
    .filter((f) => !f.is_computed && !f.is_read_only)
    .map((f) => ({ name: f.name, label: f.label ?? f.name }));

  const columns: ColumnDef<Record<string, unknown>>[] = listConfig.columns.map((field) => ({
    accessorKey: field.name,
    header:      field.label ?? field.name,
    enableSorting: field.is_sortable,
    cell: ({ getValue }) => {
      const Renderer = resolveFieldRenderer(field);
      return <Renderer value={getValue()} field={field} mode="view" />;
    },
  }));

  return (
    <PageFrame
      title={`${entity.entity_name} — Bulk Operations`}
      description={`${allRows.length} records · ${selectedIds.length} selected`}
    >
      <div className="space-y-3">
        {/* Saved view tabs */}
        {savedViews.length > 0 && (
          <div className="flex gap-1 border-b pb-0">
            <button
              onClick={() => setActiveView("__all")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                activeView === "__all"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            {savedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                  activeView === view.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {view.name}
              </button>
            ))}
          </div>
        )}

        {/* Bulk ops bar — always shown */}
        {selectedIds.length > 0 && (
          <BulkOpsBar
            count={selectedIds.length}
            onExport={handleExport}
            onUpdate={() => { setShowUpdate(true); setResult(null); }}
            onDelete={() => { setShowDelete(true); setResult(null); }}
            onClear={() => setRowSelection({})}
            isExporting={isExporting}
          />
        )}

        {/* Result panel */}
        {result && (
          <BulkResultPanel
            result={result}
            onRetry={handleRetry}
            onDismiss={() => setResult(null)}
          />
        )}

        {/* Error */}
        {opError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {opError}
            <button onClick={() => setOpError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Data table */}
        <DataTable
          columns={columns}
          data={allRows}
          loading={dataLoading}
          selectable
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          pageSize={50}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Modals */}
      <BulkUpdateModal
        open={showUpdate}
        count={selectedIds.length}
        fields={updatableFields}
        onConfirm={handleUpdate}
        onClose={() => setShowUpdate(false)}
        isPending={isPending}
      />
      <BulkDeleteDialog
        open={showDelete}
        count={selectedIds.length}
        entityName={entity.entity_name}
        onConfirm={() => void handleDelete()}
        onClose={() => setShowDelete(false)}
        isPending={isPending}
      />
    </PageFrame>
  );
}
