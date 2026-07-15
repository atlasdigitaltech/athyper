import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { validatePlaneServerSession } from "@athyper/auth-bff";
import { getPlaneConfig, isSupportSession } from "@athyper/session-plane";
import { AppShellClient } from "./AppShellClient";
import { PreferencesDomHydrator } from "./PreferencesDomHydrator";
import { RequiredActionBannerSlot } from "./RequiredActionBannerSlot";
import { SourceAdapterClient } from "./SourceAdapterClient";
import { PLANE_KEY } from "@/lib/plane";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const plane = getPlaneConfig(PLANE_KEY);
  const cookieStore = await cookies();
  const headerStore = await headers();
  const validation = await validatePlaneServerSession(PLANE_KEY, {
    cookies: cookieStore,
    headers: headerStore,
  });
  const returnUrl = currentReturnPath(headerStore, plane.defaultPath);

  if (!validation.ok) {
    if (validation.reason === "MFA_REQUIRED") {
      redirect(`/mfa/challenge?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    redirect(`${plane.loginPath}?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  if (!hasActiveTenantContext(validation.session)) {
    redirect(contextSelectPath(returnUrl));
  }

  // Phase I — surface KC required-actions inline at the top of the shell so
  // users see the pending action before the BFF starts blocking mutating routes.
  // validatePlaneServerSession already blocks fully when actions are pending.
  // allow-raw-verify: read-only for banner; gate already applied by validatePlaneServerSession.
  const requiredActions = validation.session.requiredActions ?? [];

  return (
    <AppShellClient
      supportMode={isSupportSession(PLANE_KEY, validation.session.realmKey)}
      initialSession={validation.publicSession}
    >
      <RequiredActionBannerSlot actions={requiredActions} />
      <PreferencesDomHydrator />
      <SourceAdapterClient>{children}</SourceAdapterClient>
    </AppShellClient>
  );
}

function currentReturnPath(headers: { get(name: string): string | null }, fallback: string): string {
  const pathname = headers.get("x-pathname");
  if (pathname?.startsWith("/") !== true) return fallback;

  const search = headers.get("x-search");
  return search?.startsWith("?") === true ? `${pathname}${search}` : pathname;
}

function hasActiveTenantContext(session: {
  activeOrg: string | null;
  activeWorkbench: string | null;
  organizations: Record<string, { tenantId?: string; roles: string[] }>;
}): boolean {
  if (!session.activeOrg || !session.activeWorkbench) return false;

  const membership = session.organizations[session.activeOrg];
  return Boolean(membership?.tenantId && membership.roles.includes(session.activeWorkbench));
}

function contextSelectPath(returnUrl: string): string {
  const params = new URLSearchParams({ returnUrl });
  return `/auth/select?${params.toString()}`;
}
