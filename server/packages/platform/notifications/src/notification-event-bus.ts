import type {
  NotificationEventPublisher,
  NotificationEventSubscriber,
  NotificationStreamEvent,
  NotificationStreamListener,
} from "@athyper/server-contract-notifications";

export interface NotificationEventBus
  extends NotificationEventPublisher,
    NotificationEventSubscriber {
  close(): void;
}

export function createNotificationEventBus(): NotificationEventBus {
  const listeners = new Map<string, Set<NotificationStreamListener>>();
  let closed = false;

  return {
    async publish(event) {
      if (closed) return;
      const scoped = listeners.get(key(event.tenantId, event.principalId));
      if (!scoped) return;
      await Promise.allSettled([...scoped].map((listener) => Promise.resolve().then(() => listener(event))));
    },
    subscribe(scope, listener) {
      if (closed) throw new Error("Notification event bus is closed");
      const scopeKey = key(scope.tenantId, scope.principalId);
      const scoped = listeners.get(scopeKey) ?? new Set();
      scoped.add(listener);
      listeners.set(scopeKey, scoped);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        scoped.delete(listener);
        if (scoped.size === 0) listeners.delete(scopeKey);
      };
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}

export function serializeNotificationSseEvent(event: NotificationStreamEvent): string {
  return `event: ${event.type}\nid: ${event.notificationId}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Streams an already-authorized tenant/principal scope to an HTTP-compatible writer. */
export function openNotificationSseStream(input: {
  readonly subscriber: NotificationEventSubscriber;
  readonly tenantId: string;
  readonly principalId: string;
  readonly write: (chunk: string) => void;
  readonly signal: AbortSignal;
  readonly heartbeatMs?: number;
}): () => void {
  if (input.signal.aborted) return () => undefined;
  let open = true;
  let unsubscribe = (): void => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const close = (): void => {
    if (!open) return;
    open = false;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    input.signal.removeEventListener("abort", close);
  };
  const write = (chunk: string): void => {
    if (!open) return;
    try { input.write(chunk); } catch { close(); }
  };
  write(": connected\n\n");
  if (!open) return close;
  unsubscribe = input.subscriber.subscribe(
    { tenantId: input.tenantId, principalId: input.principalId },
    (event) => write(serializeNotificationSseEvent(event)),
  );
  heartbeat = setInterval(
    () => write(`: heartbeat ${Date.now()}\n\n`),
    input.heartbeatMs ?? 15_000,
  );
  input.signal.addEventListener("abort", close, { once: true });
  return close;
}

function key(tenantId: string, principalId: string): string {
  return `${tenantId}\u0000${principalId}`;
}
