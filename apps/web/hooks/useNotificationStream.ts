"use client";

/**
 * useNotificationStream
 *
 * Subscribes to the notification SSE stream at /api/notifications/stream.
 * Handles reconnection with exponential backoff (max 30 s).
 *
 * Effects:
 *   notification:count → sets query cache ["notifications", "unread-count"]
 *   notification:new   → invalidates ["notifications"] (panel + center refetch)
 *
 * The hook is intentionally side-effect-only — callers read unread count from
 * the React Query cache via their own useQuery(["notifications", "unread-count"]).
 * This keeps the live-update mechanism decoupled from every consumer.
 *
 * Usage:
 *   // Mount once at the shell level (AppTopbar or AppShellLayout)
 *   useNotificationStream({ enabled: !!user });
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface UseNotificationStreamOptions {
  /** Only open the SSE connection when true (e.g. once the user session is ready). */
  enabled?: boolean;
}

const MIN_RECONNECT_MS  = 2_000;
const MAX_RECONNECT_MS  = 30_000;
const BACKOFF_FACTOR    = 2;

export function useNotificationStream({ enabled = true }: UseNotificationStreamOptions = {}) {
  const queryClient    = useQueryClient();
  const esRef          = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay          = useRef(MIN_RECONNECT_MS);
  const mounted        = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      if (!mounted.current) return;

      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;

      es.addEventListener("notification:count", (e: MessageEvent) => {
        try {
          const { count } = JSON.parse(e.data as string) as { count: number };
          queryClient.setQueryData<{ count: number }>(
            ["notifications", "unread-count"],
            (prev) => (prev?.count === count ? prev : { count }),
          );
          // Reset backoff on a successful event
          delay.current = MIN_RECONNECT_MS;
        } catch { /* ignore parse errors */ }
      });

      es.addEventListener("notification:new", () => {
        // Refresh the panel + notification center list
        void queryClient.invalidateQueries({ queryKey: ["notifications", "panel"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
        delay.current = MIN_RECONNECT_MS;
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!mounted.current) return;
        // Exponential backoff reconnect
        reconnectTimer.current = setTimeout(() => {
          delay.current = Math.min(delay.current * BACKOFF_FACTOR, MAX_RECONNECT_MS);
          connect();
        }, delay.current);
      };
    }

    connect();

    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
