"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PlaneShell } from "@athyper/app-mesh-shell";
import { bffFetch } from "@/lib/bff-fetch";
import {
  usePlaneInboxCount,
  type InboxCountAdapter,
} from "@athyper/app-foundation/client";
import {
  RuntimeListBrowserCacheProvider,
  runtimeListSessionScopeIdentity,
} from "@athyper/runtime-list/browser-cache";
import {
  NotificationStreamProvider,
  useNotificationStream,
} from "@athyper/notifications-client";
import { createNotificationsConfig } from "@/lib/notifications-config";

const MESH_INBOX_ADAPTER: InboxCountAdapter = {
  queryKey: ["shell", "mesh", "inbox-count"],
  load: async (signal) => {
    const response = await bffFetch<{ total?: number }>("/api/relay/mesh/inbox?limit=200", { signal });
    return response.total ?? 0;
  },
};

export function AppShellClient({
  supportMode,
  initialSession,
  runtimeCatalog,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  runtimeCatalog: ReadonlyArray<{
    entityCode: string;
    labelPlural: string;
    list: boolean;
    detail: boolean;
  }>;
  children: ReactNode;
}) {
  const router = useRouter();
  const detailEntityCodes = useMemo(
    () => new Set(
      runtimeCatalog
        .filter((item) => item.detail)
        .map((item) => item.entityCode),
    ),
    [runtimeCatalog],
  );
  const notificationsConfig = useMemo(
    () => createNotificationsConfig(
      (href) => router.push(href),
      detailEntityCodes,
    ),
    [router, detailEntityCodes],
  );
  return (
    <RuntimeListBrowserCacheProvider scopeIdentity={runtimeListSessionScopeIdentity(initialSession)}>
      <NotificationStreamProvider config={notificationsConfig}>
        <MeshShell
          supportMode={supportMode}
          initialSession={initialSession}
          runtimeCatalog={runtimeCatalog}
          navigate={(href) => router.push(href)}
        >
          {children}
        </MeshShell>
      </NotificationStreamProvider>
    </RuntimeListBrowserCacheProvider>
  );
}

function MeshShell({
  supportMode,
  initialSession,
  runtimeCatalog,
  navigate,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  runtimeCatalog: ReadonlyArray<{
    entityCode: string;
    labelPlural: string;
    list: boolean;
    detail: boolean;
  }>;
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  const { unreadCount } = useNotificationStream();
  const inboxCount = usePlaneInboxCount(MESH_INBOX_ADAPTER);
  const pathname = usePathname();
  return (
    <PlaneShell
      pathname={pathname}
      initialSession={initialSession}
      supportMode={supportMode}
      runtimeCatalog={runtimeCatalog}
      inboxCount={inboxCount}
      notificationCount={unreadCount}
      navigate={navigate}
    >
      {children}
    </PlaneShell>
  );
}
