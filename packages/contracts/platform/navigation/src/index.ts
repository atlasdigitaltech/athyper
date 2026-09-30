export interface NavigationModule { readonly code: string; readonly name: string; readonly iconKey?: string; readonly primaryWorkspaceCode?: string; }
export interface NavigationWorkspace { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly modules: readonly string[]; }
export interface NavigationCatalog { readonly schemaVersion: 1; readonly revision: string; readonly workspaces: readonly NavigationWorkspace[]; readonly modules: readonly NavigationModule[]; }

export const RESERVED_GLOBAL_ROUTE_SLUGS = Object.freeze(["home", "inbox", "notifications", "operations", "atlas", "auth", "api", "sign-in", "logout", "select-context"] as const);
export interface CatalogEntityRoute { readonly code: string; readonly routeSlug: string; readonly name: string; }
export interface CatalogModuleRoute { readonly code: string; readonly routeSlug: string; readonly name: string; readonly iconKey?: string; readonly defaultEntityCode?: string; readonly entities: readonly CatalogEntityRoute[]; }
export interface CatalogWorkspaceRoute { readonly code: string; readonly routeSlug: string; readonly name: string; readonly iconKey?: string; readonly modules: readonly CatalogModuleRoute[]; }
export type CatalogRouteResolution = Readonly<{
  kind: "module" | "entity-collection" | "entity-create" | "entity-detail";
  workspace: CatalogWorkspaceRoute;
  module: CatalogModuleRoute;
  entity?: CatalogEntityRoute;
  entityId?: string;
}>;

export function resolveCatalogRoute(catalog: readonly CatalogWorkspaceRoute[], segments: readonly string[]): CatalogRouteResolution | undefined {
  if (segments.length < 2 || segments.length > 4 || segments.some((segment) => !safeSegment(segment))) return undefined;
  const workspace = catalog.find((candidate) => candidate.routeSlug === segments[0]);
  const module = workspace?.modules.find((candidate) => candidate.routeSlug === segments[1]);
  if (!workspace || !module) return undefined;
  if (segments.length === 2) return Object.freeze({ kind: "module", workspace, module });
  if (segments[2] === "new") {
    if (segments.length !== 3 || !module.defaultEntityCode) return undefined;
    const entity = module.entities.find((candidate) => candidate.code === module.defaultEntityCode);
    return entity ? Object.freeze({ kind: "entity-create", workspace, module, entity }) : undefined;
  }
  const entity = module.entities.find((candidate) => candidate.routeSlug === segments[2]);
  if (!entity) return undefined;
  if (segments.length === 3) return Object.freeze({ kind: "entity-collection", workspace, module, entity });
  if (segments[3] === "new") return Object.freeze({ kind: "entity-create", workspace, module, entity });
  return Object.freeze({ kind: "entity-detail", workspace, module, entity, entityId: segments[3] });
}

export function validateCatalogRoutes(catalog: readonly CatalogWorkspaceRoute[]): void {
  const workspaceCodes = new Set<string>(), workspaceSlugs = new Set<string>(), moduleCodes = new Set<string>();
  for (const workspace of catalog) {
    routeSlug(workspace.routeSlug, `workspace ${workspace.code}`);
    if (RESERVED_GLOBAL_ROUTE_SLUGS.includes(workspace.routeSlug as never)) throw new TypeError(`workspace ${workspace.code} uses reserved route slug ${workspace.routeSlug}`);
    if (workspaceCodes.has(workspace.code) || workspaceSlugs.has(workspace.routeSlug)) throw new TypeError(`duplicate workspace ${workspace.code}/${workspace.routeSlug}`);
    workspaceCodes.add(workspace.code); workspaceSlugs.add(workspace.routeSlug);
    const moduleSlugs = new Set<string>();
    for (const module of workspace.modules) {
      routeSlug(module.routeSlug, `module ${module.code}`);
      if (moduleCodes.has(module.code) || moduleSlugs.has(module.routeSlug)) throw new TypeError(`duplicate module ${module.code}/${module.routeSlug}`);
      moduleCodes.add(module.code); moduleSlugs.add(module.routeSlug);
      const entityCodes = new Set<string>(), entitySlugs = new Set<string>();
      for (const entity of module.entities) {
        routeSlug(entity.routeSlug, `entity ${entity.code}`);
        if (entity.routeSlug === "new" || entityCodes.has(entity.code) || entitySlugs.has(entity.routeSlug)) throw new TypeError(`duplicate or reserved entity ${entity.code}/${entity.routeSlug}`);
        entityCodes.add(entity.code); entitySlugs.add(entity.routeSlug);
      }
      if (module.defaultEntityCode && !entityCodes.has(module.defaultEntityCode)) throw new TypeError(`module ${module.code} default entity is not registered`);
    }
  }
}

function routeSlug(value: string, path: string): void { if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) throw new TypeError(`${path} has invalid route slug ${value}`); }
function safeSegment(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(value) && value !== "." && value !== ".."; }

export function parseNavigationCatalog(value: unknown): NavigationCatalog {
  const record = object(value, "navigation catalog");
  if (record.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  const modules = array(record.modules, "modules").map((candidate, index) => {
    const item = object(candidate, `modules[${index}]`);
    const iconKey = optionalCode(item.iconKey, `modules[${index}].iconKey`);
    const primaryWorkspaceCode = optionalCode(item.primaryWorkspaceCode, `modules[${index}].primaryWorkspaceCode`);
    return Object.freeze({ code: code(item.code, `modules[${index}].code`), name: text(item.name, `modules[${index}].name`), ...(iconKey ? { iconKey } : {}), ...(primaryWorkspaceCode ? { primaryWorkspaceCode } : {}) });
  });
  const moduleCodes = new Set(modules.map((item) => item.code));
  if (moduleCodes.size !== modules.length) throw new TypeError("module codes must be unique");
  const workspaces = array(record.workspaces, "workspaces").map((candidate, index) => {
    const item = object(candidate, `workspaces[${index}]`);
    const members = codes(item.modules, `workspaces[${index}].modules`);
    for (const member of members) if (!moduleCodes.has(member)) throw new TypeError(`workspace references unknown module ${member}`);
    const sortOrder = item.sortOrder;
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0) throw new TypeError(`workspaces[${index}].sortOrder must be a non-negative integer`);
    const iconKey = optionalCode(item.iconKey, `workspaces[${index}].iconKey`);
    return Object.freeze({ code: code(item.code, `workspaces[${index}].code`), name: text(item.name, `workspaces[${index}].name`), ...(iconKey ? { iconKey } : {}), sortOrder, modules: members });
  });
  if (new Set(workspaces.map((item) => item.code)).size !== workspaces.length) throw new TypeError("workspace codes must be unique");
  return Object.freeze({ schemaVersion: 1, revision: text(record.revision, "revision"), workspaces: Object.freeze(workspaces), modules: Object.freeze(modules) });
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function code(value: unknown, name: string): string { const result = text(value, name); if (!/^[a-z][a-z0-9_.-]{1,62}$/.test(result)) throw new TypeError(`${name} must be a catalog code`); return result; }
function optionalCode(value: unknown, name: string): string | undefined { return value === undefined ? undefined : code(value, name); }
function codes(value: unknown, name: string): readonly string[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return Object.freeze([...new Set(value.map((item, index) => code(item, `${name}[${index}]`)))]); }
