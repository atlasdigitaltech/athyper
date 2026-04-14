"use client";

import { CheckCircle2, Fingerprint, Key, User, Briefcase, Pencil } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Card, CardContent } from "@athyper/ui/primitives";
import { useShellSession } from "@/components/providers/SessionProvider";
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
          Could not load profile data —{" "}
          <code className="font-mono text-2xs">{error}</code>. Ensure the
          runtime service is running and your session is active.
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
              <Badge variant="success" className="text-2xs">Active</Badge>
              <Badge variant="secondary" className="text-2xs capitalize">
                {str(p?.["principal_type"], "user")}
              </Badge>
              <Badge variant="outline" className="text-2xs capitalize">
                {str(p?.["principal_source"], "internal")}
              </Badge>
              {!!pp?.["employee_id"] && (
                <Badge variant="success" className="text-2xs">Employee linked</Badge>
              )}
            </div>
          </div>

          {/* Tenant context */}
          {bff.activeOrg && (
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span className="text-2xs text-muted-foreground">Tenant</span>
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
            title="Account Identity"
            icon={Fingerprint}
            managedBy={{
              manager:  "System / Tenant Admin",
              source:   "master.principal",
              editPath: "Read-only — no direct mutations",
            }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label="Code"        value={str(p?.["code"])}  mono copyable hint="Human-readable code, unique per tenant." />
                <InfoRow label="Login Email" value={bff.email}         verified hint="Trigger-maintained; source of truth is contact_link." />
              </div>
              <div>
                <InfoRow label="Type"          value={str(p?.["principal_type"], "user")}     hint="user or service_account" />
                <InfoRow label="Source"        value={str(p?.["principal_source"], "internal")} hint="internal | scim | saml_jit | oidc_jit | import | api" />
                <InfoRow label="Created"       value={fmtDate(p?.["created_at"])} />
                <InfoRow label="Enabled"       value={fmtDate(pp?.["enabled_date"])} />
              </div>
            </div>
          </SectionCard>

          {/* ── Display Profile ── */}
          <SectionCard
            title="Display Profile"
            icon={User}
            badge={
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                <Pencil className="h-3 w-3" /> Request Change
              </Button>
            }
            managedBy={{
              manager:     "You (via profile request)",
              source:      "master.principal_profile",
              lastUpdated: pp?.["updated_at"] as string | undefined,
              editPath:    "Submit UPUPR workflow",
            }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label="Given Name"     value={str(pp?.["given_name"])}     hint="Legal first name" />
                <InfoRow label="Family Name"    value={str(pp?.["family_name"])}    hint="Legal last name" />
                <InfoRow label="Preferred Name" value={str(pp?.["preferred_name"])} hint="Informal / display preference" />
                <InfoRow label="Display Name"   value={str(pp?.["display_name"])}   hint="Computed display name shown throughout the platform" />
              </div>
              <div>
                <InfoRow label="Locale"          value={str(pp?.["locale"])}                   hint="BCP-47 locale override (e.g. en-US)" />
                <InfoRow label="Timezone"        value={str(pp?.["timezone"])}                  hint="Personal timezone override for display" />
                <InfoRow label="Default Company" value={str(pp?.["default_company_code_id"])}   mono hint="Working-context default — pre-populates document headers" />
                <InfoRow label="Default Cost Centre" value={str(pp?.["default_cost_center_id"])} mono hint="Default cost centre for expense allocation" />
              </div>
            </div>
          </SectionCard>

          {/* ── Work Profile (if employee linked) ── */}
          {pp?.["employee_id"] && (
            <SectionCard
              title="Work Profile"
              icon={Briefcase}
              badge={
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                  <Pencil className="h-3 w-3" /> Request Change
                </Button>
              }
              managedBy={{
                manager:  "HR / Tenant Admin",
                source:   "master.employee → principal_profile.employee_id",
                editPath: "Submit UPUPR or HR update",
              }}
            >
              <InfoRow label="Employee ID" value={str(pp?.["employee_id"])} mono copyable />
              <InfoRow label="Default Project"      value={str(pp?.["default_project_id"])}      mono />
              <InfoRow label="Default Profit Centre" value={str(pp?.["default_profit_center_id"])} mono />
            </SectionCard>
          )}

          {/* ── Identity Provider Binding ── */}
          {(data?.auth_bindings ?? []).length > 0 && (
            <SectionCard
              title="Identity Provider Status"
              icon={Key}
              managedBy={{
                manager:  "Identity Provider (Athyper IAM)",
                source:   "master.principal_identity_binding",
                editPath: "Managed by your organisation's login provider",
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

                return (
                  <div key={i}>
                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <div>
                        <InfoRow label="Provider" value={<Badge variant={providerVariant}>{str(ab["provider_code"])}</Badge>} />
                        <InfoRow label="Username" value={str(ab["keycloak_username"] ?? ab["username"])} mono hint="Login username at the identity provider" />
                      </div>
                      <div>
                        <InfoRow label="Sync Status"
                          value={<Badge variant={syncVariant}>{syncStatus}</Badge>}
                          hint={
                            syncStatus === "synced"  ? "Identity record matches provider" :
                            syncStatus === "drift"   ? "Mismatch detected — re-sync recommended" :
                            syncStatus === "pending" ? "Awaiting first synchronisation" :
                            syncStatus === "error"   ? "Synchronisation failed" :
                            "Provider link disabled"
                          }
                        />
                        <InfoRow label="Last Synced"    value={fmtDateTime(ab["keycloak_synced_at"] ?? ab["synced_at"])} />
                        <InfoRow label="IdP Enabled"
                          value={ab["idp_enabled"] !== false
                            ? <span className="text-success">✓ Enabled</span>
                            : <span className="text-destructive">✗ Disabled</span>}
                        />
                        <InfoRow label="Email Verified"
                          value={ab["idp_email_verified"]
                            ? <span className="text-success">✓ Verified</span>
                            : <span className="text-destructive">✗ Unverified</span>}
                        />
                      </div>
                    </div>
                    {requiredActions.length > 0 && (
                      <Banner variant="warn">
                        <strong>Required actions from IdP:</strong>{" "}
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
