"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCsrfToken } from "@/lib/bff-fetch";
import { Layers, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, UserCheck, Users } from "lucide-react";
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from "@athyper/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "../_shared";

interface GroupRole { role_code: string; role_name: string; visibility_scope: string; assignment_scope_type: string; assignment_scope_ref_id?: string | null; }
interface GroupEntry extends Record<string, unknown> { roles: GroupRole[]; }

interface AccessibleCompany {
  company_code:      string;
  company_name:      string;
  legal_entity_code: string | null;
  legal_entity_name: string | null;
}

interface IdentityData {
  persona:               Record<string, unknown> | null;
  groups:                GroupEntry[];
  teams:                 Record<string, unknown>[];
  delegations_received:  Record<string, unknown>[];
  delegations_given:     Record<string, unknown>[];
  feature_grants?:       Record<string, unknown>[];
  access_grants?:        Record<string, unknown>[];
  accessible_companies?: AccessibleCompany[];
}

interface DelegationRecord extends Record<string, unknown> {
  id: string;
  scope_type: string;
  scope_ref: string | null;
  permissions: string[];
  reason: string | null;
  expires_at: string;
  is_revoked: boolean;
  created_at: string;
}

interface PermissionItem { id: string; code: string; name: string; module_code: string; }
interface PrincipalItem  { id: string; code: string; name: string; display_name?: string; login_email?: string; }

// ─── StepUpDialog ─────────────────────────────────────────────────────────────

function StepUpDialog({ open, onOpenChange, actionClass, onElevated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actionClass: string;
  onElevated: () => void;
}) {
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleElevate() {
    if (!code.trim()) return;
    setError(""); setLoading(true);
    try {
      const r = await fetch("/api/iam/mfa/elevate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({ action_class: actionClass, code: code.trim(), method_type: "totp" }),
      });
      const body = await r.json() as Record<string, unknown>;
      if (!r.ok) {
        setError(String(body["message"] ?? "Invalid code"));
      } else {
        setCode(""); setError("");
        onOpenChange(false);
        onElevated();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setCode(""); setError(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Security Verification</DialogTitle>
          <DialogDescription>Enter your current TOTP code to continue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">TOTP Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && handleElevate()}
              placeholder="000000"
              className="mt-1 font-mono text-centerst"
              maxLength={6}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button size="sm" onClick={handleElevate} disabled={loading || code.length !== 6}>
            {loading ? "Verifying…" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── GrantDelegationDialog ────────────────────────────────────────────────────

function GrantDelegationDialog({ open, onOpenChange, onGranted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGranted: () => void;
}) {
  const [delegateSearch, setDelegateSearch]     = useState("");
  const [selectedDelegate, setSelectedDelegate] = useState<PrincipalItem | null>(null);
  const [scopeType, setScopeType]               = useState("");
  const [scopeRef, setScopeRef]                 = useState("");
  const [selectedPermIds, setSelectedPermIds]   = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt]               = useState("");
  const [reason, setReason]                     = useState("");
  const [submitError, setSubmitError]           = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [stepUpOpen, setStepUpOpen]             = useState(false);

  const { data: principalResults } = useQuery({
    queryKey: ["iam-principal-search-del", delegateSearch],
    queryFn: async () => {
      if (delegateSearch.trim().length < 2) return { items: [] };
      const r = await fetch(`/api/iam/principals?q=${encodeURIComponent(delegateSearch)}&limit=20`);
      return r.json() as Promise<{ items: PrincipalItem[] }>;
    },
    enabled: delegateSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const { data: permData } = useQuery({
    queryKey: ["iam-permissions-grant"],
    queryFn: async () => {
      const r = await fetch("/api/iam/permissions");
      return r.json() as Promise<{ items: PermissionItem[] }>;
    },
    enabled: open,
    staleTime: 300_000,
  });

  const permissions = permData?.items ?? [];
  const permsByModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    const m = p.module_code ?? "Other";
    (acc[m] ??= []).push(p);
    return acc;
  }, {});

  function reset() {
    setDelegateSearch(""); setSelectedDelegate(null); setScopeType("");
    setScopeRef(""); setSelectedPermIds(new Set()); setExpiresAt("");
    setReason(""); setSubmitError(""); setSubmitting(false);
  }

  async function handleSubmit() {
    if (!selectedDelegate || !scopeType || selectedPermIds.size === 0 || !expiresAt) {
      setSubmitError("All required fields must be filled.");
      return;
    }
    setSubmitError(""); setSubmitting(true);
    try {
      const r = await fetch("/api/iam/delegations/my", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify({
          delegate_id: selectedDelegate.id,
          scope_type: scopeType,
          scope_ref: scopeRef.trim() || null,
          permissions: Array.from(selectedPermIds),
          expires_at: expiresAt,
          reason: reason.trim() || null,
        }),
      });
      const body = await r.json() as Record<string, unknown>;
      if (!r.ok) {
        if (body["error"] === "STEP_UP_REQUIRED") {
          setStepUpOpen(true);
        } else {
          setSubmitError(String(body["message"] ?? "Failed to grant delegation"));
        }
      } else {
        reset();
        onOpenChange(false);
        onGranted();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const principals = principalResults?.items ?? [];

  return (
    <>
      <StepUpDialog open={stepUpOpen} onOpenChange={setStepUpOpen} actionClass="delegation_accept" onElevated={handleSubmit} />
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grant Access Delegation</DialogTitle>
            <DialogDescription>Delegate specific permissions to another user.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs font-medium">Delegate to</Label>
              {selectedDelegate ? (
                <div className="mt-1.5 flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{selectedDelegate.display_name ?? selectedDelegate.name}</p>
                    {selectedDelegate.login_email && (
                      <p className="text-xs text-muted-foreground">{selectedDelegate.login_email}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedDelegate(null)}>Change</Button>
                </div>
              ) : (
                <div className="relative mt-1.5">
                  <Input
                    value={delegateSearch}
                    onChange={(e) => setDelegateSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="text-xs"
                  />
                  {principals.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                      {principals.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent"
                          onClick={() => { setSelectedDelegate(p); setDelegateSearch(""); }}
                        >
                          <p className="text-xs font-medium">{p.display_name ?? p.name}</p>
                          {p.login_email && <p className="text-xs text-muted-foreground">{p.login_email}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Scope Type</Label>
                <Select value={scopeType} onValueChange={setScopeType}>
                  <SelectTrigger className="mt-1.5 h-8 text-xs">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {["task", "entity", "workflow", "module", "company_code"].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Scope Reference</Label>
                <Input
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder="e.g. entity code or ID"
                  className="mt-1.5 h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Permissions</Label>
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-3">
                {Object.entries(permsByModule).map(([module, perms]) => (
                  <div key={module}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{module}</p>
                    <div className="space-y-1">
                      {perms.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={selectedPermIds.has(p.id)}
                            onCheckedChange={(checked) => {
                              setSelectedPermIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(p.id); else next.delete(p.id);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs">{p.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {permissions.length === 0 && <p className="text-xs text-muted-foreground">Loading permissions…</p>}
              </div>
              {selectedPermIds.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{selectedPermIds.size} selected</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-medium">Expires At</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1.5 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs font-medium">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you granting this delegation?"
                className="mt-1.5 text-xs"
                rows={2}
              />
            </div>

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Granting…" : "Grant Delegation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── DelegationsTab ───────────────────────────────────────────────────────────

function DelegationsTab() {
  const queryClient = useQueryClient();
  const [grantOpen, setGrantOpen]             = useState(false);
  const [stepUpOpen, setStepUpOpen]           = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [revokeError, setRevokeError]         = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["iam-delegations-my"],
    queryFn: async () => {
      const r = await fetch("/api/iam/delegations/my");
      if (!r.ok) throw new Error("Failed to load delegations");
      return r.json() as Promise<{ given: DelegationRecord[]; received: DelegationRecord[] }>;
    },
    staleTime: 0,
  });

  async function handleRevoke(id: string) {
    setRevokeError(null);
    const r = await fetch(`/api/iam/delegations/${id}/revoke-own`, {
      method: "POST",
      headers: { "X-CSRF-Token": getCsrfToken() },
    });
    const body = await r.json() as Record<string, unknown>;
    if (!r.ok) {
      if (body["error"] === "STEP_UP_REQUIRED") {
        setPendingRevokeId(id);
        setStepUpOpen(true);
      } else {
        setRevokeError(String(body["message"] ?? body["error"] ?? "Failed to revoke delegation"));
      }
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["iam-delegations-my"] });
  }

  const given    = data?.given    ?? [];
  const received = data?.received ?? [];
  const activeGiven   = given.filter((d) => !d.is_revoked);
  const revokedGiven  = given.filter((d) => d.is_revoked);

  if (isLoading) return <SkeletonCard lines={4} />;
  if (isError)   return <Banner variant="warn">Failed to load delegations.</Banner>;

  return (
    <>
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="delegation_accept"
        onElevated={() => {
          if (pendingRevokeId) {
            const id = pendingRevokeId;
            setPendingRevokeId(null);
            handleRevoke(id);
          }
        }}
      />
      <GrantDelegationDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        onGranted={() => queryClient.invalidateQueries({ queryKey: ["iam-delegations-my"] })}
      />

      {revokeError && <Banner variant="warn">{revokeError}</Banner>}

      <SectionCard
        title="Delegations Given"
        icon={RefreshCw}
        badge={<Badge variant="warning" className="text-xs">{activeGiven.length} active</Badge>}
        managedBy={{ manager: "You", source: "master.delegation_grant (delegator_id = you)", editPath: "Use the Grant button to create a new delegation" }}
      >
        <div className="mb-3">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setGrantOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Grant Delegation
          </Button>
        </div>

        {activeGiven.length > 0 ? (
          activeGiven.map((d) => (
            <div key={d.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground">To: {str(d["delegate_name"] ?? d["delegate_id"])}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status="active">Active</StatusBadge>
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 gap-1 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(d.id)}
                  >
                    <Trash2 className="h-3 w-3" /> Revoke
                  </Button>
                </div>
              </div>
              <InfoRow label="Scope"   value={`${d.scope_type}${d.scope_ref ? `: ${d.scope_ref}` : ""}`} />
              <InfoRow label="Reason"  value={str(d.reason)} />
              <InfoRow label="Expires" value={fmtDate(d.expires_at)} />
              {Array.isArray(d.permissions) && d.permissions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Permissions</p>
                  <div className="flex flex-wrap gap-1">
                    {(d.permissions as string[]).map((p) => (
                      <span key={p} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No active delegations granted.</p>
        )}

        {revokedGiven.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {revokedGiven.length} revoked delegations
            </summary>
            <div className="mt-2 space-y-2">
              {revokedGiven.map((d) => (
                <div key={d.id} className="rounded-md bg-muted/50 p-2 opacity-60">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">To: {str(d["delegate_name"] ?? d["delegate_id"])}</p>
                    <StatusBadge status="suspended">Revoked</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.scope_type}{d.scope_ref ? `: ${d.scope_ref}` : ""} · Expires: {fmtDate(d.expires_at)}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </SectionCard>

      <SectionCard
        title="Delegations Received"
        icon={RefreshCw}
        badge={<Badge variant="warning" className="text-xs">{received.filter((d) => !d.is_revoked).length} active</Badge>}
        managedBy={{ manager: "Delegators", source: "master.delegation_grant (delegate_id = you)", editPath: "Contact the delegator to modify or revoke" }}
      >
        {received.filter((d) => !d.is_revoked).length > 0 ? (
          received.filter((d) => !d.is_revoked).map((d) => (
            <div key={d.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">From: {str(d["delegator_name"] ?? d["delegator_id"])}</span>
                <StatusBadge status="active">Active</StatusBadge>
              </div>
              <InfoRow label="Scope Type" value={str(d.scope_type)} />
              <InfoRow label="Scope Ref"  value={str(d.scope_ref)} mono />
              <InfoRow label="Reason"     value={str(d.reason)} />
              <InfoRow label="Expires"    value={fmtDate(d.expires_at)} hint="Delegation expires at this date" />
              {Array.isArray(d.permissions) && d.permissions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Delegated Permissions</p>
                  <div className="flex flex-wrap gap-1">
                    {(d.permissions as string[]).map((p) => (
                      <span key={p} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No delegations received.</p>
        )}
      </SectionCard>
    </>
  );
}

// ─── IdentitySection ──────────────────────────────────────────────────────────

export function IdentitySection({ active }: { active: boolean }) {
  const { data, loading, error } = useSectionData<IdentityData>(active, "/api/user/identity");

  if (loading) return (
    <div className="w-full">
      <SkeletonCard lines={3} /><SkeletonCard lines={5} /><SkeletonCard lines={4} />
    </div>
  );

  if (error) return (
    <div className="w-full">
      <Banner variant="warn">Could not load identity data: {error}</Banner>
    </div>
  );

  const persona    = data?.persona as Record<string, unknown> | undefined;
  const groups     = data?.groups ?? [];
  const teams      = data?.teams ?? [];
  const received   = data?.delegations_received ?? [];
  const features   = data?.feature_grants ?? [];
  const accessGrants = data?.access_grants ?? [];
  const companies  = data?.accessible_companies ?? [];

  const legalEntityCount = new Set(companies.map((c) => c.legal_entity_code).filter(Boolean)).size;
  const companiesByLE = companies.reduce<Record<string, AccessibleCompany[]>>((acc, c) => {
    const key = c.legal_entity_code ?? "—";
    (acc[key] ??= []).push(c);
    return acc;
  }, {});

  const showFeatures = features.length > 0;

  return (
    <div className="w-full">
      <Banner>
        <strong>Your access profile</strong> is computed at runtime from groups, personas, delegations, and feature grants.
      </Banner>

      <Tabs defaultValue="summary">
        <TabsList className="mb-4 h-auto flex-wrap gap-1 bg-muted p-1">
          <TabsTrigger value="summary"     className="text-xs">Summary</TabsTrigger>
          <TabsTrigger value="persona"     className="text-xs">Persona</TabsTrigger>
          <TabsTrigger value="groups"      className="text-xs">Groups & Roles</TabsTrigger>
          <TabsTrigger value="teams"       className="text-xs">Teams</TabsTrigger>
          <TabsTrigger value="delegations" className="text-xs">Delegations</TabsTrigger>
          {showFeatures && <TabsTrigger value="features" className="text-xs">Features</TabsTrigger>}
        </TabsList>

        {/* ── Effective Access ── */}
        <TabsContent value="summary" className="mt-4">
          <SectionCard
            title="Effective Access"
            icon={ShieldCheck}
            managedBy={{
              manager:  "Runtime RBAC Engine",
              source:   "Runtime: check_permission → derive_effective_roles → access_grant evaluation",
              editPath: "Role assignments managed via groups and personas",
            }}
          >
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Current Persona",        value: persona ? str(persona["persona_name"]) : "None" },
                { label: "Active Groups",           value: String(groups.length) },
                { label: "Delegations Received",    value: String(received.length) },
                { label: "Legal Entities",          value: companies.length === 0 ? "—" : String(legalEntityCount) },
                { label: "Company Codes",           value: companies.length === 0 ? "—" : String(companies.length) },
                { label: "Explicit Denials",        value: String(accessGrants.filter((a) => str(a["effect"]) === "deny").length) },
              ].map((card) => (
                <div key={card.label} className="rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{card.value}</p>
                </div>
              ))}
            </div>

            {companies.length > 0 && (
              <>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Accessible Companies</p>
                <div className="mb-4 space-y-2">
                  {Object.entries(companiesByLE).map(([leKey, leCos]) => {
                    const le = leCos[0];
                    const leLabel = le?.legal_entity_name ? `${leKey} — ${le.legal_entity_name}` : leKey;
                    return (
                      <div key={leKey} className="rounded-md border border-border bg-muted/40 px-3 py-2">
                        <p className="mb-1.5 text-xs font-medium text-foreground">{leLabel}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {leCos.map((c) => (
                            <span key={c.company_code} className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5">
                              <span className="font-mono text-xs font-medium">{c.company_code}</span>
                              <span className="text-xs text-muted-foreground">{c.company_name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Company codes are scoped by legal entity. Permissions are evaluated per{" "}
                  <code className="rounded bg-muted px-1 font-mono text-xs">company_code</code> at runtime.
                </p>
              </>
            )}

            {accessGrants.length > 0 && (
              <>
                <p className="mb-2.5 text-xs font-medium text-muted-foreground">Permission Resolution</p>
                <DataTable
                  columns={["Permission", "Effect", "Source", "Via", "Scope"]}
                  rows={accessGrants.map((a) => [
                    <span key="perm" className="font-mono text-xs">{str(a["permission_code"])}</span>,
                    <StatusBadge key="eff" status={str(a["effect"])}>{str(a["effect"])}</StatusBadge>,
                    <StatusBadge key="src" status={str(a["source_type"])}>{str(a["source_type"])}</StatusBadge>,
                    str(a["source_name"]),
                    a["scope"]
                      ? <StatusBadge key="scope" status={str(a["scope"])}>{str(a["scope"])}</StatusBadge>
                      : <span key="scope" className="text-muted-foreground">—</span>,
                  ])}
                />
                <p className="mt-2.5 text-xs text-muted-foreground">
                  This shows how each permission was resolved — whether from a group role, persona, delegation, or explicit grant.
                </p>
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Persona ── */}
        <TabsContent value="persona" className="mt-4">
          <SectionCard
            title="Active Persona"
            icon={UserCheck}
            managedBy={{ manager: "Tenant Admin / System", source: "master.principal_persona", editPath: "Contact your admin to change persona" }}
          >
            {persona ? (
              <>
                <InfoRow label="Name"        value={str(persona["persona_name"])} />
                <InfoRow label="Code"        value={str(persona["persona_code"])} mono copyable />
                <InfoRow label="Assigned By" value={str(persona["assigned_by"], "System")} />
                <InfoRow label="Assigned On" value={fmtDate(persona["created_at"])} />
                <InfoRow
                  label="Expires"
                  value={persona["expires_at"] ? fmtDate(persona["expires_at"]) : "Never"}
                  hint="After this date the persona becomes inactive"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Personas provide a temporary role overlay for special contexts.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No persona assigned.</p>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Groups & Roles ── */}
        <TabsContent value="groups" className="mt-4">
          <SectionCard
            title="Groups & Roles"
            icon={Users}
            managedBy={{
              manager:  "Group Admin",
              source:   "master.auth_group_member → auth_group → auth_group_role → shared.role",
              editPath: "Setup → Groups to manage membership",
            }}
          >
            {groups.length > 0 ? (
              groups.map((g) => (
                <div key={str(g["id"])} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{str(g["name"])}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{str(g["code"])}</span>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!!g["is_system"] && <Badge variant="info" className="text-xs">System</Badge>}
                      <Badge variant="outline" className="text-xs capitalize">{str(g["status"], "active")}</Badge>
                    </div>
                  </div>
                  {g.roles.length > 0 && (
                    <DataTable
                      columns={["Role", "Code", "Visibility", "Assignment Scope"]}
                      rows={g.roles.map((r) => [
                        r.role_name,
                        <span key="code" className="font-mono text-xs">{r.role_code}</span>,
                        <StatusBadge key="vis" status={r.visibility_scope}>{r.visibility_scope}</StatusBadge>,
                        <StatusBadge key="asc" status={r.assignment_scope_type}>{r.assignment_scope_type}</StatusBadge>,
                      ])}
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No group memberships found.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Group roles inherit <strong>all permissions</strong> attached to that role at the time of evaluation.
            </p>
          </SectionCard>
        </TabsContent>

        {/* ── Teams ── */}
        <TabsContent value="teams" className="mt-4">
          <SectionCard
            title="Teams"
            icon={Layers}
            managedBy={{ manager: "Team Lead / HR", source: "master.team_member → master.team", editPath: "Setup → Teams to manage membership" }}
          >
            {teams.length > 0 ? (
              <>
                <DataTable
                  columns={["Team", "Code", "Type", "Your Role", "Leader", "Since"]}
                  rows={teams.map((t) => [
                    str(t["name"]),
                    <span key="code" className="font-mono text-xs">{str(t["code"])}</span>,
                    <StatusBadge key="type" status={str(t["team_type"], "functional")}>{str(t["team_type"], "functional")}</StatusBadge>,
                    <StatusBadge key="role" status={str(t["role_in_team"], "member")}>{str(t["role_in_team"], "member")}</StatusBadge>,
                    str(t["leader_name"]),
                    fmtDate(t["effective_from"]),
                  ])}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Types: <strong>functional</strong> (org unit), <strong>project</strong> (time-boxed),{" "}
                  <strong>virtual</strong> (cross-functional).
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No team memberships found.</p>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Delegations ── */}
        <TabsContent value="delegations" className="mt-4">
          <DelegationsTab />
        </TabsContent>

        {/* ── Feature Grants ── */}
        {showFeatures && (
          <TabsContent value="features" className="mt-4">
            <SectionCard
              title="Feature Access"
              icon={Sparkles}
              managedBy={{
                manager:  "Platform / Tenant Admin",
                source:   "master.principal_feature_grant, master.group_feature_grant, master.tenant_feature_entitlement",
                editPath: "Contact Platform Admin for changes",
              }}
            >
              <DataTable
                columns={["Feature", "Access", "Source", "Via", "Expires", "Contact"]}
                rows={features.map((f) => [
                  str(f["feature_name"]),
                  <StatusBadge key="acc" status={str(f["access_type"], "view")}>{str(f["access_type"])}</StatusBadge>,
                  <StatusBadge key="src" status={str(f["source"])}>{str(f["source"])}</StatusBadge>,
                  str(f["source_name"]),
                  f["expires_at"] ? fmtDate(f["expires_at"]) : "—",
                  str(f["source"]) === "plan"  ? "Subscription team" :
                  str(f["source"]) === "group" ? "Group Admin"        : "Tenant Admin",
                ])}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Source:{" "}
                <Badge variant="success" className="text-xs">plan</Badge> = subscription tier,{" "}
                <Badge variant="secondary" className="text-xs">group</Badge> = group entitlement,{" "}
                <Badge variant="secondary" className="text-xs">principal</Badge> = direct grant.
              </p>
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
