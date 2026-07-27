"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NotificationSchema } from "@athyper/api-contracts";
import { useToast } from "@athyper/ui/composites";
import {
  NotificationsClientProvider,
  type NotificationsClientConfig,
} from "../config";
import { NotificationStreamContext } from "../hooks/use-notification-stream";

function StreamConnection({
  config,
  children,
}: {
  config: NotificationsClientConfig;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/relay/platform/notifications/stream", {
      withCredentials: true,
    });

    const onNew = (event: MessageEvent<string>) => {
      try {
        const parsed = NotificationSchema.safeParse(JSON.parse(event.data));
        if (!parsed.success) return;
        const notification = parsed.data;
        const href = config.resolveHref?.(notification);
        window.dispatchEvent(new CustomEvent("athyper:notification", { detail: notification }));
        toast({
          title: notification.title,
          description: notification.body ?? notification.event_code,
          intent: notification.priority === "high" ? "warning" : "info",
          duration: 6_000,
          ...(href ? { action: { label: "Open", onClick: () => config.navigate(href) } } : {}),
        });
      } catch {
        // Ignore malformed events; the server will send the next count update.
      }
    };
    const onCount = (event: MessageEvent<string>) => {
      try {
        const value = (JSON.parse(event.data) as { count?: unknown }).count;
        if (typeof value === "number" && Number.isFinite(value)) {
          setUnreadCount(Math.max(0, Math.floor(value)));
        }
      } catch {
        // Ignore malformed count events.
      }
    };

    source.addEventListener("notification:new", onNew as EventListener);
    source.addEventListener("notification:count", onCount as EventListener);
    return () => source.close();
  }, [config, toast]);

  return (
    <NotificationStreamContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationStreamContext.Provider>
  );
}

export function NotificationStreamProvider({
  config,
  children,
}: {
  config: NotificationsClientConfig;
  children: ReactNode;
}) {
  return (
    <NotificationsClientProvider config={config}>
      <StreamConnection config={config}>{children}</StreamConnection>
    </NotificationsClientProvider>
  );
}
