import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyPersonalArrangement,
  parseExperienceSurface,
  parsePersonalSurfaceArrangement,
  resolveEffectiveExperience,
  resolvePublishedExperience,
} from "../../packages/contracts/platform/dashboard/src/index";
import { DEFAULT_EXPERIENCE_SURFACES } from "../../packages/contracts/platform/dashboard/src/generated-defaults";
import {
  resolveCatalogRoute,
  validateCatalogRoutes,
  type CatalogWorkspaceRoute,
} from "../../packages/contracts/platform/navigation/src/index";
import { PLATFORM_CATALOG_ROUTES } from "../../packages/contracts/platform/navigation/src/generated-catalog";
import {
  ICON_ROLE_FALLBACKS,
  isSemanticIconKey,
  resolveIcon,
  resolveMetadataIcon,
  SEMANTIC_ICON_KEYS,
} from "../../packages/platform/foundation/icons/src/index";
import { orderModuleCodes } from "../../packages/platform/shell/dashboard/src/module-relevance";
import { labelCap, moreMenuShowsSearch, visibleModules } from "../../packages/platform/shell/dashboard/src/workspace-navigation";

const routes = [
  {
    code: "scm",
    routeSlug: "procurement",
    name: "Supply Chain",
    modules: [
      {
        code: "buy",
        routeSlug: "purchasing",
        name: "Purchasing",
        defaultEntityCode: "purchase_order",
        entities: [
          {
            code: "purchase_order",
            routeSlug: "purchase-orders",
            name: "Purchase Orders",
          },
          {
            code: "purchase_request",
            routeSlug: "purchase-requests",
            name: "Purchase Requests",
          },
          {
            code: "supplier_invoice",
            routeSlug: "invoices",
            name: "Supplier Invoices",
          },
          {
            code: "purchasing_document",
            routeSlug: "documents",
            name: "Purchasing Documents",
          },
        ],
      },
    ],
  },
] as const satisfies readonly CatalogWorkspaceRoute[];

test("canonical catalog locks the agreed plane sizes and BP ownership", async () => {
  const counts = (plane: keyof typeof PLATFORM_CATALOG_ROUTES) => ({
    workspaces: PLATFORM_CATALOG_ROUTES[plane].length,
    modules: PLATFORM_CATALOG_ROUTES[plane].reduce(
      (sum, workspace) => sum + workspace.modules.length,
      0,
    ),
  });
  assert.deepEqual(counts("studio"), { workspaces: 10, modules: 32 });
  assert.deepEqual(counts("neon"), { workspaces: 9, modules: 51 });
  assert.deepEqual(counts("mesh"), { workspaces: 5, modules: 25 });
  const mdg = PLATFORM_CATALOG_ROUTES.neon.find(
    (workspace) => workspace.code === "mdg",
  );
  assert.equal(mdg.routeSlug, "mdg");
  assert.deepEqual(
    mdg.modules.find((module: { code: string }) => module.code === "bp"),
    {
      code: "bp",
      routeSlug: "business-partner",
      name: "Business Partners",
      iconKey: "contact",
      // Entities come from each entity's metadata placement.json.
      entities: [
        { code: "business_partner_request", routeSlug: "requests", name: "Business Partner Requests" },
        { code: "business_partner", routeSlug: "business-partners", name: "Business Partners" },
      ],
      defaultEntityCode: "business_partner",
    },
  );
  const knownIcons = new Set<string>(SEMANTIC_ICON_KEYS);
  for (const workspace of PLATFORM_CATALOG_ROUTES.neon) {
    assert.ok(
      knownIcons.has(workspace.iconKey),
      `${workspace.code} has a registered workspace icon`,
    );
    for (const module of workspace.modules)
      assert.ok(
        knownIcons.has(module.iconKey),
        `${workspace.code}.${module.code} has a registered module icon`,
      );
  }
});

test("catalog generation supplies Home, Workspace, and Module defaults", async () => {
  assert.equal(DEFAULT_EXPERIENCE_SURFACES.length, 135);
  assert.ok(
    DEFAULT_EXPERIENCE_SURFACES.some(
      (surface) => surface.id === "neon.mdg.bp.home",
    ),
  );
  assert.ok(
    DEFAULT_EXPERIENCE_SURFACES.some(
      (surface) => surface.id === "mesh.financial_collab.fpg.home",
    ),
  );
  assert.ok(
    DEFAULT_EXPERIENCE_SURFACES.some(
      (surface) => surface.id === "studio.entity.pub.home",
    ),
  );
  assert.equal(
    DEFAULT_EXPERIENCE_SURFACES.find((surface) => surface.id === "mesh.home")
      .blocks[0].extension,
    "mesh.atlas-welcome",
  );
  assert.equal(
    DEFAULT_EXPERIENCE_SURFACES.find((surface) => surface.id === "studio.home")
      .blocks[0].extension,
    "studio.atlas-welcome",
  );
  const mdg = DEFAULT_EXPERIENCE_SURFACES.find(
    (surface) => surface.id === "neon.mdg.home",
  );
  const bp = mdg.blocks.find(
    (block: { id: string }) => block.id === "module.bp",
  );
  assert.equal(mdg.blocks[0].text, "Your modules");
  assert.equal(
    bp.body,
    "Create and govern supplier, customer, and partner master data.",
  );
  assert.deepEqual(
    bp.actions.map((action: { label: string }) => action.label),
    ["Overview", "New", "Manage", "ToDo"],
  );
  const meshWorkspace = DEFAULT_EXPERIENCE_SURFACES.find(
    (surface) => surface.id === "mesh.network_rel.home",
  );
  assert.equal(meshWorkspace.blocks[0].id, "workspace.modules-title");
  assert.deepEqual(
    meshWorkspace.blocks[1].actions.map(
      (action: { label: string }) => action.label,
    ),
    ["Overview", "ToDo"],
  );
  const generatedRoutes = await readFile(
    new URL(
      "../../packages/contracts/platform/navigation/src/generated-catalog.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(generatedRoutes, /"routeSlug": "supplier-management"/);
  assert.match(generatedRoutes, /"routeSlug": "transport-logistics"/);
});

test("workspace surfaces render Home and entitled modules as header tabs", async () => {
  const [
    runtime,
    sharedRuntime,
    meshRuntime,
    studioRuntime,
    navigation,
    renderer,
    browser,
    styles,
  ] = await Promise.all([
    readFile(
      new URL("../../apps/neon/lib/experience-runtime.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../packages/platform/shell/dashboard/src/plane-experience-runtime.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../apps/mesh/lib/experience-runtime.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../apps/studio/lib/experience-runtime.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../packages/platform/shell/dashboard/src/workspace-navigation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../packages/platform/shell/dashboard/src/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../packages/platform/shell/dashboard/src/client.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../packages/platform/shell/shell/src/styles.css",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const planeRuntime of [runtime, meshRuntime, studioRuntime]) {
    assert.match(planeRuntime, /<PlaneExperienceSurface config=\{config\}/);
  }
  assert.match(sharedRuntime, /visibleModuleCodes=\{entitledModuleCodes\}/);
  assert.match(sharedRuntime, /hideHeader=\{surfaceKey ===/);
  assert.match(sharedRuntime, /moduleBadgesFromItems/);
  assert.match(
    sharedRuntime,
    /workspace\.modules\.map\(\(item\) => item\.code\)/,
  );
  assert.match(sharedRuntime, /visible\.has\(block\.id\.slice\(7\)\)/);
  assert.match(meshRuntime, /"mesh\.atlas-welcome":\s*AtlasWelcome/);
  assert.match(sharedRuntime, /WorkspaceModuleTabs/);
  assert.match(studioRuntime, /"studio\.atlas-welcome":\s*AtlasWelcome/);
  assert.match(navigation, /name:intl\.message\("workspace\.home"\),href:`\/\$\{workspace\.routeSlug\}`/);
  assert.match(navigation, /activeModuleCode\?\?"home"/);
  assert.match(navigation, /athyper-experience__module-tabs--primary/);
  assert.match(navigation, /aria-current=\{active\?"page":undefined\}/);
  assert.match(navigation, /ModuleMoreMenu/);
  assert.match(navigation, /intl\.message\("workspace\.searchModules"\)/);
  assert.match(navigation, /useFittingModuleTabLimit/);
  assert.match(navigation, /function tabsOverflow\(element:HTMLElement\)/);
  assert.match(navigation, /new ResizeObserver/);
  assert.match(renderer, /headerAccessory\?: ReactNode/);
  assert.match(renderer, /headerAccessory \|\| framedHeader/);
  assert.match(renderer, /"data-scope": surface\.scope\.kind/);
  assert.match(browser, /headerAccessory=\{headerAccessory\}/);
  assert.match(browser, /framedHeader=\{framedHeader\}/);
  assert.match(styles, /\.athyper-experience__module-tabs/);
  assert.match(
    styles,
    /\.athyper-experience__module-tabs--primary\{width:calc\(100% - 20px\);max-width:calc\(100% - 20px\);margin:15px 10px 0/,
  );
  assert.match(
    styles,
    /module-tabs--primary>a,[^}]*module-more\{flex:0 0 auto\}/,
  );
  assert.match(
    styles,
    /data-surface="neon\.home"[^}]*max-width:none;gap:0;padding:15px 10px/,
  );
  assert.match(styles, /data-surface="mesh\.home"/);
  assert.match(styles, /data-surface="studio\.home"/);
  assert.match(
    styles,
    /data-plane="neon"\]\[data-scope="workspace"\][^}]*width:100%;max-width:none;padding:15px 10px/,
  );
  assert.match(
    styles,
    /data-scope=workspace[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  );
  assert.match(renderer, /athyper-experience__module-context/);
  assert.match(renderer, /onTogglePinned/);
  assert.match(styles, /athyper-experience__module-more/);
  assert.match(styles, /athyper-experience__module-badge--loading/);
  assert.match(
    styles,
    /data-surface="neon\.home"[^}]*athyper-home\{width:100%;max-width:none/,
  );
  assert.match(
    styles,
    /athyper-experience__block--extension\{padding:0;border:0/,
  );
  assert.match(styles, /athyper-home__hero\{padding:1\.5rem/);
  assert.match(
    styles,
    /@media \(width < 48rem\)\{\.athyper-home__atlas-actions\{display:none\}\}/,
  );
});

test("module order is stable: pinned, then catalog order, never recent use", () => {
  assert.deepEqual(
    orderModuleCodes(["bp", "item", "finmd", "org"], ["org", "bp"]),
    ["org", "bp", "item", "finmd"],
  );
  assert.deepEqual(
    orderModuleCodes(["bp", "item"], ["unauthorized", "item"]),
    ["item", "bp"],
  );
  assert.deepEqual(orderModuleCodes(["bp", "item", "org"], []), ["bp", "item", "org"]);
});

test("a module opened from More takes only the last visible slot", () => {
  const modules = ["bp", "item", "finmd", "org", "tax"].map((code) => ({ code }));
  assert.deepEqual(visibleModules(modules, 3, "tax").map((module) => module.code), ["bp", "item", "tax"]);
  assert.deepEqual(visibleModules(modules, 3, "item").map((module) => module.code), ["bp", "item", "finmd"]);
  assert.deepEqual(visibleModules(modules, 3).map((module) => module.code), ["bp", "item", "finmd"]);
});

test("label cap trims the longest labels first, just enough to fit", () => {
  assert.equal(labelCap([100, 200, 300], 700), Infinity);
  assert.equal(labelCap([100, 200, 300], 500), 200);
  assert.equal(labelCap([100, 200, 300], 450), 175);
  assert.equal(labelCap([100, 100], 100), 50);
});

test("More shows search, count and Recent only from six modules", () => {
  assert.equal(moreMenuShowsSearch(1), false);
  assert.equal(moreMenuShowsSearch(5), false);
  assert.equal(moreMenuShowsSearch(6), true);
});

test("metadata icons resolve from the first published key, then the role fallback", () => {
  assert.equal(isSemanticIconKey("history"), true);
  assert.equal(isSemanticIconKey("not-an-icon"), false);
  assert.equal(isSemanticIconKey(undefined), false);
  assert.equal(resolveMetadataIcon("entity", "unknown-key", "history"), resolveIcon("history"));
  assert.equal(resolveMetadataIcon("entity", undefined, null, "package"), resolveIcon("package"));
  for (const [role, key] of Object.entries(ICON_ROLE_FALLBACKS)) {
    assert.ok(SEMANTIC_ICON_KEYS.includes(key), `${role} fallback ${key} must be a semantic key`);
    assert.equal(resolveMetadataIcon(role as keyof typeof ICON_ROLE_FALLBACKS), resolveIcon(key));
    assert.equal(resolveMetadataIcon(role as keyof typeof ICON_ROLE_FALLBACKS, "bogus"), resolveIcon(key));
  }
});

test("Neon route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(
    new URL(
      "../../packages/planes/neon/navigation/src/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.neon\.flatMap/);
  assert.match(
    navigation,
    /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/,
  );
  assert.match(navigation, /moduleCode: module\.code/);
});

test("Mesh route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(
    new URL(
      "../../packages/planes/mesh/shell/src/navigation.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.mesh\.flatMap/);
  assert.match(
    navigation,
    /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/,
  );
  assert.match(navigation, /moduleCode: module\.code/);
  assert.doesNotMatch(navigation, /mesh\.mdg\.business-partner/);
});

test("Studio route boundaries are generated for every canonical module", async () => {
  const navigation = await readFile(
    new URL(
      "../../packages/planes/studio/shell/src/navigation.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(navigation, /PLATFORM_CATALOG_ROUTES\.studio\.flatMap/);
  assert.match(
    navigation,
    /href: `\/\$\{workspace\.routeSlug\}\/\$\{module\.routeSlug\}`/,
  );
  assert.match(navigation, /moduleCode: module\.code/);
  assert.doesNotMatch(navigation, /studio\.mdg\.business-partner/);
});

test("one deterministic route tree resolves all purchasing entity surfaces", () => {
  validateCatalogRoutes(routes);
  assert.equal(
    resolveCatalogRoute(routes, ["procurement", "purchasing"])?.kind,
    "module",
  );
  assert.deepEqual(
    resolveCatalogRoute(routes, ["procurement", "purchasing", "new"]),
    {
      kind: "entity-create",
      workspace: routes[0],
      module: routes[0].modules[0],
      entity: routes[0].modules[0].entities[0],
    },
  );
  assert.equal(
    resolveCatalogRoute(routes, [
      "procurement",
      "purchasing",
      "purchase-orders",
    ])?.kind,
    "entity-collection",
  );
  assert.equal(
    resolveCatalogRoute(routes, [
      "procurement",
      "purchasing",
      "purchase-orders",
      "PO-1042",
    ])?.kind,
    "entity-detail",
  );
  assert.equal(
    resolveCatalogRoute(routes, [
      "procurement",
      "purchasing",
      "purchase-orders",
      "new",
    ])?.kind,
    "entity-create",
  );
  assert.equal(
    resolveCatalogRoute(routes, ["procurement", "purchasing", "unknown"]),
    undefined,
  );
  assert.equal(
    resolveCatalogRoute(routes, [
      "procurement",
      "purchasing",
      "purchase-orders",
      "../secret",
    ]),
    undefined,
  );
});

test("catalog route validation protects global and new route segments", () => {
  assert.throws(() =>
    validateCatalogRoutes([{ ...routes[0], routeSlug: "inbox" }]),
  );
  assert.throws(() =>
    validateCatalogRoutes([
      {
        ...routes[0],
        modules: [
          {
            ...routes[0].modules[0],
            entities: [{ code: "thing", routeSlug: "new", name: "Thing" }],
          },
        ],
      },
    ]),
  );
});

test("experience surfaces accept governed image visuals and registry references", () => {
  const value = parseExperienceSurface(
    {
      schema: "athyper-experience-surface/1",
      id: "neon.scm.buy.home",
      revision: 1,
      scope: {
        kind: "module",
        plane: "neon",
        workspaceCode: "scm",
        moduleCode: "buy",
      },
      title: "Purchasing",
      visual: {
        kind: "image",
        assetRef: "asset:catalog/purchasing-hero",
        alt: "Purchasing team",
      },
      blocks: [
        {
          id: "open-orders",
          type: "number-card",
          title: "Open orders",
          dataSource: "purchasing.open-orders",
        },
        {
          id: "create",
          type: "shortcut",
          actions: [
            {
              action: "catalog.navigate",
              label: "New purchase order",
              input: { path: "/procurement/purchasing/new" },
            },
          ],
        },
      ],
    },
    {
      dataSources: new Set(["purchasing.open-orders"]),
      actions: new Set(["catalog.navigate"]),
      extensions: new Set(),
    },
  );
  assert.equal(value.blocks.length, 2);
  assert.equal(value.visual?.kind, "image");
});

test("experience surfaces fail closed for unknown data, actions, and executable URLs", () => {
  const policy = {
    dataSources: new Set<string>(),
    actions: new Set<string>(),
    extensions: new Set<string>(),
  };
  assert.throws(
    () =>
      parseExperienceSurface(
        {
          schema: "athyper-experience-surface/1",
          id: "x.home",
          revision: 1,
          scope: { kind: "home", plane: "neon" },
          title: "X",
          blocks: [
            {
              id: "x.chart",
              type: "chart",
              dataSource: "sql.raw",
              visualization: "bar",
            },
          ],
        },
        policy,
      ),
    /unregistered/,
  );
  assert.throws(
    () =>
      parseExperienceSurface(
        {
          schema: "athyper-experience-surface/1",
          id: "x.home",
          revision: 1,
          scope: { kind: "home", plane: "neon" },
          title: "X",
          visual: { kind: "image", assetRef: "javascript:alert(1)", alt: "X" },
          blocks: [],
        },
        policy,
      ),
    /not governed/,
  );
});

test("tenant publication wins over shared defaults while personal changes stay structural", () => {
  const policy = {
    dataSources: new Set<string>(),
    actions: new Set(["catalog.navigate"]),
    extensions: new Set<string>(),
  };
  const create = (revision: number, title: string) =>
    parseExperienceSurface(
      {
        schema: "athyper-experience-surface/1",
        id: "neon.home",
        revision,
        scope: { kind: "home", plane: "neon" },
        title,
        blocks: [
          { id: "first.card", type: "text", text: "First" },
          { id: "second.card", type: "text", text: "Second" },
        ],
      },
      policy,
    );
  const published = resolvePublishedExperience(create(1, "System"), [
    { layer: "shared", surface: create(2, "Shared") },
    { layer: "tenant", surface: create(3, "Tenant") },
  ]);
  const arranged = applyPersonalArrangement(published, {
    schema: "athyper-experience-arrangement/1",
    surfaceId: "neon.home",
    baseRevision: 3,
    order: ["second.card"],
    hidden: ["first.card"],
    spans: { "second.card": 2 },
  });
  assert.equal(arranged.title, "Tenant");
  assert.deepEqual(
    arranged.blocks.map((block) => [block.id, block.span]),
    [["second.card", 2]],
  );
  assert.equal(
    applyPersonalArrangement(published, {
      schema: "athyper-experience-arrangement/1",
      surfaceId: "neon.home",
      baseRevision: 2,
    }).blocks.length,
    2,
  );
  const effective = resolveEffectiveExperience(
    create(1, "System"),
    [{ layer: "tenant", surface: create(3, "Tenant") }],
    parsePersonalSurfaceArrangement({
      schema: "athyper-experience-arrangement/1",
      surfaceId: "neon.home",
      baseRevision: 3,
      hidden: ["first.card"],
    }),
    { tenantRevision: 3 },
  );
  assert.equal(effective.provenance.personalApplied, true);
  assert.deepEqual(
    effective.surface.blocks.map((block) => block.id),
    ["second.card"],
  );
});

test("canonical Neon DDL assigns BP permissions to the bp module", async () => {
  const catalog = await readFile(
    new URL(
      "../../server/db/ddl/planes/neon/master/12_platform_catalog_reference_seed.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const seed = await readFile(
    new URL(
      "../../server/db/ddl/planes/neon/authz/14_permission_reference_seed.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(catalog, /'bp', 'Business Partners'/);
  assert.match(
    seed,
    /canonical_code LIKE 'neon\.relationship\.business_partner%'/,
  );
  assert.match(seed, /module\.code <> 'bp'/);
});

test("canonical Studio DDL aligns the exp and pcat catalog modules", async () => {
  const master = await readFile(
    new URL(
      "../../server/db/ddl/planes/studio/master/12_platform_catalog_reference_seed.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const control = await readFile(
    new URL(
      "../../server/db/ddl/planes/studio/control/12_platform_catalog_reference_seed.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(master, /'exp','Experience & Navigation Design'/);
  assert.match(master, /'pcat','Platform Catalog Management'/);
  assert.match(control, /<> 33/);
});
