import { definePlaneRoutes } from "@athyper/platform-shell/core";
export const meshRoutes = definePlaneRoutes([
  { id: "mesh.collaboration", moduleCode: "pcon", href: "/", label: "Collaboration", iconKey: "home", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "mesh.orders", moduleCode: "omi", href: "/orders", label: "Orders", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "primary" },
  { id: "mesh.logistics", moduleCode: "logx", href: "/logistics", label: "Logistics", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
  { id: "mesh.verification", moduleCode: "pcon", href: "/system/verification", label: "Verification", iconKey: "info", requiredPermissions: [], requiredFeatures: [], navigation: "secondary" },
] as const);
