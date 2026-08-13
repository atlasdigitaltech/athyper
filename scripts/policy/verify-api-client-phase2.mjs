#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { importSpecifiers } from "./frontend-spine-governance.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const packageRoot = join(root, "packages", "platform", "foundation", "api-client");
const files = readdirSync(join(packageRoot, "src")).filter((name) => name.endsWith(".ts")).map((name) => join(packageRoot, "src", name));
const violations = [];
const allowed = new Set(["@athyper/contract-platform-api", "@athyper/contract-platform-auth-session", "@athyper/contract-platform-authorization", "@athyper/contract-platform-navigation"]);
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const specifier of importSpecifiers(source)) if (!specifier.startsWith(".") && !allowed.has(specifier)) violations.push(`${relative(root, file)} imports ${specifier}`);
  if (/\b(?:publicApiBase|accessToken|refreshToken)\b|Bearer\s/i.test(source)) violations.push(`${relative(root, file)} contains a forbidden public-base or bearer-token concern`);
}
const index = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");
for (const required of ["/api/relay", "credentials: \"same-origin\"", "application/problem+json", "Idempotency-Key", "X-CSRF-Token", "ReadableStream", "AbortSignal"]) if (!index.includes(required)) violations.push(`API client is missing transport invariant: ${required}`);
const bootstrap = readFileSync(join(packageRoot, "src", "bootstrap.ts"), "utf8");
for (const parser of ["parseSanitizedSession", "parseAuthorizationSnapshot", "parseNavigationCatalog"]) if (!bootstrap.includes(parser)) violations.push(`Bootstrap boundary does not use canonical parser ${parser}`);
for (const duplicate of ["interface SanitizedSession", "interface AuthorizationSnapshot", "interface NavigationCatalog"]) if (bootstrap.includes(duplicate) || index.includes(duplicate)) violations.push(`API client independently defines authoritative DTO ${duplicate}`);
if (violations.length) { console.error(["API client Phase 2 policy failed:", ...violations.map((item) => `- ${item}`)].join("\n")); process.exitCode = 1; }
else console.log("API client Phase 2 verified: React-free same-origin relay, canonical DTO authority, CSRF/idempotency, streaming, cancellation, and bearer-token isolation.");
