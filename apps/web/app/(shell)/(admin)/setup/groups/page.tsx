"use client";

/**
 * Groups Setup — /setup/groups
 *
 * IAM group management: list groups, create/edit groups,
 * manage members, assign scoped roles.
 * All write operations require iam_admin step-up on the server.
 */

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, RefreshCw, Shield, Trash2, UserPlus, Search, Lock, Settings,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Sheet, SheetContent, SheetHeader, SheetTitle,
  Input, Label, Textarea, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Group {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_self_service_eligible: boolean;
  status: string;
  created_at: string;
  member_count: number;
  role_count: number;
}

interface GroupMember {
  membership_id: string;
  principal_id: string;
  principal_code: string;
  principal_name: string | null;
  principal_type: string;
  principal_status: string;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  joined_at: string;
}

interface GroupRole {
  assignment_id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  visibility_scope: string;
  assignment_scope_type: string;
  assignment_scope_ref_id: string | null;
  include_descendants: boolean;
  expires_at: string | null;
  status: string;
  created_at: string;
}

interface GroupDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_self_service_eligible: boolean;
  status: string;
  created_at: string;
  updated_at: string | null;
  members: GroupMember[];
  roles: GroupRole[];
}

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
}

interface Role {
  id: string;
  code: string;
  name: string;
  persona_code: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "outline"> = {
  active: "success",
  suspended: "warning",
  deprecated: "muted",
};

const SCOPE_TYPE_LABEL: Record<string, string> = {
  tenant: "Tenant-wide",
  company_code: "Company Code",
  legal_entity: "Legal Entity",
};

const VISIBILITY_LABEL: Record<string, string> = {
  all: "All",
  own: "Own",
  team: "Team",
};

// ── CreateGroupDialog ─────────────────────────────────────────────────────────

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selfService, setSelfService] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/iam/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
      onOpenChange(false);
      setCode(""); setName(""); setDescription(""); setSelfService(false); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!code.trim()) { setError("Code is required"); return; }
    if (!name.trim()) { setError("Name is required"); return; }
    create.mutate({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || undefined,
      is_self_service_eligible: selfService,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Code *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. FIN_APPROVERS"
                className="font-mono text-sm uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Finance Approvers"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Self-service eligible</p>
              <p className="text-xs text-muted-foreground">Users can request membership</p>
            </div>
            <Switch checked={selfService} onCheckedChange={setSelfService} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AddMemberDialog ───────────────────────────────────────────────────────────

function AddMemberDialog({
  groupId,
  open,
  onOpenChange,
  existingPrincipalIds,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingPrincipalIds: Set<string>;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: Principal[] }>({
    queryKey: ["iam-principal-search", q],
    queryFn: async () => {
      if (!q.trim()) return { items: [] };
      const res = await fetch(`/api/iam/principals?q=${encodeURIComponent(q)}&limit=30`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 10_000,
    enabled: q.trim().length > 0,
  });

  const principals = (data?.items ?? []).filter((p) => !existingPrincipalIds.has(p.id));

  const add = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No principal selected");
      const res = await fetch(`/api/iam/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ principal_id: selectedId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to add member");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group-detail", groupId] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
      onOpenChange(false);
      setQ(""); setSelectedId(null); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function principalLabel(p: Principal): string {
    return (p.display_name ?? `${p.given_name ?? ""} ${p.family_name ?? ""}`.trim()) || p.name || p.code;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Search Principal</Label>
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setSelectedId(null); }}
              placeholder="Search by name, code, or email…"
              autoFocus
            />
          </div>

          {q.trim() && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-md border p-1">
              {isLoading ? (
                <p className="text-xs text-muted-foreground px-2 py-1.5">Searching…</p>
              ) : principals.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1.5">No results</p>
              ) : (
                principals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
                      selectedId === p.id && "bg-primary/10 text-primary",
                    )}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="font-medium">{principalLabel(p)}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">({p.code})</span>
                    {p.login_email && (
                      <span className="block text-[10px] text-muted-foreground">{p.login_email}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={!selectedId || add.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AddRoleDialog ─────────────────────────────────────────────────────────────

function AddRoleDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [roleId, setRoleId] = useState("");
  const [visibilityScope, setVisibilityScope] = useState("all");
  const [scopeType, setScopeType] = useState("tenant");
  const [scopeRefId, setScopeRefId] = useState("");
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: rolesData } = useQuery<{ items: Role[] }>({
    queryKey: ["iam-roles"],
    queryFn: async () => {
      const res = await fetch("/api/iam/roles");
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 300_000,
  });

  const roles = rolesData?.items ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        role_id: roleId,
        visibility_scope: visibilityScope,
        assignment_scope_type: scopeType,
        include_descendants: scopeType !== "legal_entity" ? true : includeDescendants,
      };
      if (scopeType !== "tenant") body.assignment_scope_ref_id = scopeRefId.trim();
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();

      const res = await fetch(`/api/iam/groups/${groupId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Failed to assign role");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group-detail", groupId] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
      onOpenChange(false);
      setRoleId(""); setVisibilityScope("all"); setScopeType("tenant");
      setScopeRefId(""); setIncludeDescendants(true); setExpiresAt(""); setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!roleId) { setError("Role is required"); return; }
    if (scopeType !== "tenant" && !scopeRefId.trim()) { setError("Scope Reference ID is required"); return; }
    add.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign Role</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Role *</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="font-mono text-xs">{r.code}</span>
                    <span className="ml-2 text-muted-foreground">{r.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Visibility Scope *</Label>
              <Select value={visibilityScope} onValueChange={setVisibilityScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="own">Own</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assignment Scope</Label>
              <Select value={scopeType} onValueChange={(v) => { setScopeType(v); setScopeRefId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant-wide</SelectItem>
                  <SelectItem value="company_code">Company Code</SelectItem>
                  <SelectItem value="legal_entity">Legal Entity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {scopeType !== "tenant" && (
            <div className="space-y-1">
              <Label className="text-xs">Scope Reference ID (UUID) *</Label>
              <Input
                value={scopeRefId}
                onChange={(e) => setScopeRefId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-…"
                className="font-mono text-xs"
              />
            </div>
          )}

          {scopeType === "legal_entity" && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <p className="text-sm">Include descendants</p>
              <Switch checked={includeDescendants} onCheckedChange={setIncludeDescendants} />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Expires At (optional)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── GroupSheet ────────────────────────────────────────────────────────────────

function GroupSheet({
  group,
  open,
  onOpenChange,
}: {
  group: Group | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);

  const { data, isLoading } = useQuery<GroupDetail>({
    queryKey: ["iam-group-detail", group?.id],
    queryFn: async () => {
      const res = await fetch(`/api/iam/groups/${group!.id}`);
      if (!res.ok) throw new Error("Failed to load group");
      return res.json();
    },
    enabled: !!group?.id && open,
    staleTime: 15_000,
  });

  const removeMember = useMutation({
    mutationFn: async ({ groupId, memberId }: { groupId: string; memberId: string }) => {
      const res = await fetch(`/api/iam/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove member");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group-detail", group?.id] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
    },
  });

  const removeRole = useMutation({
    mutationFn: async ({ groupId, assignmentId }: { groupId: string; assignmentId: string }) => {
      const res = await fetch(`/api/iam/groups/${groupId}/roles/${assignmentId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove role assignment");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group-detail", group?.id] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
    },
  });

  const existingPrincipalIds = new Set((data?.members ?? []).map((m) => m.principal_id));

  function memberDisplayName(m: GroupMember): string {
    return (m.display_name ?? `${m.given_name ?? ""} ${m.family_name ?? ""}`.trim())
      || m.principal_name
      || m.principal_code;
  }

  if (!group) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle className="text-base">{group.name}</SheetTitle>
              {group.is_system && (
                <Badge variant="muted" className="text-[10px] gap-1">
                  <Lock className="h-2.5 w-2.5" />System
                </Badge>
              )}
              <Badge variant={STATUS_VARIANT[group.status] ?? "outline"} className="text-[10px]">
                {group.status}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{group.code}</p>
            {group.description && (
              <p className="text-xs text-muted-foreground">{group.description}</p>
            )}
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Tabs defaultValue="members">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="members" className="flex-1">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Members ({data?.members.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="roles" className="flex-1">
                  <Shield className="mr-1.5 h-3.5 w-3.5" />
                  Roles ({data?.roles.length ?? 0})
                </TabsTrigger>
              </TabsList>

              {/* ── Members tab ───────────────────────────────────────────── */}
              <TabsContent value="members" className="mt-4 space-y-2">
                {!group.is_system && (
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddMemberOpen(true)}>
                      <UserPlus className="mr-1.5 h-3 w-3" />Add Member
                    </Button>
                  </div>
                )}
                {(data?.members ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-8 w-8 text-muted-foreground/30" />}
                    title="No members yet."
                    size="sm"
                    className="py-10"
                  />
                ) : (
                  (data?.members ?? []).map((m) => (
                    <div
                      key={m.membership_id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{memberDisplayName(m)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">{m.principal_code}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{m.principal_type}</Badge>
                        </div>
                      </div>
                      {!group.is_system && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          title="Remove member"
                          onClick={() => removeMember.mutate({ groupId: group.id, memberId: m.membership_id })}
                          disabled={removeMember.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ── Roles tab ─────────────────────────────────────────────── */}
              <TabsContent value="roles" className="mt-4 space-y-2">
                {!group.is_system && (
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddRoleOpen(true)}>
                      <Shield className="mr-1.5 h-3 w-3" />Assign Role
                    </Button>
                  </div>
                )}
                {(data?.roles ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Shield className="h-8 w-8 text-muted-foreground/30" />}
                    title="No roles assigned yet."
                    size="sm"
                    className="py-10"
                  />
                ) : (
                  (data?.roles ?? []).map((r) => (
                    <div key={r.assignment_id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{r.role_name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{r.role_code}</p>
                        </div>
                        {!group.is_system && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                            title="Remove role assignment"
                            onClick={() => removeRole.mutate({ groupId: group.id, assignmentId: r.assignment_id })}
                            disabled={removeRole.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          Visibility: {VISIBILITY_LABEL[r.visibility_scope] ?? r.visibility_scope}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {SCOPE_TYPE_LABEL[r.assignment_scope_type] ?? r.assignment_scope_type}
                        </Badge>
                        {r.assignment_scope_ref_id && (
                          <Badge variant="muted" className="text-[10px] font-mono">
                            {r.assignment_scope_ref_id.slice(0, 8)}…
                          </Badge>
                        )}
                        {r.include_descendants && r.assignment_scope_type === "legal_entity" && (
                          <Badge variant="outline" className="text-[10px]">incl. descendants</Badge>
                        )}
                        {r.expires_at && (
                          <Badge variant="warning" className="text-[10px]">
                            exp {new Date(r.expires_at).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {group && addMemberOpen && (
        <AddMemberDialog
          groupId={group.id}
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          existingPrincipalIds={existingPrincipalIds}
        />
      )}

      {group && addRoleOpen && (
        <AddRoleDialog
          groupId={group.id}
          open={addRoleOpen}
          onOpenChange={setAddRoleOpen}
        />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GroupsSetupPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<{ items: Group[] }>({
    queryKey: ["iam-groups", q, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/iam/groups?${params}`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 15_000,
  });

  const groups = data?.items ?? [];

  function openGroup(g: Group) {
    setSelectedGroup(g);
    setSheetOpen(true);
  }

  return (
    <PageFrame
      title="Groups"
      description="Manage IAM groups, members, and scoped role assignments"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-groups"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New Group
          </Button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterPillBar
          items={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "deprecated", label: "Deprecated" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search groups…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Group cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10 text-muted-foreground/30" />}
          title={q ? `No groups matching "${q}"` : "No groups found."}
          action={!q && statusFilter === "active" ? (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Create your first group
            </Button>
          ) : undefined}
          className="py-20"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card
              key={g.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => openGroup(g)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{g.code}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {g.is_system && (
                      <Badge variant="muted" className="gap-1 text-[9px]">
                        <Lock className="h-2.5 w-2.5" />System
                      </Badge>
                    )}
                    <Badge variant={STATUS_VARIANT[g.status] ?? "outline"} className="text-[10px]">
                      {g.status}
                    </Badge>
                  </div>
                </div>

                {g.description && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">{g.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {g.member_count} member{g.member_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {g.role_count} role{g.role_count !== 1 ? "s" : ""}
                  </span>
                  {g.is_self_service_eligible && (
                    <span className="flex items-center gap-1 text-primary">
                      <Settings className="h-3 w-3" />self-service
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />

      <GroupSheet
        group={selectedGroup}
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) setSelectedGroup(null);
        }}
      />
    </PageFrame>
  );
}
