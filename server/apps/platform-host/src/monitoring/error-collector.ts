import * as Sentry from "@sentry/node";

let enabled = false;

export function initializeErrorCollector(): void {
  const dsn = process.env["GLITCHTIP_DSN"]?.trim() || process.env["SENTRY_DSN"]?.trim();
  if (!dsn) return;

  const tracesSampleRate = readSampleRate(process.env["SENTRY_TRACES_SAMPLE_RATE"]);
  Sentry.init({
    dsn,
    environment: process.env["ENVIRONMENT"]?.trim() || process.env["NODE_ENV"]?.trim(),
    release: process.env["SERVICE_VERSION"]?.trim() || undefined,
    tracesSampleRate,
    serverName: `athyper-platform-${process.env["MODE"]?.trim() || "api"}`,
  });
  Sentry.setTag("process.mode", process.env["MODE"]?.trim() || "api");
  enabled = true;
}

export function captureFatalError(error: unknown, phase: string): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setLevel("fatal");
    scope.setTag("failure.phase", phase);
    Sentry.captureException(error);
  });
}

export function captureOperationalError(
  error: unknown,
  tags: Readonly<Record<string, string>> = {},
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    Sentry.captureException(error);
  });
}

export async function flushErrorCollector(timeoutMs = 2_000): Promise<boolean> {
  return enabled ? Sentry.flush(timeoutMs) : true;
}

function readSampleRate(raw: string | undefined): number {
  if (!raw?.trim()) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}
