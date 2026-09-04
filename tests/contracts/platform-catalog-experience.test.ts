import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyPersonalArrangement, parseExperienceSurface, parsePersonalSurfaceArrangement, resolveEffectiveExperience, resolvePublishedExperience } from "../../packages/contracts/platform/dashboard/src/index";
import { resolveCatalogRoute, validateCatalogRoutes, type CatalogWorkspaceRoute } from "../../packages/contracts/platform/navigation/src/index";
import { SEMANTIC_ICON_KEYS } from "../../packages/platform/foundation/icons/src/index";
import { orderModuleCodes } from "../../packages/platform/shell/dashboard/src/module-relevance";

const routes = [{
  code: "scm", routeSlug: "procurement", name: "Supply Chain",
  modules: [{
    code: "buy", routeSlug: "purchasing", name: "Purchasing", defaultEntityCode: "purchase_order",
    entities: [
      { code: "purchase_order", routeSlug: "purchase-orders", name: "Purchase Orders" },
      { code: "purchase_request", routeSlug: "purchase-requests", name: "Purchase Requests" },
      { code: "supplier_invoice", routeSlug: "invoices", name: "Supplier Invoices" },
      { code: "purchasing_document", routeSlug: "documents", name: "Purchasing Documents" },
    ],
  }],
}] as const satisfies readonly CatalogWorkspaceRoute[];

test("canonical catalog locks the agreed plane sizes and BP ownership", async () => {
  const lock = JSON.parse(await readFile(new URL("../../catalog/generated/platform-catalog.lock.json", import.meta.url), "utf8"));
  assert.deepEqual(lock.planes.studio.counts, { workspaces: 10, modules: 33 });
  assert.deepEqual(lock.planes.neon.counts, { workspaces: 9, modules: 51 });
  assert.deepEqual(lock.planes.mesh.counts, { workspaces: 5, modules: 25 });
  const mdg = lock.planes.neon.workspaces.find((workspace: { code: string }) => workspace.code === "mdg");
  assert.equal(mdg.routeSlug, "mdg");
  assert.deepEqual(mdg.modules.find((module: { code: string }) => module.code === "bp"), {
    idSeed: "neon:module:bp", code: "bp", routeSlug: "business-partner", name: "Business Partner Management", iconKey: "contact", description: "Create and govern supplier, customer, and partner master data.", actions: [{ label: "New", suffix: "new" }, { label: "Manage", suffix: "partners" }], order: 10,
  });
  const knownIcons = new Set<string>(SEMANTIC_ICON_KEYS);
  for (const workspace of lock.planes.neon.workspaces) {
    assert.ok(knownIcons.has(workspace.iconKey), `${workspace.code} has a registered workspace icon`);
    for (const module of workspace.modules) assert.ok(knownIcons.has(module.iconKey), `${workspace.code}.${module.code} has a registered module icon`);
  }
});

test("catalog generation supplies Home, Workspace, and Module defaults", async () => {
  const bundle = JSON.parse(await readFile(new URL("../../catalog/generated/default-experience-surfaces.json", import.meta.url), "utf8"));
  assert.equal(bundle.schema, "athyper-experience-surface-bundle/1");
  assert.equal(bundle.surfaces.length, 136);
  assert.ok(bundle.surfaces.some((surface: { id: string }) => surface.id === "neon.mdg.bp.home"));
  assert.ok(bundle.surfaces.some((surface: { id: string }) => surface.id === "mesh.financial_collab.fpg.home"));
  assert.ok(bundle.surfaces.some((surface: { id: string }) => surface.id === "studio.entity.exp.home"));
  assert.equal(bundle.surfaces.find((surface: { id: string }) => surface.id === "mesh.home").blocks[0].extension, "mesh.atlas-welcome");
  assert.equal(bundle.surfaces.find((surface: { id: string }) => surface.id === "studio.home").blocks[0].extension, "studio.atlas-welcome");
  const mdg = bundle.surfaces.find((surface: { id: string }) => surface.id === "neon.mdg.home");
  const bp = mdg.blocks.find((block: { id: string }) => block.id === "module.bp");
  assert.equal(mdg.blocks[0].text, "Your modules");
  assert.equal(bp.body, "Create and govern supplier, customer, and partner master data.");
  assert.deepEqual(bp.actions.map((action: { label: string }) => action.label), ["Overview", "New", "Manage", "ToDo"]);
  const meshWorkspace = bundle.surfaces.find((surface: { id: string }) => surface.id === "mesh.network_rel.home");
  assert.equal(meshWorkspace.blocks[0].id, "workspace.modules-title");
  assert.deepEqual(meshWorkspace.blocks[1].actions.map((action: { label: string }) => action.label), ["Overview", "ToDo"]);
  const generatedRoutes = await readFile(new URL("../../packages/contracts/platform/navigation/src/generated-catalog.ts", import.meta.url), "utf8");
  assert.match(generatedRoutes, /"routeSlug": "supplier-management"/);
  assert.match(generatedRoutes, /"routeSlug": "transport-logistics"/);
});

test("workspace surfaces render Home and entitled modules as header tabs", async () => {
  const [runtime, meshRuntime, studioRuntime, navigation, renderer, browser, styles] = await Promise.all([
    readFile(new URL("../../apps/neon/lib/experience-runtime.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../apps/mesh/lib/experience-runtime.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../apps/studio/lib/experience-runtime.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/dashboard/src/workspace-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/dashboard/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/dashboard/src/client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/platform/shell/shell/src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /visibleModuleCodes=\{entitledModuleCodes\}/);
  assert.match(runtime, /NeonWorkspaceExperience/);
  assert.match(runtime, /hideHeader=\{surfaceKey\s*===\s*"neon\.home"\}/);
  assert.match(runtime, /useWorkspaceModuleBadges/);
  assert.match(meshRuntime, /extensions:\s*(?:Object\.freeze\()?\{\s*"mesh\.atlas-welcome":\s*AtlasWelcome/);
  assert.match(meshRuntime, /WorkspaceModuleTabs/);
  assert.match(studioRuntime, /extensions:\s*(?:Object\.freeze\()?\{\s*"studio\.atlas-welcome":\s*AtlasWelcome/);
  assert.match(studioRuntime, /WorkspaceModuleTabs/);
  assert.match(navigation, /name:"Home",href:`\/\$\{workspace\.routeSlug\}`/);
  assert.match(navigation, /activeModuleCode\?\?"home"/);
  assert.match(navigation, /athyper-experience__module-tabs--primary/);
  assert.match(navigation, /aria-current=\{active\?"page":undefined\}/);
  assert.match(navigation, /ModuleMoreMenu/);
  assert.match(navigation, /Search modules/);
  assert.match(navigation, /useFittingModuleTabLimit/);
  assert.match(navigation, /scrollWidth>element\.clientWidth/);
  assert.match(navigation, /new ResizeObserver/);
  assert.match(renderer, /headerAccessory\?: ReactNode/);
  assert.match(renderer, /headerAccessory \|\| framedHeader/);
  assert.match(renderer, /"data-scope": surface\.scope\.kind/);
  assert.match(browser, /headerAccessory=\{headerAccessory\}/);
  assert.match(browser, /framedHeader=\{framedHeader\}/);
  assert.match(styles, /\.athyper-experience__module-tabs/);
  assert.match(styles, /\.athyper-experience__module-tabs--primary\{width:calc\(100% - 20px\);max-width:calc\(100% - 20px\);margin:15px 10px 0/);
  assert.match(styles, /module-tabs--primary>a,[^}]*module-more\{flex:0 0 auto\}/);
  assert.match(styles, /data-surface="neon\.home"[^}]*max-width:none;gap:0;padding:15px 10px/);
  assert.match(styles, /data-surface="mesh\.home"/);
  assert.match(styles, /data-surface="studio\.home"/);
  assert.match(styles, /data-plane="neon"\]\[data-scope="workspace"\][^}]*width:100%;max-width:none;padding:15px 10px/);
  assert.match(styles, /data-scope=workspace[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(renderer, /athyper-experience__module-context/);
  assert.match(renderer, /onTogglePinned/);
  assert.match(styles, /athyper-experience__module-more/);
  assert.match(styles, /athyper-experience__module-badge--loading/);
  assert.match(styles, /data-surface="neon\.home"[^}]*athyper-home\{width:100%;max-width:none/);
  assert.match(styles, /athyper-experience__block--extension\{padding:0;border:0/);
  assert.match(styles, /athyper-home__hero\{padding:1\.5rem/);
  assert.match(styles, /@media\(max-width:760px\)\{\.athyper-home__atlas-actions\{display:none\}\}/);
});

test("module relevance is deterministic across pinned, recent, and catalog order", () => {
  assert.deepEqual(orderModuleCodes(["bp","item","finmd","org"],["org","bp"],["item","org"]),["org","bp","item","finmd"]);
  assert.deepEqual(orderModuleCodes(["bp","item"],["unauthorized","item"],["bp","unknown"]),["item","bp"]);
});

test("Neon route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(new URL("../../packages/planes/neon/navigation/src/index.ts", import.meta.url), "utf8");
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.neon\.flatMap/);
  assert.match(navigation, /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/);
  assert.match(navigation, /moduleCode: module\.code/);
});

test("Mesh route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(new URL("../../packages/planes/mesh/shell/src/navigation.ts", import.meta.url), "utf8");
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.mesh\.flatMap/);
  assert.match(navigation, /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/);
  assert.match(navigation, /moduleCode: module\.code/);
  assert.doesNotMatch(navigation, /mesh\.mdg\.business-partner/);
});

test("Studio route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(new URL("../../packages/planes/studio/shell/src/navigation.ts", import.meta.url), "utf8");
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.studio\.flatMap/);
  assert.match(navigation, /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/);
  assert.match(navigation, /moduleCode: module\.code/);
  assert.doesNotMatch(navigation, /studio\.mdg\.business-partner/);
});

test("one deterministic route tree resolves all purchasing entity surfaces", () => {
  validateCatalogRoutes(routes);
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing"])?.kind, "module");
  assert.deepEqual(resolveCatalogRoute(routes, ["procurement", "purchasing", "new"]), {
    kind: "entity-create", workspace: routes[0], module: routes[0].modules[0], entity: routes[0].modules[0].entities[0],
  });
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing", "purchase-orders"])?.kind, "entity-collection");
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing", "purchase-orders", "PO-1042"])?.kind, "entity-detail");
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing", "purchase-orders", "new"])?.kind, "entity-create");
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing", "unknown"]), undefined);
  assert.equal(resolveCatalogRoute(routes, ["procurement", "purchasing", "purchase-orders", "../secret"]), undefined);
});

test("catalog route validation protects global and new route segments", () => {
  assert.throws(() => validateCatalogRoutes([{ ...routes[0], routeSlug: "inbox" }]));
  assert.throws(() => validateCatalogRoutes([{ ...routes[0], modules: [{ ...routes[0].modules[0], entities: [{ code: "thing", routeSlug: "new", name: "Thing" }] }] }]));
});

test("experience surfaces accept governed image visuals and registry references", () => {
  const value = parseExperienceSurface({
    schema: "athyper-experience-surface/1", id: "neon.scm.buy.home", revision: 1,
    scope: { kind: "module", plane: "neon", workspaceCode: "scm", moduleCode: "buy" },
    title: "Purchasing", visual: { kind: "image", assetRef: "asset:catalog/purchasing-hero", alt: "Purchasing team" },
    blocks: [
      { id: "open-orders", type: "number-card", title: "Open orders", dataSource: "purchasing.open-orders" },
      { id: "create", type: "shortcut", actions: [{ action: "catalog.navigate", label: "New purchase order", input: { path: "/procurement/purchasing/new" } }] },
    ],
  }, { dataSources: new Set(["purchasing.open-orders"]), actions: new Set(["catalog.navigate"]), extensions: new Set() });
  assert.equal(value.blocks.length, 2);
  assert.equal(value.visual?.kind, "image");
});

test("experience surfaces fail closed for unknown data, actions, and executable URLs", () => {
  const policy = { dataSources: new Set<string>(), actions: new Set<string>(), extensions: new Set<string>() };
  assert.throws(() => parseExperienceSurface({ schema: "athyper-experience-surface/1", id: "x.home", revision: 1, scope: { kind: "home", plane: "neon" }, title: "X", blocks: [{ id: "x.chart", type: "chart", dataSource: "sql.raw", visualization: "bar" }] }, policy), /unregistered/);
  assert.throws(() => parseExperienceSurface({ schema: "athyper-experience-surface/1", id: "x.home", revision: 1, scope: { kind: "home", plane: "neon" }, title: "X", visual: { kind: "image", assetRef: "javascript:alert(1)", alt: "X" }, blocks: [] }, policy), /not governed/);
});

test("tenant publication wins over shared defaults while personal changes stay structural", () => {
  const policy = { dataSources: new Set<string>(), actions: new Set(["catalog.navigate"]), extensions: new Set<string>() };
  const create = (revision: number, title: string) => parseExperienceSurface({ schema: "athyper-experience-surface/1", id: "neon.home", revision, scope: { kind: "home", plane: "neon" }, title, blocks: [
    { id: "first.card", type: "text", text: "First" }, { id: "second.card", type: "text", text: "Second" },
  ] }, policy);
  const published = resolvePublishedExperience(create(1, "System"), [{ layer: "shared", surface: create(2, "Shared") }, { layer: "tenant", surface: create(3, "Tenant") }]);
  const arranged = applyPersonalArrangement(published, { schema: "athyper-experience-arrangement/1", surfaceId: "neon.home", baseRevision: 3, order: ["second.card"], hidden: ["first.card"], spans: { "second.card": 2 } });
  assert.equal(arranged.title, "Tenant");
  assert.deepEqual(arranged.blocks.map((block) => [block.id, block.span]), [["second.card", 2]]);
  assert.equal(applyPersonalArrangement(published, { schema: "athyper-experience-arrangement/1", surfaceId: "neon.home", baseRevision: 2 }).blocks.length, 2);
  const effective=resolveEffectiveExperience(create(1,"System"),[{layer:"tenant",surface:create(3,"Tenant")}],parsePersonalSurfaceArrangement({schema:"athyper-experience-arrangement/1",surfaceId:"neon.home",baseRevision:3,hidden:["first.card"]}),{tenantRevision:3});
  assert.equal(effective.provenance.personalApplied,true);
  assert.deepEqual(effective.surface.blocks.map((block)=>block.id),["second.card"]);
});

test("forward migration assigns BP permissions to the bp module", async () => {
  const migration = await readFile(new URL("../../server/db/migrations/20260831_neon_business_partner_catalog_ownership.sql", import.meta.url), "utf8");
  assert.match(migration, /'bp', 'Business Partner'/);
  assert.match(migration, /canonical_code LIKE 'neon\.relationship\.business_partner%'/);
  assert.match(migration, /module\.code <> 'bp'/);
});

test("forward migration aligns the Studio exp and pcat catalog modules", async () => {
  const migration = await readFile(new URL("../../server/db/migrations/20260901_studio_platform_catalog_alignment.sql", import.meta.url), "utf8");
  assert.match(migration, /'exp','Experience & Navigation Design'/);
  assert.match(migration, /'pcat','Platform Catalog Management'/);
  assert.match(migration, /<> 33/);
});
