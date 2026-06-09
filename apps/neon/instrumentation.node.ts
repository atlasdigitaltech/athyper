/**
 * Node.js-only instrumentation, imported dynamically from instrumentation.ts
 * so the Edge bundler never sees process.emitWarning.
 */
export {};

const localEnvironment = (process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? "development").toLowerCase();
const keycloakBaseUrl =
  process.env.KEYCLOAK_BASE_URL ??
  process.env.IAM_ISSUER_URL?.replace(/\/realms\/[^/]+\/?$/, "") ??
  "https://iam.athyper.local";

let shouldSuppressNodeTlsWarning = process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";

try {
  const keycloakHost = new URL(keycloakBaseUrl).hostname;
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1" &&
    ["local", "development", "test"].includes(localEnvironment) &&
    keycloakHost.endsWith(".athyper.local")
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    shouldSuppressNodeTlsWarning = true;
  }
} catch {
  // Ignore malformed local env and let the auth layer report the real failure.
}

// Local dev uses self-signed gateway certs. Node warns for every HTTPS request,
// and Next.js forwards that server warning into the browser DevTools overlay.
if (shouldSuppressNodeTlsWarning) {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = (warning, ...args) => {
    const message = typeof warning === "string" ? warning : (warning as Error)?.message ?? "";
    if (message.includes("NODE_TLS_REJECT_UNAUTHORIZED")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (emitWarning as (...values: any[]) => void)(warning, ...args);
  };
}
