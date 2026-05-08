"use client";

/**
 * Users Setup — /setup/users
 *
 * Principal directory: search users, inspect group memberships,
 * review access grants, and check identity bindings.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  User, RefreshCw, Shield, Key, Users, Search, Lock, UserCheck,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Input,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Principal {
  id: string;
  code: string;
  name: string | null;
  principal_type: string;
  status: string;
  is_locked: boolean;
  login_email: string | null;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  avatar_url: string | null;
}

interface GroupMembership {
  membership_id: string;
  joined_at: string;
  group_id: string;
  group_code: string;
  group_name: string;
  is_system: boolean;
  group_role_id: string | null;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
  visibility_scope: string | null;
  assignment_scope_type: string | null;
  assignment_scope_ref_id: string | null;
}

interface AccessGrant {
  id: string;
  effect: string;
  status: string;
  visibility_scope: string | null;
  assignment_scope_type: string | null;
  assignment_scope_ref_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  granted_by: string | null;
  notes: string | null;
  created_at: string;
  permission_code: string | null;
  permission_name: string | null;
}

interface AuthBinding {
  id: string;
  provider_code: string;
  subject_id: string;
  username: string | null;
  idp_enabled: boolean | null;
  idp_email_verified: boolean | null;
  sync_status: string | null;
  synced_at: string | null;
  sync_error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "destructive" | "outline"> = {
  active: "success",
  suspended: "warning",
  terminated: "destructive",
  invited: "muted",
};

const SYNC_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  synced: "success",
  pending: "warning",
  error: "destructive",
  skipped: "muted",
};

const PRINCIPAL_TYPE_LABEL: Record<string, string> = {
  user: "User",
  service_account: "Service Account",
  bot: "Bot",
};

// ── GroupsTab ─────────────────────────────────────────────────────────────────

function GroupsTab({ principalId }: { principalId: string }) {
  const { data, isLoading } = useQuery<{ principal_id: string; items: GroupMembership[] }>({
    queryKey: ["iam-principal-groups", principalId],
    queryFn: async () => {
      const res = await fetch(`/api/iam/principals/${principalId}/groups`);
      return res.ok ? res.json() : { principal_id: principalId, items: [] };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const items = data?.items ?? [];
  // Deduplicate by group_id (one row per group_role join)
  const seen = new Set<string>();
  const groups = items.filter((m) => {
    if (seen.has(m.group_id)) return false;
    seen.add(m.group_id);
    return true;
  });

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8 text-muted-foreground/30" />}
        title="Not a member of any groups."
        size="sm"
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const groupRoles = items.filter((m) => m.group_id === g.group_id && m.role_code);
        return (
          <div key={g.group_id} className="rounded-md border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{g.group_name}</p>
              {g.is_system && (
                <Badge variant="muted" className="text-doc-field-label gap-1">
                  <Lock className="h-2.5 w-2.5" />System
                </Badge>
              )}
              <span className="font-mono text-doc-support text-muted-foreground ml-auto">{g.group_code}</span>
            </div>
            {groupRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {groupRoles.map((r) => (
                  <Badge key={r.group_role_id ?? r.role_id} variant="outline" className="text-doc-support gap-1">
                    <Shield className="h-2.5 w-2.5" />
                    {r.role_code}
                    {r.assignment_scope_type && r.assignment_scope_type !== "tenant" && (
                      <span className="text-muted-foreground">· {r.assignment_scope_type}</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-doc-support text-muted-foreground">
              Joined {new Date(g.joined_at).toLocaleDateString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── GrantsTab ─────────────────────────────────────────────────────────────────

function GrantsTab({ principalId }: { principalId: string }) {
  const { data, isLoading } = useQuery<{ principal_id: string; items: AccessGrant[] }>({
    queryKey: ["iam-principal-grants", principalId],
    queryFn: async () => {
      const res = await fetch(`/api/iam/principals/${principalId}/grants`);
      return res.ok ? res.json() : { principal_id: principalId, items: [] };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const items = data?.items ?? [];
  const active = items.filter((g) => g.status === "active");
  const revoked = items.filter((g) => g.status === "revoked");

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Shield className="h-8 w-8 text-muted-foreground/30" />}
        title="No access grants."
        size="sm"
        className="py-10"
      />
    );
  }

  function GrantRow({ grant }: { grant: AccessGrant }) {
    return (
      <div className="rounded-md border p-2.5 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={grant.effect === "allow" ? "success" : "destructive"} className="text-doc-field-label">
            {grant.effect}
          </Badge>
          <span className="text-sm font-medium">{grant.permission_code ?? "—"}</span>
          {grant.status === "revoked" && (
            <Badge variant="muted" className="text-doc-field-label">revoked</Badge>
          )}
          {grant.expires_at && (
            <Badge variant="warning" className="text-doc-field-label ml-auto">
              exp {new Date(grant.expires_at).toLocaleDateString()}
            </Badge>
          )}
        </div>
        {grant.permission_name && (
          <p className="text-xs text-muted-foreground">{grant.permission_name}</p>
        )}
        {grant.assignment_scope_type && (
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-doc-field-label">{grant.assignment_scope_type}</Badge>
            {grant.visibility_scope && (
              <Badge variant="outline" className="text-doc-field-label">{grant.visibility_scope}</Badge>
            )}
          </div>
        )}
        {grant.notes && <p className="text-doc-support text-muted-foreground italic">{grant.notes}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active ({active.length})</p>
          {active.map((g) => <GrantRow key={g.id} grant={g} />)}
        </div>
      )}
      {revoked.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revoked ({revoked.length})</p>
          {revoked.map((g) => <GrantRow key={g.id} grant={g} />)}
        </div>
      )}
    </div>
  );
}

// ── BindingsTab ───────────────────────────────────────────────────────────────

function BindingsTab({ principalId }: { principalId: string }) {
  const { data, isLoading } = useQuery<{
    principal_id: string;
    auth_epoch: number;
    bindings: AuthBinding[];
  }>({
    queryKey: ["iam-principal-bindings", principalId],
    queryFn: async () => {
      const res = await fetch(`/api/iam/principals/${principalId}/auth-bindings`);
      return res.ok ? res.json() : { principal_id: principalId, auth_epoch: 0, bindings: [] };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const bindings = data?.bindings ?? [];

  if (bindings.length === 0) {
    return (
      <EmptyState
        icon={<Key className="h-8 w-8 text-muted-foreground/30" />}
        title="No identity bindings."
        size="sm"
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-2">
      {data?.auth_epoch !== undefined && (
        <div className="rounded-md bg-muted/30 px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Auth epoch</span>
          <span className="font-mono text-xs font-medium">{data.auth_epoch}</span>
        </div>
      )}
      {bindings.map((b) => (
        <div key={b.id} className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-doc-support">{b.provider_code}</Badge>
            {b.sync_status && (
              <Badge variant={SYNC_VARIANT[b.sync_status] ?? "muted"} className="text-doc-field-label">
                {b.sync_status}
              </Badge>
            )}
            {b.idp_enabled === false && (
              <Badge variant="destructive" className="text-doc-field-label">IdP disabled</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            {b.username && (
              <>
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono truncate">{b.username}</span>
              </>
            )}
            <span className="text-muted-foreground">Subject ID</span>
            <span className="font-mono text-doc-support truncate">{b.subject_id}</span>
            {b.synced_at && (
              <>
                <span className="text-muted-foreground">Last synced</span>
                <span>{new Date(b.synced_at).toLocaleString()}</span>
              </>
            )}
          </div>
          {b.sync_error_message && (
            <p className="text-doc-support text-destructive">{b.sync_error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── UserSheet ─────────────────────────────────────────────────────────────────

function UserSheet({
  principal,
  open,
  onOpenChange,
}: {
  principal: Principal | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!principal) return null;

  const fullName = (principal.display_name ?? `${principal.given_name ?? ""} ${principal.family_name ?? ""}`.trim())
    || principal.name
    || principal.code;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-base">{fullName}</SheetTitle>
            {principal.is_locked && (
              <Badge variant="destructive" className="text-doc-support gap-1">
                <Lock className="h-2.5 w-2.5" />Locked
              </Badge>
            )}
            <Badge variant={STATUS_VARIANT[principal.status] ?? "outline"} className="text-doc-support">
              {principal.status}
            </Badge>
            <Badge variant="muted" className="text-doc-support">
              {PRINCIPAL_TYPE_LABEL[principal.principal_type] ?? principal.principal_type}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{principal.code}</p>
          {principal.login_email && (
            <p className="text-xs text-muted-foreground">{principal.login_email}</p>
          )}
        </SheetHeader>

        <Tabs defaultValue="groups">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="groups" className="flex-1">
              <Users className="mr-1.5 h-3.5 w-3.5" />Groups
            </TabsTrigger>
            <TabsTrigger value="grants" className="flex-1">
              <Shield className="mr-1.5 h-3.5 w-3.5" />Grants
            </TabsTrigger>
            <TabsTrigger value="bindings" className="flex-1">
              <Key className="mr-1.5 h-3.5 w-3.5" />Bindings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="mt-4">
            <GroupsTab principalId={principal.id} />
          </TabsContent>
          <TabsContent value="grants" className="mt-4">
            <GrantsTab principalId={principal.id} />
          </TabsContent>
          <TabsContent value="bindings" className="mt-4">
            <BindingsTab principalId={principal.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PRINCIPAL_TYPES = ["", "user", "service_account", "bot"];
const TYPE_LABEL: Record<string, string> = {
  "": "All Types",
  user: "Users",
  service_account: "Service Accounts",
  bot: "Bots",
};

export default function UsersSetupPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedPrincipal, setSelectedPrincipal] = useState<Principal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<{ items: Principal[]; limit: number }>({
    queryKey: ["iam-principals", q, typeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter, limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/iam/principals?${params}`);
      return res.ok ? res.json() : { items: [], limit: 100 };
    },
    staleTime: 15_000,
  });

  const principals = data?.items ?? [];

  function openPrincipal(p: Principal) {
    setSelectedPrincipal(p);
    setSheetOpen(true);
  }

  function principalDisplayName(p: Principal): string {
    return (p.display_name ?? `${p.given_name ?? ""} ${p.family_name ?? ""}`.trim())
      || p.name
      || p.code;
  }

  return (
    <PageFrame
      title="Users"
      description="Browse principals, inspect group memberships, access grants, and identity bindings"
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["iam-principals"] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterPillBar
          items={["user", "service_account", "bot"].map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))}
          value={typeFilter}
          onChange={setTypeFilter}
          allItem={{ label: TYPE_LABEL[""] ?? "All Types" }}
        />
        <FilterPillBar
          items={[
            { value: "all", label: "All Status" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "terminated", label: "Terminated" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, code, or email…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Principal list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : principals.length === 0 ? (
        <EmptyState
          icon={<User className="h-10 w-10 text-muted-foreground/30" />}
          title={q ? `No principals matching "${q}"` : "No principals found."}
          className="py-20"
        />
      ) : (
        <div className="space-y-1.5">
          {principals.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => openPrincipal(p)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                {/* Avatar placeholder */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserCheck className="h-4 w-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{principalDisplayName(p)}</p>
                    {p.is_locked && (
                      <Lock className="h-3 w-3 text-destructive shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono text-doc-support text-muted-foreground">{p.code}</span>
                    {p.login_email && (
                      <span className="text-doc-support text-muted-foreground truncate">{p.login_email}</span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.principal_type !== "user" && (
                    <Badge variant="muted" className="text-doc-field-label">
                      {PRINCIPAL_TYPE_LABEL[p.principal_type] ?? p.principal_type}
                    </Badge>
                  )}
                  <Badge variant={STATUS_VARIANT[p.status] ?? "outline"} className="text-doc-support">
                    {p.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UserSheet
        principal={selectedPrincipal}
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) setSelectedPrincipal(null);
        }}
      />
    </PageFrame>
  );
}
