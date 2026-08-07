import { defineAtlasRelayContractSuite } from "@athyper/platform-bff-relay/test-harness";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({
  getAdminServerSession: vi.fn().mockResolvedValue({
    userId: "user-1",
    activeOrg: "org-1",
    accessToken: "token",
    realmKey: "platform-control",
    planeKey: "admin",
    organizations: {
      "org-1": { tenantId: "tenant-1", tenantCode: "tenant", roles: ["admin"] },
    },
  }),
}));

defineAtlasRelayContractSuite({
  name: "Admin",
  expectedPlane: "admin",
  expectedRealm: "platform-control",
  loadHandlers: async () => {
    const { GET, POST } = await import("../route");
    return { GET, POST };
  },
  registrar: { describe, it, afterEach },
});
