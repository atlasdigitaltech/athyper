import type { AddItemTelemetryEvent } from "./events";

// ─────────────────────────────────────────────────────────────────────────────
// GlitchTip telemetry bridge.
//
// Maps the eight `AddItemTelemetryEvent` types to Sentry-SDK calls
// (captureException / captureMessage / addBreadcrumb). GlitchTip is
// Sentry-SDK compatible; any app using @sentry/browser, @sentry/nextjs, or
// the server-side @sentry/node can wire this bridge as their
// telemetryListener and start observing the framework in GlitchTip.
//
// SDK install status: the bridge is SDK-agnostic by design. It reaches for
//   1. an explicit `sentry` option (preferred — pass the imported Sentry
//      module directly), or
//   2. `globalThis.Sentry` (the SDK was loaded via a script tag or assigned
//      to globalThis during Sentry.init),
//   3. otherwise falls back to console.debug in dev and no-op in prod.
//
// To wire the SDK in a Next.js app (e.g., apps/neon):
//   1. pnpm add @sentry/browser
//   2. In instrumentation-client.ts:
//        import * as Sentry from "@sentry/browser";
//        Sentry.init({ dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN, ... });
//   3. Pass Sentry directly when creating the listener:
//        const listener = createGlitchTipTelemetryListener({ sentry: Sentry });
//      OR assign to globalThis to make the listener pick it up automatically:
//        (globalThis as any).Sentry = Sentry;
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal Sentry-SDK shape this bridge consumes. Subset of @sentry/types. */
export interface SentryLike {
  captureException(
    error: Error,
    context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
  ): string | void;
  captureMessage(
    message: string,
    level?: "error" | "warning" | "info",
  ): string | void;
  addBreadcrumb(crumb: {
    category?: string;
    message?: string;
    level?: "error" | "warning" | "info" | "debug";
    data?: Record<string, unknown>;
  }): void;
}

export interface CreateGlitchTipTelemetryListenerOptions {
  /**
   * Sentry SDK reference. When omitted, the listener reaches for
   * `globalThis.Sentry`. When neither is present, the listener falls back
   * to console.debug in development and no-op in production so the
   * framework's commit pipeline never blocks on a missing SDK.
   */
  sentry?: SentryLike;
}

declare const process: { env: { NODE_ENV: string } };

function resolveSentry(opts: CreateGlitchTipTelemetryListenerOptions): SentryLike | null {
  if (opts.sentry) return opts.sentry;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromGlobal = (globalThis as any).Sentry as SentryLike | undefined;
  return fromGlobal ?? null;
}

function fallbackLog(event: AddItemTelemetryEvent): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[source-adapters][fallback]", event.type, event);
  }
}

/**
 * Build a telemetry listener that maps `AddItemTelemetryEvent` to
 * GlitchTip-bound Sentry calls. Pass the returned function to the app's
 * adapter-registry bootstrap (e.g. `createNeonSourceAdapters({ telemetryListener })`).
 */
export function createGlitchTipTelemetryListener(
  opts: CreateGlitchTipTelemetryListenerOptions = {},
): (event: AddItemTelemetryEvent) => void {
  return (event: AddItemTelemetryEvent) => {
    const sentry = resolveSentry(opts);
    if (!sentry) {
      fallbackLog(event);
      return;
    }
    dispatchToSentry(sentry, event);
  };
}

function dispatchToSentry(sentry: SentryLike, event: AddItemTelemetryEvent): void {
  switch (event.type) {
    case "adapter.reject":
      // Reject at register time is always a deployment bug (duplicate id,
      // framework version mismatch, malformed manifest). Surface as error.
      sentry.captureMessage(
        `[source-adapter] reject ${event.adapterId} (${event.code}): ${event.reason}`,
        "error",
      );
      return;

    case "picker.fetch.fail":
      // Fetch failures are user-impacting (picker shows error / empty). The
      // underlying error string carries the backend cause.
      sentry.captureException(new Error(event.error), {
        tags: {
          source_adapter: event.adapterId,
          source_phase: "picker.fetch",
        },
        extra: {
          durationMs: String(event.durationMs),
          seq: String(event.seq),
        },
      });
      return;

    case "commit.fail":
      // Commit failures are the load-bearing ones — sourceBinding mismatch,
      // duplicate guard, stale rejection. Capture as exception so they
      // surface in the GlitchTip issue stream.
      sentry.captureException(new Error(event.error), {
        tags: {
          source_adapters: event.adapterIds.join(","),
          source_phase: "commit",
        },
        extra: { seq: String(event.seq) },
      });
      return;

    case "commit.stale":
      // Stale-flag is informational when strategy=warn/refresh (line still
      // commits); a paired commit.fail will follow under strategy=fail.
      sentry.captureMessage(
        `[source-adapter] stale ${event.adapterId} (strategy=${event.strategy}, lines=${event.lineCount})`,
        event.strategy === "fail" ? "warning" : "info",
      );
      return;

    case "adapter.register":
    case "picker.open":
    case "picker.fetch.ok":
    case "commit.ok":
      // Routine flow events — breadcrumbs so they show up as context when a
      // later commit.fail / picker.fetch.fail surfaces.
      sentry.addBreadcrumb({
        category: "source-adapter",
        message: event.type,
        level: "info",
        data: extractEventData(event),
      });
      return;
  }
}

/**
 * Strip the discriminator + standard sequence fields so the breadcrumb data
 * only carries the event's unique payload.
 */
function extractEventData(event: AddItemTelemetryEvent): Record<string, unknown> {
  const data: Record<string, unknown> = { seq: event.seq };
  switch (event.type) {
    case "adapter.register":
      data.adapterId = event.adapterId;
      data.version = event.version;
      break;
    case "picker.open":
      data.adapterId = event.adapterId;
      break;
    case "picker.fetch.ok":
      data.adapterId = event.adapterId;
      data.itemCount = event.itemCount;
      data.durationMs = event.durationMs;
      break;
    case "commit.ok":
      data.adapterIds = event.adapterIds;
      data.lineCount = event.lineCount;
      break;
  }
  return data;
}
