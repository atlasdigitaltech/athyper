"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PlaneShell } from "@athyper/app-admin-shell";
import { FavoritesPanelContainer } from "@athyper/app-admin/collaboration";
import {
  RuntimeListBrowserCacheProvider,
  runtimeListSessionScopeIdentity,
} from "@athyper/runtime-list/browser-cache";

export function AppShellClient({
  supportMode,
  initialSession,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <RuntimeListBrowserCacheProvider scopeIdentity={runtimeListSessionScopeIdentity(initialSession)}>
      <PlaneShell
        supportMode={supportMode}
        FavoritesPanelComponent={FavoritesPanelContainer}
        navigate={(href) => router.push(href)}
      >
        {children}
      </PlaneShell>
    </RuntimeListBrowserCacheProvider>
  );
}
