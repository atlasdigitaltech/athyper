import "server-only";

/**
 * Module-level singleton Redis client for session operations.
 *
 * Per-request clients trigger an ECONNRESET uncaughtException in node-redis v4
 * after quit() resolves. A persistent singleton eliminates the connect/disconnect
 * cycle entirely. reconnectStrategy handles transient Redis unavailability.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRedisClient = any;

let _client: AnyRedisClient = null;
let _promise: Promise<AnyRedisClient> | null = null;

const CONNECT_TIMEOUT_MS = 5000;
// Socket timeout: close the socket if no data is received for > 3s.
// @redis/client has no per-command timeout — socketTimeout is the correct
// option. It fires when the connection goes silent, triggering reconnect
// and unblocking any queued commands waiting on a stale TCP socket.
const SOCKET_TIMEOUT_MS = 3000;

// Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, 5000ms (cap), then give up.
// 5 retries gives ~9.5s of total recovery time — enough to survive a transient
// Docker networking blip or brief Redis restart without abandoning the process.
const MAX_RECONNECT_RETRIES = 5;
const RECONNECT_BASE_MS = 300;
const RECONNECT_CAP_MS = 5000;

function reconnectStrategy(retries: number): number | Error {
  if (retries >= MAX_RECONNECT_RETRIES) {
    return new Error(`Redis reconnect exhausted after ${MAX_RECONNECT_RETRIES} attempts`);
  }
  return Math.min(RECONNECT_BASE_MS * Math.pow(2, retries), RECONNECT_CAP_MS);
}

function createConnection(): Promise<AnyRedisClient> {
  _promise = (async () => {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({
      url,
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        noDelay: true,
        keepAlive: true, // TCP keepalive — prevents Docker port-map drops
        reconnectStrategy,
      },
    });
    client.on("error", () => {});

    // Belt-and-suspenders timeout in case connectTimeout isn't honoured
    // (observed on Windows Docker: ECONNRESET can take 30s+ per attempt)
    const connectWithTimeout = Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis connect timed out")), CONNECT_TIMEOUT_MS + 500),
      ),
    ]);

    await connectWithTimeout;
    _client = client;
    _promise = null;
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
