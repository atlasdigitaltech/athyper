// apps/admin/app/(public)/account/complete-action/page.tsx
//
// Phase A — Required-actions completion deep link.
//
// The shared RequiredActionBanner / AuthFailurePage redirects users here when
// REQUIRED_ACTION_PENDING fires. This page authoritatively decides where in
// Keycloak to send the user — either to the account console (for self-service
// actions like UPDATE_PROFILE) or back through the OIDC auth endpoint with
// `kc_action=<X>` so KC re-prompts for the specific action mid-session.
//
// Why a dedicated route instead of redirecting client-side: the server reads
// the validated session realm here and constructs the correct KC URL. The
// client never has direct access to KEYCLOAK_BASE_URL.

import { redirect } from "next/navigation";

import { getAdminServerSession } from "@/lib/server/session";

const ACCOUNT_CONSOLE_ACTIONS = new Set([
  "UPDATE_PROFILE",
  "VERIFY_EMAIL",
  "VERIFY_PROFILE",
  "CONFIGURE_RECOVERY_AUTHN_CODES",
]);

function safeReturnUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return "/dashboard";

  try {
    const parsed = new URL(trimmed, "https://sentinel.invalid");
    if (parsed.origin !== "https://sentinel.invalid") return "/dashboard";

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isBlockedReturnPath(path)) return "/dashboard";
    return path;
  } catch {
    return "/dashboard";
  }
}

function isBlockedReturnPath(path: string): boolean {
  if (path === "/login" || path.startsWith("/login?")) return true;
  if (path === "/logout" || path.startsWith("/logout?")) return true;
  if (path === "/auth" || path.startsWith("/auth/") || path.startsWith("/auth?")) return true;
  if (path === "/mfa" || path.startsWith("/mfa/") || path.startsWith("/mfa?")) return true;
  if (path === "/api" || path.startsWith("/api/")) return true;
  return false;
}

function safeAction(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(raw)) return null;
  return raw;
}

function buildKcUrl(
  realmKey: string,
  action: string | null,
  returnUrl: string,
): string {
  const kcBase = process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  // Self-service actions live in the KC account console; everything else
  // re-enters the OIDC auth flow with kc_action.
  if (action && ACCOUNT_CONSOLE_ACTIONS.has(action)) {
    const ref = encodeURIComponent("admin");
    return `${kcBase}/realms/${realmKey}/account?referrer=${ref}`;
  }
  // Re-enter login with kc_action so KC re-prompts for the specific action.
  // The login BFF forwards kc_action through to the OIDC authorization URL.
  const params = new URLSearchParams();
  params.set("returnUrl", returnUrl);
  if (action) params.set("kc_action", action);
  return `/api/auth/login?${params.toString()}`;
}

export default async function CompleteActionPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; returnUrl?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminServerSession();

  // No active session → send to login. The post-login flow will surface the
  // required action via the banner/page again.
  if (!session) {
    const returnUrl = safeReturnUrl(params.returnUrl);
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const action = safeAction(params.action);
  const returnUrl = safeReturnUrl(params.returnUrl);
  redirect(buildKcUrl(session.realmKey, action, returnUrl));
}
