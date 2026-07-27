"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  adminAtlasProfile,
  PlaneShell,
} from "@athyper/app-admin-shell";
import { createAtlasSessionScope } from "@athyper/atlas-agent-runtime";
import {
  AtlasHeaderTrigger,
  AtlasShellWrapper,
} from "@athyper/atlas-agent-ui";
import { bffFetch, csrfFetch } from "@/lib/bff-fetch";
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

const ADMIN_INBOX_ADAPTER: InboxCountAdapter = {
  queryKey: ["shell", "admin", "inbox-count"],
  load: async (signal) => {
    const response = await bffFetch<{ count?: number }>("/api/relay/workflow/inbox/count", { signal });
    return response.count ?? 0;
  },
};

export function AppShellClient({
  supportMode,
  atlasEnabled,
  initialSession,
  children,
}: {
  supportMode: boolean;
  atlasEnabled: boolean;
  initialSession: unknown;
  children: ReactNode;
}) {
  const router = useRouter();
  const notificationsConfig = useMemo(
    () => createNotificationsConfig((href) => router.push(href)),
    [router],
  );
  return (
    <AtlasShellWrapper
      enabled={atlasEnabled}
      scope={createAtlasSessionScope(initialSession)}
      profile={adminAtlasProfile}
      mutationFetch={csrfFetch}
      feedbackEndpoint={null}
    >
      <RuntimeListBrowserCacheProvider scopeIdentity={runtimeListSessionScopeIdentity(initialSession)}>
        <NotificationStreamProvider config={notificationsConfig}>
          <AdminShell
            supportMode={supportMode}
            initialSession={initialSession}
            navigate={(href) => router.push(href)}
          >
            {children}
          </AdminShell>
        </NotificationStreamProvider>
      </RuntimeListBrowserCacheProvider>
    </AtlasShellWrapper>
  );
}

function AdminShell({
  supportMode,
  initialSession,
  navigate,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  const { unreadCount } = useNotificationStream();
  const inboxCount = usePlaneInboxCount(ADMIN_INBOX_ADAPTER);
  const pathname = usePathname();
  return (
    <PlaneShell
      pathname={pathname}
      initialSession={initialSession}
      supportMode={supportMode}
      inboxCount={inboxCount}
      notificationCount={unreadCount}
      assistantSlot={<AtlasHeaderTrigger />}
      navigate={navigate}
    >
      {children}
    </PlaneShell>
  );
}
