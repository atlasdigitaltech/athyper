import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const inventoryPath = resolve(root, "config/governance/meta-entity-routes.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const budgets = JSON.parse(readFileSync(resolve(root, "config/governance/meta-entity-performance-budgets.json"), "utf8"));
const failures = [];

if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.routes)) failures.push("route inventory must use schemaVersion 1");
const keys = new Set();
for (const [index, route] of (inventory.routes ?? []).entries()) {
  const prefix = `routes[${index}]`;
  for (const field of ["id", "template", "operation", "owner", "rolloutState", "compatibilityPath", "retirementMetric"]) {
    if (typeof route[field] !== "string" || !route[field].trim()) failures.push(`${prefix}.${field} is required`);
  }
  if (!(route.sloP95Ms > 0)) failures.push(`${prefix}.sloP95Ms must be positive`);
  if (!route.sqlBudget || !Number.isInteger(route.sqlBudget.min) || !Number.isInteger(route.sqlBudget.max)
    || route.sqlBudget.min < 0 || route.sqlBudget.max < route.sqlBudget.min) {
    failures.push(`${prefix}.sqlBudget must contain a valid min/max`);
  }
  const canonical = budgets.operations?.[route.budgetId];
  if (!canonical) failures.push(`${prefix}.budgetId '${route.budgetId}' is not canonical`);
  else {
    if (route.sloP95Ms !== canonical.p95Ms) failures.push(`${prefix}.sloP95Ms drifted from budget '${route.budgetId}'`);
    if (JSON.stringify(route.sqlBudget) !== JSON.stringify(canonical.sql)) failures.push(`${prefix}.sqlBudget drifted from budget '${route.budgetId}'`);
    if ((route.transactionP95Ms ?? null) !== (canonical.transactionP95Ms ?? null)) failures.push(`${prefix}.transactionP95Ms drifted from budget '${route.budgetId}'`);
  }
  const key = `${route.template}\0${route.operation}`;
  if (keys.has(key)) failures.push(`${prefix} duplicates ${route.template} ${route.operation}`);
  keys.add(key);
}
if (budgets.status !== "p0_initial_unrevised" && !budgets.evidenceArtifact) {
  failures.push("revised performance budgets require evidenceArtifact");
}

const kernelRoots = [
  "server/packages/services/records/mutation",
  "server/packages/services/records/query",
  "server/packages/services/records/routes/entity-mutation.route.ts",
];
// These are the canonical generic route/adapters.  Compatibility routes (for
// example the legacy records.route and metadata-admin routes) intentionally
// remain outside this scan until their retirement evidence reaches zero
// traffic.  Keeping the allow-list explicit prevents a new generic route from
// silently reintroducing header parsing while retaining a safe migration path.
const canonicalRouteRoots = [
  "server/packages/services/records/routes/entity-mutation.route.ts",
  "server/packages/services/records/query",
];
const rules = [
  {
    id: "identity-parsing",
    pattern: /(?:x-org|x-realm|verifyBearer\s*\(|resolveTenantId\s*\(|resolvePrincipalId(?:WithJit)?\s*\(|authorization\s*\?)/i,
    message: "generic kernels must consume VerifiedRequestContext and cannot parse or resolve identity",
  },
  {
    id: "direct-metadata",
    pattern: /(?:snapshot\.entity_compiled|control\.entity(?:_field|_version)?\b|resolveEntityTable\s*\(|resolveFieldMap\s*\(|resolveEntityWrite)/,
    message: "generic kernels must consume ExecutionDescriptorProvider and cannot resolve metadata directly",
  },
  {
    id: "entity-code-branch",
    pattern: /(?:if\s*\([^\n)]*entityCode[^\n)]*(?:===|!==)|switch\s*\(\s*entityCode\s*\))/,
    message: "generic kernels must dispatch registered handlers instead of branching on entity code",
  },
];

for (const file of kernelRoots.flatMap((entry) => files(resolve(root, entry)))) {
  if (file.includes("__tests__") || file.endsWith(".test.ts")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of rules) {
      if (!rule.pattern.test(lines[index])) continue;
      const previous = lines[index - 1] ?? "";
      if (previous.includes(`governance-allow-next-line ${rule.id}:`)) continue;
      failures.push(`${relative(root, file)}:${index + 1} [${rule.id}] ${rule.message}`);
    }
  }
}

// Route-level identity parsing is forbidden in canonical generic adapters as
// well as in the kernel.  This catches imports and direct header access that a
// line-oriented kernel scan could otherwise miss.
const routeIdentityPattern = /(?:req\.headers\s*\[\s*["'](?:authorization|x-org|x-realm|x-tenant|x-principal)|verifyBearer\s*\(|resolveTenantId\s*\(|resolvePrincipalId(?:WithJit|OrNull)?\s*\()/i;
for (const file of canonicalRouteRoots.flatMap((entry) => files(resolve(root, entry)))) {
  if (file.includes("__tests__") || file.endsWith(".test.ts")) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!routeIdentityPattern.test(lines[index])) continue;
    const previous = lines[index - 1] ?? "";
    if (previous.includes("governance-allow-next-line identity-parsing:")) continue;
    failures.push(`${relative(root, file)}:${index + 1} [route-identity-parsing] canonical routes must use requireVerifiedContext`);
  }
}

if (failures.length) {
  console.error("Meta-entity governance policy failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Meta-entity governance policy passed (${inventory.routes.length} protected route contracts).`);

function files(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? files(child) : entry.name.endsWith(".ts") ? [child] : [];
  });
}
