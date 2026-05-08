"use client";

/**
 * Field Group Layout Admin — /setup/metadata/field-groups
 *
 * Manage UI field groupings (control.field_group). Groups are logical
 * sections (e.g. "General", "Accounting", "Shipping") that organise
 * entity fields in detail views. Groups reference canonical fields
 * via field_group_member rows.
 *
 * API surface (via relay → runtime):
 *   GET    /api/relay/metadata/admin/field-groups       — list groups
 *   POST   /api/relay/metadata/admin/field-groups       — create group
 *   PATCH  /api/relay/metadata/admin/field-groups/:key  — update group
 *   DELETE /api/relay/metadata/admin/field-groups/:key  — delete group
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers, Plus, Trash2, Pencil, GripVertical, Tag,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  EmptyState, SearchInput, ConfirmDialog, CodeBadge,
  relayFetch, slugify,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldGroup {
  group_key: string;
  label: string;
  description: string | null;
  applies_to_classes: string[];
  sort_order: number;
  member_count: number;
}

// ─── Entity class chip options ─────────────────────────────────────────────────

const ENTITY_CLASSES = ["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "JOURNAL"];

const CLASS_STYLE: Record<string, string> = {
  REFERENCE: "bg-primary/10 text-primary border-primary/30",
  MASTER:    "bg-accent/10 text-accent-foreground border-accent/30",
  DOCUMENT:  "bg-warning/10 text-warning border-warning/30",
  CONTROL:   "bg-muted text-muted-foreground border-border",
  JOURNAL:   "bg-success/10 text-success border-success/30",
};

function ClassChip({ cls, selected, onClick }: { cls: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded border px-2 py-0.5 text-doc-support font-medium transition-all ${
        selected
          ? (CLASS_STYLE[cls] ?? "bg-primary/10 text-primary border-primary/30")
          : "bg-muted/40 text-muted-foreground border-border hover:border-primary/50"
      }`}
    >
      {cls}
    </button>
  );
}

// ─── Field Group Form Dialog ──────────────────────────────────────────────────

function FieldGroupDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: FieldGroup;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [groupKey, setKey]          = useState(edit?.group_key ?? "");
  const [label, setLabel]           = useState(edit?.label ?? "");
  const [description, setDesc]      = useState(edit?.description ?? "");
  const [sortOrder, setSort]        = useState(String(edit?.sort_order ?? 0));
  const [selectedClasses, setClasses] = useState<Set<string>>(
    new Set(edit?.applies_to_classes ?? [])
  );

  function toggleClass(cls: string) {
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }

  function handleLabelChange(v: string) {
    setLabel(v);
    if (!isEdit) setKey(slugify(v));
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        group_key: groupKey,
        label,
        description: description || null,
        applies_to_classes: [...selectedClasses],
        sort_order: Number(sortOrder),
      };
      if (isEdit) {
        return relayFetch(`/metadata/admin/field-groups/${edit!.group_key}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      return relayFetch(`/metadata/admin/field-groups`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-field-groups"] });
      toast({ title: isEdit ? "Field group updated" : "Field group created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const keyValid = /^[a-z][a-z0-9_]*$/.test(groupKey);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            {isEdit ? "Edit field group" : "New field group"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                placeholder="e.g. General Information"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Group key</Label>
              <Input
                placeholder="e.g. general_info"
                className="font-mono text-sm"
                value={groupKey}
                disabled={isEdit}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              />
              {!isEdit && groupKey && !keyValid && (
                <p className="text-doc-support text-destructive">Must start with a letter, only a-z 0-9 _</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              placeholder="What fields are grouped here?"
              className="h-16 resize-none text-sm"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Applies to entity classes</Label>
            <div className="flex flex-wrap gap-1.5">
              {ENTITY_CLASSES.map((cls) => (
                <ClassChip
                  key={cls}
                  cls={cls}
                  selected={selectedClasses.has(cls)}
                  onClick={() => toggleClass(cls)}
                />
              ))}
            </div>
            <p className="text-doc-support text-muted-foreground">
              Leave empty to apply to all classes.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number" min={0} className="h-8 w-24 text-xs"
              value={sortOrder}
              onChange={(e) => setSort(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!label || !groupKey || !keyValid || save.isPending}
          >
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field Group Card ─────────────────────────────────────────────────────────

function FieldGroupCard({
  group, onRefresh,
}: {
  group: FieldGroup; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen, setEdit]     = useState(false);
  const [deleteOpen, setDelete] = useState(false);

  const del = useMutation({
    mutationFn: () =>
      relayFetch(`/metadata/admin/field-groups/${group.group_key}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-field-groups"] });
      toast({ title: "Field group deleted" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <>
      <div className="rounded-lg border bg-card p-4 flex items-start gap-3 group hover:shadow-sm transition-shadow">
        {/* Drag handle (visual only) */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
          <GripVertical className="size-4 text-muted-foreground/40" />
          <span className="text-doc-support font-mono text-muted-foreground">{group.sort_order}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{group.label}</span>
            <CodeBadge>{group.group_key}</CodeBadge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="size-3" />
              {group.member_count} field{group.member_count !== 1 ? "s" : ""}
            </span>
          </div>

          {group.description && (
            <p className="text-xs text-muted-foreground">{group.description}</p>
          )}

          {group.applies_to_classes.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {group.applies_to_classes.map((cls) => (
                <span
                  key={cls}
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-doc-support font-medium ${CLASS_STYLE[cls] ?? ""}`}
                >
                  {cls}
                </span>
              ))}
            </div>
          )}
          {group.applies_to_classes.length === 0 && (
            <span className="text-doc-support text-muted-foreground italic">all entity classes</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-7 text-destructive"
            onClick={() => setDelete(true)}
            disabled={group.member_count > 0}
            title={group.member_count > 0 ? "Remove all members first" : "Delete group"}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <FieldGroupDialog open={editOpen} onClose={() => setEdit(false)} onSaved={onRefresh} edit={group} />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDelete}
        title="Delete field group?"
        description={`Delete '${group.label}' (${group.group_key})? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FieldGroupsPage() {
  const [search, setSearch]     = useState("");
  const [createOpen, setCreate] = useState(false);
  const [filterClass, setFilter] = useState("");

  const { data, isLoading, refetch } = useQuery<{ items: FieldGroup[] }>({
    queryKey: ["meta-field-groups"],
    queryFn: () => relayFetch("/metadata/admin/field-groups"),
    staleTime: 30_000,
  });

  const groups = (data?.items ?? []).filter((g) => {
    const matchSearch =
      !search ||
      g.group_key.includes(search.toLowerCase()) ||
      g.label.toLowerCase().includes(search.toLowerCase());
    const matchClass =
      !filterClass ||
      g.applies_to_classes.length === 0 ||
      g.applies_to_classes.includes(filterClass);
    return matchSearch && matchClass;
  });

  return (
    <PageFrame
      title="Field Groups"
      description="Define UI sections that organise entity fields in detail views. Groups reference canonical fields via field_group_member."
      actions={
        <Button className="gap-1.5" size="sm" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New group
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by key or label…"
            className="flex-1 min-w-48 max-w-sm"
          />
          <div className="flex items-center gap-1">
            <Button
              variant={!filterClass ? "primary" : "ghost"}
              size="sm" className="h-8 text-xs"
              onClick={() => setFilter("")}
            >All</Button>
            {ENTITY_CLASSES.map((cls) => (
              <Button
                key={cls}
                variant={filterClass === cls ? "primary" : "ghost"}
                size="sm" className="h-8 text-xs"
                onClick={() => setFilter(cls === filterClass ? "" : cls)}
              >
                {cls}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="No field groups"
            description="Create field groups to organise fields into UI sections in entity detail views."
            action={
              <Button size="sm" className="gap-1" onClick={() => setCreate(true)}>
                <Plus className="size-3" /> New group
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {groups
              .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
              .map((g) => (
                <FieldGroupCard key={g.group_key} group={g} onRefresh={() => void refetch()} />
              ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{groups.length} group{groups.length !== 1 ? "s" : ""}</p>
      </div>

      <FieldGroupDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        onSaved={() => void refetch()}
      />
    </PageFrame>
  );
}
