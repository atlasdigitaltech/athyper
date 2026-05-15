"use client";

import { Building2, ExternalLink, Globe, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import {
  InfoRow, SectionCard, Banner, DataTable, SkeletonCard,
  StatusBadge, useSectionData, str, fmtDate,
} from "@/components/settings/shared";
import { useIntl, useFormatRich } from "@/components/providers/IntlProvider";

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
  const { formatMessage } = useIntl();
  const formatRich        = useFormatRich();
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
          {isPermission
            ? formatRich(
                { id: "settings.tenant.banner.noPermission" },
                { strong: (chunks) => <strong>{chunks}</strong> },
              )
            : formatMessage({ id: "settings.tenant.banner.loadFailed" }, { error })}
        </Banner>
      </div>
    );
  }

  const t  = data?.tenant;
  const tp = data?.tenant_profile;

  return (
    <div className="w-full">
      <Banner variant="warn">
        {formatRich(
          { id: "settings.tenant.banner.viewOnly" },
          { strong: (chunks) => <strong>{chunks}</strong> },
        )}
      </Banner>

      {/* ── Tenant ── */}
      <SectionCard
        title={formatMessage({ id: "settings.tenant.section.tenant" }) as string}
        icon={Building2}
        managedBy={{
          manager:  formatMessage({ id: "settings.tenant.section.tenant.managedBy" }) as string,
          source:   "master.tenant",
          editPath: formatMessage({ id: "settings.tenant.section.tenant.editPath" }) as string,
        }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label={formatMessage({ id: "settings.tenant.field.code" }) as string}  value={str(t?.["code"])}         mono copyable hint={formatMessage({ id: "settings.tenant.field.code.hint" }) as string} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.name" }) as string}         value={str(t?.["name"])} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.displayName" }) as string} value={str(t?.["display_name"])} />
          </div>
          <div>
            <InfoRow label={formatMessage({ id: "settings.tenant.field.realm" }) as string} value={str(t?.["realm_key"])} mono hint={formatMessage({ id: "settings.tenant.field.realm.hint" }) as string} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.region" }) as string} value={str(t?.["region"])} />
            <InfoRow
              label={formatMessage({ id: "settings.tenant.field.subscription" }) as string}
              value={<StatusBadge status={str(t?.["subscription"], "starter")}>{str(t?.["subscription"], "starter")}</StatusBadge>}
            />
            <InfoRow
              label={formatMessage({ id: "settings.tenant.field.status" }) as string}
              value={<StatusBadge status={str(t?.["status"], "active")}>{str(t?.["status"], "active")}</StatusBadge>}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Tenant Profile ── */}
      <SectionCard
        title={formatMessage({ id: "settings.tenant.section.profile" }) as string}
        icon={Globe}
        managedBy={{
          manager:  formatMessage({ id: "settings.tenant.section.profile.managedBy" }) as string,
          source:   "master.tenant_profile",
          editPath: formatMessage({ id: "settings.tenant.section.profile.editPath" }) as string,
        }}
      >
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label={formatMessage({ id: "settings.tenant.field.country" }) as string}            value={str(tp?.["country_code"])}           hint={formatMessage({ id: "settings.tenant.field.country.hint" }) as string} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.currency" }) as string}           value={str(tp?.["currency_code"])}           hint={formatMessage({ id: "settings.tenant.field.currency.hint" }) as string} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.reportingCurrency" }) as string} value={str(tp?.["reporting_currency_code"])} hint={formatMessage({ id: "settings.tenant.field.reportingCurrency.hint" }) as string} />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.locale" }) as string}             value={str(tp?.["locale_code"])}             hint={formatMessage({ id: "settings.tenant.field.locale.hint" }) as string} />
          </div>
          <div>
            <InfoRow label={formatMessage({ id: "settings.tenant.field.timezone" }) as string}          value={str(tp?.["timezone_code"])} />
            <InfoRow
              label={formatMessage({ id: "settings.tenant.field.fiscalYearStart" }) as string}
              value={tp?.["fiscal_year_start_month"] ? (formatMessage({ id: "settings.tenant.field.fiscalYearStart.value" }, { month: String(tp["fiscal_year_start_month"]) }) as string) : "—"}
              hint={formatMessage({ id: "settings.tenant.field.fiscalYearStart.hint" }) as string}
            />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.dateFormat" }) as string}  value={str(tp?.["date_format"])} mono />
            <InfoRow label={formatMessage({ id: "settings.tenant.field.weekStart" }) as string}   value={str(tp?.["week_start"])}  hint={formatMessage({ id: "settings.tenant.field.weekStart.hint" }) as string} />
          </div>
        </div>
      </SectionCard>

      {/* ── Module Subscriptions ── */}
      <SectionCard
        title={formatMessage({ id: "settings.tenant.section.modules" }) as string}
        icon={Layers}
        badge={
          <Badge variant="secondary" className="text-2xs">
            {formatMessage({ id: "settings.tenant.section.modules.badge" }, { count: data?.modules.length ?? 0 })}
          </Badge>
        }
        managedBy={{
          manager: formatMessage({ id: "settings.tenant.section.modules.managedBy" }) as string,
          source:  "master.tenant_module_subscription",
        }}
      >
        {(data?.modules ?? []).length > 0 ? (
          <DataTable
            columns={[
              formatMessage({ id: "settings.tenant.column.module" }) as string,
              formatMessage({ id: "settings.tenant.column.code" }) as string,
              formatMessage({ id: "settings.tenant.column.status" }) as string,
              formatMessage({ id: "settings.tenant.column.subscribed" }) as string,
            ]}
            rows={(data?.modules ?? []).map((m) => [
              str(m["module_name"]),
              <span key="code" className="font-mono text-2xs">{str(m["module_code"])}</span>,
              <StatusBadge key="status" status={str(m["status"])}>{str(m["status"])}</StatusBadge>,
              fmtDate(m["subscribed_at"]),
            ])}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.tenant.section.modules.empty" })}</p>
        )}
      </SectionCard>

      {/* ── Feature Entitlements (only if present) ── */}
      {(data?.features ?? []).length > 0 && (
        <SectionCard
          title={formatMessage({ id: "settings.tenant.section.features" }) as string}
          icon={Sparkles}
          managedBy={{
            manager: formatMessage({ id: "settings.tenant.section.features.managedBy" }) as string,
            source:  "master.tenant_feature_entitlement",
          }}
        >
          <DataTable
            columns={[
              formatMessage({ id: "settings.tenant.column.featureId" }) as string,
              formatMessage({ id: "settings.tenant.column.status" }) as string,
              formatMessage({ id: "settings.tenant.column.expires" }) as string,
            ]}
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
          title={formatMessage({ id: "settings.tenant.section.overrides" }) as string}
          icon={ShieldCheck}
          managedBy={{
            manager:  formatMessage({ id: "settings.tenant.section.overrides.managedBy" }) as string,
            source:   "master.tenant_permission_override",
            editPath: formatMessage({ id: "settings.tenant.section.overrides.editPath" }) as string,
          }}
        >
          <DataTable
            columns={[
              formatMessage({ id: "settings.tenant.column.permission" }) as string,
              formatMessage({ id: "settings.tenant.column.effect" }) as string,
              formatMessage({ id: "settings.tenant.column.reason" }) as string,
              formatMessage({ id: "settings.tenant.column.expires" }) as string,
            ]}
            rows={(data?.permission_overrides ?? []).map((o) => [
              <span key="id" className="font-mono text-2xs">{str(o["permission_id"])}</span>,
              <StatusBadge key="effect" status={o["is_granted"] ? "allow" : "deny"}>
                {formatMessage({ id: o["is_granted"] ? "settings.tenant.effect.granted" : "settings.tenant.effect.denied" })}
              </StatusBadge>,
              str(o["reason"]),
              fmtDate(o["expires_at"]),
            ])}
          />
          <p className="mt-2 text-2xs text-muted-foreground">
            {formatMessage({ id: "settings.tenant.overrides.note" })}
          </p>
        </SectionCard>
      )}

      <div className="mt-2 flex justify-center">
        <Button variant="outline" className="gap-2 text-sm">
          <ExternalLink className="h-4 w-4" /> {formatMessage({ id: "settings.tenant.openStudio" })}
        </Button>
      </div>
    </div>
  );
}
