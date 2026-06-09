"use client";

import { CheckCircle2, Fingerprint, Key, User, Briefcase, Pencil } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@athyper/ui/primitives";
import { useShellSession } from "@/hooks/use-shell-session";
import {
  InfoRow, SectionCard, Banner, SkeletonCard,
  useSectionData, str, fmtDate, fmtDateTime,
} from "../_shared";

interface ProfileData {
  principal:     Record<string, unknown> | null;
  profile:       Record<string, unknown> | null;
  auth_bindings: Record<string, unknown>[];
}

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

  const [tenantCode, entityCode] = (bff.activeOrg ?? "").split("--");

  return (
    <div className="w-full">
      {error && <Banner variant="warn">Could not load profile data: {error}</Banner>}

      {/* Hero card */}
      <Card className="mb-4 w-full">
        <CardContent className="flex flex-wrap items-start gap-5 pt-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium leading-tight text-foreground">{bff.displayName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {bff.email}
              <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="success"   className="text-xs">Active</Badge>
              <Badge variant="secondary" className="text-xs capitalize">{str(p?.["principal_type"], "user")}</Badge>
              <Badge variant="outline"   className="text-xs capitalize">{str(p?.["principal_source"], "internal")}</Badge>
              {!!pp?.["employee_id"] && <Badge variant="success" className="text-xs">Employee Linked</Badge>}
            </div>
          </div>
          {bff.activeOrg && (
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span className="text-xs text-muted-foreground">Tenant</span>
              <span className="text-sm font-medium text-foreground">{entityCode ?? tenantCode}</span>
              <span className="font-mono text-xs text-muted-foreground">{tenantCode}/{entityCode ?? "—"}</span>
              <Badge variant="info" className="text-xs">{str(bff.activeWorkbench, "user")}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <><SkeletonCard lines={5} /><SkeletonCard lines={4} /><SkeletonCard lines={4} /></>
      ) : (
        <>
          <SectionCard
            title="Account Identity"
            icon={Fingerprint}
            managedBy={{ manager: "System / Tenant Admin", source: "master.principal", editPath: "Read-only — no direct mutations" }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label="Code"        value={str(p?.["code"])} mono copyable hint="Unique identifier for this principal" />
                <InfoRow label="Login Email" value={bff.email}        verified     hint="Email used to authenticate" />
              </div>
              <div>
                <InfoRow label="Type"    value={str(p?.["principal_type"],   "user")}     hint="Principal type (user, service, etc.)" />
                <InfoRow label="Source"  value={str(p?.["principal_source"], "internal")} hint="How this principal was created" />
                <InfoRow label="Created" value={fmtDate(p?.["created_at"])} />
                <InfoRow label="Enabled" value={fmtDate(pp?.["enabled_date"])} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Display Profile"
            icon={User}
            badge={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"><Pencil className="h-3 w-3" /> Request Change</Button>}
            managedBy={{ manager: "HR / People Ops", source: "master.principal_profile", lastUpdated: pp?.["updated_at"] as string | undefined, editPath: "Raise a profile change request" }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label="Given Name"     value={str(pp?.["given_name"])}     hint="Legal first name" />
                <InfoRow label="Family Name"    value={str(pp?.["family_name"])}    hint="Legal last name" />
                <InfoRow label="Preferred Name" value={str(pp?.["preferred_name"])} hint="Name shown in the UI" />
                <InfoRow label="Display Name"   value={str(pp?.["display_name"])}   hint="Full display name" />
              </div>
              <div>
                <InfoRow label="Locale"           value={str(pp?.["locale"])}                    hint="Language preference" />
                <InfoRow label="Timezone"         value={str(pp?.["timezone"])}                  hint="Your local timezone" />
                <InfoRow label="Default Company"  value={str(pp?.["default_company_code_id"])}   mono hint="Company context for new documents" />
                <InfoRow label="Default Cost Center" value={str(pp?.["default_cost_center_id"])} mono hint="Cost center for expense allocation" />
              </div>
            </div>
          </SectionCard>

          {pp?.["employee_id"] && (
            <SectionCard
              title="Work Profile"
              icon={Briefcase}
              badge={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"><Pencil className="h-3 w-3" /> Request Change</Button>}
              managedBy={{ manager: "HR System", source: "master.employee → principal_profile.employee_id", editPath: "HR self-service portal" }}
            >
              <InfoRow label="Employee ID"       value={str(pp?.["employee_id"])}           mono copyable />
              <InfoRow label="Default Project"   value={str(pp?.["default_project_id"])}    mono />
              <InfoRow label="Profit Center"     value={str(pp?.["default_profit_center_id"])} mono />
            </SectionCard>
          )}

          {(data?.auth_bindings ?? []).length > 0 && (
            <SectionCard
              title="Identity Provider Binding"
              icon={Key}
              managedBy={{ manager: "System / IdP Admin", source: "master.principal_identity_binding", editPath: "Contact IAM team to update" }}
            >
              {(data?.auth_bindings ?? []).map((ab, i) => {
                const syncStatus = str(ab["keycloak_sync_status"] ?? ab["sync_status"], "pending");
                const syncVariant =
                  syncStatus === "synced" ? "success"
                  : syncStatus === "error" ? "destructive"
                  : syncStatus === "drift" ? "warning"
                  : "info";
                const requiredActions = Array.isArray(ab["keycloak_required_actions"])
                  ? (ab["keycloak_required_actions"] as string[]) : [];
                return (
                  <div key={i}>
                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <div>
                        <InfoRow label="Provider"  value={<Badge variant={ab["idp_enabled"] !== false ? "secondary" : "outline"}>{str(ab["provider_code"])}</Badge>} />
                        <InfoRow label="Username"  value={str(ab["keycloak_username"] ?? ab["username"])} mono hint="IdP username / subject" />
                      </div>
                      <div>
                        <InfoRow label="Sync Status"   value={<Badge variant={syncVariant}>{syncStatus}</Badge>} />
                        <InfoRow label="Last Synced"   value={fmtDateTime(ab["keycloak_synced_at"] ?? ab["synced_at"])} />
                        <InfoRow label="IdP Enabled"   value={ab["idp_enabled"] !== false ? <span className="text-success">Enabled</span> : <span className="text-destructive">Disabled</span>} />
                        <InfoRow label="Email Verified" value={ab["idp_email_verified"] ? <span className="text-success">Verified</span> : <span className="text-destructive">Unverified</span>} />
                      </div>
                    </div>
                    {requiredActions.length > 0 && (
                      <Banner variant="warn">
                        <strong>Required actions: </strong>{requiredActions.join(", ")}
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
