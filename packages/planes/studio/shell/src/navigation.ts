import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const studioRoutes = definePlaneRoutes([
  { id: "studio.metadata", moduleCode: "meta", href: "/", label: "Metadata", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "studio.entity-catalog", moduleCode: "meta", href: "/admin/catalogs/metadata_entity", label: "Entity catalog", iconKey: "info", requiredPermissions: ["studio.metadata.contract.view"], requiredFeatures: [], navigation: "primary" },
  { id: "studio.notifications", moduleCode: "meta", href: "/notifications", label: "Notifications", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "studio.data-transfers", moduleCode: "ops", href: "/operations/data-transfers", label: "Imports and exports", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "studio.identity", moduleCode: "iam", href: "/identity", label: "Identity", iconKey: "user", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "studio.operations", moduleCode: "ops", href: "/operations", label: "Operations", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "studio.localization", moduleCode: "ops", href: "/operations/localization", label: "Languages", iconKey: "info", requiredPermissions: ["studio.platform.catalog.manage"], requiredFeatures: [], navigation: "secondary" },
  { id: "studio.verification", moduleCode: "ops", href: "/operations/verification", label: "Verification", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
