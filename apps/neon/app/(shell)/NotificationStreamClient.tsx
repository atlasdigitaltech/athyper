"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@athyper/ui/composites";

/**
 * Subscribes to /api/relay/platform/notifications/stream and surfaces both:
 *
 *   notification:new    — payload { id, subject, event_code, entity_type, entity_id, priority, ... }
 *                         → toast (intent='warning' for priority='high'; intent='info' otherwise)
 *                         → optional "Open" action navigating to /app/{entity_type}/{entity_id}
 *
 *   notification:count  — payload { count }
 *                         → updates ctx.unreadCount, which the Topbar bell badge reads
 *                           via useNotificationStream()
 *
 * Mounted once at shell layout level so every authenticated route gets live
 * notifications + a fresh unread count without per-page wiring.
 *
 * Auth: EventSource sends cookies via the same-origin /api/relay/* path; the
 * relay forwards the session JWT as a Bearer header. No extra auth wiring
 * needed.
 *
 * Reconnection: native EventSource handles transient drops. On hard failure
 * (auth lost) the browser keeps retrying — the relay returns 401 and the
 * user is logged out via the existing AuthFailureBridge path.
 */

interface NotificationStreamCtx {
  unreadCount: number;
}

const NotificationStreamContext = createContext<NotificationStreamCtx>({
  unreadCount: 0,
});

export function useNotificationStream(): NotificationStreamCtx {
  return useContext(NotificationStreamContext);
}

export function NotificationStreamProvider({ children }: { children: ReactNode }) {
  const router          = useRouter();
  const { toast }       = useToast();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Skip on SSR / hostile environments.
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const source = new EventSource("/api/relay/platform/notifications/stream", {
      withCredentials: true,
    });

    function onNew(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data) as {
          id:           string;
          subject?:     string | null;
          event_code?:  string;
          entity_type?: string | null;
          entity_id?:   string | null;
          priority?:    "low" | "normal" | "high" | string;
        };

        const intent = data.priority === "high" ? "warning" : "info";
        const detailHref = data.entity_type && data.entity_id
          ? `/app/${data.entity_type}/${data.entity_id}`
          : undefined;

        toast({
          title:       data.subject ?? "New notification",
          description: data.event_code ?? undefined,
          intent,
          duration:    6_000,
          ...(detailHref ? { action: { label: "Open", onClick: () => router.push(detailHref) } } : {}),
        });
      } catch {
        // Bad payload — silently ignore. The next event will retry.
      }
    }

    function onCount(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data) as { count?: number };
        if (typeof data.count === "number" && Number.isFinite(data.count)) {
          setUnreadCount(Math.max(0, Math.floor(data.count)));
        }
      } catch {
        // Bad payload — ignore; next count poll will overwrite.
      }
    }

    source.addEventListener("notification:new",   onNew);
    source.addEventListener("notification:count", onCount);

    source.onerror = () => {
      // EventSource auto-reconnects. Nothing to do unless we want to
      // surface persistent failure — the AuthFailureBridge handles 401s.
    };

    return () => {
      source.removeEventListener("notification:new",   onNew);
      source.removeEventListener("notification:count", onCount);
      source.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NotificationStreamContext.Provider value={{ unreadCount }}>
      {children}
    </NotificationStreamContext.Provider>
  );
}
