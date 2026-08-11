import { describe, expect, it, vi } from "vitest";
import {
  createProvisioningService, evaluateRequiredActions, projectionHash, shouldApplyProjection,
  signGatewayEnvelope, tokenHash, verifyGatewayEnvelope, type OrganizationProjection,
  type ProvisioningRequest,
} from "../index.js";

describe("IAM foundation contracts", () => {
  it("allows only explicit required-action routes and fails closed for unknown actions", () => {
    const input = { actions: ["NEW_PROVIDER_ACTION"], path: "/api/records", matrix: {} } as const;
    expect(evaluateRequiredActions({ ...input, method: "POST" })).toEqual({ allowed: false, action: "NEW_PROVIDER_ACTION", reason: "unknown-action" });
    expect(evaluateRequiredActions({ ...input, method: "GET" })).toEqual({ allowed: false, action: "NEW_PROVIDER_ACTION", reason: "unknown-action" });
    expect(evaluateRequiredActions({ ...input, path: "/api/auth/logout", method: "POST", matrix: { "*": ["/api/auth/logout"] } })).toEqual({ allowed: true });
    expect(evaluateRequiredActions({ ...input, method: "OPTIONS" })).toEqual({ allowed: true });
  });

  it("creates provisioning requests idempotently and enforces transitions", async () => {
    let stored: ProvisioningRequest | undefined;
    const create = vi.fn(async (request: ProvisioningRequest) => { stored = request; });
    const transition = vi.fn(async (_id: string, version: number, update: Pick<ProvisioningRequest, "state">) => ({ ...stored!, ...update, version: version + 1 }));
    const service = createProvisioningService({ findByIdempotencyKey: async () => stored, createWithAuditAndOutbox: create, transitionWithAuditAndOutbox: transition }, () => "request-1");
    const first = await service.request({ tenantId: "tenant-1", realmKey: "main", identifier: " User@Example.COM ", planes: ["neon"] });
    const second = await service.request({ tenantId: "tenant-1", realmKey: "main", identifier: "user@example.com", planes: ["neon"] });
    expect(second.id).toBe(first.id);
    expect(first.normalizedIdentifier).toBe("user@example.com");
    expect(create).toHaveBeenCalledTimes(1);
    await expect(service.request({ tenantId: "tenant-1", realmKey: "MAIN", identifier: "user@example.com", planes: ["neon", "mesh"] })).rejects.toThrow("different request parameters");
    await expect(service.transition(first, "active")).rejects.toThrow("requested -> active");
  });

  it("fails closed on projection hash and version conflicts", () => {
    const base = { organizationId: "org-1", tenantId: "tenant-1", planeKey: "neon", providerOrganizationId: "kc-org-1", version: 1, active: true } as const;
    const current: OrganizationProjection = { ...base, hash: projectionHash(base) };
    const nextBase = { ...base, version: 2 };
    expect(shouldApplyProjection(current, { ...nextBase, hash: projectionHash(nextBase) })).toBe(true);
    expect(() => shouldApplyProjection(current, { ...current, hash: "0".repeat(64) })).toThrow("hash mismatch");
    const movedTenant = { ...nextBase, tenantId: "tenant-2" };
    expect(() => shouldApplyProjection(current, { ...movedTenant, hash: projectionHash(movedTenant) })).toThrow("identity mismatch");
    const changedProvider = { ...nextBase, providerOrganizationId: "kc-org-2" };
    expect(() => shouldApplyProjection(current, { ...changedProvider, hash: projectionHash(changedProvider) })).toThrow("identity mismatch");
  });

  it("binds a signed gateway assertion to verified claims and rejects replay", async () => {
    const secret = Buffer.alloc(32, 7);
    const signed = signGatewayEnvelope({ version: 1, planeKey: "neon", issuer: "https://iam/realms/main", audience: "neon-api", subject: "subject-1", tokenHash: tokenHash("jwt"), verifiedAt: 100, expiresAt: 110, nonce: "nonce-1" }, secret);
    const consumed = new Set<string>();
    const consumeNonce = async (nonce: string) => consumed.has(nonce) ? false : Boolean(consumed.add(nonce));
    const verifiedClaims = { now: 105, planeKey: "neon", token: "jwt", issuer: "https://iam/realms/main", audience: ["neon-api"], subject: "subject-1", consumeNonce } as const;
    await expect(verifyGatewayEnvelope(signed, secret, verifiedClaims)).resolves.toMatchObject({ subject: "subject-1" });
    await expect(verifyGatewayEnvelope(signed, secret, verifiedClaims)).rejects.toThrow("replay detected");
    await expect(verifyGatewayEnvelope(signed, secret, { ...verifiedClaims, planeKey: "mesh" })).rejects.toThrow("plane mismatch");
    await expect(verifyGatewayEnvelope(signed, secret, { ...verifiedClaims, token: "other" })).rejects.toThrow("token mismatch");
    await expect(verifyGatewayEnvelope(signed, secret, { ...verifiedClaims, issuer: "https://evil.example/realms/main" })).rejects.toThrow("issuer mismatch");
    await expect(verifyGatewayEnvelope(signed, secret, { ...verifiedClaims, audience: "mesh-api" })).rejects.toThrow("audience mismatch");
    await expect(verifyGatewayEnvelope(signed, secret, { ...verifiedClaims, subject: "subject-2" })).rejects.toThrow("subject mismatch");
    expect(() => signGatewayEnvelope({ version: 1, planeKey: "neon", issuer: "https://iam/realms/main", audience: "neon-api", subject: "subject-1", tokenHash: tokenHash("jwt"), verifiedAt: 100, expiresAt: 131, nonce: "nonce-2" }, secret)).toThrow("invalid timing");
  });
});
