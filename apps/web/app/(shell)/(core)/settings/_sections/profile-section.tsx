"use client";

import { CheckCircle2, Fingerprint, Key, User, Briefcase, Pencil } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@athyper/ui/primitives";
import { useShellSession } from "@/components/providers/SessionProvider";
import { useIntl } from "@/components/providers/IntlProvider";
import {
  InfoRow, SectionCard, Banner, SkeletonCard,
  useSectionData, str, fmtDate, fmtDateTime,
} from "@/components/settings/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  principal:     Record<string, unknown> | null;
  profile:       Record<string, unknown> | null;
  auth_bindings: Record<string, unknown>[];
}

// ─── ProfileSection ───────────────────────────────────────────────────────────

export function ProfileSection({ active }: { active: boolean }) {
  const { bff }                  = useShellSession();
  const { formatMessage }        = useIntl();
  const { data, loading, error } = useSectionData<ProfileData>(active, "/api/user/profile");

  const initials = bff.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  const p  = data?.principal;
  const pp = data?.profile;

  // Derive tenant display from org alias "tenantcode--entitycode"
  const [tenantCode, entityCode] = (bff.activeOrg ?? "").split("--");

  return (
    <div className="w-full">
      {error && (
        <Banner variant="warn">
          {formatMessage({ id: "settings.profile.error.loadFailed" }, { error })}
        </Banner>
      )}

      {/* ── Hero card ── */}
      <Card className="mb-4 w-full">
        <CardContent className="flex flex-wrap items-start gap-5 pt-5">
          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            {initials}
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight text-foreground">
              {bff.displayName}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {bff.email}
              <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="success" className="text-2xs">{formatMessage({ id: "settings.profile.badge.active" })}</Badge>
              <Badge variant="secondary" className="text-2xs capitalize">
                {str(p?.["principal_type"], "user")}
              </Badge>
              <Badge variant="outline" className="text-2xs capitalize">
                {str(p?.["principal_source"], "internal")}
              </Badge>
              {!!pp?.["employee_id"] && (
                <Badge variant="success" className="text-2xs">{formatMessage({ id: "settings.profile.badge.employeeLinked" })}</Badge>
              )}
            </div>
          </div>

          {/* Tenant context */}
          {bff.activeOrg && (
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span className="text-2xs text-muted-foreground">{formatMessage({ id: "settings.profile.tenant" })}</span>
              <span className="text-sm font-semibold text-foreground">
                {entityCode ?? tenantCode}
              </span>
              <span className="font-mono text-2xs text-muted-foreground">
                {tenantCode}/{entityCode ?? "—"}
              </span>
              <Badge variant="info" className="text-2xs">
                {str(bff.activeWorkbench, "user")}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </>
      ) : (
        <>
          {/* ── Account Identity ── */}
          <SectionCard
            title={formatMessage({ id: "settings.profile.section.identity" }) as string}
            icon={Fingerprint}
            managedBy={{
              manager:  formatMessage({ id: "settings.profile.section.identity.managedBy" }) as string,
              source:   "master.principal",
              editPath: formatMessage({ id: "settings.profile.section.identity.editPath" }) as string,
            }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label={formatMessage({ id: "settings.profile.field.code" }) as string}        value={str(p?.["code"])}  mono copyable hint={formatMessage({ id: "settings.profile.field.code.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.loginEmail" }) as string} value={bff.email}         verified hint={formatMessage({ id: "settings.profile.field.loginEmail.hint" }) as string} />
              </div>
              <div>
                <InfoRow label={formatMessage({ id: "settings.profile.field.type" }) as string}          value={str(p?.["principal_type"], "user")}     hint={formatMessage({ id: "settings.profile.field.type.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.source" }) as string}        value={str(p?.["principal_source"], "internal")} hint={formatMessage({ id: "settings.profile.field.source.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.created" }) as string}       value={fmtDate(p?.["created_at"])} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.enabled" }) as string}       value={fmtDate(pp?.["enabled_date"])} />
              </div>
            </div>
          </SectionCard>

          {/* ── Display Profile ── */}
          <SectionCard
            title={formatMessage({ id: "settings.profile.section.display" }) as string}
            icon={User}
            badge={
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                <Pencil className="h-3 w-3" /> {formatMessage({ id: "settings.profile.requestChange" })}
              </Button>
            }
            managedBy={{
              manager:     formatMessage({ id: "settings.profile.section.display.managedBy" }) as string,
              source:      "master.principal_profile",
              lastUpdated: pp?.["updated_at"] as string | undefined,
              editPath:    formatMessage({ id: "settings.profile.section.display.editPath" }) as string,
            }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label={formatMessage({ id: "settings.profile.field.givenName" }) as string}     value={str(pp?.["given_name"])}     hint={formatMessage({ id: "settings.profile.field.givenName.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.familyName" }) as string}    value={str(pp?.["family_name"])}    hint={formatMessage({ id: "settings.profile.field.familyName.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.preferredName" }) as string} value={str(pp?.["preferred_name"])} hint={formatMessage({ id: "settings.profile.field.preferredName.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.displayName" }) as string}   value={str(pp?.["display_name"])}   hint={formatMessage({ id: "settings.profile.field.displayName.hint" }) as string} />
              </div>
              <div>
                <InfoRow label={formatMessage({ id: "settings.profile.field.locale" }) as string}          value={str(pp?.["locale"])}                   hint={formatMessage({ id: "settings.profile.field.locale.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.timezone" }) as string}        value={str(pp?.["timezone"])}                  hint={formatMessage({ id: "settings.profile.field.timezone.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.defaultCompany" }) as string} value={str(pp?.["default_company_code_id"])}   mono hint={formatMessage({ id: "settings.profile.field.defaultCompany.hint" }) as string} />
                <InfoRow label={formatMessage({ id: "settings.profile.field.defaultCostCenter" }) as string} value={str(pp?.["default_cost_center_id"])} mono hint={formatMessage({ id: "settings.profile.field.defaultCostCenter.hint" }) as string} />
              </div>
            </div>
          </SectionCard>

          {/* ── Work Profile (if employee linked) ── */}
          {pp?.["employee_id"] && (
            <SectionCard
              title={formatMessage({ id: "settings.profile.section.work" }) as string}
              icon={Briefcase}
              badge={
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                  <Pencil className="h-3 w-3" /> {formatMessage({ id: "settings.profile.requestChange" })}
                </Button>
              }
              managedBy={{
                manager:  formatMessage({ id: "settings.profile.section.work.managedBy" }) as string,
                source:   "master.employee → principal_profile.employee_id",
                editPath: formatMessage({ id: "settings.profile.section.work.editPath" }) as string,
              }}
            >
              <InfoRow label={formatMessage({ id: "settings.profile.field.employeeId" }) as string} value={str(pp?.["employee_id"])} mono copyable />
              <InfoRow label={formatMessage({ id: "settings.profile.field.defaultProject" }) as string}      value={str(pp?.["default_project_id"])}      mono />
              <InfoRow label={formatMessage({ id: "settings.profile.field.defaultProfitCenter" }) as string} value={str(pp?.["default_profit_center_id"])} mono />
            </SectionCard>
          )}

          {/* ── Identity Provider Binding ── */}
          {(data?.auth_bindings ?? []).length > 0 && (
            <SectionCard
              title={formatMessage({ id: "settings.profile.section.idp" }) as string}
              icon={Key}
              managedBy={{
                manager:  formatMessage({ id: "settings.profile.section.idp.managedBy" }) as string,
                source:   "master.principal_identity_binding",
                editPath: formatMessage({ id: "settings.profile.section.idp.editPath" }) as string,
              }}
            >
              {(data?.auth_bindings ?? []).map((ab, i) => {
                const syncStatus = str(ab["keycloak_sync_status"] ?? ab["sync_status"], "pending");
                const syncVariant =
                  syncStatus === "synced" ? "success"
                  : syncStatus === "error" ? "destructive"
                  : syncStatus === "drift" ? "warning"
                  : "info";

                const providerVariant = ab["idp_enabled"] !== false ? "secondary" : "outline";

                const requiredActions = Array.isArray(ab["keycloak_required_actions"])
                  ? (ab["keycloak_required_actions"] as string[])
                  : [];

                const syncHintId =
                  syncStatus === "synced"  ? "settings.profile.syncStatus.synced" :
                  syncStatus === "drift"   ? "settings.profile.syncStatus.drift" :
                  syncStatus === "pending" ? "settings.profile.syncStatus.pending" :
                  syncStatus === "error"   ? "settings.profile.syncStatus.error" :
                  "settings.profile.syncStatus.disabled";

                return (
                  <div key={i}>
                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <div>
                        <InfoRow label={formatMessage({ id: "settings.profile.field.provider" }) as string} value={<Badge variant={providerVariant}>{str(ab["provider_code"])}</Badge>} />
                        <InfoRow label={formatMessage({ id: "settings.profile.field.username" }) as string} value={str(ab["keycloak_username"] ?? ab["username"])} mono hint={formatMessage({ id: "settings.profile.field.username.hint" }) as string} />
                      </div>
                      <div>
                        <InfoRow label={formatMessage({ id: "settings.profile.field.syncStatus" }) as string}
                          value={<Badge variant={syncVariant}>{syncStatus}</Badge>}
                          hint={formatMessage({ id: syncHintId }) as string}
                        />
                        <InfoRow label={formatMessage({ id: "settings.profile.field.lastSynced" }) as string}    value={fmtDateTime(ab["keycloak_synced_at"] ?? ab["synced_at"])} />
                        <InfoRow label={formatMessage({ id: "settings.profile.field.idpEnabled" }) as string}
                          value={ab["idp_enabled"] !== false
                            ? <span className="text-success">{formatMessage({ id: "settings.profile.enabled" })}</span>
                            : <span className="text-destructive">{formatMessage({ id: "settings.profile.disabled" })}</span>}
                        />
                        <InfoRow label={formatMessage({ id: "settings.profile.field.emailVerified" }) as string}
                          value={ab["idp_email_verified"]
                            ? <span className="text-success">{formatMessage({ id: "settings.profile.verified" })}</span>
                            : <span className="text-destructive">{formatMessage({ id: "settings.profile.unverified" })}</span>}
                        />
                      </div>
                    </div>
                    {requiredActions.length > 0 && (
                      <Banner variant="warn">
                        <strong>{formatMessage({ id: "settings.profile.idp.requiredActions" })}</strong>{" "}
                        {requiredActions.join(", ")}
                      </Banner>
                    )}
                  </div>
                );
              })}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
