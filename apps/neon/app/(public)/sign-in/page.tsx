import { LoginGatePage } from "@athyper/platform-iam-identity-gate";

export default async function SignInPage({ searchParams }: { readonly searchParams: Promise<{ readonly reason?: string; readonly returnTo?: string; readonly requestId?: string }> }) {
  const params = await searchParams;
  return <LoginGatePage plane="neon" reason={params.reason} returnTo={params.returnTo} requestId={params.requestId} />;
}
