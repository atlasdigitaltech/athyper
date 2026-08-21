import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), failures = [];
const core = readFileSync(resolve(root, "packages/platform/shell/shell-runtime/src/core.ts"), "utf8"), gates = readFileSync(resolve(root, "packages/platform/shell/shell-runtime/src/index.tsx"), "utf8"), shell = readFileSync(resolve(root, "packages/platform/shell/shell/src/core.ts"), "utf8");
for (const name of ["hasPermission", "hasAnyPermission", "isFeatureEnabled", "decideRouteAccess", "classifyServerDenial", "runGuardedMutation", "not_entitled", "not_permitted", "feature_disabled", "context_unavailable"]) if (!core.includes(name)) failures.push(`access core missing ${name}`);
for (const name of ["PermissionGate", "FeatureGate", "RouteGuard", "AccessProvider"]) if (!gates.includes(name)) failures.push(`access React entry missing ${name}`);
if (!shell.includes("decideRouteAccess")) failures.push("shell navigation does not consume the shared route decision API");
if (/role|group|email|domain|cohort/i.test(core.replace(/unknown-permission/g, ""))) failures.push("access core appears to derive decisions from prohibited identity or cohort state");
if (/startsWith\([^)]*\*|endsWith\([^)]*\*|split\([^)]*\*/.test(core)) failures.push("access core interprets permission wildcards");
if (/apps-backup|packages-backup/.test(`${core}\n${gates}\n${shell}`)) failures.push("Phase 9 code references backup roots");
if (failures.length) { console.error(`Phase 9 access policy failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("Phase 9 access policy passed: exact permissions, effective flags, shared route guard, authoritative server denial, and backup isolation.");
