/**
 * Sentry browser SDK — Neon web workbench.
 *
 * Targets self-hosted GlitchTip (Sentry-SDK-compatible). DSN comes from
 * NEXT_PUBLIC_SENTRY_DSN; leave unset to disable the SDK entirely (init is a
 * no-op when dsn is falsy).
 *
 * Aligned with server-side init at
 * server/src/foundation/monitoring/sentry.ts — same release / environment
 * conventions so events from both sides group correctly.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? "local",
    release: process.env.NEXT_PUBLIC_SERVICE_VERSION,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "ChunkLoadError",
    ],
  });
}
