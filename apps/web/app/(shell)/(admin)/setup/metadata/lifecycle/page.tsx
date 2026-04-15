"use client";

/**
 * Lifecycle Bindings Admin — /setup/metadata/lifecycle
 *
 * Manage which lifecycle state machines apply to which entity types.
 * Multiple lifecycles can be bound to the same entity; priority determines
 * evaluation order. Conditions (JSONLogic) allow conditional application.
 *
 * API surface (via relay → runtime):
 *   GET  /api/relay/metadata/admin/lifecycle-bindings   — list bindings
 *   POST /api/relay/metadata/admin/lifecycle-bindings   — create binding
 *   PATCH /api/relay/metadata/admin/lifecycle-bindings/:id
 *   DELETE /api/relay/metadata/admin/lifecycle-bindings/:id
 *   GET  /api/relay/metadata/admin/lifecycles           — catalogue (picker)
 *   GET  /api/relay/metadata/admin/entities             — catalogue (picker)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitMerge, Plus, Trash2, Pencil, ArrowUpDown,
  Workflow, Link2,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  StatusPill, EmptyState, SearchInput, ConfirmDialog, CodeBadge,
  relayFetch, fmtDate,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LifecycleBinding {
  id: string;
  entity_name: string;
  lifecycle_id: string;
  lifecycle_code: string | null;
  lifecycle_name: string | null;
  lifecycle_status: string | null;
  conditions: unknown;
  priority: number;
  created_at: string;
  updated_at: string | null;
}

interface LifecycleCat { id: string; code: string; name: string; status: string; }
interface EntityCat   { name: string; label_singular: string | null; entity_class: string; module_id: string; }

// ─── Binding Form Dialog ──────────────────────────────────────────────────────

function BindingDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: LifecycleBinding;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [entityName, setEntity]   = useState(edit?.entity_name ?? "");
  const [lifecycleId, setLcId]    = useState(edit?.lifecycle_id ?? "");
  const [priority, setPriority]   = useState(String(edit?.priority ?? 100));
  const [conditions, setConds]    = useState(
    edit?.conditions ? JSON.stringify(edit.conditions, null, 2) : ""
  );

  const { data: lcData } = useQuery<{ items: LifecycleCat[] }>({
    queryKey: ["meta-admin-lifecycles"],
    queryFn: () => relayFetch("/metadata/admin/lifecycles"),
    staleTime: 60_000,
  });

  const { data: entData } = useQuery<{ items: EntityCat[] }>({
    queryKey: ["meta-admin-entities"],
    queryFn: () => relayFetch("/metadata/admin/entities"),
    staleTime: 60_000,
  });

  const lifecycles = lcData?.items ?? [];
  const entities   = entData?.items ?? [];

  function parsedConditions(): unknown {
    if (!conditions.trim()) return null;
    try { return JSON.parse(conditions); } catch { return null; }
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        entity_name: entityName,
        lifecycle_id: lifecycleId,
        priority: Number(priority),
        conditions: parsedConditions(),
      };
      if (isEdit) {
        return relayFetch(`/metadata/admin/lifecycle-bindings/${edit!.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      return relayFetch(`/metadata/admin/lifecycle-bindings`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-lifecycle-bindings"] });
      toast({ title: isEdit ? "Binding updated" : "Binding created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const conditionsValid = !conditions.trim() || (() => {
    try { JSON.parse(conditions); return true; } catch { return false; }
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            {isEdit ? "Edit lifecycle binding" : "New lifecycle binding"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Entity picker */}
          <div className="space-y-1">
            <Label>Entity</Label>
            <Select value={entityName} onValueChange={setEntity} disabled={isEdit}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select entity…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {entities.map((e) => (
                  <SelectItem key={e.name} value={e.name} className="text-sm">
                    <span className="flex items-center gap-2">
                      <span>{e.label_singular ?? e.name}</span>
                      <span className="text-muted-foreground text-xs font-mono">{e.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lifecycle picker */}
          <div className="space-y-1">
            <Label>Lifecycle</Label>
            <Select value={lifecycleId} onValueChange={setLcId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select lifecycle…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {lifecycles.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-sm">
                    <span className="flex items-center gap-2">
                      <span>{l.name}</span>
                      <span className="text-muted-foreground text-xs font-mono">{l.code}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <Label>Priority</Label>
            <Input
              type="number"
              min={1}
              max={9999}
              className="h-8 w-28 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Lower number = evaluated first. Default: 100</p>
          </div>

          {/* Conditions */}
          <div className="space-y-1">
            <Label>Conditions (JSONLogic)</Label>
            <Textarea
              placeholder='Leave blank to always apply, or enter JSONLogic e.g. {"==": [{"var": "status"}, "DRAFT"]}'
              className={`h-24 resize-none font-mono text-xs ${!conditionsValid ? "border-destructive" : ""}`}
              value={conditions}
              onChange={(e) => setConds(e.target.value)}
            />
            {!conditionsValid && (
              <p className="text-xs text-destructive">Invalid JSON</p>
            )}
            <p className="text-[10px] text-muted-foreground">If blank, lifecycle always applies to this entity.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!entityName || !lifecycleId || !conditionsValid || save.isPending}
          >
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create binding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Binding Card ─────────────────────────────────────────────────────────────

function BindingCard({
  binding, onRefresh,
}: {
  binding: LifecycleBinding; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen, setEdit]     = useState(false);
  const [deleteOpen, setDelete] = useState(false);

  const del = useMutation({
    mutationFn: () => relayFetch(`/metadata/admin/lifecycle-bindings/${binding.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-lifecycle-bindings"] });
      toast({ title: "Binding removed" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const hasConditions = binding.conditions !== null && binding.conditions !== undefined;

  return (
    <>
      <div className="rounded-lg border bg-card p-4 flex items-start gap-4">
        {/* Priority badge */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-mono font-semibold text-muted-foreground">{binding.priority}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Entity */}
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Workflow className="size-3.5 text-muted-foreground" />
              <CodeBadge>{binding.entity_name}</CodeBadge>
            </span>
            <span className="text-muted-foreground text-xs">→</span>
            {/* Lifecycle */}
            <span className="flex items-center gap-1.5 text-sm">
              <GitMerge className="size-3.5 text-primary" />
              <span className="font-medium">{binding.lifecycle_name ?? binding.lifecycle_id}</span>
              {binding.lifecycle_code && (
                <CodeBadge>{binding.lifecycle_code}</CodeBadge>
              )}
              {binding.lifecycle_status && (
                <StatusPill value={binding.lifecycle_status as "active" | "deprecated"} />
              )}
            </span>
          </div>

          {hasConditions && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">conditional</Badge>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                {JSON.stringify(binding.conditions).slice(0, 60)}
                {JSON.stringify(binding.conditions).length > 60 ? "…" : ""}
              </span>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Created {fmtDate(binding.created_at)}
            {binding.updated_at && ` · Updated ${fmtDate(binding.updated_at)}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setDelete(true)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <BindingDialog open={editOpen} onClose={() => setEdit(false)} onSaved={onRefresh} edit={binding} />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDelete}
        title="Remove lifecycle binding?"
        description={`This will detach the '${binding.lifecycle_name ?? binding.lifecycle_id}' lifecycle from '${binding.entity_name}'. Existing entity instances are not affected.`}
        confirmLabel="Remove binding"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LifecycleAdminPage() {
  const [search, setSearch]     = useState("");
  const [createOpen, setCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ items: LifecycleBinding[] }>({
    queryKey: ["meta-lifecycle-bindings"],
    queryFn: () => relayFetch("/metadata/admin/lifecycle-bindings"),
    staleTime: 30_000,
  });

  const bindings = (data?.items ?? []).filter((b) =>
    !search ||
    b.entity_name.includes(search.toLowerCase()) ||
    (b.lifecycle_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (b.lifecycle_code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Group by entity_name
  const grouped = bindings.reduce<Record<string, LifecycleBinding[]>>((acc, b) => {
    (acc[b.entity_name] ??= []).push(b);
    return acc;
  }, {});

  return (
    <PageFrame
      title="Lifecycle Bindings"
      description="Bind state-machine lifecycles to entity types. Multiple lifecycles per entity are resolved by priority."
      actions={
        <Button className="gap-1.5" size="sm" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New binding
        </Button>
      }
    >
      <div className="space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search entity or lifecycle…"
          className="max-w-sm"
        />

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : bindings.length === 0 ? (
          <EmptyState
            icon={GitMerge}
            title="No lifecycle bindings"
            description="Bind a lifecycle state machine to an entity type to control its status transitions."
            action={
              <Button size="sm" className="gap-1" onClick={() => setCreate(true)}>
                <Plus className="size-3" /> New binding
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([entityName, items]) => (
                <div key={entityName}>
                  <div className="flex items-center gap-2 mb-2">
                    <Workflow className="size-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {entityName}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((b) => (
                      <BindingCard key={b.id} binding={b} onRefresh={() => void refetch()} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{bindings.length} binding{bindings.length !== 1 ? "s" : ""}</p>
      </div>

      <BindingDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        onSaved={() => void refetch()}
      />
    </PageFrame>
  );
}
