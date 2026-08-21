import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const neonRoutes = definePlaneRoutes([
  { id: "neon.finance", moduleCode: "acc", href: "/", label: "Finance", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "neon.procurement", moduleCode: "buy", href: "/procurement", label: "Procurement", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "neon.inventory", moduleCode: "inventory", href: "/inventory", label: "Inventory", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "neon.verification", moduleCode: "acc", href: "/system/verification", label: "Verification", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
