"use client";

import { useState, useEffect, useCallback } from "react";
import { PageFrame, StatePanel } from "@athyper/surface-kit";
import { DataTable, Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/ui";
import type { LifecycleBinding, LifecycleCatalogueItem } from "../[entityId]/_components/types";

interface EntityCatalogueItem {
  id: string;
  name: string;
  label_singular: string | null;
  entity_class: string;
  module_id: string;
}

export default function LifecycleBindingsPage() {
  const [bindings, setBindings] = useState<LifecycleBinding[]>([]);
  const [entities, setEntities] = useState<EntityCatalogueItem[]>([]);
  const [lifecycles, setLifecycles] = useState<LifecycleCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = entityFilter !== "all" ? `?entity=${encodeURIComponent(entityFilter)}` : "";
      const [bRes, eRes, lRes] = await Promise.all([
        fetch(`/api/relay/metadata/admin/lifecycle-bindings${params}`),
        fetch("/api/relay/metadata/admin/entities"),
        fetch("/api/relay/metadata/admin/lifecycles"),
      ]);
      if (bRes.ok) setBindings(((await bRes.json()) as { items: LifecycleBinding[] }).items);
      if (eRes.ok) setEntities(((await eRes.json()) as { items: EntityCatalogueItem[] }).items);
      if (lRes.ok) setLifecycles(((await lRes.json()) as { items: LifecycleCatalogueItem[] }).items);
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => { void load(); }, [load]);

  async function deleteBinding(id: string) {
    await csrfFetch(`/api/relay/metadata/admin/lifecycle-bindings/${id}`, { method: "DELETE" });
    setBindings((prev) => prev.filter((b) => b.id !== id));
    setDeleting(null);
  }

  const columns: ColumnDef<LifecycleBinding>[] = [
    {
      id: "entity",
      header: "Entity",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.entity_name}</span>,
    },
    {
      id: "lifecycle_code",
      header: "Lifecycle",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs">{row.original.lifecycle_code ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{row.original.lifecycle_name ?? ""}</div>
        </div>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.priority}</span>,
    },
    {
      id: "lifecycle_status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.lifecycle_status === "active" ? "default" : "outline"} className="text-xs">
          {row.original.lifecycle_status ?? "—"}
        </Badge>
      ),
    },
    {
      id: "conditions",
      header: "Conditions",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.conditions ? JSON.stringify(row.original.conditions).slice(0, 50) : "none"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setDeleting(row.original.id)}>
          Remove
        </Button>
      ),
    },
  ];

  const entityNames = [...new Set(entities.map((e) => e.name))].sort();

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Lifecycle bindings"
      description={`${bindings.length} bindings`}
      actions={<Button size="sm" className="h-8 text-sm" onClick={() => setShowCreate(true)}>Add binding</Button>}
    >
      <div className="pb-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-8 w-56 text-sm">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityNames.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <StatePanel title="Loading…" message="Fetching lifecycle bindings." />
      ) : bindings.length === 0 ? (
        <StatePanel title="No bindings" message="No lifecycle bindings found." />
      ) : (
        <DataTable columns={columns} data={bindings} />
      )}

      {showCreate && (
        <AddBindingDialog
          entities={entityNames}
          lifecycles={lifecycles}
          onCreated={(b) => { setBindings((prev) => [...prev, b]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove binding?</AlertDialogTitle>
              <AlertDialogDescription>This lifecycle binding will be deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteBinding(deleting)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageFrame>
  );
}

function AddBindingDialog({
  entities,
  lifecycles,
  onCreated,
  onClose,
}: {
  entities: string[];
  lifecycles: LifecycleCatalogueItem[];
  onCreated: (b: LifecycleBinding) => void;
  onClose: () => void;
}) {
  const [entityName, setEntityName] = useState("");
  const [lifecycleId, setLifecycleId] = useState("");
  const [priority, setPriority] = useState("100");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!entityName || !lifecycleId) { setErr("Entity and lifecycle are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch("/api/relay/metadata/admin/lifecycle-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_name: entityName, lifecycle_id: lifecycleId, priority: Number(priority) || 100 }),
      });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? `${res.status}`);
      onCreated(await res.json() as LifecycleBinding);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add lifecycle binding</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Entity</Label>
            <Select value={entityName} onValueChange={setEntityName}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select entity…" /></SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {entities.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lifecycle</Label>
            <Select value={lifecycleId} onValueChange={setLifecycleId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select lifecycle…" /></SelectTrigger>
              <SelectContent>
                {lifecycles.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Input className="h-8 text-sm" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
