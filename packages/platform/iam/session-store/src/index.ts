import type { RedisClientType } from "redis";

import type { EnvBag } from "@athyper/platform-iam-session-plane";

export interface SessionRedisClientOptions {
  url?: string;
  env?: EnvBag;
  pingIntervalMs?: number;
  connectTimeoutMs?: number;
  maxReconnectRetries?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  logPrefix?: string;
}

export type SessionRedisClient = RedisClientType;

interface ResolvedSessionRedisClientOptions {
  url: string;
  pingIntervalMs: number;
  connectTimeoutMs: number;
  maxReconnectRetries: number;
  baseReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  logPrefix: string;
}

// Module-level singleton for the Redis client. Next.js hot-reload and
// multi-worker environments can call createSessionRedisClient() from many
// concurrent request handlers; the promise deduplication below ensures only
// one physical TCP connection is established per Node.js process.
let sessionRedisClient: SessionRedisClient | null = null;
let sessionRedisPromise: Promise<SessionRedisClient> | null = null;
let sessionRedisFingerprint: string | null = null;

export async function createSessionRedisClient(
  options: SessionRedisClientOptions = {},
): Promise<SessionRedisClient> {
  const resolved = resolveSessionRedisOptions(options);
  const fingerprint = sessionRedisOptionsFingerprint(resolved);
  // Do NOT clear the fingerprint here when the connection is closed. Clearing it
  // would allow a reconnect call with a *different* Redis URL to pass the
  // compatibility guard, potentially routing sessions to the wrong Redis instance.
  // The fingerprint is only cleared explicitly by resetSessionRedisClientForTests.
  assertCompatibleRedisOptions(fingerprint);
  if (sessionRedisClient?.isOpen) return sessionRedisClient;
  if (sessionRedisPromise) return sessionRedisPromise;
  sessionRedisFingerprint = fingerprint;

  sessionRedisPromise = (async () => {
    const { createClient } = await import("redis");
    const client = createClient({
      url: resolved.url,
      pingInterval: resolved.pingIntervalMs,
      socket: {
        connectTimeout: resolved.connectTimeoutMs,
        noDelay: true,
        keepAlive: true,
        reconnectStrategy(retries: number) {
          // Returning an Error (not false) causes the redis client to emit an
          // "error" event with this message, which is caught by our error listener
          // and logged. The client stays in a permanently-errored state until the
          // module is reset via resetSessionRedisClientForTests or process restart.
          if (retries >= resolved.maxReconnectRetries) return new Error("Redis reconnect exhausted");
          return Math.min(resolved.baseReconnectDelayMs * Math.pow(2, retries), resolved.maxReconnectDelayMs);
        },
      },
    });
    client.on("error", (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(resolved.logPrefix, message);
    });
    await client.connect();
    sessionRedisClient = client as SessionRedisClient;
    sessionRedisPromise = null;
    return sessionRedisClient;
  })().catch((err) => {
    sessionRedisPromise = null;
    // Keep the fingerprint on failure so that a failed reconnect cannot be
    // exploited to swap the Redis URL on the next call. The fingerprint is only
    // ever cleared intentionally by resetSessionRedisClientForTests.
    throw err;
  });

  return sessionRedisPromise;
}

export async function resetSessionRedisClientForTests(): Promise<void> {
  const client = sessionRedisClient;
  sessionRedisClient = null;
  sessionRedisPromise = null;
  sessionRedisFingerprint = null;
  if (!client?.isOpen) return;
  await client.quit().catch(async () => {
    await client.disconnect();
  });
}

function resolveSessionRedisOptions(options: SessionRedisClientOptions): ResolvedSessionRedisClientOptions {
  const processEnv = (globalThis as typeof globalThis & { process?: { env?: EnvBag } }).process?.env;
  const env = options.env ?? processEnv ?? {};
  return {
    url: options.url ?? env.REDIS_URL ?? "redis://localhost:6379/0",
    pingIntervalMs: options.pingIntervalMs ?? 30_000,
    connectTimeoutMs: options.connectTimeoutMs ?? 5_000,
    maxReconnectRetries: options.maxReconnectRetries ?? 5,
    baseReconnectDelayMs: options.baseReconnectDelayMs ?? 300,
    maxReconnectDelayMs: options.maxReconnectDelayMs ?? 5_000,
    logPrefix: options.logPrefix ?? "[session-plane-node/redis]",
  };
}

function sessionRedisOptionsFingerprint(options: ResolvedSessionRedisClientOptions): string {
  return JSON.stringify(options);
}

function assertCompatibleRedisOptions(fingerprint: string): void {
  if (sessionRedisFingerprint && sessionRedisFingerprint !== fingerprint) {
    throw new Error(
      "Session Redis client was already initialized with different options. " +
        "Reset the singleton before using a different Redis configuration.",
    );
  }
}
