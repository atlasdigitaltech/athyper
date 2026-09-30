import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");
const failures = [];
const query = read("packages/platform/foundation/query/src/core.ts");
const providers = read("packages/platform/shell/app-foundation/src/index.tsx");
const server = read("packages/platform/shell/app-foundation/src/server.ts");
const relay = read("packages/platform/gateway/bff-relay/src/index.ts");

for (const token of ["principalQueryKeys.root", "cancelQueries", "removeQueries", "safeToDehydrate", "shouldRetrySafeRead", "mutations: { retry: false", "applyVersionedOptimisticUpdate"]) if (!query.includes(token)) failures.push(`platform-query is missing ${token}`);
if (/localStorage|sessionStorage|persistQueryClient/.test(query)) failures.push("platform-query must not persist cache in browser storage");
const order = ["AppearanceProvider", "SessionProvider", "ExperienceBootstrapProvider", "ApiClientProvider", "PlatformQueryProvider", "PermissionProvider", "FeatureProvider", "ToastProvider", "SurfaceStackProvider", "AuthenticationFailureBridge"];
let cursor = providers.indexOf("export function AppFoundationProviders");
for (const name of order) { const next = providers.indexOf(`<${name}`, cursor); if (next <= cursor) failures.push(`provider order is missing or invalid at ${name}`); else cursor = next; }
for (const token of ["readProtectedBootstrap", "parseSanitizedSession", "parseExperienceBootstrap", "dehydratePrincipalQueries", "experienceQueryKeys.bootstrap"]) if (!server.includes(token)) failures.push(`server bootstrap is missing ${token}`);
if (!relay.includes("EXPERIENCE_BOOTSTRAP_OPERATION")) failures.push("experience bootstrap is not relay-allowlisted");
for (const plane of ["neon", "mesh", "studio"]) { const rootLayout = read(`apps/${plane}/app/layout.tsx`), protectedLayout = read(`apps/${plane}/app/(shell)/layout.tsx`), bootstrap = read(`apps/${plane}/lib/bootstrap.ts`); if (!rootLayout.includes("ThemeScript") || !protectedLayout.includes("loadProtectedAppBootstrap") || !protectedLayout.includes("AppProviders")) failures.push(`${plane} protected layout is not wired`); if (!bootstrap.includes("platformRelay") || !bootstrap.includes("readProtectedBootstrap")) failures.push(`${plane} server bootstrap does not use the relay foundation`); }
if (failures.length) { console.error(`Phase 6 provider/query policy failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`); process.exitCode = 1; }
else console.log("Phase 6 provider/query lifecycle verified.");
