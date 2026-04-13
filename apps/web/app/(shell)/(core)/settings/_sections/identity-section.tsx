"use client";

import { Layers, RefreshCw, ShieldCheck, Sparkles, UserCheck, Users } from "lucide-react";
import { Badge } from "@athyper/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "@/components/settings/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupRole { role_code: string; role_name: string; scope: string; company_code_id?: string | null; }
interface GroupEntry extends Record<string, unknown> { roles: GroupRole[]; }

interface IdentityData {
  persona:               Record<string, unknown> | null;
  groups:                GroupEntry[];
  teams:                 Record<string, unknown>[];
  delegations_received:  Record<string, unknown>[];
  delegations_given:     Record<string, unknown>[];
  feature_grants?:       Record<string, unknown>[];   // optional — added when runtime returns it
  access_grants?:        Record<string, unknown>[];   // optional — permission resolution sample
}

// ─── IdentitySection ──────────────────────────────────────────────────────────

export function IdentitySection({ active }: { active: boolean }) {
  const { data, loading, error } = useSectionData<IdentityData>(active, "/api/user/identity");

  if (loading) return (
    <div className="w-full">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={4} />
    </div>
  );

  if (error) return (
    <div className="w-full">
      <Banner variant="warn">
        Could not load identity data —{" "}
        <code className="font-mono text-2xs">{error}</code>. Ensure the
        runtime service is running and your session is active.
      </Banner>
    </div>
  );

  const persona   = data?.persona as Record<string, unknown> | undefined;
  const groups    = data?.groups ?? [];
  const teams     = data?.teams ?? [];
  const received  = data?.delegations_received ?? [];
  const given     = data?.delegations_given ?? [];
  const features  = data?.feature_grants ?? [];
  const accessGrants = data?.access_grants ?? [];

  // Determine available tabs — Feature Grants tab only if API returns data
  const showFeatures = features.length > 0;

  return (
    <div className="w-full">
      <Banner>
        Read-only transparency view — identity and access are managed by your
        tenant administrator and the RBAC engine. You can see{" "}
        <strong>what</strong> access you have and <strong>why</strong>.
      </Banner>

      <Tabs defaultValue="summary">
        <TabsList className="mb-4 h-auto flex-wrap gap-1 bg-muted p-1">
          <TabsTrigger value="summary"     className="text-xs">Effective Access</TabsTrigger>
          <TabsTrigger value="persona"     className="text-xs">Persona</TabsTrigger>
          <TabsTrigger value="groups"      className="text-xs">Groups & Roles</TabsTrigger>
          <TabsTrigger value="teams"       className="text-xs">Teams</TabsTrigger>
          <TabsTrigger value="delegations" className="text-xs">Delegations</TabsTrigger>
          {showFeatures && (
            <TabsTrigger value="features" className="text-xs">Feature Grants</TabsTrigger>
          )}
        </TabsList>

        {/* ── Effective Access ── */}
        <TabsContent value="summary">
          <SectionCard
            title="Effective Access Summary"
            icon={ShieldCheck}
            managedBy={{
              manager:  "RBAC Engine",
              source:   "Runtime: check_permission → derive_effective_roles → access_grant evaluation",
              editPath: "Contact tenant admin",
            }}
          >
            {/* Summary cards */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Current Persona",       value: persona ? str(persona["persona_name"]) : "None" },
                { label: "Active Groups",          value: `${groups.length} group${groups.length !== 1 ? "s" : ""}` },
                { label: "Delegations Received",   value: String(received.length) },
                { label: "Explicit Denials",       value: String(accessGrants.filter((a) => str(a["effect"]) === "deny").length) },
              ].map((card) => (
                <div key={card.label} className="rounded-md bg-muted p-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Permission resolution table (only if runtime returns it) */}
            {accessGrants.length > 0 && (
              <>
                <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Permission Resolution Sample
                </p>
                <DataTable
                  columns={["Permission", "Effect", "Source", "Via", "Scope"]}
                  rows={accessGrants.map((a) => [
                    <span key="perm" className="font-mono text-2xs">{str(a["permission_code"])}</span>,
                    <StatusBadge key="eff" status={str(a["effect"])}>{str(a["effect"])}</StatusBadge>,
                    <StatusBadge key="src" status={str(a["source_type"])}>{str(a["source_type"])}</StatusBadge>,
                    str(a["source_name"]),
                    a["scope"]
                      ? <StatusBadge key="scope" status={str(a["scope"])}>{str(a["scope"])}</StatusBadge>
                      : <span key="scope" className="text-muted-foreground">—</span>,
                  ])}
                />
                <p className="mt-2.5 text-2xs text-muted-foreground">
                  Resolution order: Plan gate → Persona permissions → Group roles (scoped) →
                  Access grants (allow) → Access grants (deny wins). Deny always beats allow (SoD).
                </p>
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Persona ── */}
        <TabsContent value="persona">
          <SectionCard
            title="Principal Persona"
            icon={UserCheck}
            managedBy={{
              manager:  "Tenant Admin",
              source:   "master.principal_persona",
              editPath: "Admin assignment only — one per principal per tenant",
            }}
          >
            {persona ? (
              <>
                <InfoRow label="Persona"     value={str(persona["persona_name"])} />
                <InfoRow label="Code"        value={str(persona["persona_code"])} mono copyable />
                <InfoRow label="Assigned By" value={str(persona["assigned_by"], "System")} />
                <InfoRow label="Assigned On" value={fmtDate(persona["created_at"])} />
                <InfoRow
                  label="Expires"
                  value={persona["expires_at"] ? fmtDate(persona["expires_at"]) : "Never"}
                  hint="Open-ended if no expiry set"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  One persona per principal per tenant — enforced at DB level. The persona
                  determines the base permission set. Additional permissions come from group
                  roles, direct grants, and delegations.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No persona assigned.</p>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Groups & Roles ── */}
        <TabsContent value="groups">
          <SectionCard
            title="Group Memberships & Roles"
            icon={Users}
            managedBy={{
              manager:  "Tenant Admin",
              source:   "master.group_member → principal_group → group_role → shared.role",
              editPath: "Admin or self-service (if group is eligible)",
            }}
          >
            {groups.length > 0 ? (
              groups.map((g) => (
                <div key={str(g["id"])} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {str(g["name"])}
                      </span>
                      <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                        {str(g["code"])}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {g["is_system"] && (
                        <Badge variant="info" className="text-2xs">System</Badge>
                      )}
                      <Badge variant="outline" className="text-2xs capitalize">
                        {str(g["status"], "active")}
                      </Badge>
                    </div>
                  </div>
                  {g.roles.length > 0 && (
                    <DataTable
                      columns={["Role", "Code", "Scope", "Company"]}
                      rows={g.roles.map((r) => [
                        r.role_name,
                        <span key="code" className="font-mono text-2xs">{r.role_code}</span>,
                        <StatusBadge key="scope" status={r.scope}>{r.scope}</StatusBadge>,
                        r.company_code_id ?? (
                          <span key="co" className="text-muted-foreground">All companies</span>
                        ),
                      ])}
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                Not a member of any groups.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Scope: <strong>all</strong> = unrestricted ·{" "}
              <strong>own</strong> = records you created ·{" "}
              <strong>team</strong> = your team&apos;s records. Company code optionally
              restricts scope further.
            </p>
          </SectionCard>
        </TabsContent>

        {/* ── Teams ── */}
        <TabsContent value="teams">
          <SectionCard
            title="Team Memberships"
            icon={Layers}
            managedBy={{
              manager:  "Team Leader / Tenant Admin",
              source:   "master.team_principal → master.team",
              editPath: "Admin or team leader assignment",
            }}
          >
            {teams.length > 0 ? (
              <>
                <DataTable
                  columns={["Team", "Code", "Type", "Your Role", "Leader", "Since"]}
                  rows={teams.map((t) => [
                    str(t["name"]),
                    <span key="code" className="font-mono text-2xs">{str(t["code"])}</span>,
                    <StatusBadge key="type" status={str(t["team_type"], "functional")}>
                      {str(t["team_type"], "functional")}
                    </StatusBadge>,
                    <StatusBadge key="role" status={str(t["role_in_team"], "member")}>
                      {str(t["role_in_team"], "member")}
                    </StatusBadge>,
                    str(t["leader_name"]),
                    fmtDate(t["effective_from"]),
                  ])}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Types: <strong>functional</strong> (permanent) ·{" "}
                  <strong>project</strong> (time-bound) ·{" "}
                  <strong>virtual</strong> (cross-functional). Teams resolve{" "}
                  <code className="rounded bg-muted px-1 font-mono text-2xs">scope=team</code>{" "}
                  permission checks.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not a member of any teams.
              </p>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Delegations ── */}
        <TabsContent value="delegations">
          {/* Received */}
          <SectionCard
            title="Delegations Received"
            icon={RefreshCw}
            badge={<Badge variant="warning" className="text-2xs">{received.length} active</Badge>}
            managedBy={{
              manager:  "Delegator",
              source:   "master.delegation_grant (delegate_id = you)",
              editPath: "Granted to you by another principal",
            }}
          >
            {received.length > 0 ? (
              received.map((d) => (
                <div key={str(d["id"])} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      From: {str(d["delegator_name"] ?? d["delegator_id"])}
                    </span>
                    <StatusBadge status={d["is_revoked"] ? "suspended" : "active"}>
                      {d["is_revoked"] ? "Revoked" : "Active"}
                    </StatusBadge>
                  </div>
                  <InfoRow label="Scope Type"   value={str(d["scope_type"])} hint="task | entity | workflow | module | company_code" />
                  <InfoRow label="Scope Ref"    value={str(d["scope_ref"])} mono hint="Qualifier: module code, task ID, etc." />
                  <InfoRow label="Reason"       value={str(d["reason"])} />
                  <InfoRow label="Expires"      value={fmtDate(d["expires_at"])} hint="Mandatory expiry — open-ended delegation is not permitted" />
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No delegations received.</p>
            )}
          </SectionCard>

          {/* Given */}
          <SectionCard
            title="Delegations Given"
            icon={RefreshCw}
            badge={<Badge variant="warning" className="text-2xs">{given.length} active</Badge>}
            managedBy={{
              manager:  "You",
              source:   "master.delegation_grant (delegator_id = you)",
              editPath: "You can revoke active delegations",
            }}
          >
            {given.length > 0 ? (
              given.map((d) => (
                <div key={str(d["id"])} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      To: {str(d["delegate_name"] ?? d["delegate_id"])}
                    </span>
                    <StatusBadge status={d["is_revoked"] ? "suspended" : "active"}>
                      {d["is_revoked"] ? "Revoked" : "Active"}
                    </StatusBadge>
                  </div>
                  <InfoRow label="Scope"   value={`${str(d["scope_type"])}: ${str(d["scope_ref"])}`} />
                  <InfoRow label="Reason"  value={str(d["reason"])} />
                  <InfoRow label="Expires" value={fmtDate(d["expires_at"])} />
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No delegations given.</p>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── Feature Grants (optional — only when API returns it) ── */}
        {showFeatures && (
          <TabsContent value="features">
            <SectionCard
              title="Feature Access Grants"
              icon={Sparkles}
              managedBy={{
                manager:  "Tenant Admin / Plan",
                source:   "master.principal_feature_grant, master.group_feature_grant, master.tenant_feature_entitlement",
                editPath: "Admin-managed",
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
                  str(f["source"]) === "plan"  ? "Subscription" :
                  str(f["source"]) === "group" ? "Group admin"  : "Tenant admin",
                ])}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Feature access sources:{" "}
                <Badge variant="success" className="text-2xs">plan</Badge> included in subscription ·{" "}
                <Badge variant="secondary" className="text-2xs">group</Badge> via group membership ·{" "}
                <Badge variant="secondary" className="text-2xs">principal</Badge> direct individual grant.
              </p>
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
