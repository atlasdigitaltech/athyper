import { buildRuntimeHeaders } from "@athyper/bff-relay";
import { describe, expect, it } from "vitest";

describe("Admin relay runtime context headers", () => {
  it("does not forward a stale tenant-level active work context", () => {
    const headers = buildRuntimeHeaders({
      accessToken: "token",
      realmKey: "platform-control",
      planeKey: "admin",
      activeOrg: null,
      organizations: {},
      activeWorkContext: {
        type: "tenant",
        id: "tenant-1",
        tenantId: "tenant-1",
      },
    } as never);

    expect(headers["X-Work-Context-Type"]).toBeUndefined();
    expect(headers["X-Work-Context-ID"]).toBeUndefined();
  });

  it("continues to forward canonical work contexts", () => {
    const headers = buildRuntimeHeaders({
      accessToken: "token",
      realmKey: "athyper",
      planeKey: "neon",
      activeOrg: null,
      organizations: {},
      activeWorkContext: {
        type: "legal_entity",
        id: "legal-entity-1",
        tenantId: "tenant-1",
      },
    } as never);

    expect(headers["X-Work-Context-Type"]).toBe("legal_entity");
    expect(headers["X-Work-Context-ID"]).toBe("legal-entity-1");
  });
});
