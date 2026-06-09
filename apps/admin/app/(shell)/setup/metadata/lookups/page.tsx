"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageFrame, StatePanel } from "@athyper/surface-kit";
import { DataTable, Badge, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Switch } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/ui";

interface DomainRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source_schema: string;
  is_extensible: boolean;
  status: string;
  value_count: number;
}

const columns: ColumnDef<DomainRow>[] = [
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
    cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span>,
  },
  {
    id: "source_schema",
    header: "Schema",
    cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.source_schema}</Badge>,
  },
  {
    id: "is_extensible",
    header: "Extensible",
    cell: ({ row }) => (
      <Badge variant={row.original.is_extensible ? "default" : "secondary"} className="text-xs">
        {row.original.is_extensible ? "yes" : "no"}
      </Badge>
    ),
  },
  {
    id: "value_count",
    header: "Values",
    cell: ({ row }) => <span className="tabular-nums text-sm text-muted-foreground">{row.original.value_count}</span>,
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
];

export default function LookupDomainsPage() {
  const router = useRouter();
  const [items, setItems] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/relay/metadata/admin/lookup-domains");
      if (res.ok) setItems(((await res.json()) as { items: DomainRow[] }).items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = q.trim()
    ? items.filter((d) =>
        d.code.toLowerCase().includes(q.toLowerCase()) ||
        d.name.toLowerCase().includes(q.toLowerCase()),
      )
    : items;

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Lookup domains"
      description={`${filtered.length} platform domains`}
      actions={<Button size="sm" className="h-8 text-sm" onClick={() => setShowCreate(true)}>New domain</Button>}
    >
      <div className="pb-2">
        <Input
          className="h-8 w-56 text-sm"
          placeholder="Search code or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <StatePanel title="Loading…" message="Fetching lookup domains." />
      ) : filtered.length === 0 ? (
        <StatePanel title="No domains" message="No lookup domains match the search." />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(row) => router.push(`/setup/metadata/lookups/${row.code}`)}
        />
      )}

      {showCreate && (
        <CreateDomainDialog
          onCreated={(d) => { setItems((prev) => [...prev, d].sort((a, b) => a.code.localeCompare(b.code))); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </PageFrame>
  );
}

function CreateDomainDialog({
  onCreated,
  onClose,
}: {
  onCreated: (d: DomainRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ code: "", name: "", description: "", is_extensible: true });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) { setErr("Code and name are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch("/api/relay/metadata/admin/lookup-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          is_extensible: form.is_extensible,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? `${res.status}`);
      const data = await res.json() as DomainRow;
      onCreated({ ...data, value_count: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New lookup domain</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Code <span className="text-muted-foreground">(slug, immutable)</span></Label>
            <Input className="h-8 font-mono text-sm" placeholder="e.g. invoice.payment_terms" value={form.code} onChange={(e) => setForm((d) => ({ ...d, code: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-sm" placeholder="Human-readable label" value={form.name} onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input className="h-8 text-sm" placeholder="Optional" value={form.description} onChange={(e) => setForm((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ext" checked={form.is_extensible} onCheckedChange={(v) => setForm((d) => ({ ...d, is_extensible: v }))} />
            <Label htmlFor="ext" className="text-sm">Allow tenant extensions</Label>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
