import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../.."), pnpmScript = process.env.npm_execpath;
if (!pnpmScript) throw new Error("qualify:frontend-spine must be launched through pnpm");
const checks = [
  ["policy", "run", "policy:canonical-packages"], ["policy", "run", "policy:frontend-spine"], ["policy", "run", "policy:foundation-phase1"],
  ["policy", "run", "policy:api-client-phase2"], ["policy", "run", "policy:auth-session-phase3"], ["policy", "run", "policy:bff-relay-phase4"],
  ["policy", "run", "policy:provider-query-phase6"], ["policy", "run", "policy:error-boundaries-phase7"], ["policy", "run", "policy:shared-shell-phase8"],
  ["policy", "run", "policy:access-consumption-phase9"], ["policy", "run", "policy:app-composition-phase10"], ["policy", "run", "policy:deployment-profiles"],
  ["policy", "run", "policy:plane-boundaries"], ["policy", "run", "policy:no-source-junctions"], ["policy", "run", "policy:frontend-spine-dod"],
  ["contracts", "exec", "tsx", "--test", "tests/contracts/frontend-spine-browser-contracts.test.ts", "tests/contracts/frontend-spine-server-contracts.test.ts", "tests/contracts/api-client-transport.test.ts", "tests/contracts/auth-session-foundation.test.ts", "tests/contracts/bff-relay-security.test.ts", "tests/contracts/query-provider-lifecycle.test.ts", "tests/contracts/server-plane-composition.test.ts", "tests/contracts/shared-shell-navigation.test.ts", "tests/contracts/access-consumption-phase9.test.ts", "tests/contracts/app-composition-phase10.test.ts", "tests/contracts/first-business-module-readiness.test.ts"],
  ["experience", "--filter", "@athyper/server-platform-experience", "test"],
  ["components", "exec", "tsx", "--tsconfig", "tooling/config/tsconfig-react.json", "--test", "tests/foundation/error-boundaries.test.tsx", "tests/foundation/access-gates-phase9.test.tsx"],
  ["accessibility", "exec", "playwright", "test", "--config=playwright.foundation.config.ts", "tests/foundation-browser/error-boundaries.spec.ts", "tests/foundation-browser/shared-shell.spec.ts"],
  ["build", "run", "build:frontend-spine"]
];
for (const plane of ["neon", "mesh", "studio"]) rmSync(resolve(root, "apps", plane, ".next"), { recursive: true, force: true });
for (const [name, ...args] of checks) { console.log(`\n=== frontend spine ${name} ===`); const result = spawnSync(process.execPath, [pnpmScript, ...args], { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" }, timeout: 10 * 60_000 }); if (result.error) { console.error(result.error.message); process.exit(1); } if (result.status !== 0) process.exit(result.status ?? 1); }
console.log("\nFrontend spine qualification passed: policy, contracts, security, exact-plane experience, components, accessibility, deployment, and clean production builds.");
