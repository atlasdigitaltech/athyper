"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { DiagnosticsSection, MeSettings, MeUIProvider, type MeUISessionView } from "@athyper/me-ui";
import { getPlaneConfig } from "@athyper/session-plane";
import { PageFrame } from "@athyper/surface-kit";
import { bffFetch } from "@/lib/bff-fetch";
import { PLANE_KEY } from "@/lib/plane";

interface SessionPayload {
  authenticated: true;
  displayName: string;
  email?: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

const DEFAULT_SESSION: MeUISessionView = {
  displayName: "-",
  email: "-",
  activeOrg: null,
  activeWorkbench: null,
};

const VALID_SETTINGS_IDS = new Set(["profile", "identity", "preferences", "tenant-context", "tenant", "diagnostics"]);

function isSessionPayload(value: unknown): value is SessionPayload {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)["authenticated"] === true);
}

function defaultActiveId(path: readonly string[] | undefined): string | undefined {
  const first = path?.[0];
  return first && VALID_SETTINGS_IDS.has(first) ? first : undefined;
}

export function SettingsClient({ path }: { path?: readonly string[] }) {
  const config = getPlaneConfig(PLANE_KEY);
  const [session, setSession] = useState<MeUISessionView>(DEFAULT_SESSION);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!isSessionPayload(payload)) return;
        setSession({
          displayName: payload.displayName || "-",
          email: payload.email || "-",
          activeOrg: payload.activeOrg,
          activeWorkbench: payload.activeWorkbench,
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <MeUIProvider bffFetch={bffFetch} session={session}>
      <PageFrame
        eyebrow={config.appName}
        title="Settings"
        description="Profile, security, tenant context, diagnostics, and plane preferences."
      >
        <MeSettings
          adminSections={["tenant"]}
          defaultActiveId={defaultActiveId(path)}
          extras={[{
            id: "diagnostics",
            label: "Diagnostics",
            icon: Activity,
            adminOnly: true,
            render: (active) => <DiagnosticsSection active={active} />,
          }]}
        />
      </PageFrame>
    </MeUIProvider>
  );
}
