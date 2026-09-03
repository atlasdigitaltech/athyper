import { PLATFORM_CATALOG_ROUTES } from "../../../../contracts/platform/navigation/src/generated-catalog";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

export const studioRoutes = definePlaneRoutes(PLATFORM_CATALOG_ROUTES.studio.flatMap((workspace, workspaceIndex) =>
  workspace.modules.map((module) => ({
    id: `studio.${workspace.code}.${module.code}`,
    moduleCode: module.code,
    href: `/${workspace.routeSlug}/${module.routeSlug}` as `/${string}`,
    label: module.name,
    iconKey: module.code === "exp" ? "layout" : "info",
    requiredPermissions: [],
    requiredFeatures: [],
    navigation: "primary" as const,
    presentation: {
      workspaceCode: workspace.code,
      workspaceName: workspace.name,
      workspaceHref: `/${workspace.routeSlug}` as `/${string}`,
      workspaceIconKey: "settings",
      workspaceSortOrder: (workspaceIndex + 1) * 10,
      moduleName: module.name,
    },
  })),
));
