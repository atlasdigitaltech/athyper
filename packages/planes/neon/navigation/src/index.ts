import { PLATFORM_CATALOG_ROUTES } from "@athyper/contract-platform-navigation/generated";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

// Every canonical module receives a route-boundary declaration. Entitlements
// still filter this registry before navigation or content is rendered.
export const neonRoutes = definePlaneRoutes(PLATFORM_CATALOG_ROUTES.neon.flatMap((workspace, workspaceIndex) => workspace.modules.map((module) => ({
  id: `neon.${workspace.code}.${module.code}`,
  moduleCode: module.code,
  href: `/${workspace.routeSlug}/${module.routeSlug}` as `/${string}`,
  label: module.name,
  iconKey: module.iconKey ?? "info",
  requiredPermissions: [],
  requiredFeatures: [],
  navigation: "primary" as const,
  presentation: {
    workspaceCode: workspace.code,
    workspaceName: workspace.name,
    workspaceHref: `/${workspace.routeSlug}` as `/${string}`,
    workspaceIconKey: workspace.iconKey ?? "info",
    workspaceSortOrder: (workspaceIndex + 1) * 10,
    moduleName: module.name,
  },
}))));
