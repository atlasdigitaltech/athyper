import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const meshRoutes = definePlaneRoutes([
  { id: "mesh.collaboration", moduleCode: "pcon", href: "/", label: "Collaboration", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "mesh.relationships", moduleCode: "pcon", href: "/workspace/network_relationship", label: "Relationships", iconKey: "info", requiredPermissions: ["mesh.catalog.network_relationship.read"], requiredFeatures: [], navigation: "primary" },
  { id: "mesh.notifications", moduleCode: "pcon", href: "/notifications", label: "Notifications", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "mesh.data-transfers", moduleCode: "pcon", href: "/operations/data-transfers", label: "Imports and exports", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "hidden" },
  { id: "mesh.orders", moduleCode: "omi", href: "/orders", label: "Orders", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "mesh.logistics", moduleCode: "logx", href: "/logistics", label: "Logistics", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "mesh.verification", moduleCode: "pcon", href: "/system/verification", label: "Verification", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
