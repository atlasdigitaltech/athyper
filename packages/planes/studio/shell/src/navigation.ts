import { PLATFORM_CATALOG_ROUTES } from "../../../../contracts/platform/navigation/src/generated-catalog";
import { definePlaneRoutes } from "@athyper/platform-shell/core";

const catalogRoutes = PLATFORM_CATALOG_ROUTES.studio.flatMap((workspace, workspaceIndex) =>
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
);

const publicationRoute = catalogRoutes.find((route) => route.moduleCode === "pub");
if (!publicationRoute) throw new Error("Studio publication catalog route is required");

export const studioRoutes = definePlaneRoutes([
  ...catalogRoutes,
  {
    ...publicationRoute,
    id: "studio.entity.pub.mdg",
    href: "/mdg",
    label: "Master Data Governance",
    requiredPermissions: ["studio.business_partner_definition.read"],
    navigation: "hidden",
  },
  {
    ...publicationRoute,
    id: "studio.entity.pub.business-partner-publication",
    href: "/mdg/business-partner/publication",
    label: "Business Partner Publication",
    requiredPermissions: ["studio.business_partner_definition.read"],
    navigation: "secondary",
  },
]);
