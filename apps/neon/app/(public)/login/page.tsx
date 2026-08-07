import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginGatePage } from "@athyper/platform-iam-identity-gate";
import { PLANE_KEY } from "@/lib/plane";
import { getNeonServerSession } from "@/lib/server/session";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnUrl?: string; reason?: string; change_user?: string; changeUser?: string }>;
}) {
  const params = await searchParams;
  const changeUser = params.change_user === "1" || params.changeUser === "1";

  const session = await getNeonServerSession();
  const returnUrl = safeReturnUrl(params.returnUrl);
  if (session && !changeUser) redirect(returnUrl);

  // sso_skip is a short-lived HttpOnly cookie (60 s) set by the auth callback
  // when KC returns login_required on a silent SSO attempt. Avoids a retry loop
  // and keeps the URL clean — no ?sso_failed=1 visible to the user.
  const cookieStore = await cookies();
  const ssoSkip = cookieStore.get("sso_skip")?.value;

  if (!ssoSkip && !params.error && !changeUser) {
    const dest = `/api/auth/login?silent=true&returnUrl=${encodeURIComponent(returnUrl)}`;
    redirect(dest);
  }

  return <LoginGatePage plane={PLANE_KEY} reason={params.reason} />;
}
