"use client";

import { useState, useEffect, useCallback } from "react";
import { PageFrame, StatePanel } from "@athyper/surface-kit";
import { DataTable, Badge, Button, Input, Label, Switch, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/ui";
import { use } from "react";

interface DomainDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source_schema: string;
  is_extensible: boolean;
  status: string;
}

interface ValueRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  sort_order: number;
  status: string;
  is_system: boolean;
}

export default function DomainDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [domain, setDomain] = useState<DomainDetail | null>(null);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingDomain, setEditingDomain] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, vRes] = await Promise.all([
        fetch("/api/relay/metadata/admin/lookup-domains"),
        fetch(`/api/relay/metadata/admin/lookup-domains/${code}/values`),
      ]);
      if (dRes.ok) {
        const data = await dRes.json() as { items: DomainDetail[] };
        setDomain(data.items.find((d) => d.code === code) ?? null);
      }
      if (vRes.ok) {
        setValues(((await vRes.json()) as { items: ValueRow[] }).items);
      }
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void load(); }, [load]);

  async function deleteValue(id: string) {
    await csrfFetch(`/api/relay/metadata/admin/lookup-domains/${code}/values/${id}`, { method: "DELETE" });
    setValues((prev) => prev.filter((v) => v.id !== id));
    setDeleting(null);
  }

  const filtered = q.trim()
    ? values.filter((v) =>
        v.code.toLowerCase().includes(q.toLowerCase()) ||
        v.name.toLowerCase().includes(q.toLowerCase()),
      )
    : values;

  const valueColumns: ColumnDef<ValueRow>[] = [
    {
      id: "code",
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.description ?? "—"}</span>,
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.category ?? "—"}</span>
      ),
    },
    {
      id: "sort_order",
      header: "Order",
      cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.sort_order}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "default" : "outline"} className="text-xs">
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        domain?.is_extensible ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive"
            onClick={() => setDeleting(row.original.id)}
          >
            Delete
          </Button>
        ) : null
      ),
    },
  ];

  if (loading) return <StatePanel title="Loading…" message="Fetching domain." />;
  if (!domain) return <StatePanel title="Not found" message={`Domain '${code}' does not exist.`} />;

  return (
    <PageFrame
      eyebrow={`Meta Studio / Lookup domains / ${domain.code}`}
      title={domain.name}
      description={domain.description ?? undefined}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{domain.source_schema}</Badge>
          <Badge variant={domain.is_extensible ? "default" : "secondary"} className="text-xs">
            {domain.is_extensible ? "extensible" : "schema-locked"}
          </Badge>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditingDomain(true)}>Edit domain</Button>
        </div>
      }
    >
      {!domain.is_extensible && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This domain is schema-defined. Values can be viewed but not added or deleted via the admin UI.
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <Input
          className="h-8 w-56 text-sm"
          placeholder="Filter values…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {domain.is_extensible && (
          <Button size="sm" className="h-8 text-sm" onClick={() => setShowCreate(true)}>Add value</Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <StatePanel title="No values" message="This domain has no platform values." />
      ) : (
        <DataTable columns={valueColumns} data={filtered} />
      )}

      {showCreate && (
        <CreateValueDialog
          domainCode={code}
          onCreated={(v) => { setValues((prev) => [...prev, v].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editingDomain && (
        <EditDomainDialog
          domain={domain}
          onSaved={(d) => { setDomain(d); setEditingDomain(false); }}
          onClose={() => setEditingDomain(false)}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete value?</AlertDialogTitle>
              <AlertDialogDescription>This platform lookup value will be permanently deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteValue(deleting)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageFrame>
  );
}

function CreateValueDialog({
  domainCode,
  onCreated,
  onClose,
}: {
  domainCode: string;
  onCreated: (v: ValueRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ code: "", name: "", description: "", category: "", sort_order: "0" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) { setErr("Code and name are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/relay/metadata/admin/lookup-domains/${domainCode}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category.trim() || null,
          sort_order: Number(form.sort_order) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? `${res.status}`);
      onCreated(await res.json() as ValueRow);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add lookup value</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Code</Label>
            <Input className="h-8 font-mono text-sm" placeholder="e.g. net_30" value={form.code} onChange={(e) => setForm((d) => ({ ...d, code: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-sm" placeholder="Display label" value={form.name} onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input className="h-8 text-sm" placeholder="Optional" value={form.category} onChange={(e) => setForm((d) => ({ ...d, category: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort order</Label>
              <Input className="h-8 text-sm" type="number" value={form.sort_order} onChange={(e) => setForm((d) => ({ ...d, sort_order: e.target.value }))} />
            </div>
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

function EditDomainDialog({
  domain,
  onSaved,
  onClose,
}: {
  domain: DomainDetail;
  onSaved: (d: DomainDetail) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: domain.name, description: domain.description ?? "", is_extensible: domain.is_extensible });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/relay/metadata/admin/lookup-domains/${domain.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, is_extensible: form.is_extensible }),
      });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? `${res.status}`);
      const updated = await res.json() as DomainDetail;
      onSaved({ ...domain, ...updated });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Edit domain</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-sm" value={form.name} onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input className="h-8 text-sm" value={form.description} onChange={(e) => setForm((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ext2" checked={form.is_extensible} onCheckedChange={(v) => setForm((d) => ({ ...d, is_extensible: v }))} />
            <Label htmlFor="ext2" className="text-sm">Allow tenant extensions</Label>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
