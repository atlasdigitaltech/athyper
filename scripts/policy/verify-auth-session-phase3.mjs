import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8").replace(/^\uFEFF/, "");
const failures = [];
const requireText = (source, values, label) => { for (const value of values) if (!source.includes(value)) failures.push(`${label} is missing ${value}`); };

for (const [path, name] of [["packages/platform/iam/auth-bff/package.json", "auth-bff"], ["packages/platform/iam/session-store/package.json", "session-store"]]) {
  const manifest = JSON.parse(read(path)); const exported = manifest.exports?.["."];
  if (exported?.browser !== "./src/browser-denied.ts" || exported?.default !== "./src/browser-denied.ts" || exported?.node !== "./src/index.ts") failures.push(`${name} must retain explicit server-only conditional exports`);
}

const store = read("packages/platform/iam/session-store/src/index.ts");
requireText(store, ["createRedisSessionStore", "hashOpaqueSessionId", "REVOKE_INDEX", "CONSUME", "TOUCH", "RELEASE_LOCK", "REPLACE_REFRESH", "SessionStoreUnavailableError", "enableOfflineQueue: false"], "Redis session store");
if (/memory fallback|new Map</i.test(store)) failures.push("Redis session store must not include an in-memory fallback");

const bff = read("packages/platform/iam/auth-bff/src/index.ts");
requireText(bff, ["code_challenge_method", "S256", "nonce", "validateIdentity", "authorizedRole", "auth.invalid_state", "auth.capability_unavailable", "__Host-athyper-session", "SameSite=Lax", "HttpOnly"], "Auth BFF");

const routes = ["login", "callback", "logout", "session", "session/context", "touch", "refresh", "backchannel-logout", "step-up/start", "mfa/verify"];
for (const plane of ["neon", "mesh", "studio"]) for (const route of routes) {
  const path = `apps/${plane}/app/api/auth/${route}/route.ts`; if (!existsSync(new URL(path, root))) failures.push(`Missing ${path}`); else { const source = read(path); if (!source.includes("@/lib/auth") || source.includes("packages-backup") || source.includes("apps-backup")) failures.push(`${path} must remain a thin active-package delegate`); }
}

const fixture = read("packages/contracts/platform/fixtures/sanitized-session.v1.json");
if (/"(?:accessToken|refreshToken|idToken|providerSessionId|encryptedTokenBundle)"\s*:/.test(fixture)) failures.push("Sanitized session fixture contains server-only token/session material");

if (failures.length) { console.error(failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log("Phase 3 auth/session policy verified: safe contract, server-only stores, atomic lifecycle markers, and thin plane routes.");
