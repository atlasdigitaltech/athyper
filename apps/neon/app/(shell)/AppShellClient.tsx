"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  PlaneShell,
  neonAtlasProfile,
  type FavoritesPanelSlotProps,
} from "@athyper/app-neon-shell";
import { FavoritesPanelContainer } from "@athyper/app-neon/collaboration";
import { createAtlasSessionScope } from "@athyper/platform-ai-agent-runtime";
import { ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID } from "@athyper/platform-ai-agent-runtime";
import {
  AtlasHeaderTrigger,
  AtlasShellWrapper,
} from "@athyper/platform-ai-agent-ui";
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
} from "@athyper/platform-communications-notifications-client";
import { createNotificationsConfig } from "@/lib/notifications-config";

const NEON_INBOX_ADAPTER: InboxCountAdapter = {
  queryKey: ["shell", "neon", "inbox-count"],
  load: async (signal) => {
    const response = await bffFetch<{ count?: number }>("/api/relay/workflow/inbox/count", { signal });
    return response.count ?? 0;
  },
};

export interface ShellPublicSession {
  displayName: string;
  email?: string;
  activeOrg: string | null;
  activeWorkbench: string | null;
}

const ShellPublicSessionContext = createContext<ShellPublicSession | null>(null);

export function useShellPublicSession(): ShellPublicSession {
  const session = useContext(ShellPublicSessionContext);
  if (!session) throw new Error("useShellPublicSession must be used inside AppShellClient");
  return session;
}

export function AppShellClient({
  supportMode,
  atlasEnabled,
  atlasHistoryEnabled,
  initialSession,
  children,
}: {
  supportMode: boolean;
  atlasEnabled: boolean;
  atlasHistoryEnabled: boolean;
  initialSession: unknown;
  children: ReactNode;
}) {
  const router = useRouter();
  const notificationsConfig = useMemo(
    () => createNotificationsConfig((href) => router.push(href)),
    [router],
  );
  const cacheScopeIdentity = runtimeListSessionScopeIdentity(initialSession);
  const shellSession = toShellPublicSession(initialSession);
  const atlasProfile = atlasHistoryEnabled
    ? {
        ...neonAtlasProfile,
        capabilityIds: [ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID],
      }
    : neonAtlasProfile;
  return (
    <AtlasShellWrapper
      enabled={atlasEnabled}
      scope={createAtlasSessionScope(initialSession)}
      profile={atlasProfile}
      mutationFetch={csrfFetch}
      {...(atlasHistoryEnabled
        ? {
            threadHistory: {
              enabled: true,
              // The rail remains hidden until the authenticated list call
              // returns the tenant-effective server copy.
              retentionNotice: "Loading the effective retention policy.",
              pageSize: 25,
              maxThreads: 200,
              maxResumeMessages: 100,
              archiveEnabled: false,
              deleteEnabled: false,
            },
          }
        : {})}
    >
      <ShellPublicSessionContext.Provider value={shellSession}>
        <RuntimeListBrowserCacheProvider scopeIdentity={cacheScopeIdentity}>
          <AppRouteNavigationBoundary>
            <NotificationStreamProvider config={notificationsConfig}>
              <ShellWithNotificationCount supportMode={supportMode} initialSession={initialSession}>
                {children}
              </ShellWithNotificationCount>
            </NotificationStreamProvider>
          </AppRouteNavigationBoundary>
        </RuntimeListBrowserCacheProvider>
      </ShellPublicSessionContext.Provider>
    </AtlasShellWrapper>
  );
}

function toShellPublicSession(value: unknown): ShellPublicSession {
  if (!value || typeof value !== "object") {
    throw new Error("AppShellClient requires a validated public session");
  }
  const session = value as Record<string, unknown>;
  if (typeof session["displayName"] !== "string") {
    throw new Error("AppShellClient session is missing displayName");
  }
  return {
    displayName: session["displayName"],
    email: typeof session["email"] === "string" ? session["email"] : undefined,
    activeOrg: typeof session["activeOrg"] === "string" ? session["activeOrg"] : null,
    activeWorkbench: typeof session["activeWorkbench"] === "string" ? session["activeWorkbench"] : null,
  };
}

function AppRouteNavigationBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const navigateAppAnchor = (event: MouseEvent) => {
      const anchor = appAnchorForClientNavigation(event);
      if (!anchor) return;
      event.preventDefault();
      const url = new URL(anchor.href);
      router.push(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", navigateAppAnchor);
    return () => document.removeEventListener("click", navigateAppAnchor);
  }, [router]);
  return children;
}

export function appAnchorForClientNavigation(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target.toLowerCase() !== "_self") return null;
  if (anchor.dataset["nativeNavigation"] === "true") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/app/")) return null;
  return anchor;
}

function ShellWithNotificationCount({
  supportMode,
  initialSession,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  children: ReactNode;
}) {
  const { unreadCount } = useNotificationStream();
  const inboxCount = usePlaneInboxCount(NEON_INBOX_ADAPTER);
  const router = useRouter();
  const pathname = usePathname();
  return (
    <PlaneShell
      pathname={pathname}
      supportMode={supportMode}
      initialSession={initialSession}
      inboxCount={inboxCount}
      notificationCount={unreadCount}
      assistantSlot={<AtlasHeaderTrigger />}
      FavoritesPanelComponent={ClientFavoritesPanel}
      navigate={(href) => router.push(href)}
    >
      {children}
    </PlaneShell>
  );
}

function ClientFavoritesPanel(props: FavoritesPanelSlotProps) {
  const router = useRouter();
  return (
    <FavoritesPanelContainer
      {...props}
      navigate={(href) => router.push(href)}
      request={csrfFetch}
    />
  );
}
