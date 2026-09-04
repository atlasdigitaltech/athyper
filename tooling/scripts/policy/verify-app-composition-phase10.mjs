import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../.."), failures = [], planes = ["neon", "mesh", "studio"];
for (const plane of planes) {
  const app = resolve(root, "apps", plane), rootLayout = read("app/layout.tsx"), protectedLayout = read("app/(shell)/layout.tsx"), instrumentation = read("instrumentation.ts"), packageJson = JSON.parse(read("package.json").replace(/^\uFEFF/, ""));
  for (const file of ["next.config.ts", "instrumentation.ts", "lib/environment.ts", "app/livez/route.ts", "app/readyz/route.ts", "app/(public)/sign-in/page.tsx", "app/(shell)/layout.tsx"]) if (!existsSync(resolve(app, ...file.split("/")))) failures.push(`${plane} missing ${file}`);
  if (/loadProtectedAppBootstrap|AppProviders|Shell/.test(rootLayout)) failures.push(`${plane} root layout mounts protected concerns`);
  for (const required of ["loadProtectedAppBootstrap", "AppProviders", `${plane[0].toUpperCase()}${plane.slice(1)}Shell`]) if (!protectedLayout.includes(required)) failures.push(`${plane} protected layout missing ${required}`);
  if (/error\.message|error\.stack|JSON\.stringify\(error/.test(instrumentation)) failures.push(`${plane} instrumentation reports unsafe error detail`);
  const appSources = ["app/providers.tsx", "lib/auth.ts", "lib/bootstrap.ts", "lib/relay.ts"].map(read).join("\n");
  if (/function\s+hasPermission|function\s+isFeatureEnabled|class\s+.*HttpClient/.test(appSources)) failures.push(`${plane} contains reusable access or fetch implementation`);
  if (!packageJson.dependencies[`@athyper/product-${plane}-shell`]) failures.push(`${plane} does not import its plane shell package`);
  if (/apps-backup|packages-backup/.test(`${rootLayout}\n${protectedLayout}\n${appSources}`)) failures.push(`${plane} uses a backup runtime`);
  function read(path) { return readFileSync(resolve(app, ...path.split("/")), "utf8"); }
}
const profiles = JSON.parse(readFileSync(resolve(root, "governance/config/deployment/profiles.json"), "utf8")).profiles;
for (const plane of planes) { const profile = profiles[`athyper-${plane}`]; if (!profile) failures.push(`missing deployment profile ${plane}`); else { for (const variable of ["APP_ORIGIN", "RUNTIME_API_URL", "REDIS_URL", "KEYCLOAK_BASE_URL", "SESSION_TOKEN_ENCRYPTION_KEY"]) if (!profile.environmentVariables.includes(variable)) failures.push(`${plane} profile missing ${variable}`); for (const path of ["/livez", "/readyz"]) if (!profile.healthChecks.some((check) => check.path === path && check.expectedStatus === 200)) failures.push(`${plane} profile missing ${path} check`); } }
if (failures.length) { console.error(`Phase 10 composition policy failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("Phase 10 composition policy passed for thin apps, route groups, environment, health, instrumentation, plane ownership, and backup isolation.");
