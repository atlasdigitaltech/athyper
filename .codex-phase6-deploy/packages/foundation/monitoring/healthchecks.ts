/**
 * Healthchecks-compatible cron heartbeat pings.
 *
 * Targets the self-hosted cronwatch service at CRONWATCH_BASE_URL.
 * The service expects GET pings at `<base>/<slug>` for success and
 * POST to `<base>/<slug>/fail` for failure.
 *
 * A slug is derived from the BullMQ queue + job name. Developers create
 * a cronwatch check per slug they want to monitor; unmatched pings
 * are silently dropped server-side (no client-side coordination needed).
 *
 * Design notes:
 *   - No-op when CRONWATCH_BASE_URL is unset (returns immediately).
 *   - All failures are swallowed — a broken monitoring endpoint must not
 *     affect the runtime. Errors log once per cooldown window to avoid
 *     flooding when Healthchecks itself is down.
 *   - 5 s request timeout. Monitoring pings should not block job workers.
 */

const BASE_URL = process.env.CRONWATCH_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const ENABLED = BASE_URL.length > 0;
const REQUEST_TIMEOUT_MS = 5_000;

let _lastErrorLogAt = 0;
const ERROR_LOG_COOLDOWN_MS = 60_000;

function slugify(queue: string, jobName: string): string {
  return `${queue}-${jobName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function logErrorThrottled(err: unknown): void {
  const now = Date.now();
  if (now - _lastErrorLogAt < ERROR_LOG_COOLDOWN_MS) return;
  _lastErrorLogAt = now;
  // Console fallback — the logger isn't threaded through to these hooks
  // and this is a monitoring-plane diagnostic, not app output.
  console.warn(
    "[healthchecks] ping_failed",
    err instanceof Error ? err.message : String(err),
  );
}

async function send(path: string, body?: string): Promise<void> {
  if (!ENABLED) return;
  try {
    await fetch(`${BASE_URL}/${path}`, {
      method: body ? "POST" : "GET",
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logErrorThrottled(err);
  }
}

export function pingSuccess(queue: string, jobName: string): void {
  void send(slugify(queue, jobName));
}

export function pingFail(
  queue: string,
  jobName: string,
  reason?: string,
): void {
  void send(`${slugify(queue, jobName)}/fail`, reason?.slice(0, 1000) ?? "");
}

export function isHealthchecksEnabled(): boolean {
  return ENABLED;
}
