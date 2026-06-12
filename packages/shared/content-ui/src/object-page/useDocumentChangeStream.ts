"use client";

import { useEffect, useRef } from "react";

/**
 * Events emitted by the server's record stream
 * (`GET /api/records/:entity/:id/stream`).
 *
 * - `record.connected` — Sent once on initial subscribe. Carries the
 *   current `etag` and `status` so the client can compare incoming
 *   events to its session's etag without a separate /edit-context round-trip.
 * - `record.statusChanged` — Emitted when the record's status transitions
 *   server-side (e.g. another user approved while we were editing).
 * - `record.deleted` — Emitted when the record is hard-deleted. Forward-
 *   declared here; not currently published by the server.
 */
export type DocumentChangeEventType =
  | "record.connected"
  | "record.statusChanged"
  | "record.deleted";

export interface DocumentChangeEvent {
  type: DocumentChangeEventType;
  data: {
    etag?:      string;
    status?:    string;
    newStatus?: string;
    oldStatus?: string | null;
    actorId?:   string;
  };
}

export interface UseDocumentChangeStreamOptions {
  /** Path or full URL to the SSE endpoint. Default: relay path. */
  url: string;
  /**
   * When false, the hook tears down any open stream and does not reconnect.
   * Typical usage: pass `editSession.isEditing` so the connection only
   * lives during edit mode.
   */
  enabled: boolean;
  /** Called for each event from the server. */
  onEvent: (event: DocumentChangeEvent) => void;
  /**
   * Optional callback for connection state changes. Useful for showing a
   * "live updates paused" affordance when EventSource cannot connect.
   */
  onConnectionStateChange?: (state: "connecting" | "open" | "closed") => void;
  /**
   * Reconnect backoff schedule (ms). After exhausting the list the last
   * value repeats. Defaults to [1000, 2000, 4000, 8000, 16000].
   */
  reconnectBackoffMs?: number[];
}

const DEFAULT_BACKOFF = [1000, 2000, 4000, 8000, 16000];

/**
 * Subscribes to a per-record Server-Sent Events stream and dispatches
 * incoming events to a callback. Auto-reconnects on connection error
 * with exponential backoff. Tears down cleanly on unmount or when
 * `enabled` flips to false.
 *
 * Reusable across neon / mesh / admin — caller provides the relay URL.
 */
export function useDocumentChangeStream(options: UseDocumentChangeStreamOptions): void {
  const { url, enabled, onEvent, onConnectionStateChange, reconnectBackoffMs } = options;

  // Latest callback refs — keeps the useEffect deps stable so we don't
  // tear down and reconnect on every render of the consumer.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  onConnectionStateChangeRef.current = onConnectionStateChange;
  const backoffRef = useRef(reconnectBackoffMs ?? DEFAULT_BACKOFF);
  backoffRef.current = reconnectBackoffMs ?? DEFAULT_BACKOFF;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (typeof EventSource === "undefined") return; // SSR / environments without SSE

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const reportState = (state: "connecting" | "open" | "closed") => {
      onConnectionStateChangeRef.current?.(state);
    };

    const dispatch = (type: DocumentChangeEventType, raw: string) => {
      try {
        const data = JSON.parse(raw) as DocumentChangeEvent["data"];
        onEventRef.current({ type, data });
      } catch {
        // Malformed payload — skip; server's own logger handles its side.
      }
    };

    const connect = (): void => {
      if (cancelled) return;
      reportState("connecting");
      try {
        source = new EventSource(url);
      } catch {
        scheduleReconnect();
        return;
      }

      source.onopen = () => {
        attempt = 0;
        reportState("open");
      };

      source.addEventListener("record.connected", (e) =>
        dispatch("record.connected", (e as MessageEvent).data));
      source.addEventListener("record.statusChanged", (e) =>
        dispatch("record.statusChanged", (e as MessageEvent).data));
      source.addEventListener("record.deleted", (e) =>
        dispatch("record.deleted", (e as MessageEvent).data));

      source.onerror = () => {
        // EventSource auto-reconnects only for specific error classes. To
        // make the behavior predictable, close the stream ourselves and
        // schedule a backoff reconnect.
        if (source && source.readyState === EventSource.CLOSED) {
          scheduleReconnect();
        } else if (source) {
          source.close();
          source = null;
          scheduleReconnect();
        }
      };
    };

    const scheduleReconnect = (): void => {
      if (cancelled) return;
      reportState("closed");
      const schedule = backoffRef.current;
      const delay = schedule[Math.min(attempt, schedule.length - 1)] ?? 16000;
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (source) {
        try { source.close(); } catch { /* ignore */ }
        source = null;
      }
      reportState("closed");
    };
    // url + enabled changes do warrant tear-down + reconnect; callbacks
    // are read via refs so the effect doesn't re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);
}
