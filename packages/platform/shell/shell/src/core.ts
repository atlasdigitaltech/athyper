import {
  createAccessSnapshot,
  decideRouteAccess,
} from "@athyper/platform-shell-runtime/core";

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
  readonly presentation?: Readonly<{
    workspaceCode: string;
    workspaceName: string;
    workspaceHref?: `/${string}`;
    workspaceIconKey?: string;
    workspaceSortOrder?: number;
    moduleName: string;
  }>;
}
export interface ShellCatalogModule {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly primary: boolean;
}
export interface ShellCatalogWorkspace {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly modules: readonly ShellCatalogModule[];
}
export interface ShellExperienceInput {
  readonly workspaces: readonly ShellCatalogWorkspace[];
  readonly permissions: readonly string[];
  readonly features: Readonly<Record<string, Readonly<{ enabled: boolean }>>>;
}
export interface DerivedShellRoute extends PlaneRouteDefinition {
  readonly label: string;
  readonly iconKey: string;
  readonly workspaceCode: string;
  readonly workspaceName: string;
  readonly moduleName: string;
  readonly sortOrder: number;
}
export interface DerivedShellWorkspace {
  readonly code: string;
  readonly name: string;
  readonly href: `/${string}`;
  readonly iconKey: string;
  readonly sortOrder: number;
  readonly routes: readonly DerivedShellRoute[];
}
export interface DerivedShellNavigation {
  readonly workspaces: readonly DerivedShellWorkspace[];
  readonly routes: readonly DerivedShellRoute[];
  readonly landingHref?: string;
  readonly unknownActiveModules: readonly string[];
}
export interface NavigationDiagnostic {
  readonly kind: "unknown-active-module";
  readonly moduleCode: string;
}

export function definePlaneRoutes<
  const Routes extends readonly PlaneRouteDefinition[],
>(routes: Routes): Routes {
  const ids = new Set<string>(),
    hrefs = new Set<string>();
  for (const route of routes) {
    if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(route.id))
      throw new TypeError(`Invalid route id: ${route.id}`);
    if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(route.moduleCode))
      throw new TypeError(`Invalid module code for ${route.id}`);
    if (
      !route.href.startsWith("/") ||
      route.href.startsWith("//") ||
      route.href.includes("\\") ||
      route.href.includes("..")
    )
      throw new TypeError(`Route ${route.id} must use a safe local href`);
    if (ids.has(route.id) || hrefs.has(route.href))
      throw new TypeError(`Duplicate route id or href: ${route.id}`);
    ids.add(route.id);
    hrefs.add(route.href);
  }
  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        ...route,
        requiredPermissions: Object.freeze([...route.requiredPermissions]),
        requiredFeatures: Object.freeze([...route.requiredFeatures]),
      }),
    ),
  ) as unknown as Routes;
}

export function deriveShellNavigation(
  registry: readonly PlaneRouteDefinition[],
  experience: ShellExperienceInput,
  onDiagnostic?: (event: NavigationDiagnostic) => void,
): DerivedShellNavigation {
  const registryModules = new Set(registry.map((route) => route.moduleCode));
  const moduleLandingRoutes = new Map<string, string>();
  for (const route of registry) {
    if (!moduleLandingRoutes.has(route.moduleCode))
      moduleLandingRoutes.set(route.moduleCode, route.id);
  }
  const activeModules = [
    ...new Set(
      experience.workspaces.flatMap((workspace) =>
        workspace.modules.map((module) => module.code),
      ),
    ),
  ];
  const unknownActiveModules = activeModules
    .filter((code) => !registryModules.has(code))
    .sort();
  for (const moduleCode of unknownActiveModules)
    onDiagnostic?.(
      Object.freeze({ kind: "unknown-active-module", moduleCode }),
    );
  const access = createAccessSnapshot({
    sessionState: "authenticated",
    contextAvailable: true,
    entitledModules: activeModules,
    permissions: experience.permissions,
    features: experience.features,
    knownModules: [...registryModules],
    knownPermissions: [
      ...new Set(registry.flatMap((route) => route.requiredPermissions)),
    ],
    knownFeatures: [
      ...new Set(registry.flatMap((route) => route.requiredFeatures)),
    ],
  });
  const routes: DerivedShellRoute[] = [];
  const workspaceGroups = new Map<
    string,
    {
      name: string;
      href: `/${string}`;
      iconKey: string;
      sortOrder: number;
      routes: DerivedShellRoute[];
    }
  >();
  for (const workspace of [...experience.workspaces].sort(byOrder)) {
    for (const module of [...workspace.modules].sort(byOrder))
      for (const route of registry) {
        if (
          route.moduleCode !== module.code ||
          !decideRouteAccess(access, route).allowed
        )
          continue;
        const isModuleLandingRoute =
          moduleLandingRoutes.get(route.moduleCode) === route.id;
        const presentedWorkspace = route.presentation;
        const moduleName =
          cleanLabel(presentedWorkspace?.moduleName) ??
          cleanLabel(module.name) ??
          module.code;
        const label = isModuleLandingRoute
          ? moduleName
          : (cleanLabel(route.label) ?? moduleName);
        const workspaceCode =
          presentedWorkspace?.workspaceCode ?? workspace.code;
        const workspaceName =
          cleanLabel(presentedWorkspace?.workspaceName) ??
          cleanLabel(workspace.name) ??
          workspace.code;
        const workspaceHref = presentedWorkspace?.workspaceHref ?? route.href;
        const workspaceIconKey =
          presentedWorkspace?.workspaceIconKey ?? workspace.iconKey ?? "info";
        const workspaceSortOrder =
          presentedWorkspace?.workspaceSortOrder ?? workspace.sortOrder;
        const derived = Object.freeze({
          ...route,
          label,
          iconKey: module.iconKey ?? route.iconKey ?? "info",
          workspaceCode,
          workspaceName,
          moduleName,
          sortOrder: module.sortOrder,
        });
        routes.push(derived);
        const group = workspaceGroups.get(workspaceCode) ?? {
          name: workspaceName,
          href: workspaceHref,
          iconKey: workspaceIconKey,
          sortOrder: workspaceSortOrder,
          routes: [],
        };
        group.routes.push(derived);
        workspaceGroups.set(workspaceCode, group);
      }
  }
  const workspaces = [...workspaceGroups.entries()]
    .filter(([, workspace]) =>
      workspace.routes.some((route) => route.navigation !== "hidden"),
    )
    .map(([code, workspace]) =>
      Object.freeze({
        code,
        name: workspace.name,
        href: workspace.href,
        iconKey: workspace.iconKey,
        sortOrder: workspace.sortOrder,
        routes: Object.freeze(workspace.routes),
      }),
    )
    .sort(byOrder);
  const visible = routes.filter((route) => route.navigation !== "hidden");
  const firstWorkspace = workspaces.find((workspace) =>
    workspace.routes.some((route) => route.navigation !== "hidden"),
  );
  return Object.freeze({
    workspaces: Object.freeze(workspaces),
    routes: Object.freeze(routes),
    ...(firstWorkspace
      ? { landingHref: firstWorkspace.href }
      : visible[0]
        ? { landingHref: visible[0].href }
        : {}),
    unknownActiveModules: Object.freeze(unknownActiveModules),
  });
}

/** Shared activity pages use the authenticated shell and server-scoped data. */
export function isShellActivityRoute(pathname: string): boolean {
  return pathname === "/inbox" || pathname === "/notifications";
}

export function canAccessRoute(
  navigation: DerivedShellNavigation,
  pathname: string,
): boolean {
  return (
    navigation.workspaces.some((workspace) => workspace.href === pathname) ||
    navigation.routes.some(
      (route) =>
        route.href === pathname ||
        (route.href !== "/" && pathname.startsWith(`${route.href}/`)),
    )
  );
}
export function selectLandingRoute(
  navigation: DerivedShellNavigation,
  requestedPath?: string,
): string | undefined {
  return requestedPath && canAccessRoute(navigation, requestedPath)
    ? requestedPath
    : navigation.landingHref;
}
export function deriveBreadcrumbs(
  navigation: DerivedShellNavigation,
  pathname: string,
): readonly Readonly<{ label: string; href?: string }>[] {
  const workspaceLanding = navigation.workspaces.find(
    (item) => item.href === pathname,
  );
  if (workspaceLanding)
    return Object.freeze([
      Object.freeze({
        label: workspaceLanding.name,
        href: workspaceLanding.href,
      }),
    ]);
  const route = [...navigation.routes]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        item.href === pathname ||
        (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
    );
  if (!route) return Object.freeze([]);
  const workspace = navigation.workspaces.find(
    (item) => item.code === route.workspaceCode,
  );
  const crumbs: Readonly<{ label: string; href?: string }>[] = [
    {
      label: route.workspaceName,
      ...(workspace ? { href: workspace.href } : {}),
    },
    { label: route.label, href: route.href },
  ];
  const suffix = pathname
    .slice(route.href === "/" ? 1 : route.href.length + 1)
    .split("/")
    .filter(Boolean)
    .map(humanizePathSegment);
  for (const label of suffix) crumbs.push({ label });
  return Object.freeze(crumbs);
}
function byOrder<
  T extends { readonly sortOrder: number; readonly code: string },
>(left: T, right: T): number {
  return (
    left.sortOrder - right.sortOrder || left.code.localeCompare(right.code)
  );
}
function cleanLabel(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result.slice(0, 100) : undefined;
}
function humanizePathSegment(value: string): string {
  const decoded = decodeURIComponent(value).replace(/[-_]+/g, " ");
  return /\d/u.test(decoded)
    ? decoded
    : decoded.replace(/\b\p{L}/gu, (character) =>
        character.toLocaleUpperCase(),
      );
}
