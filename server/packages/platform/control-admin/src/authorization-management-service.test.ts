import { describe, expect, it, vi } from "vitest";
import type { Authorizer, AuthorizationManagementCommand, AuthorizationManagementRepository, AuthorizationManagementRepositoryProvider, AuthorizationWriterSwitchGate, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { authorizationManagementPermissionFor, createAuthorizationManagementService, evaluateAuthorizationProofs } from "./authorization-management-service.js";
import { createExactPlaneAuthorizationRepositoryProvider, createSafeAuthorizationManagementRolloutSelector } from "./authorization-management-selection.js";
import { assertRouteMatchesPermission } from "./authorization-management-routes.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "mesh" } as VerifiedRequestContext;
const command: AuthorizationManagementCommand = { context, kind: "role.create", commandId: "command-1", idempotencyKey: "key-1", payload: { code: "operator" } };
const receipt = { commandId: "command-1", resourceId: "role-1", version: 1, replayed: false };
const allow: Authorizer = { async authorize() { return { allowed: true }; } };

describe("authorization management rollout", () => {
  it("keeps legacy as the only writer in legacy mode", async () => {
    const harness = setup("legacy");
    await expect(harness.service.execute(command)).resolves.toMatchObject({ mode: "legacy", writer: "legacy" });
    expect(harness.legacy).toHaveBeenCalledTimes(1); expect(harness.repository.apply).toHaveBeenCalledTimes(0); expect(harness.repository.preview).toHaveBeenCalledTimes(0);
  });

  it("uses legacy for shadow writes and records a read-only v2 preview", async () => {
    const harness = setup("shadow");
    await expect(harness.service.execute(command)).resolves.toMatchObject({ mode: "shadow", writer: "legacy", shadow: { accepted: true } });
    expect(harness.legacy).toHaveBeenCalledTimes(1); expect(harness.repository.preview).toHaveBeenCalledTimes(1); expect(harness.repository.apply).toHaveBeenCalledTimes(0);
  });

  it("keeps the legacy result authoritative when the exact-plane shadow repository is unavailable", async () => {
    const harness = setup("shadow");
    harness.provider.forExactPlane = vi.fn(() => undefined);
    await expect(harness.service.execute(command)).resolves.toMatchObject({ mode: "shadow", writer: "legacy", shadow: { accepted: false, reason: "AUTHZ_EXACT_PLANE_REPOSITORY_REQUIRED" } });
    expect(harness.legacy).toHaveBeenCalledTimes(1);
    expect(harness.repository.apply).toHaveBeenCalledTimes(0);
  });

  it("fails enforce closed until writer approval, watermark, corpus, and ticket are complete", async () => {
    const harness = setup("enforce", false);
    await expect(harness.service.execute(command)).rejects.toMatchObject({ code: "AUTHZ_WRITER_SWITCH_NOT_APPROVED" });
    expect(harness.legacy).toHaveBeenCalledTimes(0); expect(harness.repository.apply).toHaveBeenCalledTimes(0);
  });

  it("keeps mutation disabled unless the host explicitly enables it", async () => {
    const harness = setup("legacy", false, "mesh", allow, false);
    await expect(harness.service.execute(command)).rejects.toMatchObject({ code: "AUTHZ_MUTATIONS_DISABLED" });
    expect(harness.legacy).not.toHaveBeenCalled();
  });

  it("rejects malformed writer-gate evidence", async () => {
    const harness = setup("enforce", true);
    harness.gate.inspect = vi.fn(async () => ({ approved: true, targetWritable: true, sourceWatermark: "42", appliedWatermark: "42", goldenCorpusSha256: "not-a-sha", goldenEvaluatorCorpusQualified: true, ddlEpochIntegrationQualified: true, approvedBy: ["security"], approvalTicket: "SEC-42" }));
    await expect(harness.service.execute(command)).rejects.toMatchObject({ code: "AUTHZ_WRITER_SWITCH_NOT_APPROVED" });
    expect(harness.repository.apply).not.toHaveBeenCalled();
  });

  it("rejects enforce when the DDL-owned epoch integration is not qualified", async () => {
    const harness = setup("enforce", true);
    const qualified = await harness.gate.inspect("mesh");
    harness.gate.inspect = vi.fn(async () => ({ ...qualified, ddlEpochIntegrationQualified: false }));
    await expect(harness.service.execute(command)).rejects.toMatchObject({ code: "AUTHZ_WRITER_SWITCH_NOT_APPROVED" });
    expect(harness.repository.apply).not.toHaveBeenCalled();
  });

  it("writes only to the exact verified plane after approval", async () => {
    const harness = setup("enforce", true);
    await expect(harness.service.execute(command)).resolves.toMatchObject({ mode: "enforce", writer: "authorization-v2" });
    expect(harness.repository.apply).toHaveBeenCalledTimes(1); expect(harness.legacy).toHaveBeenCalledTimes(0);
    expect(harness.audit.record).toHaveBeenCalledWith(expect.objectContaining({ writerSwitchEvidence: expect.objectContaining({ sourceWatermark: "42", appliedWatermark: "42", ddlEpochIntegrationQualified: true }) }));
    const mismatched = setup("enforce", true, "neon");
    await expect(mismatched.service.execute(command)).rejects.toMatchObject({ code: "AUTHZ_EXACT_PLANE_REPOSITORY_REQUIRED" });
  });

  it("requires separate approve, revoke, break-glass, and manage permissions", async () => {
    const seen: string[] = []; const authorizer: Authorizer = { async authorize(request) { seen.push(request.permissionCode); return { allowed: true }; } };
    const harness = setup("legacy", false, "mesh", authorizer);
    for (const kind of ["role.create", "role.retire", "override.request", "override.approve"] as const) {
      const payload = kind === "override.request" ? { principalId: "principal-2", permissionId: "permission-1", scopeTargetId: "scope-1", reason: "incident", approvalTicket: "SEC-1" } : kind === "override.approve" ? { requestedBy: "principal-2" } : {};
      await harness.service.execute({ ...command, commandId: kind, idempotencyKey: kind, kind, payload, ...(kind === "override.request" ? { effectiveFrom: "2026-08-11T00:00:00Z", effectiveUntil: "2026-08-11T01:00:00Z" } : {}) });
    }
    expect(seen).toEqual(["authorization.management.manage", "authorization.management.revoke", "authorization.management.break_glass", "authorization.management.approve"]);
  });

  it("maps every mutation to an explicit management permission class", () => {
    expect(authorizationManagementPermissionFor("role.create")).toBe("authorization.management.manage");
    expect(authorizationManagementPermissionFor("group.member.revoke")).toBe("authorization.management.revoke");
    expect(authorizationManagementPermissionFor("override.request")).toBe("authorization.management.break_glass");
    expect(authorizationManagementPermissionFor("override.approve")).toBe("authorization.management.approve");
  });

  it("keeps command categories on separate route surfaces", () => {
    expect(() => assertRouteMatchesPermission("manage", "role.create")).not.toThrow();
    expect(() => assertRouteMatchesPermission("approve", "override.approve")).not.toThrow();
    expect(() => assertRouteMatchesPermission("revoke", "acl.revoke")).not.toThrow();
    expect(() => assertRouteMatchesPermission("break-glass", "override.request")).not.toThrow();
    expect(() => assertRouteMatchesPermission("manage", "override.approve")).toThrowError(expect.objectContaining({ code: "AUTHZ_MUTATION_ROUTE_MISMATCH" }));
  });

  it("protects status reads with the dedicated read permission", async () => {
    const seen: string[] = [];
    const harness = setup("legacy", false, "mesh", { async authorize(request) { seen.push(request.permissionCode); return { allowed: true }; } });
    await expect(harness.service.readStatus(context)).resolves.toMatchObject({ mode: "legacy", mutationsEnabled: true });
    expect(seen).toEqual(["authorization.management.read"]);
  });

  it("requires finite valid windows only for new delegations and override requests", async () => {
    const harness = setup("legacy");
    await expect(harness.service.execute({ ...command, kind: "delegation.create", payload: { delegatorId: "a", delegateId: "b", reason: "coverage" }, effectiveFrom: "bad", effectiveUntil: "also-bad" })).rejects.toMatchObject({ code: "AUTHZ_INVALID_EFFECTIVE_WINDOW" });
    await expect(harness.service.execute({ ...command, kind: "delegation.revoke", payload: {} })).resolves.toMatchObject({ writer: "legacy" });
  });

  it("validates OCC versions and trusted-device token hashes", async () => {
    const harness = setup("legacy");
    await expect(harness.service.execute({ ...command, expectedVersion: 0 })).rejects.toMatchObject({ code: "AUTHZ_INVALID_EXPECTED_VERSION" });
    await expect(harness.service.execute({ ...command, kind: "trustedDevice.register", payload: { deviceTokenHash: "unsafe", expiresAt: "2026-09-01T00:00:00Z" } })).rejects.toMatchObject({ code: "AUTHZ_INVALID_DEVICE_TOKEN_HASH" });
  });
});

describe("authorization proof precedence", () => {
  const allAllows = { roleAllow: true, delegationAllow: true, recordAclAllow: true, overrideAllow: true };
  const base = { tenantBoundaryPassed: true, identityActive: true, planeAdmissionActive: true, operationCompatible: true, entitlementAvailable: true, hardPolicyPassed: true, explicitDeny: false, scopeContained: true, ...allAllows };
  it("lets every hard failure and explicit deny beat all allow paths", () => {
    const corpus = [
      ["tenantBoundaryPassed", false, "tenant_boundary_failed"], ["identityActive", false, "identity_inactive"],
      ["planeAdmissionActive", false, "plane_admission_inactive"], ["operationCompatible", false, "operation_plane_incompatible"],
      ["entitlementAvailable", false, "entitlement_unavailable"], ["hardPolicyPassed", false, "hard_policy_failed"],
      ["explicitDeny", true, "explicit_deny"], ["scopeContained", false, "scope_not_contained"],
    ] as const;
    for (const [field, value, reason] of corpus) expect(evaluateAuthorizationProofs({ ...base, [field]: value })).toEqual({ allowed: false, reason });
  });
  it("selects complete allow proofs in the accepted deterministic order", () => {
    expect(evaluateAuthorizationProofs(base)).toEqual({ allowed: true, proof: "role" });
    expect(evaluateAuthorizationProofs({ ...base, roleAllow: false })).toEqual({ allowed: true, proof: "delegation" });
    expect(evaluateAuthorizationProofs({ ...base, roleAllow: false, delegationAllow: false })).toEqual({ allowed: true, proof: "record_acl" });
    expect(evaluateAuthorizationProofs({ ...base, roleAllow: false, delegationAllow: false, recordAclAllow: false })).toEqual({ allowed: true, proof: "override" });
  });
});

describe("authorization management selection", () => {
  it("never falls back to a repository from another plane", () => { const neon = { planeKey: "neon", preview: vi.fn(), apply: vi.fn() } as unknown as AuthorizationManagementRepository; const provider = createExactPlaneAuthorizationRepositoryProvider({ neon }); expect(provider.forExactPlane("mesh")).toBeUndefined(); expect(provider.forExactPlane("neon")).toBe(neon); });
  it("resolves missing, mismatched, expired, unapproved and wrong-cohort policy to legacy", async () => {
    const select = (policy: any) => createSafeAuthorizationManagementRolloutSelector({ async loadExactPlane() { return policy; } }, () => new Date("2026-08-11T00:00:00Z"));
    const input = { planeKey: "mesh" as const, tenantId: "tenant-1", principalId: "principal-1", mutationKind: "role.create" as const };
    await expect(select(undefined).select(input)).resolves.toMatchObject({ mode: "legacy" });
    await expect(select({ planeKey: "neon", mode: "enforce", revision: "1", approved: true, approvedAt: "2026-08-01" }).select(input)).resolves.toMatchObject({ mode: "legacy" });
    await expect(select({ planeKey: "mesh", mode: "enforce", revision: "2", approved: true, approvedAt: "2026-08-01", expiresAt: "2026-08-10" }).select(input)).resolves.toMatchObject({ mode: "legacy" });
    await expect(select({ planeKey: "mesh", mode: "shadow", revision: "3", approved: true, approvedAt: "2026-08-01", cohortPrincipalIds: ["principal-1"] }).select(input)).resolves.toEqual({ mode: "shadow", revision: "3" });
  });
  it("fails safely for unavailable, malformed, or not-yet-approved policy", async () => {
    const input = { planeKey: "mesh" as const, tenantId: "tenant-1", principalId: "principal-1", mutationKind: "role.create" as const };
    const at = () => new Date("2026-08-11T00:00:00Z");
    await expect(createSafeAuthorizationManagementRolloutSelector({ async loadExactPlane() { throw new Error("offline"); } }, at).select(input)).resolves.toEqual({ mode: "legacy", revision: "policy-unavailable" });
    const select = (policy: any) => createSafeAuthorizationManagementRolloutSelector({ async loadExactPlane() { return policy; } }, at);
    await expect(select({ planeKey: "mesh", mode: "enforce", revision: "1", approved: true, approvedAt: "invalid" }).select(input)).resolves.toMatchObject({ mode: "legacy" });
    await expect(select({ planeKey: "mesh", mode: "enforce", revision: "1", approved: true, approvedAt: "2026-08-12T00:00:00Z" }).select(input)).resolves.toMatchObject({ mode: "legacy" });
    await expect(select({ planeKey: "mesh", mode: "enforce", revision: "1", approved: true, approvedAt: "2026-08-01", expiresAt: "invalid" }).select(input)).resolves.toMatchObject({ mode: "legacy" });
  });
});

function setup(mode: "legacy" | "shadow" | "enforce", approved = false, repositoryPlane: "mesh" | "neon" = "mesh", authorizer: Authorizer = allow, mutationsEnabled = true) {
  const repository: AuthorizationManagementRepository = { planeKey: repositoryPlane, preview: vi.fn(async () => ({ accepted: true, normalizedHash: "a".repeat(64) })), apply: vi.fn(async () => receipt) };
  const legacy = vi.fn(async () => receipt); const audit = { record: vi.fn(async () => undefined) };
  const gate: AuthorizationWriterSwitchGate = { async inspect() { return approved ? { approved: true, targetWritable: true, sourceWatermark: "42", appliedWatermark: "42", goldenCorpusSha256: "b".repeat(64), goldenEvaluatorCorpusQualified: true, ddlEpochIntegrationQualified: true, approvedBy: ["security"], approvalTicket: "SEC-42" } : { approved: false, targetWritable: false, sourceWatermark: null, appliedWatermark: null, goldenCorpusSha256: null, goldenEvaluatorCorpusQualified: false, ddlEpochIntegrationQualified: false, approvedBy: [], approvalTicket: null }; } };
  const provider: AuthorizationManagementRepositoryProvider = { forExactPlane() { return repository; } };
  const service = createAuthorizationManagementService({ authorizer, repositories: provider, legacyWriter: { execute: legacy }, rollout: { async select() { return { mode, revision: "wave0" }; } }, writerGate: gate, audit, mutationsEnabled });
  return { service, provider, repository: repository as AuthorizationManagementRepository & { preview: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> }, legacy, audit, gate };
}
