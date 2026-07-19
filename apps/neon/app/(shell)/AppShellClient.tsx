"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PlaneShell, type FavoritesPanelSlotProps } from "@athyper/app-neon-shell";
import { FavoritesPanelContainer } from "@athyper/app-neon/collaboration";
import {
  RuntimeListBrowserCacheProvider,
  runtimeListSessionScopeIdentity,
} from "@athyper/runtime-list/browser-cache";
import {
  NotificationStreamProvider,
  useNotificationStream,
} from "./NotificationStreamClient";

export function AppShellClient({
  supportMode,
  initialSession,
  children,
}: {
  supportMode: boolean;
  initialSession: unknown;
  children: ReactNode;
}) {
  const cacheScopeIdentity = runtimeListSessionScopeIdentity(initialSession);
  return (
    <RuntimeListBrowserCacheProvider scopeIdentity={cacheScopeIdentity}>
      <AppRouteNavigationBoundary>
        <NotificationStreamProvider>
          <ShellWithNotificationCount supportMode={supportMode} initialSession={initialSession}>
            {children}
          </ShellWithNotificationCount>
        </NotificationStreamProvider>
      </AppRouteNavigationBoundary>
    </RuntimeListBrowserCacheProvider>
  );
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
  const router = useRouter();
  return (
    <PlaneShell
      supportMode={supportMode}
      initialSession={initialSession}
      notificationCount={unreadCount}
      FavoritesPanelComponent={ClientFavoritesPanel}
      navigate={(href) => router.push(href)}
    >
      {children}
    </PlaneShell>
  );
}

function ClientFavoritesPanel(props: FavoritesPanelSlotProps) {
  const router = useRouter();
  return <FavoritesPanelContainer {...props} navigate={(href) => router.push(href)} />;
}
