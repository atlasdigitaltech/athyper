/**
 * Next.js instrumentation hook.
 *
 * Loads the correct Sentry runtime SDK depending on where the code is running.
 * Next.js invokes register() exactly once per process at startup.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Suppress the Node.js TLS warning that fires on every RSC request in local dev
  // when NODE_TLS_REJECT_UNAUTHORIZED=0 (self-signed certs). Next.js captures this
  // warning via its console.error intercept and sends it to the browser DevTools overlay.
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    const _emitWarning = process.emitWarning.bind(process);
    process.emitWarning = (warning, ...args) => {
      const msg = typeof warning === "string" ? warning : warning?.message ?? "";
      if (msg.includes("NODE_TLS_REJECT_UNAUTHORIZED")) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_emitWarning as (...a: any[]) => void)(warning, ...args);
    };
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
