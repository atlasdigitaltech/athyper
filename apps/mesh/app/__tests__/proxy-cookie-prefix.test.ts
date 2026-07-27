import { definePlaneProxyContractSuite } from "@athyper/app-foundation/test-harness";
import { getPlaneConfig } from "@athyper/session-plane";

import { PLANE_KEY } from "@/lib/plane";

definePlaneProxyContractSuite({
  name: "Mesh",
  origin: "https://mesh.athyper.local",
  plane: getPlaneConfig(PLANE_KEY),
  publicPath: "/login",
  forbiddenPath: "/admin",
  loadProxy: async () => (await import("@/proxy")).proxy,
});
