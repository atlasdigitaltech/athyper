"use client";

/**
 * Lookup Domain Admin — /setup/metadata/lookups
 *
 * Browse all lookup domains (platform + tenant). For extensible domains,
 * inline-manage tenant-scoped values (add / edit / deprecate).
 *
 * API surface (via relay → runtime):
 *   GET  /api/relay/metadata/admin/lookup-domains       — domain list
 *   POST /api/relay/metadata/admin/lookup-domains       — create domain
 *   PATCH /api/relay/metadata/admin/lookup-domains/:code— update domain
 *   GET  /api/relay/metadata/lookups/:code              — domain values
 *   POST /api/relay/metadata/lookups/:code/values       — add tenant value
 *   PATCH /api/relay/metadata/lookups/:code/values/:vc  — update tenant value
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  List, Plus, ChevronDown, ChevronRight,
  Pencil, Tag, BookOpen, Lock, Unlock,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Switch,
} from "@athyper/ui/primitives";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  StatusPill, EmptyState, SearchInput, SectionHeader, CodeBadge,
  relayFetch, fmtDate, slugify,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Domain {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source_schema: string;
  is_extensible: boolean;
  status: string;
  value_count: number;
}

interface LookupValue {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: string;
  is_system: boolean;
  tenant_owned: boolean;
}

// ─── Domain Form Dialog ───────────────────────────────────────────────────────

function DomainDialog({
  open, onClose, onSaved, edit,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; edit?: Domain;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [code, setCode]           = useState(edit?.code ?? "");
  const [name, setName]           = useState(edit?.name ?? "");
  const [description, setDesc]    = useState(edit?.description ?? "");
  const [isExtensible, setExt]    = useState(edit?.is_extensible ?? true);
  const [status, setStatus]       = useState(edit?.status ?? "active");

  const save = useMutation({
    mutationFn: async () => {
      const body = { code, name, description: description || null, is_extensible: isExtensible, status };
      if (isEdit) {
        return relayFetch(`/metadata/admin/lookup-domains/${edit!.code}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      return relayFetch(`/metadata/admin/lookup-domains`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-lookup-domains"] });
      toast({ title: isEdit ? "Domain updated" : "Domain created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4" />
            {isEdit ? "Edit lookup domain" : "New lookup domain"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                placeholder="e.g. document.status"
                value={code}
                disabled={isEdit}
                onChange={(e) => setCode(slugify(e.target.value).replace(/_/g, "."))}
              />
              <p className="text-doc-support text-muted-foreground">dot.separated lowercase</p>
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Document Status"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              placeholder="What does this lookup domain represent?"
              className="h-16 resize-none text-sm"
              value={description}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={isExtensible} onCheckedChange={setExt} />
              <Label className="text-sm">Tenant-extensible</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!code || !name || save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create domain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Value Row ────────────────────────────────────────────────────────────────

function ValueRow({
  value, domainCode, onRefresh,
}: {
  value: LookupValue; domainCode: string; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(value.name);
  const [desc, setDesc]   = useState(value.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await relayFetch(`/metadata/lookups/${domainCode}/values/${value.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc || null }),
      });
      toast({ title: "Value updated" });
      onRefresh();
      setEditing(false);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    try {
      const next = value.status === "active" ? "deprecated" : "active";
      await relayFetch(`/metadata/lookups/${domainCode}/values/${value.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      onRefresh();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded hover:bg-muted/30 group">
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <Input
              className="h-7 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="h-7 text-xs"
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-6 text-xs" onClick={save} disabled={saving}>
                {saving ? "…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <CodeBadge>{value.code}</CodeBadge>
            <span className="text-sm">{value.name}</span>
            {value.description && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">{value.description}</span>
            )}
            {value.is_system && (
              <Badge variant="outline" className="text-doc-support">system</Badge>
            )}
            {value.tenant_owned && (
              <Badge variant="secondary" className="text-doc-support">tenant</Badge>
            )}
            <StatusPill value={value.status as "active" | "deprecated"} />
          </div>
        )}
      </div>

      {!editing && value.tenant_owned && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost" size="icon" className="size-6"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-6"
            onClick={toggleStatus}
            title={value.status === "active" ? "Deprecate" : "Reactivate"}
          >
            {value.status === "active"
              ? <Lock className="size-3 text-warning" />
              : <Unlock className="size-3 text-success" />}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Add Value Form ───────────────────────────────────────────────────────────

function AddValueForm({ domainCode, onAdded }: { domainCode: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [code, setCode]   = useState("");
  const [name, setName]   = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!code || !name) return;
    setSaving(true);
    try {
      await relayFetch(`/metadata/lookups/${domainCode}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      toast({ title: "Value added" });
      setCode(""); setName("");
      onAdded();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 pt-2 border-t">
      <Input
        className="h-7 w-28 text-xs font-mono"
        placeholder="code"
        value={code}
        onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
        maxLength={80}
      />
      <Input
        className="h-7 flex-1 text-xs"
        placeholder="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button size="sm" className="h-7 text-xs gap-1" onClick={add} disabled={!code || !name || saving}>
        <Plus className="size-3" /> {saving ? "…" : "Add"}
      </Button>
    </div>
  );
}

// ─── Domain Card ──────────────────────────────────────────────────────────────

function DomainCard({ domain, onRefresh }: { domain: Domain; onRefresh: () => void }) {
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [editOpen, setEdit]   = useState(false);

  const { data: valuesData, refetch: refetchValues } = useQuery<{ values: LookupValue[] }>({
    queryKey: ["meta-lookup-values", domain.code],
    queryFn: () => relayFetch(`/metadata/lookups/${domain.code}?include_inactive=true`),
    enabled: open,
  });

  const values = valuesData?.values ?? [];

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Header */}
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 select-none">
              {open ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{domain.name}</span>
                  <CodeBadge>{domain.code}</CodeBadge>
                  <StatusPill value={domain.status as "active" | "deprecated"} />
                  {domain.is_extensible
                    ? <Badge variant="secondary" className="text-doc-support">extensible</Badge>
                    : <Badge variant="outline" className="text-doc-support text-muted-foreground">platform-only</Badge>}
                </div>
                {domain.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{domain.description}</p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {domain.value_count} value{domain.value_count !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost" size="icon" className="size-7"
                  onClick={(e) => { e.stopPropagation(); setEdit(true); }}
                >
                  <Pencil className="size-3" />
                </Button>
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Values list */}
          <CollapsibleContent>
            <div className="border-t divide-y divide-border/50">
              {values.length === 0 && !valuesData ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Loading values…</div>
              ) : values.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">No values yet.</div>
              ) : (
                <div className="py-1">
                  {values.map((v) => (
                    <ValueRow
                      key={v.id}
                      value={v}
                      domainCode={domain.code}
                      onRefresh={() => void refetchValues()}
                    />
                  ))}
                </div>
              )}

              {domain.is_extensible && (
                <AddValueForm
                  domainCode={domain.code}
                  onAdded={() => { void refetchValues(); onRefresh(); }}
                />
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {editOpen && (
        <DomainDialog
          open={editOpen}
          onClose={() => setEdit(false)}
          onSaved={onRefresh}
          edit={domain}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LookupDomainsPage() {
  const [search, setSearch]     = useState("");
  const [createOpen, setCreate] = useState(false);
  const [filter, setFilter]     = useState<"all" | "extensible" | "platform">("all");

  const { data, isLoading, refetch } = useQuery<{ items: Domain[]; total: number }>({
    queryKey: ["meta-lookup-domains"],
    queryFn: () => relayFetch("/metadata/admin/lookup-domains"),
    staleTime: 30_000,
  });

  const domains = (data?.items ?? []).filter((d) => {
    const matchSearch =
      !search ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "extensible" && d.is_extensible) ||
      (filter === "platform" && !d.is_extensible);
    return matchSearch && matchFilter;
  });

  return (
    <PageFrame
      title="Lookup Domains"
      description="Manage lookup value catalogues. Tenant-extensible domains allow adding custom values."
      actions={
        <Button className="gap-1.5" size="sm" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New domain
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by code or name…"
            className="flex-1 min-w-48 max-w-sm"
          />
          <FilterPillBar
            items={[
              { value: "all", label: "All" },
              { value: "extensible", label: "Extensible" },
              { value: "platform", label: "Platform-only" },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as "all" | "extensible" | "platform")}
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : domains.length === 0 ? (
          <EmptyState
            icon={<List />}
            title="No lookup domains found"
            description={search ? "Try a different search term." : "Create your first lookup domain to get started."}
            action={
              !search && (
                <Button size="sm" className="gap-1" onClick={() => setCreate(true)}>
                  <Plus className="size-3" /> New domain
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-2">
            {domains.map((d) => (
              <DomainCard
                key={d.code}
                domain={d}
                onRefresh={() => void refetch()}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {domains.length} domain{domains.length !== 1 ? "s" : ""}
          {data && data.total !== domains.length ? ` of ${data.total}` : ""}
        </p>
      </div>

      <DomainDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        onSaved={() => void refetch()}
      />
    </PageFrame>
  );
}
