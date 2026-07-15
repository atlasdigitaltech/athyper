// apps/admin/app/(public)/account/complete-action/page.tsx — see neon for docs.

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
  if (action && ACCOUNT_CONSOLE_ACTIONS.has(action)) {
    const ref = encodeURIComponent("admin");
    return `${kcBase}/realms/${realmKey}/account?referrer=${ref}`;
  }
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

  if (!session) {
    const returnUrl = safeReturnUrl(params.returnUrl);
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const action = safeAction(params.action);
  const returnUrl = safeReturnUrl(params.returnUrl);
  redirect(buildKcUrl(session.realmKey, action, returnUrl));
}
