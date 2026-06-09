/**
 * Sentry SDK initialiser — targets self-hosted GlitchTip.
 *
 * GlitchTip is Sentry-SDK-compatible; the DSN points at
 *   https://<public-key>@errors.athyper.{local,com}/<project-id>
 * and is generated in the GlitchTip admin UI after creating a project.
 *
 * Init runs at the very top of app.ts, BEFORE any other imports from
 * the codebase and BEFORE loadConfig(). Reading env directly (not the
 * Zod-validated config) is intentional: we want Sentry live to capture
 * boot-time failures, including a broken config file.
 *
 * When GLITCHTIP_DSN is unset, initSentry() is a no-op. The SDK's
 * captureException / captureMessage calls remain safe in that state —
 * they become silent drops rather than errors.
 */
import * as Sentry from "@sentry/node";

export interface SentryInitOptions {
  /** MODE value — "api" | "worker" | "scheduler". Tags events for filtering. */
  mode: string;
  /** SERVICE_VERSION env var value, if set. */
  release?: string;
  /** ENVIRONMENT env var value — "local" | "staging" | "production". */
  environment?: string;
}

let _initialised = false;

export function initSentry(opts: SentryInitOptions): boolean {
  const dsn = process.env.GLITCHTIP_DSN?.trim();
  if (!dsn) return false;

  if (_initialised) return true;

  Sentry.init({
    dsn,
    environment: opts.environment ?? process.env.ENVIRONMENT ?? "local",
    release: opts.release ?? process.env.SERVICE_VERSION,
    initialScope: {
      tags: {
        mode: opts.mode,
        service: process.env.SERVICE_NAME ?? "athyper-runtime",
      },
    },
    // Conservative defaults — errors + a small perf sample. Tune via env
    // once the project has traffic baselines.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Drop obvious local-dev noise. Add project-specific filters later.
    ignoreErrors: [
      "ECONNRESET",
      "EPIPE",
    ],
  });

  _initialised = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return _initialised;
}

export { Sentry };
