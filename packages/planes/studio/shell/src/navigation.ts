import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const studioRoutes = definePlaneRoutes([
  { id: "studio.metadata", moduleCode: "meta", href: "/", label: "Metadata", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "studio.identity", moduleCode: "iam", href: "/identity", label: "Identity", iconKey: "user", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "studio.operations", moduleCode: "ops", href: "/operations", label: "Operations", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "studio.localization", moduleCode: "ops", href: "/operations/localization", label: "Languages", iconKey: "info", requiredPermissions: ["studio.platform.catalog.manage"], requiredFeatures: [], navigation: "secondary" },
  { id: "studio.verification", moduleCode: "ops", href: "/operations/verification", label: "Verification", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
