"use client";

// tabs/UsersRolesTab.tsx — Role summary, client roles, groups, membership stub

import { PlaceholderBadge, SectionCard } from "../shared";

import type { TenantProfileData } from "../use-tenant-profile";

import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/messages-context";

interface UsersRolesTabProps {
  data: TenantProfileData;
}

export function UsersRolesTab({ data }: UsersRolesTabProps) {
  const { t } = useMessages();

  return (
    <div className="space-y-4">
      {/* Current User Roles */}
      <SectionCard
        title={t("tenant.profile.currentUserRoles", "Current User Roles")}
        description={t(
          "tenant.profile.currentUserRolesDesc",
          "Realm roles assigned to the current session.",
        )}
      >
        {data.roles.length > 0 ? (
          <div className="flex flex-wrap gap-2 py-2">
            {data.roles.map((role) => (
              <Badge key={role} variant="secondary" className="text-xs">
                {role}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {t("tenant.profile.noRoles", "No realm roles assigned")}
          </p>
        )}
      </SectionCard>

      {/* Client Roles */}
      <SectionCard
        title={t("tenant.profile.clientRoles", "Client Roles")}
        description={t(
          "tenant.profile.clientRolesDesc",
          "Application-specific roles from Keycloak resource_access.",
        )}
      >
        {data.clientRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2 py-2">
            {data.clientRoles.map((role) => (
              <Badge key={role} variant="outline" className="text-xs font-mono">
                {role}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {t("tenant.profile.noClientRoles", "No client roles assigned")}
          </p>
        )}
      </SectionCard>

      {/* Groups */}
      <SectionCard
        title={t("tenant.profile.groups", "Groups")}
        description={t(
          "tenant.profile.groupsDesc",
          "Group membership for data scoping.",
        )}
      >
        {data.groups.length > 0 ? (
          <div className="flex flex-wrap gap-2 py-2">
            {data.groups.map((group) => (
              <Badge key={group} variant="outline" className="text-xs">
                {group}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            {t("tenant.profile.noGroups", "No groups assigned")}
          </p>
        )}
      </SectionCard>

      {/* Org-wide Membership */}
      <SectionCard
        title={t("tenant.profile.orgMembership", "Organization Membership")}
      >
        <div className="flex items-center justify-center py-6">
          <PlaceholderBadge />
        </div>
      </SectionCard>
    </div>
  );
}
