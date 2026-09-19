import { PLATFORM_CATALOG_ROUTES } from "../../../../contracts/platform/navigation/src/generated-catalog";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

const catalogRoutes = PLATFORM_CATALOG_ROUTES.mesh.flatMap((workspace, workspaceIndex) =>
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
);

const partnerNetworkRoute = catalogRoutes.find((route) => route.moduleCode === "npm");
if (!partnerNetworkRoute) throw new Error("MESH partner-network catalog route is required");

export const meshRoutes = definePlaneRoutes([
  ...catalogRoutes,
  {
    ...partnerNetworkRoute,
    id: "mesh.network-rel.npm.business-partner",
    href: "/mdg/business-partner",
    label: "Business Partner",
    requiredPermissions: ["mesh.catalog.network_account.read"],
    navigation: "hidden",
  },
]);
