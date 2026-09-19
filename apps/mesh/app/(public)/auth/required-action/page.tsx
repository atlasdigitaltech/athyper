import type { Metadata } from "next";
import { RequiredActionGatePage } from "@athyper/platform-iam-identity-gate";

export const metadata: Metadata = { title: "Complete account setup" };

// This recovery page must remain outside the protected layout, which redirects
// sessions with outstanding issuer actions here before loading the workspace.
export default async function RequiredActionPage({ searchParams }: {
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}) {
  return <RequiredActionGatePage plane="mesh" returnTo={(await searchParams).returnTo} />;
}
