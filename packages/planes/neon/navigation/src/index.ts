import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const neonRoutes = definePlaneRoutes([
  { id: "neon.finance", moduleCode: "acc", href: "/", label: "Finance", iconKey: "calculator", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "neon.procurement", moduleCode: "buy", href: "/procurement", label: "Procurement", iconKey: "shopping-cart", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "neon.inventory", moduleCode: "inventory", href: "/inventory", label: "Inventory", iconKey: "warehouse", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "neon.entity-list", moduleCode: "fnd", href: "/app", label: "Records", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "neon.notifications", moduleCode: "acc", href: "/notifications", label: "Notifications", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "neon.data-transfers", moduleCode: "fnd", href: "/operations/data-transfers", label: "Imports and exports", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "neon.verification", moduleCode: "acc", href: "/system/verification", label: "Verification", iconKey: "shield-check", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
