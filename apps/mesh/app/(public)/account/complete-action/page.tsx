// apps/mesh/app/(public)/account/complete-action/page.tsx — see neon for docs.

import { redirect } from "next/navigation";

import { getMeshServerSession } from "@/lib/server/session";

const ACCOUNT_CONSOLE_ACTIONS = new Set([
  "UPDATE_PROFILE",
  "VERIFY_EMAIL",
  "VERIFY_PROFILE",
  "CONFIGURE_RECOVERY_AUTHN_CODES",
]);

function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
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
    const ref = encodeURIComponent("mesh");
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
  const session = await getMeshServerSession();

  if (!session) {
    const returnUrl = safeReturnUrl(params.returnUrl);
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const action = safeAction(params.action);
  const returnUrl = safeReturnUrl(params.returnUrl);
  redirect(buildKcUrl(session.realmKey, action, returnUrl));
}
