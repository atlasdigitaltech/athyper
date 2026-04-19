/**
 * Sentry edge-runtime SDK — covers Next.js middleware and edge route handlers.
 *
 * The edge runtime is a restricted V8 isolate (no Node APIs). @sentry/nextjs
 * ships a compatible init surface; keep this config minimal.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.ENVIRONMENT ?? process.env.NEXT_PUBLIC_ENVIRONMENT ?? "local",
    release: process.env.SERVICE_VERSION ?? process.env.NEXT_PUBLIC_SERVICE_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    initialScope: {
      tags: {
        runtime: "edge",
        service: "athyper-web",
      },
    },
  });
}
