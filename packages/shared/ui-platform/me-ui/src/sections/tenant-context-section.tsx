"use client";

import { Building2, Globe, Layers } from "lucide-react";
import { Badge } from "@athyper/platform-ui/primitives";
import type { MeTenantContext } from "@athyper/api-contracts/me";
import {
  InfoRow, SectionCard, Banner, SkeletonCard,
  useSectionData, str,
} from "../_shared";

/**
 * Principal-centric "where am I" view sourced from /api/me/tenant-context.
 *
 *   - active:          tenant/realm/workbench the request is operating in
 *   - memberships:     tenants this principal is bound to in the realm
 *                      (single-entry on neon, many on mesh)
 *   - enabled_modules: effective module codes the principal can see
 *
 * This is the non-admin companion to <TenantAdminSection>, which surfaces
 * the full tenant configuration behind a tenant_admin gate.
 */
export function TenantContextSection({ active }: { active: boolean }) {
  const { data, loading, error } = useSectionData<MeTenantContext>(active, "/api/me/tenant-context");

  if (loading) return (
    <div className="w-full">
      <SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={2} />
    </div>
  );

  if (error) return (
    <div className="w-full">
      <Banner variant="warn">Could not load tenant context: {error}</Banner>
    </div>
  );

  const activeTenant     = data?.active ?? null;
  const memberships      = data?.memberships ?? [];
  const enabledModules   = data?.enabled_modules ?? [];

  return (
    <div className="w-full">
      <SectionCard
        title="Active Context"
        icon={Building2}
        managedBy={{
          manager:  "Session",
          source:   "master.tenant + active session headers",
          editPath: "Switch tenant via the org switcher in the shell",
        }}
      >
        {activeTenant ? (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <InfoRow label="Tenant"    value={str(activeTenant.name)} />
              <InfoRow label="Code"      value={str(activeTenant.code)} mono copyable hint="Tenant slug" />
              <InfoRow label="Realm"     value={str(activeTenant.realm_key)} mono hint="Keycloak realm" />
            </div>
            <div>
              <InfoRow
                label="Workbench"
                value={
                  activeTenant.workbench
                    ? <Badge variant="info" className="text-xs">{activeTenant.workbench}</Badge>
                    : <span className="text-muted-foreground">—</span>
                }
              />
              <InfoRow
                label="Tenant ID"
                value={str(activeTenant.tenant_id)}
                mono
                hint="Internal UUID"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No active tenant in this session.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Tenant Memberships"
        icon={Globe}
        badge={<Badge variant="secondary" className="text-xs">{memberships.length} {memberships.length === 1 ? "tenant" : "tenants"}</Badge>}
        managedBy={{
          manager:  "IdP",
          source:   "master.principal_identity_binding (scoped to current realm)",
          editPath: "Contact your IdP admin to add or remove memberships",
        }}
      >
        {memberships.length > 0 ? (
          <div className="space-y-2">
            {memberships.map((m) => (
              <div
                key={m.tenant_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{str(m.name)}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{str(m.code)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">{str(m.realm_key)}</Badge>
                  {m.is_active && <Badge variant="success" className="text-xs">Active</Badge>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No memberships found in this realm.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Enabled Modules"
        icon={Layers}
        badge={<Badge variant="secondary" className="text-xs">{enabledModules.length} modules</Badge>}
        managedBy={{
          manager:  "Tenant Plan + Role Bindings",
          source:   "iam.getEffectiveModuleAccess(tenant, principal)",
          editPath: "Module access flows from plan subscription + group role bindings",
        }}
      >
        {enabledModules.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {enabledModules.map((code) => (
              <span
                key={code}
                className="inline-flex items-center rounded border border-border bg-background px-2 py-0.5 font-mono text-xs"
              >
                {code}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No modules are active for this principal in this tenant.</p>
        )}
      </SectionCard>
    </div>
  );
}
