"use client";

import { CheckCircle2, Fingerprint, Key, User, Briefcase, Pencil } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@athyper/ui/primitives";
import type { MeProfile, MeAuthBinding } from "@athyper/api-contracts/me";
import {
  InfoRow, SectionCard, Banner, SkeletonCard,
  useSectionData, str, fmtDate, fmtDateTime,
} from "../_shared";
import { useMeUI } from "../MeUIProvider";

function syncBadgeVariant(syncStatus: string): "success" | "destructive" | "warning" | "info" {
  if (syncStatus === "synced") return "success";
  if (syncStatus === "error") return "destructive";
  if (syncStatus === "drift") return "warning";
  return "info";
}

export function ProfileSection({ active }: { active: boolean }) {
  const { session } = useMeUI();
  const { data, loading, error } = useSectionData<MeProfile>(active, "/api/me/profile");

  const initials = session.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");

  const p  = data?.principal ?? null;
  const pp = data?.profile ?? null;

  const [tenantCode, entityCode] = (session.activeOrg ?? "").split("--");

  return (
    <div className="w-full">
      {error && <Banner variant="warn">Could not load profile data: {error}</Banner>}

      <Card className="mb-4 w-full">
        <CardContent className="flex flex-wrap items-start gap-5 pt-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium leading-tight text-foreground">{session.displayName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {session.email}
              <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="success"   className="text-xs">Active</Badge>
              <Badge variant="secondary" className="text-xs capitalize">{str(p?.principal_type,   "user")}</Badge>
              <Badge variant="outline"   className="text-xs capitalize">{str(p?.principal_source, "internal")}</Badge>
              {!!pp?.employee_id && <Badge variant="success" className="text-xs">Employee Linked</Badge>}
            </div>
          </div>
          {session.activeOrg && (
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span className="text-xs text-muted-foreground">Tenant</span>
              <span className="text-sm font-medium text-foreground">{entityCode ?? tenantCode}</span>
              <span className="font-mono text-xs text-muted-foreground">{tenantCode}/{entityCode ?? "—"}</span>
              <Badge variant="info" className="text-xs">{str(session.activeWorkbench, "user")}</Badge>
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
                <InfoRow label="Code"        value={str(p?.code)} mono copyable hint="Unique identifier for this principal" />
                <InfoRow label="Login Email" value={session.email}        verified     hint="Email used to authenticate" />
              </div>
              <div>
                <InfoRow label="Type"    value={str(p?.principal_type,   "user")}     hint="Principal type (user, service, etc.)" />
                <InfoRow label="Source"  value={str(p?.principal_source, "internal")} hint="How this principal was created" />
                <InfoRow label="Created" value={fmtDate(p?.created_at)} />
                <InfoRow label="Enabled" value={fmtDate(pp?.enabled_date)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Display Profile"
            icon={User}
            badge={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"><Pencil className="h-3 w-3" /> Request Change</Button>}
            managedBy={{ manager: "HR / People Ops", source: "master.principal_profile", lastUpdated: pp?.updated_at ?? undefined, editPath: "Raise a profile change request" }}
          >
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <InfoRow label="Given Name"     value={str(pp?.given_name)}     hint="Legal first name" />
                <InfoRow label="Family Name"    value={str(pp?.family_name)}    hint="Legal last name" />
                <InfoRow label="Preferred Name" value={str(pp?.preferred_name)} hint="Name shown in the UI" />
                <InfoRow label="Display Name"   value={str(pp?.display_name)}   hint="Full display name" />
              </div>
              <div>
                <InfoRow label="Locale"              value={str(pp?.locale)}                  hint="Language preference" />
                <InfoRow label="Timezone"            value={str(pp?.timezone)}                hint="Your local timezone" />
                <InfoRow label="Default Company"     value={str(pp?.default_company_code_id)} mono hint="Company context for new documents" />
                <InfoRow label="Default Cost Center" value={str(pp?.default_cost_center_id)}  mono hint="Cost center for expense allocation" />
              </div>
            </div>
          </SectionCard>

          {pp?.employee_id && (
            <SectionCard
              title="Work Profile"
              icon={Briefcase}
              badge={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"><Pencil className="h-3 w-3" /> Request Change</Button>}
              managedBy={{ manager: "HR System", source: "master.employee → principal_profile.employee_id", editPath: "HR self-service portal" }}
            >
              <InfoRow label="Employee ID" value={str(pp.employee_id)} mono copyable />
            </SectionCard>
          )}

          {(data?.auth_bindings ?? []).length > 0 && (
            <SectionCard
              title="Identity Provider Binding"
              icon={Key}
              managedBy={{ manager: "System / IdP Admin", source: "master.principal_identity_binding", editPath: "Contact IAM team to update" }}
            >
              {(data?.auth_bindings ?? []).map((ab: MeAuthBinding, i: number) => {
                const syncStatus = str(ab.sync_status, "pending");
                const syncVariant = syncBadgeVariant(syncStatus);
                const requiredActions = ab.required_actions ?? [];
                return (
                  <div key={i}>
                    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <div>
                        <InfoRow label="Provider"  value={<Badge variant={ab.idp_enabled !== false ? "secondary" : "outline"}>{str(ab.provider_code)}</Badge>} />
                        <InfoRow label="Username"  value={str(ab.username)} mono hint="IdP username / subject" />
                      </div>
                      <div>
                        <InfoRow label="Sync Status"   value={<Badge variant={syncVariant}>{syncStatus}</Badge>} />
                        <InfoRow label="Last Synced"   value={fmtDateTime(ab.synced_at)} />
                        <InfoRow label="IdP Enabled"   value={ab.idp_enabled !== false ? <span className="text-success">Enabled</span> : <span className="text-destructive">Disabled</span>} />
                        <InfoRow label="Email Verified" value={ab.idp_email_verified ? <span className="text-success">Verified</span> : <span className="text-destructive">Unverified</span>} />
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
