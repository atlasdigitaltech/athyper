import "server-only";

/**
 * Module-level singleton Redis client for session operations.
 *
 * Per-request clients (createClient → connect → ops → quit) trigger an
 * ECONNRESET uncaughtException in node-redis v4: after quit() resolves,
 * the library destroys the socket internally. If the OS delivers a late
 * TCP RST at that moment, the socket fires an error event after the
 * client's error forwarder has been torn down — no handler → uncaughtException.
 *
 * A persistent singleton eliminates the connect/disconnect cycle entirely.
 * reconnectStrategy handles transient Redis unavailability automatically.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRedisClient = any;

let _client: AnyRedisClient = null;
let _promise: Promise<AnyRedisClient> | null = null;

function createConnection(): Promise<AnyRedisClient> {
  _promise = (async () => {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({
      url,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (retries: number) => {
          if (retries >= 3) return false; // fail fast — don't hang indefinitely
          return Math.min(retries * 200, 1000);
        },
      },
    });
    client.on("error", () => {});
    await client.connect();
    _client = client;
    _promise = null;
    // Reset so the next call triggers a fresh connection after a disconnect.
    client.on("end", () => {
      if (_client === client) _client = null;
    });
    return client;
  })().catch((err: unknown) => {
    _promise = null;
    throw err;
  });
  return _promise;
}

export async function getSessionRedis(): Promise<AnyRedisClient> {
  if (_client?.isOpen) return _client;
  return _promise ?? createConnection();
}
