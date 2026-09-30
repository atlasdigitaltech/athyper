import { PLATFORM_CATALOG_ROUTES } from "@athyper/contract-platform-navigation/generated";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

const catalogRoutes = PLATFORM_CATALOG_ROUTES.studio.flatMap(
  (workspace, workspaceIndex) =>
    workspace.modules.map((module) => ({
      id: `studio.${workspace.code}.${module.code}`,
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
        workspaceIconKey: "settings",
        workspaceSortOrder: (workspaceIndex + 1) * 10,
        moduleName: module.name,
      },
    })),
);

const publicationRoute = catalogRoutes.find(
  (route) => route.moduleCode === "pub",
);
if (!publicationRoute)
  throw new Error("Studio publication catalog route is required");

export const studioRoutes = definePlaneRoutes([
  ...catalogRoutes,
  {
    ...publicationRoute,
    id: "studio.entity.pub.atlas-learning",
    href: "/atlas/learning",
    label: "Atlas learning inbox",
    requiredPermissions: ["metadata.entity.review"],
    navigation: "secondary",
  },
]);
