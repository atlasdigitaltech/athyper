import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = resolve(root, "catalog/platform-catalog.v1.json");
const outputPath = resolve(root, "catalog/generated/platform-catalog.lock.json");
const surfaceOutputPath = resolve(root, "catalog/generated/default-experience-surfaces.json");
const surfaceModulePath = resolve(root, "packages/contracts/platform/dashboard/src/generated-defaults.ts");
const navigationModulePath = resolve(root, "packages/contracts/platform/navigation/src/generated-catalog.ts");
const checkOnly = process.argv.includes("--check");
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const codePattern = /^[a-z][a-z0-9_]{1,62}$/;
const iconKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const expectedCounts = { studio: [10, 33], neon: [9, 51], mesh: [5, 25] };

const fail = (message) => { throw new Error(`Invalid platform catalog: ${message}`); };
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function compileCatalog(source) {
  if (source.$schema !== "athyper-platform-catalog/1") fail("unsupported schema");
  const reserved = new Set(source.reservedGlobalSlugs ?? []);
  const compiled = { schema: source.$schema, sourceHash: digest(JSON.stringify(source)), planes: {} };

  for (const [planeCode, plane] of Object.entries(source.planes ?? {})) {
    const expected = expectedCounts[planeCode];
    if (!expected) fail(`unknown plane ${planeCode}`);
    const workspaceCodes = new Set();
    const workspaceSlugs = new Set();
    const moduleCodes = new Set();
    const routePairs = new Set();
    const workspaces = [];

    for (const workspace of plane.workspaces ?? []) {
      const description = workspace.description ?? plane.workspaceDescriptions?.[workspace.code];
      if (!codePattern.test(workspace.code)) fail(`${planeCode} workspace code ${workspace.code}`);
      if (!slugPattern.test(workspace.routeSlug) || reserved.has(workspace.routeSlug)) fail(`${planeCode} workspace routeSlug ${workspace.routeSlug}`);
      if (workspace.iconKey !== undefined && !iconKeyPattern.test(workspace.iconKey)) fail(`${planeCode}.${workspace.code} iconKey ${workspace.iconKey}`);
      if (workspaceCodes.has(workspace.code) || workspaceSlugs.has(workspace.routeSlug)) fail(`${planeCode} duplicate workspace ${workspace.code}/${workspace.routeSlug}`);
      workspaceCodes.add(workspace.code); workspaceSlugs.add(workspace.routeSlug);
      const modules = (workspace.modules ?? []).map(([code, routeSlug, name, iconKey], index) => {
        if (!codePattern.test(code) || moduleCodes.has(code)) fail(`${planeCode} duplicate or invalid module code ${code}`);
        if (!slugPattern.test(routeSlug)) fail(`${planeCode}.${code} routeSlug ${routeSlug}`);
        if (iconKey !== undefined && !iconKeyPattern.test(iconKey)) fail(`${planeCode}.${code} iconKey ${iconKey}`);
        const moduleCard = plane.moduleCards?.[code];
        if (moduleCard?.description !== undefined && (typeof moduleCard.description !== "string" || !moduleCard.description.trim() || moduleCard.description.trim().length > 240)) fail(`${planeCode}.${code} module card description`);
        const moduleActions = (moduleCard?.actions ?? []).map(([label, suffix]) => {
          if (typeof label !== "string" || !label.trim() || label.trim().length > 40) fail(`${planeCode}.${code} module card action label`);
          if (typeof suffix !== "string" || !slugPattern.test(suffix)) fail(`${planeCode}.${code} module card action suffix`);
          return { label: label.trim(), suffix };
        });
        const pair = `${workspace.routeSlug}/${routeSlug}`;
        if (routePairs.has(pair)) fail(`${planeCode} duplicate route ${pair}`);
        moduleCodes.add(code); routePairs.add(pair);
        return { idSeed: `${plane.seedNamespace}:module:${code}`, code, routeSlug, name, ...(iconKey ? { iconKey } : {}), ...(moduleCard?.description ? { description: moduleCard.description.trim() } : {}), ...(moduleActions.length ? { actions: moduleActions } : {}), order: (index + 1) * 10 };
      });
      workspaces.push({ idSeed: `${plane.seedNamespace}:workspace:${workspace.code}`, code: workspace.code, routeSlug: workspace.routeSlug, name: workspace.name, ...(description ? { description } : {}), ...(workspace.iconKey ? { iconKey: workspace.iconKey } : {}), visibility: workspace.visibility, order: workspace.order, modules });
    }
    const moduleCount = workspaces.reduce((sum, workspace) => sum + workspace.modules.length, 0);
    if (workspaces.length !== expected[0] || moduleCount !== expected[1]) fail(`${planeCode} expected ${expected[0]}/${expected[1]}, received ${workspaces.length}/${moduleCount}`);
    compiled.planes[planeCode] = { counts: { workspaces: workspaces.length, modules: moduleCount }, workspaces };
  }
  return compiled;
}

export function generateDefaultSurfaces(catalog) {
  const surfaces = [];
  for (const [plane, projection] of Object.entries(catalog.planes)) {
    surfaces.push({
      schema: "athyper-experience-surface/1", id: `${plane}.home`, revision: 1,
      scope: { kind: "home", plane }, title: "Home", description: "Choose a workspace to continue.",
      blocks: [{ id: "home.atlas-welcome", type: "extension", extension: `${plane}.atlas-welcome`, span: 4, config: {} }],
    });
    for (const workspace of projection.workspaces) {
      surfaces.push({
        schema: "athyper-experience-surface/1", id: `${plane}.${workspace.code}.home`, revision: 1,
        scope: { kind: "workspace", plane, workspaceCode: workspace.code }, eyebrow: `${workspace.name} workspace`, title: workspace.name, ...(workspace.description ? { description: workspace.description } : {}),
        ...(workspace.iconKey ? { visual: { kind: "icon", key: workspace.iconKey } } : {}),
        blocks: [{ id: "workspace.modules-title", type: "heading", text: "Your modules", level: 2, span: 4 }, ...workspace.modules.map((module) => ({ id: `module.${module.code}`, type: "shortcut", title: module.name, body: module.description ?? `Open ${module.name} capabilities and governed work.`, ...(module.iconKey ? { visual: { kind: "icon", key: module.iconKey } } : {}), actions: [{ action: "catalog.navigate", label: "Overview", input: { path: `/${workspace.routeSlug}/${module.routeSlug}` } }, ...(module.actions ?? []).map((item) => ({ action: "catalog.navigate", label: item.label, input: { path: `/${workspace.routeSlug}/${module.routeSlug}/${item.suffix}` } })), { action: "catalog.navigate", label: "ToDo", input: { path: `/inbox?workspace=${workspace.routeSlug}&module=${module.routeSlug}` } }] }))],
      });
      for (const module of workspace.modules) surfaces.push({
        schema: "athyper-experience-surface/1", id: `${plane}.${workspace.code}.${module.code}.home`, revision: 1,
        scope: { kind: "module", plane, workspaceCode: workspace.code, moduleCode: module.code }, title: module.name,
        ...(module.iconKey ? { visual: { kind: "icon", key: module.iconKey } } : {}), blocks: [{ id: "module.summary", type: "text", text: `${module.name} is ready for published entity experiences.` }],
      });
    }
  }
  return { schema: "athyper-experience-surface-bundle/1", catalogSourceHash: catalog.sourceHash, surfaces };
}

function generateCatalogRoutes(catalog) {
  return Object.fromEntries(Object.entries(catalog.planes).map(([plane, projection]) => [plane, projection.workspaces.map((workspace) => ({
    code: workspace.code,
    routeSlug: workspace.routeSlug,
    name: workspace.name,
    ...(workspace.iconKey ? { iconKey: workspace.iconKey } : {}),
    modules: workspace.modules.map((module) => ({ code: module.code, routeSlug: module.routeSlug, name: module.name, ...(module.iconKey ? { iconKey: module.iconKey } : {}), entities: [] })),
  }))]));
}

const sourceText = await readFile(sourcePath, "utf8");
const compiled = compileCatalog(JSON.parse(sourceText));
const compiledText = `${JSON.stringify(compiled, null, 2)}\n`;
const surfacesText = `${JSON.stringify(generateDefaultSurfaces(compiled), null, 2)}\n`;
const surfaceModuleText = `// Generated by scripts/catalog/generate-platform-catalog.mjs. Do not edit.\nimport type { ExperienceSurface } from "./index.js";\n\nexport const DEFAULT_EXPERIENCE_SURFACES = Object.freeze(${JSON.stringify(generateDefaultSurfaces(compiled).surfaces, null, 2)} as const satisfies readonly ExperienceSurface[]);\n\nexport function defaultExperienceSurface(surfaceKey: string, plane?: "studio" | "neon" | "mesh"): ExperienceSurface | undefined {\n  return DEFAULT_EXPERIENCE_SURFACES.find((surface) => surface.id === surfaceKey && (!plane || surface.scope.plane === plane));\n}\n`;
const navigationModuleText = `// Generated by scripts/catalog/generate-platform-catalog.mjs. Do not edit.\nimport type { CatalogWorkspaceRoute } from "./index.js";\n\nexport const PLATFORM_CATALOG_ROUTES = Object.freeze(${JSON.stringify(generateCatalogRoutes(compiled), null, 2)} as const satisfies Readonly<Record<"studio" | "neon" | "mesh", readonly CatalogWorkspaceRoute[]>>);\n`;
if (checkOnly) {
  const [current, currentSurfaces, currentSurfaceModule, currentNavigationModule] = await Promise.all([readFile(outputPath, "utf8").catch(() => ""), readFile(surfaceOutputPath, "utf8").catch(() => ""), readFile(surfaceModulePath, "utf8").catch(() => ""), readFile(navigationModulePath, "utf8").catch(() => "")]);
  if (current !== compiledText || currentSurfaces !== surfacesText || currentSurfaceModule !== surfaceModuleText || currentNavigationModule !== navigationModuleText) throw new Error("Generated catalog artifacts are stale; run pnpm catalog:generate");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([writeFile(outputPath, compiledText), writeFile(surfaceOutputPath, surfacesText), writeFile(surfaceModulePath, surfaceModuleText), writeFile(navigationModulePath, navigationModuleText)]);
}
console.log(`platform catalog ${checkOnly ? "verified" : "generated"}: ${outputPath}, ${surfaceOutputPath}`);
