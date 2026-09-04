import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveShellNavigation, type PlaneRouteDefinition } from "../../packages/platform/shell/shell/src/core";
import { neonRoutes } from "../../packages/planes/neon/navigation/src/index";
import { meshRoutes } from "../../packages/planes/mesh/shell/src/navigation";
import { studioRoutes } from "../../packages/planes/studio/shell/src/navigation";
import { validateRuntimeEnvironment as validateNeon } from "../../apps/neon/lib/environment";
import { validateRuntimeEnvironment as validateMesh } from "../../apps/mesh/lib/environment";
import { validateRuntimeEnvironment as validateStudio } from "../../apps/studio/lib/environment";

const planes = [
  { plane: "neon", routes: neonRoutes, validate: validateNeon },
  { plane: "mesh", routes: meshRoutes, validate: validateMesh },
  { plane: "studio", routes: studioRoutes, validate: validateStudio },
] as const;
const validEnvironment = { APP_ORIGIN: "https://app.example.test", RUNTIME_API_URL: "https://host.example.test", REDIS_URL: "redis://redis:6379", KEYCLOAK_BASE_URL: "https://identity.example.test", KEYCLOAK_CLIENT_SECRET: "test-confidential-client-secret", SESSION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } as NodeJS.ProcessEnv;

for (const pilot of planes) test(`${pilot.plane} runs the common environment, auth/bootstrap, health, and shell smoke contract`, async () => {
  assert.deepEqual(pilot.validate(validEnvironment), { ready: true, missing: [], invalid: [] });
  assert.equal(pilot.validate({}).ready, false);
  assert.equal(pilot.validate({ ...validEnvironment, RUNTIME_API_URL: "file:///internal" }).ready, false);
  const first = (pilot.routes as readonly PlaneRouteDefinition[])[0]!;
  const navigation = deriveShellNavigation(pilot.routes, { permissions: first.requiredPermissions, features: Object.fromEntries(first.requiredFeatures.map((code) => [code, { enabled: true }])), workspaces: [{ code: "pilot", name: "Pilot", sortOrder: 1, modules: [{ code: first.moduleCode, name: "Pilot landing", sortOrder: 1, primary: true }] }] });
  assert.equal(navigation.landingHref, first.presentation?.workspaceHref ?? first.href);
  const authRoute = readFileSync(`apps/${pilot.plane}/app/api/auth/session/route.ts`, "utf8"), relayRoute = readFileSync(`apps/${pilot.plane}/app/api/relay/[...path]/route.ts`, "utf8"), protectedLayout = readFileSync(`apps/${pilot.plane}/app/(shell)/layout.tsx`, "utf8"), liveRoute = await import(`../../apps/${pilot.plane}/app/livez/route.ts`), readyRoute = await import(`../../apps/${pilot.plane}/app/readyz/route.ts`);
  assert.match(authRoute, /auth\.session/); assert.match(relayRoute, /platformRelay/); assert.match(protectedLayout, /loadProtectedAppBootstrap/);
  const live = liveRoute.GET(); assert.equal(live.status, 200); assert.deepEqual(await live.json(), { status: "live", plane: pilot.plane });
  const ready = readyRoute.createReadinessResponse(validEnvironment); assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), { status: "ready", plane: pilot.plane });
  const unavailable = readyRoute.createReadinessResponse({}); assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { status: "not_ready", plane: pilot.plane });
});

test("deployment profiles enumerate the complete active frontend package closure and BFF variables", () => {
  const deployment = JSON.parse(readFileSync("governance/config/deployment/profiles.json", "utf8")) as { profiles: Record<string, { requiredProductPackages: string[]; requiredSharedPackages: string[]; environmentVariables: string[]; healthChecks: { path: string }[] }> };
  for (const pilot of planes) { const profile = deployment.profiles[`athyper-${pilot.plane}`]!; for (const variable of ["APP_ORIGIN", "RUNTIME_API_URL", "REDIS_URL", "KEYCLOAK_BASE_URL", "SESSION_TOKEN_ENCRYPTION_KEY"]) assert.ok(profile.environmentVariables.includes(variable), `${pilot.plane}:${variable}`); assert.deepEqual(profile.healthChecks.map((item) => item.path), ["/livez", "/readyz"]); assert.ok(profile.requiredSharedPackages.includes("@athyper/platform-shell-runtime")); assert.ok(profile.requiredProductPackages.some((name) => name.includes(`product-${pilot.plane}`))); }
});
