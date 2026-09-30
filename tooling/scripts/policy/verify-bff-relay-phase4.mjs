import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const read = (path) =>
  readFileSync(new URL(path, root), "utf8").replace(/^\uFEFF/, "");
const failures = [];
const manifest = JSON.parse(
  read("packages/platform/gateway/bff-relay/package.json"),
);
const relayExport = manifest.exports?.["."];
if (
  relayExport?.node !== "./src/index.ts" ||
  relayExport?.browser !== "./src/browser-denied.ts" ||
  relayExport?.default !== "./src/browser-denied.ts"
)
  failures.push("Relay package must retain server-only conditional exports");

const relay = read("packages/platform/gateway/bff-relay/src/index.ts");
for (const marker of [
  "operations.map(compileOperation)",
  "RELAY_OPERATION_NOT_ALLOWED",
  "BLOCKED_REQUEST_HEADERS",
  "authorization",
  "x-plane",
  "x-tenant-id",
  "x-principal-id",
  "x-realm",
  "verifyUnsafeRequest",
  "RELAY_BODY_TOO_LARGE",
  "RELAY_HEADERS_TOO_LARGE",
  "CONTENT_ENCODING_UNSUPPORTED",
  "sameAuthority",
  "AUTH_CONTEXT_MISMATCH",
  "cancelOnDisconnect",
  "SAFE_RESPONSE_HEADERS",
])
  if (!relay.includes(marker))
    failures.push(`Relay implementation is missing ${marker}`);
if (/console\.(?:log|info|warn|error)/.test(relay))
  failures.push(
    "Relay implementation must use structured redacted diagnostics rather than console logging",
  );
if (/routePrefix|\[\.\.\.path\].*forward/i.test(relay))
  failures.push("Relay must not restore unrestricted proxy routing");

for (const plane of ["neon", "mesh", "studio"]) {
  const routePath = `apps/${plane}/app/api/relay/[...path]/route.ts`;
  const configPath = `apps/${plane}/lib/relay.ts`;
  if (
    !existsSync(new URL(routePath, root)) ||
    !existsSync(new URL(configPath, root))
  )
    failures.push(`${plane} relay route/config is missing`);
  else {
    const route = read(routePath);
    const config = read(configPath); // The server URL is required through the shared BFF environment contract
    // (REQUIRED_BFF_ENVIRONMENT + validateRuntimeEnvironment), which each plane
    // consumes as readAppEnvironment().runtimeApiUrl. The former per-plane
    // requiredEnvironment("RUNTIME_API_URL") helper no longer exists.
    if (
      !route.includes("@/lib/relay") ||
      !config.includes("...COMMON_PLANE_RELAY_OPERATIONS") ||
      !relay
        .slice(relay.indexOf("export const COMMON_PLANE_RELAY_OPERATIONS"))
        .includes("IAM_ME_OPERATION") ||
      !config.includes("readAppEnvironment().runtimeApiUrl")
    )
      failures.push(
        `${plane} relay must be a thin route with explicit IAM allowlisting and a server URL from the shared environment contract`,
      );
    if (/packages-backup|apps-backup|NEXT_PUBLIC_RUNTIME/.test(route + config))
      failures.push(
        `${plane} relay references a forbidden source or public runtime URL`,
      );
  }
}

if (
  !["neon", "mesh", "studio"].every((plane) =>
    read(`apps/${plane}/lib/relay.ts`).includes(
      "relaySessionFromAuth(authRuntime)",
    ),
  ) ||
  !relay.includes("auth.resolveRelaySession(request)") ||
  !relay.includes("auth.refreshRelaySession(request)") ||
  !relay.includes("auth.invalidateRelaySession(request, reason)")
)
  failures.push(
    "Application relays must resolve and invalidate through the shared server auth runtime",
  );

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(
  "Phase 4 BFF relay policy verified: server-only allowlist, authoritative context, bounded forwarding, and thin plane routes.",
);
