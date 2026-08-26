import { createAccessSnapshot, decideRouteAccess } from "@athyper/platform-shell-runtime/core";

export type PlaneNavigationKind = "primary" | "secondary" | "hidden";
export interface PlaneRouteDefinition {
  readonly id: string;
  readonly moduleCode: string;
  readonly href: `/${string}`;
  readonly label: string;
  readonly iconKey: string;
  readonly requiredPermissions: readonly string[];
  readonly requiredFeatures: readonly string[];
  readonly navigation: PlaneNavigationKind;
}
export interface ShellCatalogModule { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly primary: boolean; }
export interface ShellCatalogWorkspace { readonly code: string; readonly name: string; readonly iconKey?: string; readonly sortOrder: number; readonly modules: readonly ShellCatalogModule[]; }
export interface ShellExperienceInput { readonly workspaces: readonly ShellCatalogWorkspace[]; readonly permissions: readonly string[]; readonly features: Readonly<Record<string, Readonly<{ enabled: boolean }>>>; }
export interface DerivedShellRoute extends PlaneRouteDefinition { readonly label: string; readonly iconKey: string; readonly workspaceCode: string; readonly workspaceName: string; readonly moduleName: string; readonly sortOrder: number; }
export interface DerivedShellWorkspace { readonly code: string; readonly name: string; readonly iconKey: string; readonly sortOrder: number; readonly routes: readonly DerivedShellRoute[]; }
export interface DerivedShellNavigation { readonly workspaces: readonly DerivedShellWorkspace[]; readonly routes: readonly DerivedShellRoute[]; readonly landingHref?: string; readonly unknownActiveModules: readonly string[]; }
export interface NavigationDiagnostic { readonly kind: "unknown-active-module"; readonly moduleCode: string; }

export function definePlaneRoutes<const Routes extends readonly PlaneRouteDefinition[]>(routes: Routes): Routes {
  const ids = new Set<string>(), hrefs = new Set<string>();
  for (const route of routes) {
    if (!/^[a-z][a-z0-9.-]{1,80}$/.test(route.id)) throw new TypeError(`Invalid route id: ${route.id}`);
    if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(route.moduleCode)) throw new TypeError(`Invalid module code for ${route.id}`);
    if (!route.href.startsWith("/") || route.href.startsWith("//") || route.href.includes("\\") || route.href.includes("..")) throw new TypeError(`Route ${route.id} must use a safe local href`);
    if (ids.has(route.id) || hrefs.has(route.href)) throw new TypeError(`Duplicate route id or href: ${route.id}`);
    ids.add(route.id); hrefs.add(route.href);
  }
  return Object.freeze(routes.map((route) => Object.freeze({ ...route, requiredPermissions: Object.freeze([...route.requiredPermissions]), requiredFeatures: Object.freeze([...route.requiredFeatures]) }))) as unknown as Routes;
}

export function deriveShellNavigation(registry: readonly PlaneRouteDefinition[], experience: ShellExperienceInput, onDiagnostic?: (event: NavigationDiagnostic) => void): DerivedShellNavigation {
  const registryModules = new Set(registry.map((route) => route.moduleCode));
  const moduleLandingRoutes = new Map<string, string>();
  for (const route of registry) {
    if (!moduleLandingRoutes.has(route.moduleCode)) moduleLandingRoutes.set(route.moduleCode, route.id);
  }
  const activeModules = [...new Set(experience.workspaces.flatMap((workspace) => workspace.modules.map((module) => module.code)))];
  const unknownActiveModules = activeModules.filter((code) => !registryModules.has(code)).sort();
  for (const moduleCode of unknownActiveModules) onDiagnostic?.(Object.freeze({ kind: "unknown-active-module", moduleCode }));
  const access = createAccessSnapshot({ sessionState: "authenticated", contextAvailable: true, entitledModules: activeModules, permissions: experience.permissions, features: experience.features, knownModules: [...registryModules], knownPermissions: [...new Set(registry.flatMap((route) => route.requiredPermissions))], knownFeatures: [...new Set(registry.flatMap((route) => route.requiredFeatures))] });
  const routes: DerivedShellRoute[] = [], workspaces: DerivedShellWorkspace[] = [];
  for (const workspace of [...experience.workspaces].sort(byOrder)) {
    const workspaceRoutes: DerivedShellRoute[] = [];
    for (const module of [...workspace.modules].sort(byOrder)) for (const route of registry) {
      if (route.moduleCode !== module.code || !decideRouteAccess(access, route).allowed) continue;
      const isModuleLandingRoute = moduleLandingRoutes.get(route.moduleCode) === route.id;
      const label = isModuleLandingRoute
        ? cleanLabel(module.name) ?? cleanLabel(route.label) ?? route.moduleCode
        : cleanLabel(route.label) ?? cleanLabel(module.name) ?? route.moduleCode;
      const derived = Object.freeze({ ...route, label, iconKey: module.iconKey ?? route.iconKey ?? "info", workspaceCode: workspace.code, workspaceName: cleanLabel(workspace.name) ?? workspace.code, moduleName: cleanLabel(module.name) ?? module.code, sortOrder: module.sortOrder });
      workspaceRoutes.push(derived); routes.push(derived);
    }
    if (workspaceRoutes.some((route) => route.navigation !== "hidden")) workspaces.push(Object.freeze({ code: workspace.code, name: cleanLabel(workspace.name) ?? workspace.code, iconKey: workspace.iconKey ?? "info", sortOrder: workspace.sortOrder, routes: Object.freeze(workspaceRoutes) }));
  }
  const visible = routes.filter((route) => route.navigation !== "hidden");
  return Object.freeze({ workspaces: Object.freeze(workspaces), routes: Object.freeze(routes), ...(visible[0] ? { landingHref: visible[0].href } : {}), unknownActiveModules: Object.freeze(unknownActiveModules) });
}

export function canAccessRoute(navigation: DerivedShellNavigation, pathname: string): boolean { return navigation.routes.some((route) => route.href === pathname || (route.href !== "/" && pathname.startsWith(`${route.href}/`))); }
export function selectLandingRoute(navigation: DerivedShellNavigation, requestedPath?: string): string | undefined { return requestedPath && canAccessRoute(navigation, requestedPath) ? requestedPath : navigation.landingHref; }
export function deriveBreadcrumbs(navigation: DerivedShellNavigation, pathname: string): readonly Readonly<{ label: string; href?: string }>[] {
  const route = [...navigation.routes].sort((a, b) => b.href.length - a.href.length).find((item) => item.href === pathname || (item.href !== "/" && pathname.startsWith(`${item.href}/`)));
  if (!route) return Object.freeze([]);
  const crumbs: Readonly<{ label: string; href?: string }>[] = [{ label: route.workspaceName }, { label: route.label, href: route.href }];
  const suffix = pathname.slice(route.href === "/" ? 1 : route.href.length + 1).split("/").filter(Boolean).map((part) => decodeURIComponent(part).replace(/[-_]+/g, " "));
  for (const label of suffix) crumbs.push({ label });
  return Object.freeze(crumbs);
}
function byOrder<T extends { readonly sortOrder: number; readonly code: string }>(left: T, right: T): number { return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code); }
function cleanLabel(value: string | undefined): string | undefined { const result = value?.trim(); return result ? result.slice(0, 100) : undefined; }
