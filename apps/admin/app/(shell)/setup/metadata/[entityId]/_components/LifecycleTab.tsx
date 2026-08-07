"use client";

import { useEffect, useState } from "react";
import { StatePanel } from "@athyper/platform-surface-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@athyper/platform-ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/platform-ui";
import type { LifecycleBinding, LifecycleCatalogueItem } from "./types";
import { formatJson, parseJsonText } from "./metadataContract";

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? `${res.status}`;
}

function BindingDialog({
  entityName,
  lifecycles,
  binding,
  onSaved,
  onClose,
}: {
  entityName: string;
  lifecycles: LifecycleCatalogueItem[];
  binding: LifecycleBinding | null;
  onSaved: (binding: LifecycleBinding) => void;
  onClose: () => void;
}) {
  const [lifecycleId, setLifecycleId] = useState(binding?.lifecycle_id ?? "");
  const [priority, setPriority] = useState(String(binding?.priority ?? 100));
  const [conditions, setConditions] = useState(formatJson(binding?.conditions));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = Boolean(binding);

  async function submit() {
    if (!isEdit && !lifecycleId) {
      setErr("Select a lifecycle.");
      return;
    }
    const parsed = parseJsonText(conditions, { objectOnly: true });
    if (!parsed.ok) {
      setErr(`conditions: ${parsed.error}`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        conditions: parsed.value,
        priority: Number(priority) || 100,
      };
      if (!isEdit) {
        body["entity_name"] = entityName;
        body["lifecycle_id"] = lifecycleId;
      }
      const res = await csrfFetch(isEdit ? `/api/relay/metadata/admin/lifecycle-bindings/${binding!.id}` : "/api/relay/metadata/admin/lifecycle-bindings", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      onSaved(await res.json() as LifecycleBinding);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{isEdit ? "Edit lifecycle binding" : "Add lifecycle binding"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Lifecycle</Label>
              <Select disabled={isEdit} value={lifecycleId} onValueChange={setLifecycleId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select lifecycle" /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {lifecycles.map((lifecycle) => (
                    <SelectItem key={lifecycle.id} value={lifecycle.id}>{lifecycle.name} ({lifecycle.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Input className="h-8 text-sm" type="number" value={priority} onChange={(event) => setPriority(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conditions</Label>
            <Textarea className="min-h-40 font-mono text-xs" value={conditions} onChange={(event) => setConditions(event.target.value)} />
            <p className="text-xs text-muted-foreground">JSON object evaluated by the lifecycle binding resolver. Leave empty for an unconditional binding.</p>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LifecycleTab({ entityName }: { entityName: string }) {
  const [bindings, setBindings] = useState<LifecycleBinding[]>([]);
  const [lifecycles, setLifecycles] = useState<LifecycleCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LifecycleBinding | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [bindingsRes, lifecyclesRes] = await Promise.all([
        fetch(`/api/relay/metadata/admin/lifecycle-bindings?entity=${encodeURIComponent(entityName)}`),
        fetch("/api/relay/metadata/admin/lifecycles"),
      ]);
      if (!bindingsRes.ok) throw new Error(await readError(bindingsRes));
      if (!lifecyclesRes.ok) throw new Error(await readError(lifecyclesRes));
      setBindings(((await bindingsRes.json()) as { items: LifecycleBinding[] }).items);
      setLifecycles(((await lifecyclesRes.json()) as { items: LifecycleCatalogueItem[] }).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifecycle bindings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [entityName]);

  async function deleteBinding(id: string) {
    setError(null);
    const res = await csrfFetch(`/api/relay/metadata/admin/lifecycle-bindings/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setBindings((current) => current.filter((binding) => binding.id !== id));
    setDeleting(null);
  }

  function upsert(binding: LifecycleBinding) {
    setBindings((current) => current.some((item) => item.id === binding.id)
      ? current.map((item) => item.id === binding.id ? binding : item)
      : [...current, binding]);
    setCreating(false);
    setEditing(null);
  }

  const columns: ColumnDef<LifecycleBinding>[] = [
    {
      id: "lifecycle",
      header: "Lifecycle",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs">{row.original.lifecycle_code ?? "-"}</div>
          <div className="text-xs text-muted-foreground">{row.original.lifecycle_name ?? ""}</div>
        </div>
      ),
    },
    {
      id: "priority",
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.priority}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.lifecycle_status === "active" ? "default" : "outline"} className="text-xs">
          {row.original.lifecycle_status ?? "-"}
        </Badge>
      ),
    },
    {
      id: "conditions",
      header: "Conditions",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.conditions ? JSON.stringify(row.original.conditions).slice(0, 80) : "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(row.original)}>Edit</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setDeleting(row.original.id)}>Remove</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{bindings.length} lifecycle bindings</span>
        <Button size="sm" className="h-8 text-sm" onClick={() => setCreating(true)}>Add binding</Button>
      </div>

      {loading ? (
        <StatePanel title="Loading..." message="Fetching lifecycle bindings." />
      ) : error ? (
        <StatePanel title="Error" message={error} />
      ) : bindings.length === 0 ? (
        <StatePanel title="No bindings" message="No lifecycle bindings are defined for this entity." />
      ) : (
        <DataTable columns={columns} data={bindings} />
      )}

      {(creating || editing) && (
        <BindingDialog
          entityName={entityName}
          lifecycles={lifecycles}
          binding={editing}
          onSaved={upsert}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove binding?</AlertDialogTitle>
              <AlertDialogDescription>The lifecycle binding will be deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteBinding(deleting)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
