"use client";

import { Layers, RefreshCw, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Badge } from "@athyper/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";
import type {
  MeIdentity,
  MeIdentityAccessibleCompany,
  MeIdentityDelegation,
} from "@athyper/api-contracts/me";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "../_shared";
import { DelegationsMutationTab } from "../delegations/DelegationsMutationTab";

export interface IdentitySectionProps {
  active: boolean;
  /**
   * When true, the Delegations tab renders the full self-service mutation
   * flow (grant + revoke, gated by MFA step-up) via /api/iam/delegations/my.
   * When false (default), the tab is a read-only list of delegations received
   * sourced from /api/me/identity.
   *
   * Opt-in because mutations require a wired @tanstack/react-query
   * QueryClientProvider in the host app's tree.
   */
  enableDelegationMutations?: boolean;
}

/**
 * Identity view sourced from the canonical /api/me/identity contract. Renders
 * the principal's persona, groups, teams, accessible companies, and
 * delegations.
 */
export function IdentitySection({ active, enableDelegationMutations = false }: IdentitySectionProps) {
  const { data, loading, error } = useSectionData<MeIdentity>(active, "/api/me/identity");

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

  const persona  = data?.persona ?? null;
  const groups   = data?.groups ?? [];
  const teams    = data?.teams ?? [];
  const received = data?.delegations_received ?? [];
  const companies = data?.accessible_companies ?? [];

  const legalEntityCount = new Set(companies.map((c) => c.legal_entity_code).filter(Boolean)).size;
  const companiesByLE = companies.reduce<Record<string, MeIdentityAccessibleCompany[]>>((acc, c) => {
    const key = c.legal_entity_code ?? "—";
    (acc[key] ??= []).push(c);
    return acc;
  }, {});

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
        </TabsList>

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
                { label: "Current Persona",       value: persona ? str(persona.persona_name) : "None" },
                { label: "Active Groups",          value: String(groups.length) },
                { label: "Delegations Received",   value: String(received.length) },
                { label: "Legal Entities",         value: companies.length === 0 ? "—" : String(legalEntityCount) },
                { label: "Company Codes",          value: companies.length === 0 ? "—" : String(companies.length) },
                { label: "Teams",                  value: String(teams.length) },
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
          </SectionCard>
        </TabsContent>

        <TabsContent value="persona" className="mt-4">
          <SectionCard
            title="Active Persona"
            icon={UserCheck}
            managedBy={{ manager: "Tenant Admin / System", source: "master.principal_persona", editPath: "Contact your admin to change persona" }}
          >
            {persona ? (
              <>
                <InfoRow label="Name"        value={str(persona.persona_name)} />
                <InfoRow label="Code"        value={str(persona.persona_code)} mono copyable />
                <InfoRow label="Assigned By" value={str(persona.assigned_by, "System")} />
                <InfoRow label="Assigned On" value={fmtDate(persona.created_at)} />
                <InfoRow
                  label="Expires"
                  value={persona.expires_at ? fmtDate(persona.expires_at) : "Never"}
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
                <div key={g.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{str(g.name)}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{str(g.code)}</span>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!!g.is_system && <Badge variant="info" className="text-xs">System</Badge>}
                      <Badge variant="outline" className="text-xs capitalize">{str(g.status, "active")}</Badge>
                    </div>
                  </div>
                  {g.roles.length > 0 && (
                    <DataTable
                      columns={["Role", "Code", "Visibility", "Assignment Scope"]}
                      rows={g.roles.map((r) => [
                        r.role_name,
                        <span key="code" className="font-mono text-xs">{r.role_code}</span>,
                        <StatusBadge key="vis" status={str(r.visibility_scope)}>{str(r.visibility_scope)}</StatusBadge>,
                        <StatusBadge key="asc" status={str(r.assignment_scope_type)}>{str(r.assignment_scope_type)}</StatusBadge>,
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

        <TabsContent value="teams" className="mt-4">
          <SectionCard
            title="Teams"
            icon={Layers}
            managedBy={{ manager: "Team Lead / HR", source: "master.team_member → master.team", editPath: "Setup → Teams to manage membership" }}
          >
            {teams.length > 0 ? (
              <DataTable
                columns={["Team", "Code", "Type", "Your Role", "Since"]}
                rows={teams.map((t) => [
                  str(t.name),
                  <span key="code" className="font-mono text-xs">{str(t.code)}</span>,
                  <StatusBadge key="type" status={str(t.team_type, "functional")}>{str(t.team_type, "functional")}</StatusBadge>,
                  <StatusBadge key="role" status={str(t.role_in_team, "member")}>{str(t.role_in_team, "member")}</StatusBadge>,
                  fmtDate(t.effective_from),
                ])}
              />
            ) : (
              <p className="text-xs text-muted-foreground">No team memberships found.</p>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="delegations" className="mt-4">
          {enableDelegationMutations ? (
            // Full self-service flow: list given + received, grant, revoke. Sources data
            // from /api/iam/delegations/my and gates mutations behind MFA step-up.
            <DelegationsMutationTab />
          ) : (
            <SectionCard
              title="Delegations Received"
              icon={RefreshCw}
              badge={<Badge variant="warning" className="text-xs">{received.filter((d) => !d.is_revoked).length} active</Badge>}
              managedBy={{ manager: "Delegators", source: "master.delegation_grant (delegate_id = you)", editPath: "Contact the delegator to modify or revoke" }}
            >
              {received.filter((d: MeIdentityDelegation) => !d.is_revoked).length > 0 ? (
                received.filter((d) => !d.is_revoked).map((d) => (
                  <div key={d.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">From: {str(d.delegator_name ?? d.delegator_id)}</span>
                      <StatusBadge status="active">Active</StatusBadge>
                    </div>
                    <InfoRow label="Scope Type" value={str(d.scope_type)} />
                    <InfoRow label="Scope Ref"  value={str(d.scope_ref)} mono />
                    <InfoRow label="Reason"     value={str(d.reason)} />
                    <InfoRow label="Expires"    value={fmtDate(d.expires_at)} hint="Delegation expires at this date" />
                    {d.permissions.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Delegated Permissions</p>
                        <div className="flex flex-wrap gap-1">
                          {d.permissions.map((p) => (
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
