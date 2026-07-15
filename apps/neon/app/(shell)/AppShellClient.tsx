"use client";

import type { ReactNode } from "react";
import { PlaneShell } from "@athyper/app-neon-shell";
import { FavoritesPanelContainer } from "@athyper/app-neon/collaboration";
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
  return (
    <NotificationStreamProvider>
      <ShellWithNotificationCount supportMode={supportMode} initialSession={initialSession}>
        {children}
      </ShellWithNotificationCount>
    </NotificationStreamProvider>
  );
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
  return (
    <PlaneShell
      supportMode={supportMode}
      initialSession={initialSession}
      notificationCount={unreadCount}
      FavoritesPanelComponent={FavoritesPanelContainer}
    >
      {children}
    </PlaneShell>
  );
}
