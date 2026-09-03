import { PLATFORM_CATALOG_ROUTES } from "../../../../contracts/platform/navigation/src/generated-catalog";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

export const meshRoutes = definePlaneRoutes(PLATFORM_CATALOG_ROUTES.mesh.flatMap((workspace, workspaceIndex) =>
  workspace.modules.map((module) => ({
    id: `mesh.${workspace.code}.${module.code}`,
    moduleCode: module.code,
    href: `/${workspace.routeSlug}/${module.routeSlug}` as `/${string}`,
    label: module.name,
    iconKey: "info",
    requiredPermissions: [],
    requiredFeatures: [],
    navigation: "primary" as const,
    presentation: {
      workspaceCode: workspace.code,
      workspaceName: workspace.name,
      workspaceHref: `/${workspace.routeSlug}` as `/${string}`,
      workspaceIconKey: "info",
      workspaceSortOrder: (workspaceIndex + 1) * 10,
      moduleName: module.name,
    },
  })),
));
