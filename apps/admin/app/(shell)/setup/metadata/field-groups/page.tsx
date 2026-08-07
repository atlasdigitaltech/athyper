"use client";

import { useState, useEffect, useCallback } from "react";
import { PageFrame, StatePanel } from "@athyper/platform-surface-kit";
import { DataTable, Badge, Button, Input, Label, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@athyper/platform-ui";
import { csrfFetch } from "@/lib/bff-fetch";
import type { ColumnDef } from "@athyper/platform-ui";

interface FieldGroupRow {
  group_key: string;
  label: string;
  description: string | null;
  applies_to_classes: string[];
  sort_order: number;
  member_count: number;
}

const ENTITY_CLASSES = ["MASTER", "DOCUMENT", "CONTROL", "REFERENCE", "LOG", "ANALYTICS"];

export default function FieldGroupsPage() {
  const [groups, setGroups] = useState<FieldGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/relay/metadata/admin/field-groups");
      if (res.ok) setGroups(((await res.json()) as { items: FieldGroupRow[] }).items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function deleteGroup(key: string) {
    setDeleteError(null);
    const res = await csrfFetch(`/api/relay/metadata/admin/field-groups/${key}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json() as { message?: string };
      setDeleteError(data.message ?? "Cannot delete — group has members.");
      setDeleting(null);
      return;
    }
    setGroups((prev) => prev.filter((g) => g.group_key !== key));
    setDeleting(null);
  }

  const columns: ColumnDef<FieldGroupRow>[] = [
    {
      id: "group_key",
      accessorKey: "group_key",
      header: "Key",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.group_key}</span>,
    },
    {
      id: "label",
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => <span className="font-medium text-sm">{row.original.label}</span>,
    },
    {
      id: "applies_to_classes",
      header: "Applies to",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.applies_to_classes.length === 0
            ? <span className="text-xs text-muted-foreground">All</span>
            : row.original.applies_to_classes.map((c) => (
              <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
            ))}
        </div>
      ),
    },
    {
      id: "member_count",
      header: "Members",
      cell: ({ row }) => <span className="tabular-nums text-sm text-muted-foreground">{row.original.member_count}</span>,
    },
    {
      id: "sort_order",
      header: "Order",
      cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.sort_order}</span>,
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.description ?? "—"}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive"
          disabled={row.original.member_count > 0}
          title={row.original.member_count > 0 ? "Remove all field assignments first" : undefined}
          onClick={() => setDeleting(row.original.group_key)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Field groups"
      description={`${groups.length} groups`}
      actions={<Button size="sm" className="h-8 text-sm" onClick={() => setShowCreate(true)}>New group</Button>}
    >
      {deleteError && (
        <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {deleteError}
        </div>
      )}

      {loading ? (
        <StatePanel title="Loading…" message="Fetching field groups." />
      ) : groups.length === 0 ? (
        <StatePanel title="No field groups" message="Create a group to organize entity fields." />
      ) : (
        <DataTable columns={columns} data={groups} />
      )}

      {showCreate && (
        <CreateGroupDialog
          onCreated={(g) => { setGroups((prev) => [...prev, g].sort((a, b) => a.sort_order - b.sort_order || a.group_key.localeCompare(b.group_key))); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete group &ldquo;{deleting}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>This field group will be permanently deleted. Fields using this group_key will lose their grouping assignment.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteGroup(deleting)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageFrame>
  );
}

function CreateGroupDialog({
  onCreated,
  onClose,
}: {
  onCreated: (g: FieldGroupRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    group_key: "", label: "", description: "",
    applies_to_classes: [] as string[], sort_order: "0",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleClass(cls: string) {
    setForm((d) => ({
      ...d,
      applies_to_classes: d.applies_to_classes.includes(cls)
        ? d.applies_to_classes.filter((c) => c !== cls)
        : [...d.applies_to_classes, cls],
    }));
  }

  async function submit() {
    if (!form.group_key.trim() || !form.label.trim()) { setErr("Key and label are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await csrfFetch("/api/relay/metadata/admin/field-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_key: form.group_key.trim(),
          label: form.label.trim(),
          description: form.description.trim() || null,
          applies_to_classes: form.applies_to_classes,
          sort_order: Number(form.sort_order) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? `${res.status}`);
      const data = await res.json() as FieldGroupRow;
      onCreated({ ...data, member_count: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New field group</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Key <span className="text-muted-foreground">(slug, immutable)</span></Label>
            <Input className="h-8 font-mono text-sm" placeholder="e.g. financials" value={form.group_key} onChange={(e) => setForm((d) => ({ ...d, group_key: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input className="h-8 text-sm" placeholder="Display name" value={form.label} onChange={(e) => setForm((d) => ({ ...d, label: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input className="h-8 text-sm" placeholder="Optional" value={form.description} onChange={(e) => setForm((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort order</Label>
            <Input className="h-8 text-sm" type="number" value={form.sort_order} onChange={(e) => setForm((d) => ({ ...d, sort_order: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Applies to classes <span className="text-muted-foreground">(empty = all)</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {ENTITY_CLASSES.map((cls) => (
                <div key={cls} className="flex items-center gap-2">
                  <Checkbox
                    id={`cls-${cls}`}
                    checked={form.applies_to_classes.includes(cls)}
                    onCheckedChange={() => toggleClass(cls)}
                  />
                  <Label htmlFor={`cls-${cls}`} className="text-xs font-normal">{cls}</Label>
                </div>
              ))}
            </div>
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
