import { definePlaneProxyContractSuite } from "@athyper/app-foundation/test-harness";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";

import { PLANE_KEY } from "@/lib/plane";

definePlaneProxyContractSuite({
  name: "Admin",
  origin: "https://admin.athyper.local",
  plane: getPlaneConfig(PLANE_KEY),
  publicPath: "/login",
  forbiddenPath: "/app",
  loadProxy: async () => (await import("@/proxy")).proxy,
});
