/**
 * Next.js instrumentation hook.
 *
 * Runs once per process at startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await import("./instrumentation.node");
}
