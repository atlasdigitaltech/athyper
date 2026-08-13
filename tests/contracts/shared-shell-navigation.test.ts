import assert from "node:assert/strict";
import test from "node:test";
import { canAccessRoute, definePlaneRoutes, deriveBreadcrumbs, deriveShellNavigation, selectLandingRoute } from "../../packages/platform/shell/shell/src/core";

const registry = definePlaneRoutes([
  { id: "test.home", moduleCode: "acc", href: "/", label: "Registry finance", iconKey: "home", requiredPermissions: ["finance.read"], requiredFeatures: [], navigation: "primary" },
  { id: "test.inventory", moduleCode: "inventory", href: "/inventory", label: "Registry inventory", iconKey: "info", requiredPermissions: [], requiredFeatures: ["inventory.ui"], navigation: "secondary" },
  { id: "test.hidden", moduleCode: "inventory", href: "/inventory/internal", label: "Internal", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
] as const);
const experience = { permissions: ["finance.read"], features: { "inventory.ui": { enabled: true } }, workspaces: [{ code: "fin", name: "Tenant Finance", iconKey: "home", sortOrder: 20, modules: [{ code: "acc", name: "General Ledger", iconKey: "home", sortOrder: 1, primary: true }] }, { code: "scm", name: "Supply Chain", sortOrder: 30, modules: [{ code: "inventory", name: "Stock", sortOrder: 2, primary: true }, { code: "unknown", name: "Future module", sortOrder: 3, primary: false }] }] } as const;

test("joins registry routes to ordered catalog modules and applies safe label precedence", () => {
  const navigation = deriveShellNavigation(registry, experience);
  assert.deepEqual(navigation.workspaces.map((item) => item.code), ["fin", "scm"]);
  assert.equal(navigation.routes[0]?.label, "General Ledger");
  assert.equal(navigation.routes[1]?.label, "Stock");
  assert.equal(navigation.landingHref, "/");
});

test("fails closed for missing permissions and disabled or unknown features", () => {
  const navigation = deriveShellNavigation(registry, { ...experience, permissions: [], features: { "inventory.ui": { enabled: false } } });
  assert.deepEqual(navigation.routes.map((item) => item.href), ["/inventory/internal"]);
  assert.equal(navigation.landingHref, undefined);
});

test("reports active server modules without frontend routes", () => {
  const events: unknown[] = [];
  const navigation = deriveShellNavigation(registry, experience, (event) => events.push(event));
  assert.deepEqual(navigation.unknownActiveModules, ["unknown"]);
  assert.deepEqual(events, [{ kind: "unknown-active-module", moduleCode: "unknown" }]);
});

test("deep links and forbidden routes resolve without an inaccessible default", () => {
  const navigation = deriveShellNavigation(registry, experience);
  assert.equal(canAccessRoute(navigation, "/inventory/stock/42"), true);
  assert.equal(canAccessRoute(navigation, "/administration"), false);
  assert.equal(selectLandingRoute(navigation, "/administration"), "/");
  assert.equal(selectLandingRoute(navigation, "/inventory/stock/42"), "/inventory/stock/42");
});

test("breadcrumbs preserve workspace and permitted route ancestry", () => {
  const breadcrumbs = deriveBreadcrumbs(deriveShellNavigation(registry, experience), "/inventory/stock/42");
  assert.deepEqual(breadcrumbs.map((item) => item.label), ["Supply Chain", "Stock", "stock", "42"]);
});

test("rejects unsafe, duplicate, and traversing route declarations", () => {
  assert.throws(() => definePlaneRoutes([{ id: "bad.route", moduleCode: "acc", href: "//evil" as `/${string}`, label: "Bad", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }]));
  assert.throws(() => definePlaneRoutes([{ id: "same.route", moduleCode: "acc", href: "/x", label: "X", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }, { id: "same.route", moduleCode: "buy", href: "/y", label: "Y", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }]));
});
