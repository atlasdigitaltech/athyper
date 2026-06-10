import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { validatePlaneServerSession } from "@athyper/auth-bff";
import { getPlaneConfig, isSupportSession } from "@athyper/session-plane";
import { AppShellClient } from "./AppShellClient";
import { RequiredActionBannerSlot } from "./RequiredActionBannerSlot";
import { PLANE_KEY } from "@/lib/plane";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const plane = getPlaneConfig(PLANE_KEY);
  const cookieStore = await cookies();
  const headerStore = await headers();
  const validation = await validatePlaneServerSession(PLANE_KEY, {
    cookies: cookieStore,
    headers: headerStore,
  });

  if (!validation.ok) {
    const returnUrl = currentReturnPath(headerStore, plane.defaultPath);
    if (validation.reason === "MFA_REQUIRED") {
      redirect(`/mfa/challenge?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    redirect(`${plane.loginPath}?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  // Phase I — surface pending KC required-actions inline above the shell.
  // allow-raw-verify: read-only for banner; gate already applied above.
  const requiredActions = validation.session.requiredActions ?? [];

  return (
    <AppShellClient supportMode={isSupportSession(PLANE_KEY, validation.session.realmKey)}>
      <RequiredActionBannerSlot actions={requiredActions} />
      {children}
    </AppShellClient>
  );
}

function currentReturnPath(headers: { get(name: string): string | null }, fallback: string): string {
  const pathname = headers.get("x-pathname");
  return pathname?.startsWith("/") === true ? pathname : fallback;
}
