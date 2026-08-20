import { describe, expect, it, vi } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createIamConfig, createIamService, ExactPlaneAuthorizationError, snapshotFromEvidence } from "../index.js";

const token: VerifiedToken = {
  issuer: "https://iam.example/realms/athyper",
  subject: "subject-1",
  audience: ["athyper-api"],
  claims: {
    iss: "https://iam.example/realms/athyper", sub: "subject-1", aud: "athyper-api",
    tenant_id: "tenant-1", principal_id: "principal-1", auth_epoch: 4,
    azp: "neon-web", permissions: ["iam.profile.read"],
    resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
  },
};

describe("IAM service", () => {
  it("owns environment-sensitive authentication flag defaults", () => {
    expect(createIamConfig({ environment: "local" }).claimContextMode).toBe("shadow");
    expect(createIamConfig({ environment: "production" }).claimContextMode).toBe("enforce");
    expect(() => createIamConfig({
      environment: "production",
      requiredActionsMatrix: { invalid: ["not-a-route"] },
    })).toThrow("required-action matrix");
  });

  it("builds a verified context and emits the audit port", async () => {
    const record = vi.fn(async (input: AuditRecordInput): Promise<AuditEvent> => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: input.severity ?? "info" }));
    const service = createIamService({
      tokenVerifier: { verify: async () => token }, audit: { record },
      config: createIamConfig({ environment: "production", defaultRealmKey: "athyper" }), now: () => 123,
    });
    const result = await service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1", route: { path: "/api/iam/me", method: "GET" } });
    expect(result).toMatchObject({ ok: true, context: { tenantId: "tenant-1", principalId: "principal-1", requestId: "request-1", permissions: { allowed: ["iam.profile.read"], resolvedAt: 123 } } });
    if (!result.ok) throw new Error("authentication failed");
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.permissions)).toBe(true);
    expect(Object.isFrozen(result.context.permissions.allowed)).toBe(true);
    expect(Object.isFrozen(result.context.permissions.entries)).toBe(true);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventCode: "iam.authentication.succeeded", tenantId: "tenant-1" }));
  });

  it("replaces untrusted token permissions with exact-plane database authority", async () => {
    const service = createIamService({
      tokenVerifier: { verify: async () => token },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "info" }) },
      config: createIamConfig({ environment: "production" }),
      permissionResolver: {
        resolve: async (identity) => snapshotFromEvidence(identity, [{
          permissionCode: "finance.invoice.read", effect: "allow", proof: "role",
          scopeTargetId: "scope-1", scopeKind: "tenant", targetId: identity.tenantId,
          propagationMode: "exact",
        }], 456),
      },
    });

    const result = await service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1" });
    expect(result).toMatchObject({ ok: true, context: { permissions: { allowed: ["finance.invoice.read"], resolvedAt: 456 } } });
    if (!result.ok) throw new Error("authentication failed");
    expect(result.context.permissions.allowed).not.toContain("iam.profile.read");
  });

  it("resolves a selected tenant and principal from the verified provider subject", async () => {
    const resolveIdentityContext = vi.fn(async () => ({ tenantId: "tenant-2", principalId: "principal-2", authEpoch: 9 }));
    const service = createIamService({
      tokenVerifier: { verify: async () => token },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "info" }) },
      config: createIamConfig({ environment: "production" }), resolveIdentityContext,
    });
    const result = await service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1", requestedContext: { tenantId: "tenant-2" } });
    expect(result).toMatchObject({ ok: true, context: { tenantId: "tenant-2", principalId: "principal-2", authEpoch: 9 } });
    expect(resolveIdentityContext).toHaveBeenCalledWith(expect.objectContaining({ subject: "subject-1", requestedTenantId: "tenant-2", tokenTenantId: "tenant-1" }));
  });

  it("rejects a stale BFF database authority epoch", async () => {
    const service = createIamService({
      tokenVerifier: { verify: async () => token },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "warning" }) },
      config: createIamConfig({ environment: "production" }),
      resolveIdentityContext: async () => ({ tenantId: "tenant-1", principalId: "principal-1", authEpoch: 9 }),
    });
    await expect(service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1", requestedContext: { tenantId: "tenant-1", authEpoch: 8 } }))
      .resolves.toMatchObject({ ok: false, status: 403, code: "AUTH_CONTEXT_MISMATCH" });
  });

  it("denies a selected tenant without an active subject binding", async () => {
    const service = createIamService({
      tokenVerifier: { verify: async () => token },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "warning" }) },
      config: createIamConfig({ environment: "production" }), resolveIdentityContext: async () => undefined,
    });
    await expect(service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1", requestedContext: { tenantId: "tenant-attacker" } }))
      .resolves.toMatchObject({ ok: false, status: 403, code: "AUTH_CONTEXT_MISMATCH" });
  });

  it("fails closed when exact-plane admission is inactive", async () => {
    const service = createIamService({
      tokenVerifier: { verify: async () => token },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "warning" }) },
      config: createIamConfig({ environment: "production" }),
      permissionResolver: { resolve: async () => { throw new ExactPlaneAuthorizationError("AUTHZ_PLANE_ADMISSION_INACTIVE"); } },
    });

    await expect(service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1" }))
      .resolves.toMatchObject({ ok: false, status: 403, code: "AUTH_ACCESS_DENIED" });
  });

  it("rejects legacy Athyper claims after canonical plane cutover", async () => {
    const legacyToken: VerifiedToken = {
      ...token,
      claims: {
        ...token.claims,
        plane: "athyper",
        azp: "athyper-web",
        resource_access: { "athyper-web": { roles: ["AUTHORIZED"] } },
      },
    };
    const service = createIamService({
      tokenVerifier: { verify: async () => legacyToken },
      audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "info" }) },
      config: createIamConfig({ environment: "production" }),
    });

    await expect(service.authenticate({ token: "jwt", planeKey: "studio", requestId: "request-1" }))
      .resolves.toMatchObject({ ok: false, status: 403, code: "AUTH_CONTEXT_MISMATCH" });
  });

  it("denies a plane mismatch without exposing token details", async () => {
    const record = vi.fn(async (input: AuditRecordInput): Promise<AuditEvent> => ({ ...input, id: "audit-1", occurredAt: "2026-08-09T00:00:00.000Z", severity: "warning" }));
    const service = createIamService({ tokenVerifier: { verify: async () => token }, audit: { record }, config: createIamConfig({ environment: "production" }) });
    await expect(service.authenticate({ token: "secret-jwt", planeKey: "mesh", requestId: "request-1" })).resolves.toMatchObject({ ok: false, status: 403, code: "AUTH_CONTEXT_MISMATCH" });
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret-jwt");
  });

  it("fails closed when a successful authentication cannot be audited", async () => {
    const service = createIamService({ tokenVerifier: { verify: async () => token }, audit: { record: async () => { throw new Error("offline"); } }, config: createIamConfig({ environment: "production" }) });
    await expect(service.authenticate({ token: "jwt", planeKey: "neon", requestId: "request-1" })).resolves.toMatchObject({ ok: false, status: 503, code: "AUTH_AUDIT_UNAVAILABLE" });
  });
});
