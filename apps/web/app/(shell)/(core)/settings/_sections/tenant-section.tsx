"use client";

import { Building2, ExternalLink, Globe, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "@/components/settings/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantAdminData {
  tenant:              Record<string, unknown> | null;
  tenant_profile:      Record<string, unknown> | null;
  modules:             Record<string, unknown>[];
  features:            Record<string, unknown>[];
  permission_overrides: Record<string, unknown>[];
}

// ─── TenantSection ─────────────────────────────────────────────────────────────

export function TenantSection({ active }: { active: boolean }) {
  const { data, loading, error } = useSectionData<TenantAdminData>(active, "/api/user/tenant-admin");

  if (loading) {
    return (
      <div className="w-full">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (error) {
    const isPermission = error.includes("TENANT_ADMIN_REQUIRED") || error.includes("403");
    return (
      <div className="w-full">
        <Banner variant="warn">
          {isPermission ? (
            <>
              You do not have tenant administration privileges. This section requires membership
              in the <strong>Tenant Administrators</strong> group.
            </>
          ) : (
            <>
              Could not load tenant data —{" "}
              <code className="font-mono text-2xs">{error}</code>.{" "}
              Ensure the runtime service is running and try refreshing.
            </>
          )}
        </Banner>
      </div>
    );
  }

  const t  = data?.tenant;
  const tp = data?.tenant_profile;

  return (
    <div className="w-full">
      <Banner variant="warn">
        Tenant settings are <strong>view-only</strong> in this panel. Full configuration is managed
        through <strong>Mesh Tenant Studio</strong>.
      </Banner>

      {/* ── Tenant ── */}
      <SectionCard
        title="Tenant"
        icon={Building2}
        managedBy={{
          manager:  "Platform / Mesh Tenant Studio",
          source:   "master.tenant",
          editPath: "Changes via Mesh Tenant Studio only",
        }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Tenant Code"  value={str(t?.["code"])}         mono copyable hint="Immutable identifier for this tenant" />
            <InfoRow label="Name"         value={str(t?.["name"])} />
            <InfoRow label="Display Name" value={str(t?.["display_name"])} />
          </div>
          <div>
            <InfoRow label="Realm"        value={str(t?.["realm_key"])} mono hint="Keycloak realm key" />
            <InfoRow label="Region"       value={str(t?.["region"])} />
            <InfoRow
              label="Subscription"
              value={<StatusBadge status={str(t?.["subscription"], "starter")}>{str(t?.["subscription"], "starter")}</StatusBadge>}
            />
            <InfoRow
              label="Status"
              value={<StatusBadge status={str(t?.["status"], "active")}>{str(t?.["status"], "active")}</StatusBadge>}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Tenant Profile ── */}
      <SectionCard
        title="Tenant Profile"
        icon={Globe}
        managedBy={{
          manager:  "Tenant Admin",
          source:   "master.tenant_profile",
          editPath: "Default locale, currency and fiscal settings for all principals",
        }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Country"            value={str(tp?.["country_code"])}           hint="ISO 3166-1 alpha-2" />
            <InfoRow label="Currency"           value={str(tp?.["currency_code"])}           hint="ISO 4217 transaction currency" />
            <InfoRow label="Reporting Currency" value={str(tp?.["reporting_currency_code"])} hint="Consolidated reporting currency" />
            <InfoRow label="Locale"             value={str(tp?.["locale_code"])}             hint="BCP-47 default locale" />
          </div>
          <div>
            <InfoRow label="Timezone"          value={str(tp?.["timezone_code"])} />
            <InfoRow
              label="Fiscal Year Start"
              value={tp?.["fiscal_year_start_month"] ? `Month ${tp["fiscal_year_start_month"]}` : "—"}
              hint="Month number (1 = January)"
            />
            <InfoRow label="Date Format"  value={str(tp?.["date_format"])} mono />
            <InfoRow label="Week Start"   value={str(tp?.["week_start"])}  hint="0 = Sunday, 1 = Monday" />
          </div>
        </div>
      </SectionCard>

      {/* ── Module Subscriptions ── */}
      <SectionCard
        title="Module Subscriptions"
        icon={Layers}
        badge={
          <Badge variant="secondary" className="text-2xs">
            {data?.modules.length ?? 0} modules
          </Badge>
        }
        managedBy={{
          manager: "Platform / Tenant Admin",
          source:  "master.tenant_module_subscription",
        }}
      >
        {(data?.modules ?? []).length > 0 ? (
          <DataTable
            columns={["Module", "Code", "Status", "Subscribed"]}
            rows={(data?.modules ?? []).map((m) => [
              str(m["module_name"]),
              <span key="code" className="font-mono text-2xs">{str(m["module_code"])}</span>,
              <StatusBadge key="status" status={str(m["status"])}>{str(m["status"])}</StatusBadge>,
              fmtDate(m["subscribed_at"]),
            ])}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No module subscriptions found.</p>
        )}
      </SectionCard>

      {/* ── Feature Entitlements (only if present) ── */}
      {(data?.features ?? []).length > 0 && (
        <SectionCard
          title="Feature Entitlements"
          icon={Sparkles}
          managedBy={{
            manager: "Platform",
            source:  "master.tenant_feature_entitlement",
          }}
        >
          <DataTable
            columns={["Feature ID", "Status", "Expires"]}
            rows={(data?.features ?? []).map((f) => [
              <span key="id" className="font-mono text-2xs">{str(f["feature_id"])}</span>,
              <StatusBadge key="status" status={str(f["status"])}>{str(f["status"])}</StatusBadge>,
              fmtDate(f["expires_at"]),
            ])}
          />
        </SectionCard>
      )}

      {/* ── Permission Overrides (only if present) ── */}
      {(data?.permission_overrides ?? []).length > 0 && (
        <SectionCard
          title="Permission Overrides"
          icon={ShieldCheck}
          managedBy={{
            manager:  "Platform Support",
            source:   "master.tenant_permission_override",
            editPath: "Contact Platform Support to modify",
          }}
        >
          <DataTable
            columns={["Permission", "Effect", "Reason", "Expires"]}
            rows={(data?.permission_overrides ?? []).map((o) => [
              <span key="id" className="font-mono text-2xs">{str(o["permission_id"])}</span>,
              <StatusBadge key="effect" status={o["is_granted"] ? "allow" : "deny"}>
                {o["is_granted"] ? "Granted" : "Denied"}
              </StatusBadge>,
              str(o["reason"]),
              fmtDate(o["expires_at"]),
            ])}
          />
          <p className="mt-2 text-2xs text-muted-foreground">
            Platform-level overrides take precedence over tenant and group role assignments.
          </p>
        </SectionCard>
      )}

      <div className="mt-2 flex justify-center">
        <Button variant="outline" className="gap-2 text-sm">
          <ExternalLink className="h-4 w-4" /> Open Mesh Tenant Studio
        </Button>
      </div>
    </div>
  );
}
