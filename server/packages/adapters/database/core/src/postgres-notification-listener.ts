import pg from "pg";
const { Client } = pg;

export interface PostgresNotificationListenerConfig {
  readonly connectionString: string;
  readonly channel: string;
  readonly connectionMode: "direct";
  readonly reconnectMinMs?: number;
  readonly reconnectMaxMs?: number;
  readonly onError?: (error: Error) => void;
  /** Test/embedding hook; production callers use the default pg client. */
  readonly createClient?: () => pg.Client;
}
export interface PostgresNotificationListener { start(onWake: () => void, onReconnect: () => void): Promise<void>; close(): Promise<void>; }

/** Dedicated PostgreSQL session listener. Never use a transaction-pooled PgBouncer URL. */
export function createPostgresNotificationListener(config: PostgresNotificationListenerConfig): PostgresNotificationListener {
  if (config.connectionMode !== "direct") throw new TypeError("LISTEN requires a direct PostgreSQL session connection");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(config.channel)) throw new TypeError("Invalid PostgreSQL notification channel");
  const min = config.reconnectMinMs ?? 500;
  const max = config.reconnectMaxMs ?? 30_000;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 100 || max < min) throw new TypeError("Invalid listener reconnect policy");

  let client: pg.Client | undefined;
  let connecting: Promise<void> | undefined;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let wake = () => {};
  let reconnected = () => {};
  const ending = new WeakSet<pg.Client>();

  const end = async (target: pg.Client): Promise<void> => {
    if (ending.has(target)) return;
    ending.add(target);
    try { await target.end(); } catch { /* failed sessions may already be closed */ }
  };

  const scheduleReconnect = (failed: pg.Client): void => {
    if (client === failed) client = undefined;
    void end(failed);
    if (closed || reconnectTimer) return;
    const delay = Math.min(max, min * 2 ** Math.min(attempt++, 8));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connecting = connect().finally(() => { connecting = undefined; });
    }, delay);
    (reconnectTimer as { unref?: () => void }).unref?.();
  };

  const connect = async (): Promise<void> => {
    if (closed) return;
    const next = config.createClient?.() ?? new Client({ connectionString: config.connectionString, application_name: `athyper-listener-${config.channel}` });
    client = next;
    let failed = false;
    const fail = (error?: Error): void => {
      if (failed) return;
      failed = true;
      if (error) config.onError?.(error);
      scheduleReconnect(next);
    };
    next.on("notification", (message) => { if (!failed && !closed && message.channel === config.channel) wake(); });
    next.on("error", (error) => fail(error));
    next.on("end", () => fail());
    try {
      await next.connect();
      if (closed || client !== next) { await end(next); return; }
      await next.query(`LISTEN ${config.channel}`);
      if (closed || client !== next) { await end(next); return; }
      const wasReconnect = attempt > 0;
      attempt = 0;
      if (wasReconnect) reconnected();
      wake();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return {
    async start(onWake, onReconnect) {
      if (client || reconnectTimer || connecting) return;
      closed = false;
      wake = onWake;
      reconnected = onReconnect;
      connecting = connect().finally(() => { connecting = undefined; });
      await connecting;
    },
    async close() {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = undefined; }
      const current = client;
      client = undefined;
      if (current) await end(current);
      await connecting;
    },
  };
}
