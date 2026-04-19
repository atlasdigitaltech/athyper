/**
 * Sentry Node runtime SDK — Neon web (Next.js server components + route handlers).
 *
 * Runs in the Node.js runtime of the Next.js server. Distinct from:
 *   - sentry.edge.config.ts  — middleware / edge runtime
 *   - sentry.client.config.ts — browser bundle
 *   - server/src/foundation/monitoring/sentry.ts — the runtime API process
 *
 * DSN: SENTRY_DSN (server-only) falls back to NEXT_PUBLIC_SENTRY_DSN so a single
 * secret covers both sides when desired.
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
        runtime: "nodejs",
        service: "athyper-web",
      },
    },
    ignoreErrors: ["ECONNRESET", "EPIPE"],
  });
}
