import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const neonRoutes = definePlaneRoutes([
  { id: "neon.mdg.business-partner", moduleCode: "fnd", href: "/mdg/business-partner", label: "Business Partner", iconKey: "user", requiredPermissions: [], requiredFeatures: [], navigation: "primary", presentation: { workspaceCode: "mdg", workspaceName: "MDG", workspaceHref: "/mdg", workspaceIconKey: "user", workspaceSortOrder: 10, moduleName: "Business Partner" } },
] as const);
