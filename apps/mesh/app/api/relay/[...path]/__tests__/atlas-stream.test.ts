import { defineAtlasRelayContractSuite } from "@athyper/bff-relay/test-harness";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getMeshServerSession: vi.fn().mockResolvedValue({
    userId: "user-1",
    activeOrg: "org-1",
    accessToken: "token",
    realmKey: "mesh",
    planeKey: "mesh",
    organizations: {
      "org-1": { tenantId: "tenant-1", tenantCode: "tenant", roles: ["user"] },
    },
  }),
}));

defineAtlasRelayContractSuite({
  name: "Mesh",
  expectedPlane: "mesh",
  expectedRealm: "mesh",
  loadHandlers: async () => {
    const { GET, POST } = await import("../route");
    return { GET, POST };
  },
  registrar: { describe, it, afterEach },
});
