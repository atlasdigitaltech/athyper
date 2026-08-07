import { describe, expect, it, vi } from "vitest";
import type {
  EffectivePermissionContext,
  VerifiedRequestContext,
} from "../../permission-context/index.js";
import type { StepUpBinding } from "../../mfa/step-up.service.js";
import {
  AtlasSupportSessionService,
} from "../atlas-support-session.service.js";
import {
  ATLAS_SUPPORT_SESSION_PERMISSION,
  type AtlasSupportAuditEntry,
  type AtlasSupportSessionRecord,
  type AtlasSupportSessionRepository,
} from "../atlas-support-session.types.js";

const ORIGIN_TENANT = "10000000-0000-4000-8000-000000000001";
const ORIGIN_PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const TARGET_TENANT = "30000000-0000-4000-8000-000000000001";
const SHADOW_PRINCIPAL = "40000000-0000-4000-8000-000000000001";
const RELATIONSHIP_ID = "50000000-0000-4000-8000-000000000001";
const SUPPORT_SESSION_ID = "60000000-0000-4000-8000-000000000001";
const THREAD_ID = "70000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-24T12:00:00.000Z");

class MemoryRepository implements AtlasSupportSessionRepository {
  record: AtlasSupportSessionRecord | null = null;
  readonly audits: AtlasSupportAuditEntry[] = [];

  async resolveShadowPrincipal() {
    return {
      targetTenantId: TARGET_TENANT,
      shadowPrincipalId: SHADOW_PRINCIPAL,
      shadowAuthEpoch: 11,
      membershipId: RELATIONSHIP_ID,
    };
  }

  async create(record: AtlasSupportSessionRecord) {
    this.record = record;
  }

  async find(sessionId: string) {
    return this.record?.sessionId === sessionId ? this.record : null;
  }

  async end(input: {
    sessionId: string;
    endedAt: Date;
    status: "revoked" | "expired" | "ended";
  }) {
    if (!this.record || this.record.sessionId !== input.sessionId) return false;
    this.record = {
      ...this.record,
      status: input.status,
      endedAt: input.endedAt,
    };
    return true;
  }

  async appendAudit(entry: AtlasSupportAuditEntry) {
    this.audits.push(entry);
  }
}

function permissions(
  allowed: readonly string[] = [ATLAS_SUPPORT_SESSION_PERMISSION],
): EffectivePermissionContext {
  return {
    planeKey: "admin",
    tenantId: ORIGIN_TENANT,
    principalId: ORIGIN_PRINCIPAL,
    principalFingerprint: "origin-profile",
    allowed: new Set(allowed),
    denied: new Set(),
    planLocked: new Set(),
    planeExcluded: new Set(),
    entries: new Map(),
    authorizationScopes: new Map(),
    profileHash: "origin-profile",
    schemaHash: "schema-v1",
    resolvedAt: NOW.getTime(),
  };
}

function context(
  overrides: Partial<VerifiedRequestContext> = {},
): VerifiedRequestContext {
  return {
    planeKey: "admin",
    realmKey: "platform-control",
    tenantId: ORIGIN_TENANT,
    principalId: ORIGIN_PRINCIPAL,
    permissions: permissions(),
    authEpoch: 9,
    profileHash: "origin-profile",
    requestId: "request-1",
    ...overrides,
  };
}

function elevation(
  overrides: Partial<StepUpBinding> = {},
): StepUpBinding {
  return {
    subject: "platform-staff-subject",
    tenantId: TARGET_TENANT,
    sessionId: "keycloak-session-123",
    actionClass: "atlas_support",
    assurance: {
      assuranceLevel: "aal2",
      keycloakAssuranceLevel: "aal2",
      authenticationTime: Math.floor(NOW.getTime() / 1_000),
      keycloakMfaSatisfied: true,
      keycloakPhishingResistant: true,
    },
    ...overrides,
  };
}

function target(options: {
  now?: Date;
  elevated?: boolean;
  authCurrent?: boolean;
} = {}) {
  const repository = new MemoryRepository();
  const stepUp = {
    isElevated: vi.fn(async () => options.elevated ?? true),
  };
  const authEpochs = {
    isCurrent: vi.fn(async () => options.authCurrent ?? true),
  };
  const threads = {
    createTenantThread: vi.fn(async () => THREAD_ID),
  };
  const service = new AtlasSupportSessionService({
    repository,
    stepUp,
    authEpochs,
    threads,
    signingKey: "support-session-test-signing-key-with-more-than-32-bytes",
    signingKeyId: "test-key-1",
    now: () => options.now ?? NOW,
    randomId: () => SUPPORT_SESSION_ID,
    maximumTtlSeconds: 1_800,
  });
  return { service, repository, stepUp, authEpochs, threads };
}

async function start(
  service: AtlasSupportSessionService,
) {
  return service.start({
    context: context(),
    originSubject: "platform-staff-subject",
    targetTenantId: TARGET_TENANT,
    ticketId: "INC-2026-0042",
    reason: "Investigate a customer-reported permission denial.",
    requestedScopes: ["permission_denial.explain"],
    ttlSeconds: 600,
    stepUpBinding: elevation(),
  });
}

describe("Atlas Admin support-session service", () => {
  it("issues a tenant/session/scope-bound token and audits both actors", async () => {
    const testTarget = target();
    const started = await start(testTarget.service);
    const verified = await testTarget.service.verify({
      token: started.token,
      originSubject: "platform-staff-subject",
      originSessionId: "keycloak-session-123",
      authenticatedOriginPrincipalId: ORIGIN_PRINCIPAL,
      requestedScope: "permission_denial.explain",
    });

    expect(verified).toMatchObject({
      effectiveTenantId: TARGET_TENANT,
      effectivePrincipalId: SHADOW_PRINCIPAL,
      plane: "admin",
    });
    expect(testTarget.threads.createTenantThread).toHaveBeenCalledWith({
      sessionId: SUPPORT_SESSION_ID,
      targetTenantId: TARGET_TENANT,
      shadowPrincipalId: SHADOW_PRINCIPAL,
      plane: "admin",
    });
    expect(testTarget.repository.audits[0]).toMatchObject({
      event: "access_started",
      originPrincipalId: ORIGIN_PRINCIPAL,
      targetTenantId: TARGET_TENANT,
      shadowPrincipalId: SHADOW_PRINCIPAL,
    });
  });

  it("requires exact permission and target-bound Atlas MFA", async () => {
    const missingPermission = target();
    await expect(missingPermission.service.start({
      context: context({ permissions: permissions([]) }),
      originSubject: "platform-staff-subject",
      targetTenantId: TARGET_TENANT,
      ticketId: "INC-2026-0042",
      reason: "Investigate a customer-reported permission denial.",
      requestedScopes: ["permission_denial.explain"],
      ttlSeconds: 600,
      stepUpBinding: elevation(),
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    for (const binding of [
      elevation({ tenantId: ORIGIN_TENANT }),
      elevation({ sessionId: "another-keycloak-session" }),
      elevation({ actionClass: "iam_admin" }),
    ]) {
      const denied = target({
        elevated: binding.sessionId !== "another-keycloak-session",
      });
      await expect(denied.service.start({
        context: context(),
        originSubject: "platform-staff-subject",
        targetTenantId: TARGET_TENANT,
        ticketId: "INC-2026-0042",
        reason: "Investigate a customer-reported permission denial.",
        requestedScopes: ["permission_denial.explain"],
        ttlSeconds: 600,
        stepUpBinding: binding,
      })).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    }
  });

  it("rejects token replay across actor, login session, scope, and signature", async () => {
    const testTarget = target();
    const started = await start(testTarget.service);
    const base = {
      token: started.token,
      originSubject: "platform-staff-subject",
      originSessionId: "keycloak-session-123",
      authenticatedOriginPrincipalId: ORIGIN_PRINCIPAL,
      requestedScope: "permission_denial.explain" as const,
    };

    for (const request of [
      { ...base, originSubject: "other-subject" },
      { ...base, originSessionId: "another-keycloak-session" },
      {
        ...base,
        authenticatedOriginPrincipalId:
          "20000000-0000-4000-8000-000000000099",
      },
      {
        ...base,
        requestedScope: "tenant_health.summarize" as const,
      },
      { ...base, token: `${started.token.slice(0, -1)}x` },
    ]) {
      await expect(testTarget.service.verify(request)).rejects.toBeInstanceOf(
        Error,
      );
    }
  });

  it("fails closed for expiry, revocation, and changed auth epochs", async () => {
    const expiring = target();
    const started = await start(expiring.service);
    const verifyRequest = {
      token: started.token,
      originSubject: "platform-staff-subject",
      originSessionId: "keycloak-session-123",
      authenticatedOriginPrincipalId: ORIGIN_PRINCIPAL,
    };

    const expiredService = new AtlasSupportSessionService({
      repository: expiring.repository,
      stepUp: expiring.stepUp,
      authEpochs: expiring.authEpochs,
      threads: expiring.threads,
      signingKey: "support-session-test-signing-key-with-more-than-32-bytes",
      signingKeyId: "test-key-1",
      now: () => new Date("2026-07-24T12:11:00.000Z"),
    });
    await expect(expiredService.verify(verifyRequest)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });

    const revoked = target();
    const revokedStart = await start(revoked.service);
    revoked.repository.record = {
      ...revokedStart.session,
      status: "revoked",
      endedAt: NOW,
    };
    await expect(revoked.service.verify({
      ...verifyRequest,
      token: revokedStart.token,
    })).rejects.toMatchObject({ code: "SESSION_REVOKED" });

    const stale = target({ authCurrent: false });
    const staleStart = await start(stale.service);
    await expect(stale.service.verify({
      ...verifyRequest,
      token: staleStart.token,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_STALE" });
  });

  it("audits only hashes for data reads and exports", async () => {
    const testTarget = target();
    const started = await start(testTarget.service);
    const verified = await testTarget.service.verify({
      token: started.token,
      originSubject: "platform-staff-subject",
      originSessionId: "keycloak-session-123",
      authenticatedOriginPrincipalId: ORIGIN_PRINCIPAL,
      requestedScope: "permission_denial.explain",
    });
    await testTarget.service.recordAccess(verified, {
      event: "data_read",
      scope: "permission_denial.explain",
      resourceHash: "a".repeat(64),
    });

    expect(testTarget.repository.audits.at(-1)).toEqual({
      sessionId: SUPPORT_SESSION_ID,
      event: "data_read",
      occurredAt: NOW,
      originPrincipalId: ORIGIN_PRINCIPAL,
      targetTenantId: TARGET_TENANT,
      shadowPrincipalId: SHADOW_PRINCIPAL,
      scope: "permission_denial.explain",
      resourceHash: "a".repeat(64),
    });
    expect(JSON.stringify(testTarget.repository.audits)).not.toContain(
      "customer-reported permission denial",
    );
  });
});
