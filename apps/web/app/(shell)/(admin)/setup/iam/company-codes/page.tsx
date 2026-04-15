"use client";

/**
 * Company-Code Access Admin — /setup/iam/company-codes
 *
 * DataTable of principal × company_code access grants stored in
 * master.company_code_access. Supports:
 *   - Filter by company code (dropdown) and entity type (pill bar)
 *   - Grant Access: pick entity type → search principal or group → pick company code
 *   - Revoke: one-click DELETE with confirmation
 *
 * All writes require iam_admin step-up on the server.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, RefreshCw, Trash2, Search, Users, User, Shield,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/feedback";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@athyper/ui/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CcaGrant {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  entity_code: string | null;
  company_code_id: string;
  company_code: string;
  company_name: string;
  inherit_subtree: boolean;
  granted_by: string | null;
  granted_by_code: string | null;
  created_at: string;
}

interface CompanyCode {
  id: string;
  code: string;
  name: string;
}

interface Principal {
  id: string;
  code: string;
  name: string | null;
  principal_type: string;
  login_email: string | null;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
}

interface Group {
  id: string;
  code: string;
  name: string;
  status: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ENTITY_TYPE_ICONS: Record<string, React.ElementType> = {
  principal:  User,
  auth_group: Users,
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  principal:      "Principal",
  auth_group:     "Group",
  auth_group_role: "Group Role",
  team:           "Team",
};

// ── GrantDialog ────────────────────────────────────────────────────────────────

function GrantDialog({
  open,
  onOpenChange,
  companyCodes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyCodes: CompanyCode[];
}) {
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState<"principal" | "auth_group">("principal");
  const [companyCodeId, setCompanyCodeId] = useState("");
  const [inheritSubtree, setInheritSubtree] = useState(true);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Principal search
  const { data: principalData, isLoading: loadingPrincipals } = useQuery<{ items: Principal[] }>({
    queryKey: ["iam-principal-search", q, entityType],
    queryFn: async () => {
      if (!q.trim() || entityType !== "principal") return { items: [] };
      const res = await fetch(`/api/iam/principals?q=${encodeURIComponent(q)}&limit=30`);
      return res.ok ? res.json() : { items: [] };
    },
    enabled: q.trim().length > 0 && entityType === "principal",
    staleTime: 10_000,
  });

  // Group search
  const { data: groupData, isLoading: loadingGroups } = useQuery<{ items: Group[] }>({
    queryKey: ["iam-groups-search", q, entityType],
    queryFn: async () => {
      if (!q.trim() || entityType !== "auth_group") return { items: [] };
      const params = new URLSearchParams({ q: q.trim(), status: "active" });
      const res = await fetch(`/api/iam/groups?${params}`);
      return res.ok ? res.json() : { items: [] };
    },
    enabled: q.trim().length > 0 && entityType === "auth_group",
    staleTime: 10_000,
  });

  const results = entityType === "principal"
    ? (principalData?.items ?? [])
    : (groupData?.items ?? []);
  const isLoading = entityType === "principal" ? loadingPrincipals : loadingGroups;

  function principalLabel(p: Principal): string {
    return (p.display_name ?? `${p.given_name ?? ""} ${p.family_name ?? ""}`.trim()) || p.name || p.code;
  }

  const grant = useMutation({
    mutationFn: async () => {
      if (!selectedId || !companyCodeId) throw new Error("Missing required fields");
      const res = await fetch("/api/iam/admin/company-code-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: selectedId,
          company_code_id: companyCodeId,
          inherit_subtree: inheritSubtree,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to grant access");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-cca"] });
      onOpenChange(false);
      reset();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function reset() {
    setEntityType("principal");
    setCompanyCodeId("");
    setInheritSubtree(true);
    setQ("");
    setSelectedId(null);
    setError(null);
  }

  function submit() {
    setError(null);
    if (!selectedId) { setError("Select a principal or group"); return; }
    if (!companyCodeId) { setError("Select a company code"); return; }
    grant.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Grant Company-Code Access</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">

          {/* Entity type */}
          <div className="space-y-1">
            <Label className="text-xs">Entity Type *</Label>
            <Select
              value={entityType}
              onValueChange={(v) => { setEntityType(v as "principal" | "auth_group"); setQ(""); setSelectedId(null); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="principal">Principal (user / service)</SelectItem>
                <SelectItem value="auth_group">Group</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entity search */}
          <div className="space-y-1">
            <Label className="text-xs">
              {entityType === "principal" ? "Search Principal *" : "Search Group *"}
            </Label>
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setSelectedId(null); }}
              placeholder={entityType === "principal" ? "Name, code, or email…" : "Group name or code…"}
            />
          </div>

          {q.trim() && (
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-md border p-1">
              {isLoading ? (
                <p className="text-xs text-muted-foreground px-2 py-1.5">Searching…</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1.5">No results</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full text-left rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
                      selectedId === item.id ? "bg-primary/10 text-primary" : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="font-medium">
                      {entityType === "principal"
                        ? principalLabel(item as Principal)
                        : (item as Group).name}
                    </span>
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">({item.code})</span>
                    {entityType === "principal" && (item as Principal).login_email && (
                      <span className="block text-[10px] text-muted-foreground">{(item as Principal).login_email}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Company code */}
          <div className="space-y-1">
            <Label className="text-xs">Company Code *</Label>
            <Select value={companyCodeId} onValueChange={setCompanyCodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select company code…" />
              </SelectTrigger>
              <SelectContent>
                {companyCodes.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    <span className="font-mono text-xs">{cc.code}</span>
                    <span className="ml-2 text-muted-foreground">{cc.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Inherit subtree */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Inherit subtree</p>
              <p className="text-xs text-muted-foreground">Access extends to subsidiary company codes</p>
            </div>
            <Switch checked={inheritSubtree} onCheckedChange={setInheritSubtree} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={submit} disabled={grant.isPending}>Grant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RevokeDialog ───────────────────────────────────────────────────────────────

function RevokeDialog({
  grant,
  open,
  onOpenChange,
}: {
  grant: CcaGrant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();

  const revoke = useMutation({
    mutationFn: async () => {
      if (!grant) return;
      const res = await fetch(`/api/iam/admin/company-code-access/${grant.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to revoke");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-cca"] });
      onOpenChange(false);
    },
  });

  const entityLabel = grant
    ? (grant.entity_name ?? grant.entity_code ?? grant.entity_id.slice(0, 8))
    : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke access?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove <strong>{entityLabel}</strong>&apos;s access to company code{" "}
            <strong>{grant?.company_code}</strong>? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CompanyCodeAccessPage() {
  const qc = useQueryClient();
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [companyCodeFilter, setCompanyCodeFilter] = useState("all");
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CcaGrant | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [q, setQ] = useState("");

  // Company codes for filter dropdown
  const { data: ccData } = useQuery<{ items: CompanyCode[] }>({
    queryKey: ["iam-admin-company-codes"],
    queryFn: async () => {
      const res = await fetch("/api/iam/admin/company-codes");
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 120_000,
  });
  const companyCodes = ccData?.items ?? [];

  // Grants list
  const { data, isLoading } = useQuery<{ items: CcaGrant[]; total: number }>({
    queryKey: ["iam-cca", entityTypeFilter, companyCodeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityTypeFilter !== "all") params.set("entity_type", entityTypeFilter);
      if (companyCodeFilter !== "all") params.set("company_code_id", companyCodeFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/iam/admin/company-code-access?${params}`);
      return res.ok ? res.json() : { items: [], total: 0 };
    },
    staleTime: 15_000,
  });

  const allGrants = data?.items ?? [];
  const grants = q.trim()
    ? allGrants.filter((g) => {
        const hay = `${g.entity_name ?? ""} ${g.entity_code ?? ""} ${g.company_code} ${g.entity_type}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : allGrants;

  function openRevoke(g: CcaGrant) {
    setRevokeTarget(g);
    setRevokeOpen(true);
  }

  return (
    <PageFrame
      title="Company-Code Access"
      description="Control which principals and groups may access records scoped to a company code"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-cca"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Grant Access
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <FilterPillBar
          items={[
            { value: "all", label: "All types" },
            { value: "principal", label: "Principals" },
            { value: "auth_group", label: "Groups" },
          ]}
          value={entityTypeFilter}
          onChange={setEntityTypeFilter}
        />

        {/* Company code filter */}
        <Select value={companyCodeFilter} onValueChange={setCompanyCodeFilter}>
          <SelectTrigger className="h-8 text-sm w-[200px]">
            <Building2 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="All company codes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All company codes</SelectItem>
            {companyCodes.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>
                <span className="font-mono text-xs">{cc.code}</span>
                <span className="ml-1.5 text-muted-foreground">{cc.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Text search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entity or company…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : grants.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-10 w-10 text-muted-foreground/30" />}
          title={q ? `No grants matching "${q}"` : "No company-code grants configured."}
          action={!q ? (
            <Button variant="outline" size="sm" onClick={() => setGrantOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Grant Access
            </Button>
          ) : undefined}
          className="py-20"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Entity</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Company Code</th>
                <th className="py-2 pr-4 font-medium">Subtree</th>
                <th className="py-2 pr-4 font-medium">Granted</th>
                <th className="py-2 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const Icon = ENTITY_TYPE_ICONS[g.entity_type] ?? Shield;
                return (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    {/* Entity */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[180px]">
                            {g.entity_name ?? g.entity_id.slice(0, 8)}
                          </p>
                          {g.entity_code && (
                            <p className="font-mono text-[10px] text-muted-foreground">{g.entity_code}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className="text-[10px]">
                        {ENTITY_TYPE_LABELS[g.entity_type] ?? g.entity_type}
                      </Badge>
                    </td>

                    {/* Company code */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <div>
                          <span className="font-mono text-xs font-medium">{g.company_code}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{g.company_name}</span>
                        </div>
                      </div>
                    </td>

                    {/* Subtree */}
                    <td className="py-2.5 pr-4">
                      <Badge variant={g.inherit_subtree ? "success" : "muted"} className="text-[10px]">
                        {g.inherit_subtree ? "yes" : "no"}
                      </Badge>
                    </td>

                    {/* Granted at */}
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      <div>
                        {new Date(g.created_at).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </div>
                      {g.granted_by_code && (
                        <div className="font-mono text-[10px]">{g.granted_by_code}</div>
                      )}
                    </td>

                    {/* Revoke */}
                    <td className="py-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Revoke access"
                        onClick={() => openRevoke(g)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data && data.total > grants.length && !q && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing {grants.length} of {data.total} grants
            </p>
          )}
        </div>
      )}

      <GrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        companyCodes={companyCodes}
      />

      <RevokeDialog
        grant={revokeTarget}
        open={revokeOpen}
        onOpenChange={(v) => {
          setRevokeOpen(v);
          if (!v) setRevokeTarget(null);
        }}
      />
    </PageFrame>
  );
}
