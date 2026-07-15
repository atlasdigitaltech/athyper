import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAttachmentAuthFlags, resolveAttachmentAuthContext, verifyBearer } from "../route-helpers.js";

describe("resolveAttachmentAuthContext", () => {
  function dbWith(
    rows: Array<{ id: string; code: string; realm_key: string }>,
    bindings: Array<{ subject_id: string; tenant_id: string; realm_key: string; principal_id: string }>,
    principals: Array<{ principal_id: string; is_service_account: boolean; status: string; keycloak_service_client_id: string | null }> = [],
  ) {
    const capturedWheres: Array<Record<string, unknown>> = [];
    const makeQuery = () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where(column: string, _op: string, value: unknown) {
          filters[column] = value;
          return chain;
        },
        executeTakeFirst: vi.fn(async () => {
          capturedWheres.push({ ...filters });
          if (filters["t.code"] !== undefined && filters["t.realm_key"] !== undefined) {
            return rows.find((r) => r.code === filters["t.code"] && r.realm_key === filters["t.realm_key"]);
          }
          if (filters["t.id"] !== undefined && filters["t.realm_key"] !== undefined) {
            return rows.find((r) => r.id === filters["t.id"] && r.realm_key === filters["t.realm_key"]);
          }
          if (filters["pab.subject_id"] !== undefined && filters["pab.tenant_id"] !== undefined && filters["pab.realm_key"] !== undefined) {
            return bindings.find(
              (b) =>
                b.subject_id === filters["pab.subject_id"] &&
                b.tenant_id === filters["pab.tenant_id"] &&
                b.realm_key === filters["pab.realm_key"],
            );
          }
          if (filters["p.id"] !== undefined && filters["p.tenant_id"] !== undefined) {
            const binding = bindings.find((b) => b.principal_id === filters["p.id"] && b.tenant_id === filters["p.tenant_id"]);
            return principals.find((principal) => principal.principal_id === filters["p.id"])
              ?? (binding ? { is_service_account: false, status: "active", keycloak_service_client_id: null } : undefined);
          }
          return undefined;
        }),
      };
      return chain;
    };
    return {
      db: { selectFrom: vi.fn(() => makeQuery()) },
      capturedWheres,
    };
  }

  const tenants = [
    { id: "tenant-a-id", code: "tenant-a", realm_key: "athyper" },
    { id: "tenant-b-id", code: "tenant-b", realm_key: "athyper" },
  ];
  const bindings = [
    { subject_id: "subject-1", tenant_id: "tenant-a-id", realm_key: "athyper", principal_id: "principal-a" },
  ];

  it("denies a tenant header that conflicts with the verified token", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm_key: "athyper",
      tenant_code: "tenant-a",
      allowed_tenants: ["tenant-a"],
    }, "tenant-b--companyX", "platform-control");
    expect(result).toMatchObject({ ok: false, error: "AUTH_CONTEXT_MISMATCH", status: 403 });
  });

  it("resolves a matching verified tenant and principal binding", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm_key: "athyper",
      tenant_code: "tenant-a",
      allowed_tenants: ["tenant-a"],
    }, "tenant-a--companyX", "athyper");
    expect(result).toMatchObject({
      ok: true,
      context: { tenantCode: "tenant-a", tenantId: "tenant-a-id", realmKey: "athyper", principalId: "principal-a" },
    });
  });

  it("rejects cross-realm mismatch from token context", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm: "platform-control",
      tenant_code: "tenant-a",
    }, "tenant-a--companyX", "platform-control");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_CONTEXT_DENIED",
      status: 403,
    });
  });

  it("rejects cross-tenant mismatch from allowed_tenants", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm_key: "athyper",
      tenant_code: "tenant-a",
      allowed_tenants: ["tenant-b"],
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_CONTEXT_MISMATCH",
      status: 403,
    });
  });

  it("returns AUTH_CONTEXT_REQUIRED when token is missing realm binding", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_CONTEXT_REQUIRED",
      status: 403,
    });
  });

  it("returns AUTH_CONTEXT_REQUIRED when token is missing subject claim", async () => {
    const { db } = dbWith(tenants, bindings);
    const result = await resolveAttachmentAuthContext(db, {
      realm_key: "athyper",
      tenant_code: "tenant-a",
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({
      ok: false,
      error: "AUTH_CONTEXT_REQUIRED",
      status: 403,
    });
  });

  it("fails closed when the verified identity has no principal binding", async () => {
    const { db } = dbWith(tenants, []);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "unknown-subject",
      realm_key: "athyper",
      tenant_code: "tenant-a",
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({ ok: false, error: "PRINCIPAL_NOT_FOUND", status: 403 });
  });

  it("accepts a service request only when its verified client id matches the bound service principal", async () => {
    const { db } = dbWith(tenants, bindings, [{
      principal_id: "principal-a",
      is_service_account: true,
      status: "active",
      keycloak_service_client_id: "attachment-scanner",
    }]);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm_key: "athyper",
      tenant_code: "tenant-a",
      azp: "attachment-scanner",
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({ ok: true, context: { authType: "internal_service", serviceClientId: "attachment-scanner" } });
  });

  it("does not let an external bearer token impersonate a service principal", async () => {
    const { db } = dbWith(tenants, bindings, [{
      principal_id: "principal-a",
      is_service_account: true,
      status: "active",
      keycloak_service_client_id: "attachment-scanner",
    }]);
    const result = await resolveAttachmentAuthContext(db, {
      sub: "subject-1",
      realm_key: "athyper",
      tenant_code: "tenant-a",
      azp: "public-web-client",
    }, "tenant-a--company", "athyper");
    expect(result).toMatchObject({ ok: false, error: "SERVICE_PRINCIPAL_DENIED", status: 403 });
  });
}); 

describe("verifyBearer", () => {
  const auth = { verifyToken: vi.fn() };

  beforeEach(() => {
    auth.verifyToken.mockReset();
  });

  it("returns 401 when token header is missing", async () => {
    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn().mockReturnThis();
    const response = { status: statusMock, json: jsonMock } as {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };

    const claims = await verifyBearer("", auth as never, response as never);

    expect(claims).toBeNull();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
  });

  it("returns 401 when token verification fails", async () => {
    auth.verifyToken.mockRejectedValue(new Error("invalid"));
    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn().mockReturnThis();
    const response = { status: statusMock, json: jsonMock } as {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };

    const claims = await verifyBearer("Bearer bad-token", auth as never, response as never);

    expect(claims).toBeNull();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "INVALID_TOKEN", message: "Token verification failed" });
  });

  it("does not alter configured auth feature flags", () => {
    const { attachmentAuthStrict, multipartCleanupStrict } = getAttachmentAuthFlags();
    expect(typeof attachmentAuthStrict).toBe("boolean");
    expect(typeof multipartCleanupStrict).toBe("boolean");
  });
});
