"use client";

/**
 * Entity Policy Admin — /setup/metadata/entity-policies
 *
 * Manage access, audit, scope, and retention settings per entity
 * (control.entity_policy). One policy row per entity per tenant,
 * with an optional entity_version_id for version-specific overrides.
 *
 * API surface (via relay → runtime):
 *   GET    /api/relay/metadata/admin/entity-policies        — list
 *   POST   /api/relay/metadata/admin/entity-policies        — create
 *   PATCH  /api/relay/metadata/admin/entity-policies/:id    — update
 *   DELETE /api/relay/metadata/admin/entity-policies/:id    — delete
 *   GET    /api/relay/metadata/admin/entities               — entity picker
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, Plus, Trash2, Pencil, Eye, Lock, Database,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Skeleton, Input, Label, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { useToast } from "@/components/ui/use-toast";
import {
  EmptyState, SearchInput, ConfirmDialog, CodeBadge,
  relayFetch,
} from "../../_components/admin-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityEntry {
  id: string;
  name: string;
  label_singular: string | null;
  entity_class: string;
  module_id: string;
}

interface EntityPolicy {
  id: string;
  entity_id: string;
  entity_name: string | null;
  entity_label: string | null;
  entity_class: string | null;
  entity_version_id: string | null;
  access_mode: string;
  company_scope_mode: string;
  audit_mode: string;
  retention_policy: Record<string, unknown>;
  default_filters: Record<string, unknown>;
  cache_flags: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_MODES = [
  { value: "default_deny",  label: "Default deny" },
  { value: "default_allow", label: "Default allow" },
  { value: "explicit",      label: "Explicit" },
] as const;

const SCOPE_MODES = [
  { value: "none",    label: "None" },
  { value: "single",  label: "Single company" },
  { value: "subtree", label: "Company subtree" },
  { value: "full",    label: "Full hierarchy" },
] as const;

const AUDIT_MODES = [
  { value: "enabled",  label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "sampling", label: "Sampling" },
] as const;

const CLASS_STYLE: Record<string, string> = {
  REFERENCE: "bg-primary/10 text-primary border-primary/30",
  MASTER:    "bg-accent/10 text-accent-foreground border-accent/30",
  DOCUMENT:  "bg-warning/10 text-warning border-warning/30",
  CONTROL:   "bg-muted text-muted-foreground border-border",
  JOURNAL:   "bg-success/10 text-success border-success/30",
};

function jsonStr(val: Record<string, unknown>): string {
  return JSON.stringify(val, null, 2);
}

function parseJson(val: string): Record<string, unknown> | null {
  try { return JSON.parse(val) as Record<string, unknown>; }
  catch { return null; }
}

// ─── Policy Form Dialog ───────────────────────────────────────────────────────

function PolicyDialog({
  open, onClose, onSaved, edit, entities,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  edit?: EntityPolicy;
  entities: EntityEntry[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!edit;

  const [entityId,    setEntityId]    = useState(edit?.entity_id ?? "");
  const [accessMode,  setAccess]      = useState(edit?.access_mode ?? "default_deny");
  const [scopeMode,   setScope]       = useState(edit?.company_scope_mode ?? "none");
  const [auditMode,   setAudit]       = useState(edit?.audit_mode ?? "enabled");
  const [retention,   setRetention]   = useState(jsonStr(edit?.retention_policy ?? {}));
  const [filters,     setFilters]     = useState(jsonStr(edit?.default_filters ?? {}));
  const [cacheFlags,  setCacheFlags]  = useState(jsonStr(edit?.cache_flags ?? {}));

  const retentionJson = parseJson(retention);
  const filtersJson   = parseJson(filters);
  const cacheFlagsJson = parseJson(cacheFlags);
  const jsonValid = retentionJson !== null && filtersJson !== null && cacheFlagsJson !== null;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        entity_id: entityId,
        access_mode: accessMode,
        company_scope_mode: scopeMode,
        audit_mode: auditMode,
        retention_policy: retentionJson ?? {},
        default_filters: filtersJson ?? {},
        cache_flags: cacheFlagsJson ?? {},
      };
      if (isEdit) {
        return relayFetch(`/metadata/admin/entity-policies/${edit!.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      return relayFetch("/metadata/admin/entity-policies", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-entity-policies"] });
      toast({ title: isEdit ? "Policy updated" : "Policy created" });
      onSaved(); onClose();
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const selectedEntity = entities.find((e) => e.id === entityId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {isEdit ? "Edit entity policy" : "New entity policy"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Entity selector */}
          <div className="space-y-1">
            <Label>Entity</Label>
            {isEdit ? (
              <div className="flex items-center gap-2">
                <CodeBadge>{selectedEntity?.name ?? edit!.entity_name ?? edit!.entity_id}</CodeBadge>
                {selectedEntity?.label_singular && (
                  <span className="text-sm text-muted-foreground">{selectedEntity.label_singular}</span>
                )}
                <p className="text-[10px] text-muted-foreground ml-auto">entity cannot be changed</p>
              </div>
            ) : (
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an entity…" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-mono text-xs">{e.name}</span>
                      {e.label_singular && <span className="ml-2 text-muted-foreground">{e.label_singular}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Access + Scope + Audit */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Access mode</Label>
              <Select value={accessMode} onValueChange={setAccess}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Company scope</Label>
              <Select value={scopeMode} onValueChange={setScope}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Audit mode</Label>
              <Select value={auditMode} onValueChange={setAudit}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* JSON editors */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Retention policy <span className="text-muted-foreground font-normal">(JSON object)</span></Label>
              <Textarea
                className="h-16 resize-none font-mono text-xs"
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Default filters <span className="text-muted-foreground font-normal">(JSON object)</span></Label>
              <Textarea
                className="h-16 resize-none font-mono text-xs"
                value={filters}
                onChange={(e) => setFilters(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Cache flags <span className="text-muted-foreground font-normal">(JSON object)</span></Label>
              <Textarea
                className="h-16 resize-none font-mono text-xs"
                value={cacheFlags}
                onChange={(e) => setCacheFlags(e.target.value)}
                spellCheck={false}
              />
            </div>

            {!jsonValid && (
              <p className="text-[10px] text-destructive">One or more JSON fields are invalid.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!entityId || !jsonValid || save.isPending}
          >
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Policy Card ──────────────────────────────────────────────────────────────

const ACCESS_ICON: Record<string, typeof Lock> = {
  default_deny:  Lock,
  default_allow: Eye,
  explicit:      ShieldCheck,
};

const ACCESS_STYLE: Record<string, string> = {
  default_deny:  "bg-destructive/10 text-destructive border-destructive/30",
  default_allow: "bg-success/10 text-success border-success/30",
  explicit:      "bg-primary/10 text-primary border-primary/30",
};

const AUDIT_STYLE: Record<string, string> = {
  enabled:  "bg-success/10 text-success border-success/30",
  disabled: "bg-muted text-muted-foreground border-border",
  sampling: "bg-warning/10 text-warning border-warning/30",
};

function PolicyCard({
  policy, entities, onRefresh,
}: {
  policy: EntityPolicy;
  entities: EntityEntry[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editOpen,   setEdit]   = useState(false);
  const [deleteOpen, setDelete] = useState(false);

  const AccessIcon = ACCESS_ICON[policy.access_mode] ?? ShieldCheck;

  const del = useMutation({
    mutationFn: () =>
      relayFetch(`/metadata/admin/entity-policies/${policy.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meta-entity-policies"] });
      toast({ title: "Policy deleted" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const displayName = policy.entity_label ?? policy.entity_name ?? policy.entity_id;

  return (
    <>
      <div className="rounded-lg border bg-card p-4 flex items-start gap-3 group hover:shadow-sm transition-shadow">
        <div className="shrink-0 mt-0.5">
          <AccessIcon className="size-4 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{displayName}</span>
            {policy.entity_name && (
              <CodeBadge>{policy.entity_name}</CodeBadge>
            )}
            {policy.entity_class && (
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${CLASS_STYLE[policy.entity_class] ?? ""}`}>
                {policy.entity_class}
              </span>
            )}
            {policy.entity_version_id && (
              <Badge variant="outline" className="text-[10px] font-mono">v: {policy.entity_version_id.slice(0, 8)}</Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ACCESS_STYLE[policy.access_mode] ?? ""}`}>
              {ACCESS_MODES.find((m) => m.value === policy.access_mode)?.label ?? policy.access_mode}
            </span>
            <span className="text-[10px] text-muted-foreground">
              scope: <strong>{SCOPE_MODES.find((m) => m.value === policy.company_scope_mode)?.label ?? policy.company_scope_mode}</strong>
            </span>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${AUDIT_STYLE[policy.audit_mode] ?? ""}`}>
              audit: {AUDIT_MODES.find((m) => m.value === policy.audit_mode)?.label ?? policy.audit_mode}
            </span>
          </div>

          {/* JSONB summary */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            {Object.keys(policy.retention_policy).length > 0 && (
              <span>retention: {Object.keys(policy.retention_policy).join(", ")}</span>
            )}
            {Object.keys(policy.default_filters).length > 0 && (
              <span>filters: {Object.keys(policy.default_filters).length} key{Object.keys(policy.default_filters).length !== 1 ? "s" : ""}</span>
            )}
            {Object.keys(policy.cache_flags).length > 0 && (
              <span>cache: {Object.keys(policy.cache_flags).join(", ")}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-7 text-destructive"
            onClick={() => setDelete(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <PolicyDialog
          open={editOpen}
          onClose={() => setEdit(false)}
          onSaved={onRefresh}
          edit={policy}
          entities={entities}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDelete}
        title="Delete entity policy?"
        description={`Remove policy for '${displayName}'? Access will revert to platform defaults.`}
        confirmLabel="Delete"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntityPoliciesPage() {
  const [search,     setSearch]  = useState("");
  const [createOpen, setCreate]  = useState(false);
  const [filterClass, setFilter] = useState("");

  const { data: entData } = useQuery<{ items: EntityEntry[] }>({
    queryKey: ["meta-admin-entities"],
    queryFn: () => relayFetch("/metadata/admin/entities"),
    staleTime: 60_000,
  });
  const entities = entData?.items ?? [];

  const { data, isLoading, refetch } = useQuery<{ items: EntityPolicy[] }>({
    queryKey: ["meta-entity-policies"],
    queryFn: () => relayFetch("/metadata/admin/entity-policies"),
    staleTime: 30_000,
  });

  const policies = (data?.items ?? []).filter((p) => {
    const displayName = (p.entity_label ?? p.entity_name ?? "").toLowerCase();
    const matchSearch = !search || displayName.includes(search.toLowerCase()) ||
      (p.entity_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchClass  = !filterClass || p.entity_class === filterClass;
    return matchSearch && matchClass;
  });

  const ENTITY_CLASSES = ["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "JOURNAL"];

  return (
    <PageFrame
      title="Entity Policies"
      description="Configure access mode, company scope, audit trail, retention, and filter defaults per entity type."
      actions={
        <Button className="gap-1.5" size="sm" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> New policy
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by entity name…"
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
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : policies.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No entity policies"
            description="Create policies to configure access mode, audit settings, and data scope per entity type."
            action={
              <Button size="sm" className="gap-1" onClick={() => setCreate(true)}>
                <Plus className="size-3" /> New policy
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {policies
              .sort((a, b) =>
                (a.entity_label ?? a.entity_name ?? "").localeCompare(
                  b.entity_label ?? b.entity_name ?? ""
                )
              )
              .map((p) => (
                <PolicyCard
                  key={p.id}
                  policy={p}
                  entities={entities}
                  onRefresh={() => void refetch()}
                />
              ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {policies.length} polic{policies.length !== 1 ? "ies" : "y"}
        </p>
      </div>

      <PolicyDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        onSaved={() => void refetch()}
        entities={entities}
      />
    </PageFrame>
  );
}
