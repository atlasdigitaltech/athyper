import "server-only";

/**
 * Module-level singleton Redis client for session operations.
 *
 * Per-request clients trigger an ECONNRESET uncaughtException in node-redis v4/v5
 * after quit() resolves. A persistent singleton eliminates the connect/disconnect
 * cycle entirely. reconnectStrategy handles transient Redis unavailability.
 *
 * Why no socketTimeout: socketTimeout fires whenever the socket is silent for N ms,
 * which includes healthy idle periods between session reads. On a persistent
 * singleton with infrequent commands this fires constantly even when Redis is fine.
 * pingInterval is the correct mechanism — it keeps the socket warm and detects
 * dead connections via failed PINGs rather than inactivity silence.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRedisClient = any;

let _client: AnyRedisClient = null;
let _promise: Promise<AnyRedisClient> | null = null;
let _exhaustedAt = 0;
let _lastLoggedErr = "";

const CONNECT_TIMEOUT_MS = 5000;
// Socket timeout: close the socket if no data is received for this many ms.
// 0 = disabled (recommended for local dev — idle connections between page loads
// would otherwise trigger constant reconnects on Windows Docker).
// Set REDIS_SOCKET_TIMEOUT_MS in production to detect stale TCP sockets.
const SOCKET_TIMEOUT_MS = process.env.REDIS_SOCKET_TIMEOUT_MS
  ? parseInt(process.env.REDIS_SOCKET_TIMEOUT_MS, 10)
  : 0;
// Send a PING every 30s to keep the socket warm and detect dead connections.
// Must be shorter than any upstream idle-timeout (Docker NAT tables, Redis
// server timeout=0 in dev / 300s in staging).
const PING_INTERVAL_MS = 30_000;

// Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, 5000ms (cap), then give up.
// 5 retries gives ~9.5s of total recovery time — enough to survive a transient
// Docker networking blip or brief Redis restart without abandoning the process.
const MAX_RECONNECT_RETRIES = 5;
const RECONNECT_BASE_MS = 300;
const RECONNECT_CAP_MS = 5000;
// After all retries are exhausted, wait before starting a new cycle to avoid
// flooding logs when Redis is down for an extended period.
const EXHAUSTION_COOLDOWN_MS = 30_000;

function reconnectStrategy(retries: number): number | Error {
  if (retries >= MAX_RECONNECT_RETRIES) {
    _exhaustedAt = Date.now();
    return new Error(`Redis reconnect exhausted after ${MAX_RECONNECT_RETRIES} attempts`);
  }
  return Math.min(RECONNECT_BASE_MS * Math.pow(2, retries), RECONNECT_CAP_MS);
}

function createConnection(): Promise<AnyRedisClient> {
  _promise = (async () => {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL || "redis://localhost:6379/0";
    const client = createClient({
      url,
      pingInterval: PING_INTERVAL_MS,
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        ...(SOCKET_TIMEOUT_MS > 0 ? { socketTimeout: SOCKET_TIMEOUT_MS } : {}),
        noDelay: true,
        keepAlive: true, // TCP keepalive — prevents Docker NAT table drops
        reconnectStrategy,
      },
    });
    client.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== _lastLoggedErr) {
        console.warn("[session-redis] Redis error:", msg);
        _lastLoggedErr = msg;
      }
    });
    client.on("ready", () => {
      _lastLoggedErr = ""; // reset dedup so next error is always logged
    });

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
  if (_promise) return _promise;
  // Circuit breaker: after full exhaustion, wait before starting a new retry cycle.
  if (_exhaustedAt && Date.now() - _exhaustedAt < EXHAUSTION_COOLDOWN_MS) {
    const remaining = Math.ceil((EXHAUSTION_COOLDOWN_MS - (Date.now() - _exhaustedAt)) / 1000);
    throw new Error(`Redis unavailable (retry in ${remaining}s)`);
  }
  return createConnection();
}
