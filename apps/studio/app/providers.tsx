"use client";

import type { DehydratedState } from "@athyper/platform-query";
import {
  BrowserApplicationProviders,
  type ExperienceBootstrap,
  type SanitizedSession,
} from "@athyper/platform-shell-app-foundation";
import { useMemo, type ReactNode } from "react";
import { ShellRouteProvider } from "@athyper/platform-shell";
import { useRouter, usePathname } from "next/navigation";

export function AppProviders({ session, bootstrap, dehydratedState, children }: {
  readonly session: SanitizedSession;
  readonly bootstrap: ExperienceBootstrap;
  readonly dehydratedState: DehydratedState;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useMemo(() => ({
    push: (href: string) => router.push(href),
    replace: (href: string) => router.replace(href),
    refresh: () => router.refresh(),
  }), [router]);
  return (
    <BrowserApplicationProviders
      session={session}
      bootstrap={bootstrap}
      dehydratedState={dehydratedState}
      navigation={navigation}
      onBootstrapRevalidation={() => router.refresh()}
      onAuthenticationFailure={() => window.location.assign("/api/auth/login")}
    >
      <ShellRouteProvider pathname={pathname}>{children}</ShellRouteProvider>
    </BrowserApplicationProviders>
  );
}
