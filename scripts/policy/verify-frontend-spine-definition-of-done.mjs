import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), failures = [], read = (path) => readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");
const manifest = JSON.parse(read("config/governance/frontend-spine-definition-of-done.json"));
const expected = ["canonical-graph", "backup-isolation", "authoritative-contracts", "server-only-session", "same-origin-relay", "exact-plane-bootstrap", "prepaint-theme-locale", "query-lifecycle", "hydration-boundaries", "derived-navigation", "server-authority", "three-plane-qualification", "rollback-observability", "business-module-readiness"];
if (manifest.schemaVersion !== 1) failures.push("DoD evidence manifest schemaVersion must be 1");
const ids = manifest.criteria?.map((item) => item.id) ?? [];
for (const id of expected) if (!ids.includes(id)) failures.push(`DoD criterion is missing: ${id}`);
if (new Set(ids).size !== ids.length) failures.push("DoD criteria must be unique");
for (const criterion of manifest.criteria ?? []) for (const path of criterion.evidence ?? []) if (!existsSync(resolve(root, path))) failures.push(`${criterion.id} evidence is missing: ${path}`);

const dashboard = JSON.parse(read("stack/config/telemetry/provisioning/dashboards/json/frontend-spine-production.json"));
if (dashboard.uid !== "athyper-frontend-spine" || !Array.isArray(dashboard.panels) || dashboard.panels.length < 6) failures.push("production frontend dashboard is incomplete");
const dashboardText = JSON.stringify(dashboard);
for (const signal of ["/livez", "/readyz", "athyper_http_request_duration_seconds", "athyper_http_errors_total", "AUTH_", "RELAY_", "app_boundary_error", "frontend-request-error"]) if (!dashboardText.includes(signal)) failures.push(`production dashboard is missing ${signal}`);
if (/tenant_id|principal_id|access_token|refresh_token|cookie/i.test(dashboardText)) failures.push("production dashboard contains a sensitive identity/token dimension");

const contractRuntime = read("server/packages/runtime/http/src/route-contract.ts"), experienceRoute = read("server/packages/platform/experience/src/routes.ts");
for (const marker of ["authenticated", "permission", "MISSING_PERMISSION", "bearerAuth"]) if (!contractRuntime.includes(marker)) failures.push(`server route authority is missing ${marker}`);
if (!experienceRoute.includes("authenticated: true") || !experienceRoute.includes('permission: "platform.experience.bootstrap"') || !experienceRoute.includes("options.authenticate")) failures.push("experience bootstrap lacks independent server authorization metadata/middleware");

const workspace = read("pnpm-workspace.yaml"), activeSources = ["apps/neon", "apps/mesh", "apps/studio", "packages/contracts", "packages/platform", "packages/planes"];
if (/^\s*-\s*["']?(?:apps-backup|packages-backup)/m.test(workspace)) failures.push("backup roots have workspace authority");
for (const path of activeSources) { const output = scan(path); if (/from\s+["'][^"']*(?:apps-backup|packages-backup)|require\s*\([^)]*(?:apps-backup|packages-backup)/.test(output)) failures.push(`${path} contains an active backup import`); }

if (failures.length) { console.error(`Frontend spine definition-of-done policy failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`Frontend spine definition of done verified: ${expected.length} evidence-backed criteria, immutable production dashboard, rollback, server authority, and business-module extension contract.`);
function scan(path) { return walk(resolve(root, path)); }
function walk(directory) { let result = ""; for (const entry of readdirSync(directory, { withFileTypes: true })) { if (["node_modules", ".next"].includes(entry.name)) continue; const path = resolve(directory, entry.name); if (entry.isDirectory()) result += walk(path); else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) result += readFileSync(path, "utf8"); } return result; }
