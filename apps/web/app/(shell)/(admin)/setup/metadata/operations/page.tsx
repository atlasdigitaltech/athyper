"use client";

/**
 * Entity Operations Admin — /setup/metadata/operations
 *
 * Register action-bar operations on entity types. Each operation
 * maps a permission_code to a placement surface (toolbar / overflow / etc.)
 * and a handler type (API call / navigation / modal / inline edit).
 *
 * API surface (via relay → runtime):
 *   GET  /api/relay/metadata/admin/entity-operations   — list
 *   POST /api/relay/metadata/admin/entity-operations   — create
 *   PATCH /api/relay/metadata/admin/entity-operations/:id
 *   DELETE /api/relay/metadata/admin/entity-operations/:id
 *   GET  /api/relay/metadata/admin/entities            — catalogue picker
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Trash2, Pencil, ToggleLeft, ToggleRight,
  MousePointerClick,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Switch,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  StatusPill, EmptyState, SearchInput, ConfirmDialog, CodeBadge,
  relayFetch, fmtDate,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityOperation {
  id: string;
  entity_name: string;
  permission_code: string;
  permission_label: string | null;
  permission_description: string | null;
  surface: string;
  placement: string;
  handler_type: string;
  handler_target: string | null;
  is_record_required: boolean;
  sort_order: number;
  label_override: string | null;
  icon_override: string | null;
  tcode_alias: string | null;
  is_enabled: boolean;
  created_at: string;
}

interface EntityCat { name: string; label_singular: string | null; entity_class: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const SURFACES   = ["BOTH", "LIST", "DETAIL", "PALETTE_ONLY", "HIDDEN"];
const PLACEMENTS = ["TOOLBAR", "PRIMARY", "OVERFLOW", "CONTEXT", "COMMAND"];
const HANDLERS   = ["API", "NAVIGATE", "MODAL", "INLINE"];

const SURFACE_LABEL: Record<string, string> = {
  BOTH: "List + Detail", LIST: "List only", DETAIL: "Detail only",
  PALETTE_ONLY: "Palette only", HIDDEN: "Hidden",
};

const HANDLER_COLORS: Record<string, string> = {
  API:      "bg-primary/10 text-primary border-primary/30",
  NAVIGATE: "bg-accent/10 text-accent-foreground border-accent/30",
  MODAL:    "bg-warning/10 text-warning border-warning/30",
  INLINE:   "bg-success/10 text-success border-success/30",
};

// ─── Operation Form Dialog ────────────────────────────────────────────────────

function OperationDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: EntityOperation;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [entityName, setEntity]     = useState(edit?.entity_name ?? "");
  const [permCode, setPerm]         = useState(edit?.permission_code ?? "");
  const [surface, setSurface]       = useState(edit?.surface ?? "BOTH");
  const [placement, setPlacement]   = useState(edit?.placement ?? "TOOLBAR");
  const [handlerType, setHandler]   = useState(edit?.handler_type ?? "API");
  const [handlerTarget, setTarget]  = useState(edit?.handler_target ?? "");
  const [isRecordReq, setRecordReq] = useState(edit?.is_record_required ?? false);
  const [sortOrder, setSort]        = useState(String(edit?.sort_order ?? 0));
  const [labelOverride, setLabel]   = useState(edit?.label_override ?? "");
  const [iconOverride, setIcon]     = useState(edit?.icon_override ?? "");

  const { data: entData } = useQuery<{ items: EntityCat[] }>({
    queryKey: ["meta-admin-entities"],
    queryFn: () => relayFetch("/metadata/admin/entities"),
    staleTime: 60_000,
  });
  const entities = entData?.items ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        entity_name: entityName,
        permission_code: permCode,
        surface, placement,
        handler_type: handlerType,
        handler_target: handlerTarget || null,
        is_record_required: isRecordReq,
        sort_order: Number(sortOrder),
        label_override: labelOverride || null,
        icon_override: iconOverride || null,
      };
      if (isEdit) {
        return relayFetch(`/metadata/admin/entity-operations/${edit!.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      return relayFetch(`/metadata/admin/entity-operations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-entity-operations"] });
      toast({ title: isEdit ? "Operation updated" : "Operation created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            {isEdit ? "Edit entity operation" : "New entity operation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Entity</Label>
              <Select value={entityName} onValueChange={setEntity} disabled={isEdit}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select entity…" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {entities.map((e) => (
                    <SelectItem key={e.name} value={e.name} className="text-sm">
                      {e.label_singular ?? e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Permission code</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="e.g. entity.approve"
                value={permCode}
                disabled={isEdit}
                onChange={(e) => setPerm(e.target.value.toLowerCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Surface</Label>
              <Select value={surface} onValueChange={setSurface}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURFACES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{SURFACE_LABEL[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Placement</Label>
              <Select value={placement} onValueChange={setPlacement}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs capitalize">{p.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Handler type</Label>
              <Select value={handlerType} onValueChange={setHandler}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HANDLERS.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs capitalize">{h.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Handler target</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="e.g. /api/entity/approve"
                value={handlerTarget}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label override</Label>
              <Input className="h-8 text-xs" placeholder="Display label (optional)"
                value={labelOverride} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Icon override</Label>
              <Input className="h-8 text-xs font-mono" placeholder="Icon key (optional)"
                value={iconOverride} onChange={(e) => setIcon(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number" min={0} className="h-8 w-20 text-xs"
                value={sortOrder}
                onChange={(e) => setSort(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={isRecordReq} onCheckedChange={setRecordReq} />
              <Label className="text-xs">Requires selected record</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!entityName || !permCode || save.isPending}
          >
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create operation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Operation Row ────────────────────────────────────────────────────────────

function OperationRow({
  op, onRefresh,
}: {
  op: EntityOperation; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen, setEdit]     = useState(false);
  const [deleteOpen, setDelete] = useState(false);

  const del = useMutation({
    mutationFn: () => relayFetch(`/metadata/admin/entity-operations/${op.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-entity-operations"] });
      toast({ title: "Operation removed" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: () => relayFetch(`/metadata/admin/entity-operations/${op.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !op.is_enabled }),
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meta-entity-operations"] }),
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-muted/30 rounded group">
        {/* Sort order */}
        <span className="text-xs text-muted-foreground font-mono w-6 shrink-0 text-right">
          {op.sort_order}
        </span>

        {/* Permission */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CodeBadge>{op.permission_code}</CodeBadge>
            {op.label_override && (
              <span className="text-sm font-medium">{op.label_override}</span>
            )}
            {op.permission_label && !op.label_override && (
              <span className="text-sm text-muted-foreground">{op.permission_label}</span>
            )}
          </div>
          {op.permission_description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">{op.permission_description}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-doc-support font-medium ${HANDLER_COLORS[op.handler_type] ?? ""}`}>
            {op.handler_type}
          </span>
          <Badge variant="outline" className="text-doc-support">{op.surface}</Badge>
          <Badge variant="outline" className="text-doc-support">{op.placement}</Badge>
          {op.is_record_required && (
            <Badge variant="secondary" className="text-doc-support">record req.</Badge>
          )}
          {!op.is_enabled && <StatusPill value="disabled" />}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost" size="icon" className="size-7"
            onClick={() => toggleEnabled.mutate()}
            title={op.is_enabled ? "Disable" : "Enable"}
          >
            {op.is_enabled
              ? <ToggleRight className="size-4 text-success" />
              : <ToggleLeft className="size-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setDelete(true)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <OperationDialog open={editOpen} onClose={() => setEdit(false)} onSaved={onRefresh} edit={op} />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDelete}
        title="Remove entity operation?"
        description={`Remove '${op.permission_code}' from '${op.entity_name}'?`}
        confirmLabel="Remove"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntityOperationsPage() {
  const [search, setSearch]     = useState("");
  const [createOpen, setCreate] = useState(false);
  const [filterEntity, setFE]   = useState("");

  const { data, isLoading, refetch } = useQuery<{ items: EntityOperation[] }>({
    queryKey: ["meta-entity-operations"],
    queryFn: () => relayFetch("/metadata/admin/entity-operations"),
    staleTime: 30_000,
  });

  const { data: entData } = useQuery<{ items: EntityCat[] }>({
    queryKey: ["meta-admin-entities"],
    queryFn: () => relayFetch("/metadata/admin/entities"),
    staleTime: 60_000,
  });

  interface EntityCat { name: string; label_singular: string | null; entity_class: string; }
  const entityNames = [...new Set((entData?.items ?? []).map((e) => e.name))];

  const ops = (data?.items ?? []).filter((op) => {
    const matchSearch =
      !search ||
      op.entity_name.includes(search.toLowerCase()) ||
      op.permission_code.includes(search.toLowerCase()) ||
      (op.permission_label ?? "").toLowerCase().includes(search.toLowerCase());
    const matchEntity = !filterEntity || op.entity_name === filterEntity;
    return matchSearch && matchEntity;
  });

  const grouped = ops.reduce<Record<string, EntityOperation[]>>((acc, op) => {
    (acc[op.entity_name] ??= []).push(op);
    return acc;
  }, {});

  return (
    <PageFrame
      title="Entity Operations"
      description="Register action-bar operations on entity types. Controls which actions appear on list and detail pages."
      actions={
        <Button className="gap-1.5" size="sm" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New operation
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search permission or entity…"
            className="flex-1 min-w-48 max-w-sm"
          />
          <Select value={filterEntity || "__all__"} onValueChange={(v) => setFE(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              <SelectItem value="__all__" className="text-xs">All entities</SelectItem>
              {entityNames.map((n) => (
                <SelectItem key={n} value={n} className="text-xs font-mono">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : ops.length === 0 ? (
          <EmptyState
            icon={<MousePointerClick />}
            title="No entity operations"
            description="Register operations to add action buttons to entity list and detail pages."
            action={
              <Button size="sm" className="gap-1" onClick={() => setCreate(true)}>
                <Plus className="size-3" /> New operation
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([entityName, items]) => (
                <div key={entityName}>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="size-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {entityName}
                    </h3>
                    <Badge variant="secondary" className="text-doc-support px-1.5">{items.length}</Badge>
                  </div>
                  <div className="rounded-lg border bg-card divide-y divide-border/50">
                    {items
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((op) => (
                        <OperationRow key={op.id} op={op} onRefresh={() => void refetch()} />
                      ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{ops.length} operation{ops.length !== 1 ? "s" : ""}</p>
      </div>

      <OperationDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        onSaved={() => void refetch()}
      />
    </PageFrame>
  );
}
