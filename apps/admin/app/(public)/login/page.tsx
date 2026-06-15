import { redirect } from "next/navigation";
import { LoginGatePage } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";
import { getAdminServerSession } from "@/lib/server/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnUrl?: string; reason?: string; change_user?: string; changeUser?: string }>;
}) {
  const params = await searchParams;
  const changeUser = params.change_user === "1" || params.changeUser === "1";

  const session = await getAdminServerSession();
  if (session && !changeUser) redirect(params.returnUrl ?? "/dashboard");

  if (!params.error && !changeUser) {
    const dest = `/api/auth/login?force_authn=true&returnUrl=${encodeURIComponent(params.returnUrl ?? "/dashboard")}`;
    redirect(dest);
  }

  return <LoginGatePage plane={PLANE_KEY} reason={params.reason} />;
}
