"use client";

import { useEffect, useState } from "react";
import { Activity, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SettingsScopeRef } from "@athyper/api-contracts/me";
import {
  DiagnosticsSection, MeUIProvider, SettingsWorkspace, deriveSettingsAccess,
  type MeUISessionView,
} from "@athyper/me-ui";
import { NotificationsSettingsSection } from "@athyper/notifications-client";
import { PageFrame } from "@athyper/surface-kit";
import { bffFetch } from "@/lib/bff-fetch";
import { applyThemePreferences } from "@/lib/preferences/theme-dom";

interface SessionPayload {
  authenticated: true;
  displayName: string;
  email?: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
  permissions?: string[];
  settingsScopes?: SettingsScopeRef[];
  supportMode?: boolean;
  organizations?: Record<string, { tenantId?: string; roles: string[] }>;
}

const DEFAULT_SESSION: MeUISessionView = {
  displayName: "-",
  email: "-",
  activeOrg: null,
  activeWorkbench: null,
};

function isSessionPayload(value: unknown): value is SessionPayload {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)["authenticated"] === true);
}

export function SettingsClient({ path }: { path?: readonly string[] }) {
  const router = useRouter();
  const [session, setSession] = useState<MeUISessionView>(DEFAULT_SESSION);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [scopes, setScopes] = useState<SettingsScopeRef[]>([{ kind: "personal", id: "me", label: "Personal" }]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!isSessionPayload(payload)) return;
        setSession({
          displayName: payload.displayName || "-",
          email: payload.email || "-",
          activeOrg: payload.activeOrg,
          activeWorkbench: payload.activeWorkbench,
        });
        const access = deriveSettingsAccess("neon", payload);
        setPermissions(payload.permissions ?? access.permissions);
        setScopes(payload.settingsScopes ?? [{ kind: "personal", id: "me", label: "Personal" }]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <MeUIProvider bffFetch={bffFetch} session={session} applyThemePreferences={applyThemePreferences}>
      <PageFrame eyebrow="Neon" title="Settings" description="Personal, tenant, legal-entity, company, and purchasing-organization settings.">
        <SettingsWorkspace
          plane="neon"
          path={path}
          permissions={permissions}
          scopes={scopes}
          navigate={(href) => router.push(href)}
          extras={[
            { id: "notifications", label: "Notifications", icon: Bell, scopes: ["personal"], render: (active) => active ? <NotificationsSettingsSection /> : null },
            { id: "diagnostics", label: "Diagnostics", icon: Activity, scopes: ["tenant"], requiredPermission: "settings.diagnostics.read", render: (active) => <DiagnosticsSection active={active} /> },
          ]}
        />
      </PageFrame>
    </MeUIProvider>
  );
}
