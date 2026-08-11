import { describe, expect, it, vi } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createIamConfig, createIamService } from "../index.js";

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
