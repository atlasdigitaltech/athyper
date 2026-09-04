import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  IdentityReplayService,
  IdentitySagaWorker,
  ProviderIdentityCallbackConsumer,
  PeriodicIdentityReconciliationJob,
  classifyIdentitySagaFailure,
  diffIdentityProjection,
  providerKey,
  type DesiredIdentityProjection,
  type DesiredOrganizationProjection,
  type IdentitySagaRepository,
  type IdentitySagaWork,
  type ProviderCallbackRepository,
} from "../index.js";

const now = new Date("2026-08-29T00:00:00.000Z");
const organization: DesiredOrganizationProjection = {
  organizationId: "org-1",
  canonicalPartyId: "party-1",
  purpose: "tenant_employer",
  realmKey: "neon",
  externalOrganizationId: "kc-org-1",
  displayName: "Employer",
  desiredVersion: 3,
  desiredHash: "b".repeat(64),
};

function desired(
  overrides: Partial<DesiredIdentityProjection> = {},
): DesiredIdentityProjection {
  return {
    identityId: "identity-1",
    authorityTenantId: "tenant-1",
    personId: "person-1",
    identifier: "user@example.test",
    displayName: "User",
    realmKey: "neon",
    desiredVersion: 7,
    desiredHash: "a".repeat(64),
    status: "active",
    membership: {
      organizationId: "org-1",
      relationship: "employer",
      sourceRef: "employment:employment-1",
    },
    applications: [
      {
        plane: "neon",
        targetTenantId: "tenant-1",
        roles: [
          {
            roleCode: "workforce.employee",
            scopeKind: "legal_entity",
            scopeTargetId: "legal-1",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function work(overrides: Partial<IdentitySagaWork> = {}): IdentitySagaWork {
  return {
    ...desired(),
    attemptId: "attempt-1",
    attemptNo: 1,
    fencingToken: 4,
    claimTokenHash: "",
    ...overrides,
  };
}

function harness(
  item = work(),
  options: {
    current?: boolean;
    providerError?: Error;
    providerSubject?: string;
  } = {},
) {
  const repository = {
    claim: vi.fn(async (input) => ({
      ...item,
      claimTokenHash: input.claimTokenHash,
    })),
    current: vi.fn(async () => options.current ?? true),
    start: vi.fn(async () => true),
    succeed: vi.fn(async () => true),
    fail: vi.fn(async () => true),
    replay: vi.fn(async () => true),
  } as unknown as IdentitySagaRepository;
  const provider = {
    inviteOrCreate: vi.fn(async () => {
      if (options.providerError) throw options.providerError;
      return { providerSubject: "subject-1" };
    }),
    ensureMembership: vi.fn(async () => undefined),
    ensureApplication: vi.fn(async () => undefined),
    suspend: vi.fn(async () => {
      if (options.providerError) throw options.providerError;
    }),
    deprovision: vi.fn(async () => {
      if (options.providerError) throw options.providerError;
    }),
  };
  const local = {
    providerSubject: vi.fn(async () => options.providerSubject),
    converge: vi.fn(async (_input: unknown) => undefined),
    revokeAccess: vi.fn(async (_input: unknown) => undefined),
  };
  const alerts = { metric: vi.fn(), deadLetter: vi.fn(async () => undefined) };
  const worker = new IdentitySagaWorker({
    workerId: "worker",
    repository,
    provider,
    local,
    organizations: {
      get: vi.fn(async (id) =>
        id === organization.organizationId ? organization : undefined,
      ),
    },
    alerts,
    now: () => now,
    maxAttempts: 3,
  });
  return { worker, repository, provider, local, alerts };
}

describe("TrustIAM identity saga", () => {
  it("dead-letters provider configuration and authorization rejections", () => {
    expect(
      classifyIdentitySagaFailure(
        Object.assign(new Error("not found"), {
          code: "KEYCLOAK_PROVIDER_REJECTED_404",
        }),
      ),
    ).toBe("permanent");
    expect(
      classifyIdentitySagaFailure(
        Object.assign(new Error("unauthorized"), {
          code: "KEYCLOAK_ADMIN_AUTH_REJECTED",
        }),
      ),
    ).toBe("permanent");
    expect(
      classifyIdentitySagaFailure(
        Object.assign(new Error("unavailable"), {
          code: "KEYCLOAK_PROVIDER_UNAVAILABLE",
        }),
      ),
    ).toBe("transient");
  });

  it("converges provider membership and plane-local roles through separate ports", async () => {
    const h = harness();
    await expect(h.worker.runOne("claim-secret")).resolves.toBe("succeeded");
    expect(h.provider.ensureMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        relationship: "employer",
        externalOrganizationId: "kc-org-1",
      }),
    );
    expect(h.provider.ensureApplication).toHaveBeenCalledWith(
      expect.not.objectContaining({ roles: expect.anything() }),
    );
    expect(h.local.converge).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "person-1",
        applications: expect.arrayContaining([
          expect.objectContaining({
            roles: expect.arrayContaining([
              expect.objectContaining({ roleCode: "workforce.employee" }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("uses stable provider idempotency keys and rejects stale work before provider calls", async () => {
    const projection = desired();
    expect(providerKey(projection, "identity")).toBe(
      providerKey(projection, "identity"),
    );
    expect(
      providerKey({ ...projection, desiredVersion: 8 }, "identity"),
    ).not.toBe(providerKey(projection, "identity"));
    const h = harness(work(), { current: false });
    await expect(h.worker.runOne("claim-secret")).resolves.toBe("stale");
    expect(h.provider.inviteOrCreate).not.toHaveBeenCalled();
  });

  it("revokes local access before provider suspension and preserves person history by contract", async () => {
    const calls: string[] = [];
    const h = harness(work({ status: "suspended" }), {
      providerSubject: "subject-1",
    });
    h.local.revokeAccess.mockImplementation(async (input) => {
      calls.push(`local:${(input as { personId: string }).personId}`);
    });
    h.provider.suspend.mockImplementation(async () => {
      calls.push("provider");
    });
    await expect(h.worker.runOne("claim-secret")).resolves.toBe("succeeded");
    expect(calls).toEqual(["local:person-1", "provider"]);
    expect(h.local.converge).not.toHaveBeenCalled();
  });

  it("provisions and deprovisions an external worker from the engagement coordinate without mutating worker authority", async () => {
    const membership = {
      organizationId: "org-1",
      relationship: "external_worker" as const,
      sourceRef: "worker_engagement:engagement-1",
    };
    const active = harness(work({ membership }));
    await expect(active.worker.runOne("claim-secret")).resolves.toBe(
      "succeeded",
    );
    expect(active.provider.ensureMembership).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: "external_worker" }),
    );
    expect(active.local.converge).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "person-1", membership }),
    );

    const terminated = harness(
      work({
        membership,
        status: "deprovisioned",
        desiredVersion: 8,
        desiredHash: "c".repeat(64),
      }),
      { providerSubject: "subject-1" },
    );
    await expect(terminated.worker.runOne("claim-secret")).resolves.toBe(
      "succeeded",
    );
    expect(terminated.local.revokeAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "person-1",
        reason: "deprovisioned",
      }),
    );
    expect(terminated.provider.deprovision).toHaveBeenCalledOnce();
    expect(terminated.provider.inviteOrCreate).not.toHaveBeenCalled();
  });

  it("retries provider outages and dead-letters exhausted attempts", async () => {
    const outage = Object.assign(new Error("unavailable"), {
      code: "PROVIDER_UNAVAILABLE",
    });
    const retry = harness(work(), { providerError: outage });
    await expect(retry.worker.runOne("claim-secret")).resolves.toBe("retry");
    expect(retry.repository.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classification: "transient",
        nextAttemptAt: "2026-08-29T00:01:00.000Z",
        deadLetter: false,
      }),
    );
    const exhausted = harness(work({ attemptNo: 3 }), {
      providerError: outage,
    });
    await expect(exhausted.worker.runOne("claim-secret")).resolves.toBe(
      "dead_letter",
    );
    expect(exhausted.alerts.deadLetter).toHaveBeenCalledOnce();
  });

  it("enforces employer/contact membership semantics", async () => {
    const h = harness(
      work({
        membership: {
          organizationId: "org-1",
          relationship: "contact",
          sourceRef: "business_partner_contact:contact-1",
        },
      }),
    );
    await expect(h.worker.runOne("claim-secret")).resolves.toBe("dead_letter");
    expect(h.provider.inviteOrCreate).not.toHaveBeenCalled();
    expect(h.repository.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classification: "permanent",
        errorCode: "IDENTITY_ORGANIZATION_RELATIONSHIP_INVALID",
      }),
    );
  });
});

describe("provider callbacks and reconciliation", () => {
  const callback = {
    eventId: "event-1",
    identityId: "identity-1",
    desiredVersion: 7,
    desiredHash: "a".repeat(64),
    providerSequence: 4,
    providerSubject: "subject-1",
    status: "active" as const,
  };
  it("deduplicates callbacks and delegates exact-version/order fencing to persistence", async () => {
    const repository: ProviderCallbackRepository = {
      accept: vi.fn(async () => "duplicate" as const),
      observeIfCurrent: vi.fn(async () => "applied" as const),
    };
    await expect(
      new ProviderIdentityCallbackConsumer(repository).consume(callback),
    ).resolves.toBe("duplicate");
    expect(repository.observeIfCurrent).not.toHaveBeenCalled();
    vi.mocked(repository.accept).mockResolvedValue("accepted");
    vi.mocked(repository.observeIfCurrent).mockResolvedValue("out_of_order");
    await expect(
      new ProviderIdentityCallbackConsumer(repository).consume({
        ...callback,
        eventId: "event-2",
        providerSequence: 3,
      }),
    ).resolves.toBe("out_of_order");
  });

  it("reports missing, extra, and mismatched provider projections without importing authority", () => {
    const drift = diffIdentityProjection(
      [desired()],
      [
        {
          identityId: "identity-1",
          providerSubject: "subject-1",
          status: "suspended",
          organizationIds: [],
          applications: [],
          desiredVersion: 6,
          desiredHash: "c".repeat(64),
        },
        {
          identityId: "extra-identity",
          providerSubject: "subject-2",
          status: "active",
          organizationIds: [],
          applications: [],
        },
      ],
    );
    expect(drift).toEqual(
      expect.arrayContaining([
        { identityId: "identity-1", kind: "mismatched", coordinate: "state" },
        {
          identityId: "identity-1",
          kind: "missing",
          coordinate: "organization:org-1",
        },
        {
          identityId: "identity-1",
          kind: "missing",
          coordinate: "application:neon:tenant-1",
        },
        { identityId: "extra-identity", kind: "extra", coordinate: "identity" },
      ]),
    );
  });

  it("periodically records exact-version drift and quarantines extra identities", async () => {
    const wanted = desired(),
      repository = {
        listDesired: vi.fn(async () => [wanted]),
        recordExact: vi.fn(async () => "applied" as const),
        recordExtra: vi.fn(async () => undefined),
      };
    const job = new PeriodicIdentityReconciliationJob({
      repository,
      provider: {
        inventory: vi.fn(async () => [
          {
            identityId: wanted.identityId,
            providerSubject: "subject-1",
            status: "active" as const,
            organizationIds: [wanted.membership.organizationId],
            applications: ["neon:tenant-1"],
            desiredVersion: 6,
            desiredHash: wanted.desiredHash,
          },
          {
            identityId: "extra",
            providerSubject: "subject-2",
            status: "active" as const,
            organizationIds: [],
            applications: [],
          },
        ]),
      },
      now: () => now,
    });
    await expect(job.run()).resolves.toEqual({
      inSync: 0,
      drifted: 1,
      stale: 0,
      extra: 1,
    });
    expect(repository.recordExact).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: wanted.identityId,
        desiredVersion: 7,
        status: "drifted",
        drift: expect.arrayContaining([
          expect.objectContaining({ kind: "mismatched" }),
        ]),
      }),
    );
    expect(repository.recordExtra).toHaveBeenCalledWith({
      identityId: "extra",
      observedAt: now.toISOString(),
    });
  });
});

describe("privileged replay", () => {
  const context = {
    planeKey: "studio",
    realmKey: "studio",
    tenantId: "tenant-1",
    principalId: "operator-1",
    authEpoch: 1,
    assurance: "elevated",
    profileHash: "p",
    requestId: "r",
    permissions: {
      planeKey: "studio",
      tenantId: "tenant-1",
      principalId: "operator-1",
      principalFingerprint: "p",
      profileHash: "p",
      schemaHash: "s",
      resolvedAt: 1,
      allowed: [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    },
  } as VerifiedRequestContext;
  it("requires MFA, authorization, and a distinct SoD approver", async () => {
    const repository = {
      replay: vi.fn(async () => true),
    } as unknown as IdentitySagaRepository;
    const allowed = {
      authorize: vi.fn(async () => ({ allowed: true as const })),
    };
    const service = new IdentityReplayService(repository, allowed, () => now);
    await expect(
      service.request({
        context,
        deadLetterAttemptId: "attempt-1",
        approvedBy: "operator-1",
      }),
    ).rejects.toThrow("SOD_REQUIRED");
    await expect(
      service.request({
        context: { ...context, assurance: "baseline" },
        deadLetterAttemptId: "attempt-1",
        approvedBy: "approver-2",
      }),
    ).rejects.toThrow("MFA_REQUIRED");
    await expect(
      service.request({
        context,
        deadLetterAttemptId: "attempt-1",
        approvedBy: "approver-2",
      }),
    ).resolves.toBe(true);
    expect(repository.replay).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: "operator-1",
        approvedBy: "approver-2",
      }),
    );
  });
});
