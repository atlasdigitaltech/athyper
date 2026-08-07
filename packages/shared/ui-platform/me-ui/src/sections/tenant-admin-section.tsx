"use client";

import { Building2, ExternalLink, Globe, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button } from "@athyper/platform-ui/primitives";
import type { AdminTenant } from "@athyper/api-contracts/me";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "../_shared";

/**
 * Admin-gated tenant configuration view sourced from /api/admin/tenant by
 * default. Returns 403 TENANT_ADMIN_REQUIRED to non-admins; this section
 * surfaces a friendly banner in that case.
 *
 * The companion principal-centric view (no admin gate) is <TenantContextSection>.
 *
 * URL injection
 * ─────────────
 * `url` overrides the default endpoint. Useful when a plane's BFF admin
 * namespace differs from the canonical `/api/admin/tenant`, or for tests.
 * The response shape must match `AdminTenant`.
 */
export interface TenantAdminSectionProps {
  active: boolean;
  /** Defaults to `/api/admin/tenant`. */
  url?: string;
}

const DEFAULT_TENANT_ADMIN_URL = "/api/admin/tenant";

export function TenantAdminSection({ active, url = DEFAULT_TENANT_ADMIN_URL }: TenantAdminSectionProps) {
  const { data, loading, error } = useSectionData<AdminTenant>(active, url);

  if (loading) {
    return <div className="w-full"><SkeletonCard lines={4} /><SkeletonCard lines={5} /><SkeletonCard lines={4} /></div>;
  }

  if (error) {
    const isPermission = error.includes("TENANT_ADMIN_REQUIRED") || error.includes("403");
    return (
      <div className="w-full">
        <Banner variant="warn">
          {isPermission
            ? <><strong>Permission required.</strong> Tenant Administration is only visible to users with the TENANT_ADMIN role. Contact your administrator to request access.</>
            : <>Could not load tenant data: {error}</>}
        </Banner>
      </div>
    );
  }

  const t  = data?.tenant ?? null;
  const tp = data?.tenant_profile ?? null;
  const modules = data?.modules ?? [];
  const features = data?.features ?? [];
  const overrides = data?.permission_overrides ?? [];

  return (
    <div className="w-full">
      <Banner variant="warn">
        <strong>View only.</strong> Tenant configuration is managed by Tenant Admins. Contact your administrator to request changes.
      </Banner>

      <SectionCard
        title="Tenant"
        icon={Building2}
        managedBy={{ manager: "Platform Admin", source: "master.tenant", editPath: "Admin Studio → Tenant settings" }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Code"         value={str(t?.code)} mono copyable hint="Unique tenant slug" />
            <InfoRow label="Name"         value={str(t?.name)} />
            <InfoRow label="Display Name" value={str(t?.display_name)} />
          </div>
          <div>
            <InfoRow label="Realm"        value={str(t?.realm_key)} mono hint="Keycloak realm" />
            <InfoRow label="Region"       value={str(t?.region)} />
            <InfoRow label="Subscription" value={<StatusBadge status={str(t?.subscription, "starter")}>{str(t?.subscription, "starter")}</StatusBadge>} />
            <InfoRow label="Status"       value={<StatusBadge status={str(t?.status, "active")}>{str(t?.status, "active")}</StatusBadge>} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Tenant Profile"
        icon={Globe}
        managedBy={{ manager: "Tenant Admin", source: "master.tenant_profile", editPath: "Setup → Tenant Configuration" }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Country"            value={str(tp?.country_code)}            hint="Primary country of operation" />
            <InfoRow label="Currency"           value={str(tp?.currency_code)}           hint="Functional currency" />
            <InfoRow label="Reporting Currency" value={str(tp?.reporting_currency_code)} hint="Group reporting currency" />
            <InfoRow label="Locale"             value={str(tp?.locale_code)}             hint="Default locale for all users" />
          </div>
          <div>
            <InfoRow label="Timezone"           value={str(tp?.timezone_code)} />
            <InfoRow label="Fiscal Year Start"  value={tp?.fiscal_year_start_month != null ? `Month ${String(tp.fiscal_year_start_month)}` : "—"} hint="Month number of fiscal year start" />
            <InfoRow label="Date Format"        value={str(tp?.date_format)} mono />
            <InfoRow label="Week Start"         value={str(tp?.week_start)} hint="0 = Sunday, 1 = Monday" />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Module Subscriptions"
        icon={Layers}
        badge={<Badge variant="secondary" className="text-xs">{modules.length} modules</Badge>}
        managedBy={{ manager: "Platform / Tenant Admin", source: "master.tenant_module_subscription" }}
      >
        {modules.length > 0 ? (
          <DataTable
            columns={["Module", "Code", "Status", "Subscribed"]}
            rows={modules.map((m) => [
              str(m.module_name),
              <span key="code" className="font-mono text-xs">{str(m.module_code)}</span>,
              <StatusBadge key="status" status={str(m.status)}>{str(m.status)}</StatusBadge>,
              fmtDate(m.subscribed_at),
            ])}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No module subscriptions found.</p>
        )}
      </SectionCard>

      {features.length > 0 && (
        <SectionCard
          title="Feature Entitlements"
          icon={Sparkles}
          managedBy={{ manager: "Platform Admin", source: "master.tenant_feature_entitlement" }}
        >
          <DataTable
            columns={["Feature ID", "Status", "Expires"]}
            rows={features.map((f) => [
              <span key="id" className="font-mono text-xs">{str(f.feature_id)}</span>,
              <StatusBadge key="status" status={str(f.status)}>{str(f.status)}</StatusBadge>,
              fmtDate(f.expires_at),
            ])}
          />
        </SectionCard>
      )}

      {overrides.length > 0 && (
        <SectionCard
          title="Permission Overrides"
          icon={ShieldCheck}
          managedBy={{ manager: "Platform Admin", source: "master.tenant_permission_override", editPath: "Contact Platform Admin" }}
        >
          <DataTable
            columns={["Permission", "Effect", "Reason", "Expires"]}
            rows={overrides.map((o) => [
              <span key="id" className="font-mono text-xs">{str(o.permission_id)}</span>,
              <StatusBadge key="effect" status={o.is_granted ? "allow" : "deny"}>{o.is_granted ? "Granted" : "Denied"}</StatusBadge>,
              str(o.reason),
              fmtDate(o.expires_at),
            ])}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            These overrides take precedence over module-level permission defaults.
          </p>
        </SectionCard>
      )}

      <div className="mt-2 flex justify-center">
        <Button variant="outline" className="gap-2 text-sm">
          <ExternalLink className="h-4 w-4" /> Open Admin Studio
        </Button>
      </div>
    </div>
  );
}
