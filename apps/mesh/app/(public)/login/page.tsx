import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginGatePage } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";
import { getMeshServerSession } from "@/lib/server/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnUrl?: string; reason?: string; change_user?: string; changeUser?: string }>;
}) {
  const params = await searchParams;
  const changeUser = params.change_user === "1" || params.changeUser === "1";

  const session = await getMeshServerSession();
  if (session && !changeUser) redirect(params.returnUrl ?? "/dashboard");

  const cookieStore = await cookies();
  const ssoSkip = cookieStore.get("sso_skip")?.value;

  if (!ssoSkip && !params.error && !changeUser) {
    const dest = `/api/auth/login?silent=true&returnUrl=${encodeURIComponent(params.returnUrl ?? "/dashboard")}`;
    redirect(dest);
  }

  return <LoginGatePage plane={PLANE_KEY} reason={params.reason} />;
}
