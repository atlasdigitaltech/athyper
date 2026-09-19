import { readAppEnvironment } from "@/lib/environment";
import { LoginGatePage } from "@athyper/platform-iam-identity-gate";
import { resolveExistingSessionLanding } from "@athyper/platform-shell-app-foundation/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly reason?: string;
    readonly returnTo?: string;
    readonly requestId?: string;
  }>;
}) {
  const params = await searchParams;
  const origin = readAppEnvironment().appOrigin;
  const landing = await resolveExistingSessionLanding({
    request: new Request(new URL("/sign-in", origin), {
      headers: new Headers(await headers()),
    }),
    readSession: auth.session,
    returnTo: params.returnTo,
  });
  if (landing) redirect(landing);
  return (
    <LoginGatePage
      plane="mesh"
      reason={params.reason}
      returnTo={params.returnTo}
      requestId={params.requestId}
    />
  );
}
