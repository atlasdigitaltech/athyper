import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.equal(navigation.routes[2]?.label, "Internal");
  assert.equal(navigation.landingHref, "/");
});

test("retains distinct labels for multiple capabilities under one catalog module", () => {
  const navigation = deriveShellNavigation(
    definePlaneRoutes([
      { id: "studio.operations", moduleCode: "ops", href: "/operations", label: "Operations", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
      { id: "studio.localization", moduleCode: "ops", href: "/operations/localization", label: "Languages", iconKey: "info", requiredPermissions: ["catalog.manage"], requiredFeatures: [], navigation: "secondary" },
    ] as const),
    { permissions: ["catalog.manage"], features: {}, workspaces: [{ code: "platform", name: "Platform Operations Studio", sortOrder: 1, modules: [{ code: "ops", name: "Platform Operations", sortOrder: 1, primary: true }] }] },
  );

  assert.deepEqual(navigation.routes.map((route) => route.label), ["Platform Operations", "Languages"]);
});

test("classifies a technical entitlement as the MDG Business Partner product module", () => {
  const navigation = deriveShellNavigation(
    definePlaneRoutes([{ id: "neon.mdg.business-partner", moduleCode: "fnd", href: "/mdg/business-partner", label: "Business Partner", iconKey: "user", requiredPermissions: [], requiredFeatures: [], navigation: "primary", presentation: { workspaceCode: "mdg", workspaceName: "MDG", workspaceHref: "/mdg", moduleName: "Business Partner" } }] as const),
    { permissions: [], features: {}, workspaces: [{ code: "core", name: "Core Platform", sortOrder: 1, modules: [{ code: "fnd", name: "Foundation Runtime", sortOrder: 1, primary: true }] }] },
  );

  assert.deepEqual(navigation.workspaces.map(({ code, name }) => ({ code, name })), [{ code: "mdg", name: "MDG" }]);
  assert.equal(navigation.workspaces[0]?.href, "/mdg");
  assert.equal(navigation.landingHref, "/mdg");
  assert.equal(navigation.routes[0]?.moduleName, "Business Partner");
  assert.equal(navigation.routes[0]?.label, "Business Partner");
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
  assert.deepEqual(breadcrumbs.map((item) => item.label), ["Supply Chain", "Stock", "Stock", "42"]);
});

test("workspace dashboards are accessible without exposing modules in the sidebar", () => {
  const navigation = deriveShellNavigation(definePlaneRoutes([{ id: "mdg.bp", moduleCode: "fnd", href: "/mdg/business-partner", label: "Business Partner", iconKey: "user", requiredPermissions: [], requiredFeatures: [], navigation: "primary", presentation: { workspaceCode: "mdg", workspaceName: "MDG", workspaceHref: "/mdg", moduleName: "Business Partner" } }] as const), { permissions: [], features: {}, workspaces: [{ code: "core", name: "Core", sortOrder: 1, modules: [{ code: "fnd", name: "Foundation", sortOrder: 1, primary: true }] }] });
  assert.equal(canAccessRoute(navigation, "/mdg"), true);
  assert.equal(selectLandingRoute(navigation), "/mdg");
  assert.deepEqual(deriveBreadcrumbs(navigation, "/mdg/business-partner/requests").map((item) => item.href), ["/mdg", "/mdg/business-partner", undefined]);
});

test("rejects unsafe, duplicate, and traversing route declarations", () => {
  assert.throws(() => definePlaneRoutes([{ id: "bad.route", moduleCode: "acc", href: "//evil" as `/${string}`, label: "Bad", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }]));
  assert.throws(() => definePlaneRoutes([{ id: "same.route", moduleCode: "acc", href: "/x", label: "X", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }, { id: "same.route", moduleCode: "buy", href: "/y", label: "Y", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" }]));
});

test("shared shell keeps global actions and breadcrumbs in compact separate rows", async () => {
  const [source, styles, messages] = await Promise.all([
    readFile(new URL("../../packages/platform/shell/shell/src/client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/shell/src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/shell/src/messages.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /<BusinessContext /);
  assert.match(source, /className="athyper-shell__rail-brand"/);
  assert.match(source, /className="athyper-shell__mobile-brand"/);
  assert.match(source, /className="athyper-shell__product-wordmark"/);
  assert.match(source, /className="athyper-shell__plane-badge"/);
  assert.match(source, /className="athyper-shell__rail-toggle"/);
  assert.match(source, /aria-label=\{t\(collapsed \? "shell\.navigation\.expand" : "shell\.navigation\.collapse"\)\}/);
  assert.match(source, /className="athyper-shell__brand-tooltip"/);
  assert.match(source, /className="athyper-shell__navigation-peek"/);
  assert.match(source, /<SidebarProfile /);
  assert.match(source, /className="athyper-shell__profile"/);
  assert.match(messages, /"shell\.profile\.organization": "Organization"/);
  assert.match(messages, /"shell\.profile\.email": "Email address"/);
  assert.match(messages, /shellArabicMessages/);
  assert.match(source, /athyper:work-context-request/);
  assert.doesNotMatch(source, /<AccountMenu /);
  assert.match(source, /className="athyper-shell__nav-label"/);
  assert.match(source, /onPointerEnter=/);
  assert.match(source, /min-width: 761px\) and \(max-width: 1100px/);
  assert.match(source, /athyper_shell_collapsed=\$\{next\}/);
  assert.match(source, /aria-label=\{`\$\{applicationName\} home`\}/);
  assert.doesNotMatch(source, /title=\{`\$\{applicationName\} home`\}/);
  assert.doesNotMatch(source, /className="athyper-shell__brand"/);
  assert.doesNotMatch(source, /<ContextSwitcher /);
  assert.match(source, /Switch your authorized workspace/);
  assert.match(source, /fetch\("\/api\/auth\/contexts"/);
  assert.match(source, /<HeaderActions navigation=\{navigation\}/);
  for (const action of ["search", "notifications", "inbox", "agent"]) {
    assert.match(source, new RegExp(`kind="${action}"`));
  }
  assert.match(source, /className="athyper-shell__breadcrumbs"/);
  assert.match(styles, /--shell-topbar:3\.5rem/);
  assert.match(styles, /--shell-crumbs:2\.25rem/);
  assert.match(styles, /athyper-shell__rail-brand\{[^}]*height:var\(--shell-topbar\)/);
  assert.match(styles, /athyper-shell__rail-toggle\{[^}]*height:var\(--shell-crumbs\)/);
  assert.match(styles, /product-wordmark img\{position:static;[^}]*object-fit:contain;object-position:left center/);
  assert.match(styles, /athyper-context-identity--logo-or-name .*max-width:9rem;height:2\.2rem/);
  assert.match(styles, /\.athyper-shell__action-panel/);
  assert.match(styles, /\.athyper-shell__profile-panel/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__rail-brand/);
  assert.match(styles, /athyper-shell__mobile-brand\{display:flex/);
  assert.match(styles, /athyper-shell__rail-brand>\.athyper-shell__brand-mark-frame\{display:none/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__rail-brand>\.athyper-shell__brand-mark-frame\{display:block/);
  assert.match(styles, /max-width:760px.*athyper-shell__rail-brand>\.athyper-shell__brand-mark-frame.*display:none/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__plane-badge\{display:grid/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__rail-toggle\{justify-content:center/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__workspace\+\.athyper-shell__workspace/);
  assert.match(styles, /athyper-shell__navigation-peek\{/);
  assert.match(styles, /athyper-navigation-peek-in/);
  assert.match(styles, /athyper-shell__profile\{/);
  assert.match(styles, /data-collapsed=true.*athyper-shell__profile-summary/);
  assert.match(styles, /max-width:760px.*athyper-shell__navigation-peek\{display:none/);
  assert.match(styles, /prefers-reduced-motion:reduce.*athyper-shell__rail-toggle/);
  assert.match(styles, /prefers-reduced-motion:reduce.*athyper-shell__brand-mark-frame/);
  assert.match(styles, /prefers-reduced-motion:reduce.*athyper-shell__navigation-peek/);
});

test("plane shells prefer named context and use outlined product lockups", async () => {
  const sources = await Promise.all(["neon", "mesh", "studio"].map((plane) => readFile(new URL(`../../packages/planes/${plane}/shell/src/index.tsx`, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /planeWordmarkSrc="\/brand\/(neon|mesh|studio)\/identity-lockup\.svg"/);
  }
  for (const source of sources.slice(1)) {
    assert.match(source, /bootstrap\.tenant\?\.displayName \?\? bootstrap\.tenantId/);
    assert.match(source, /bootstrap\.identity\?\.displayName \?\? principalId/);
  }
  assert.match(sources[0]!, /ShellContextSelector/);
  assert.match(sources[0]!, /ShellContextPickerPanel/);
  assert.doesNotMatch(sources[0]!, /ShellContextSelector className="neon-company-picker"/);
  assert.match(sources[1]!, /ShellContextSelector/);
  assert.match(sources[1]!, /ShellContextPickerPanel/);
  assert.doesNotMatch(sources[1]!, /ShellContextSelector className="mesh-account-picker"/);
  assert.match(sources[1]!, /logoAssetRef:selected\?\.logoAssetRef/);
  assert.doesNotMatch(sources[1]!, /Derived from Neon access/);
  assert.doesNotMatch(sources[1]!, /Verified Mesh account/);
  assert.match(sources[1]!, /accountReference\(account\)/);
  assert.doesNotMatch(sources[2]!, /Not applicable/);
  assert.match(sources[2]!, /contexts=\{contexts\}/);
});

test("business-context switchability is based only on resolved authorized contexts", async()=>{
  const [source,studioLayout]=await Promise.all([
    readFile(new URL("../../packages/platform/shell/shell/src/client.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../apps/studio/app/(shell)/layout.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(source,/interactive=\{status==="ready"&&contexts\.length>1\}/);
  assert.doesNotMatch(source,/interactive=\{status!=="ready"/);
  assert.match(studioLayout,/loadShellContexts\(\)/);
  assert.match(studioLayout,/contexts=\{contexts\}/);
});
