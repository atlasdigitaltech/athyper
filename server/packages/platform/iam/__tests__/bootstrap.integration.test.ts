import { describe, expect, it, vi } from "vitest";

import { createBootstrapService } from "../bootstrap/bootstrap.service.js";
import type {
  AdmittedIdentity,
  IdentityAdmissionRepository,
} from "../identity/identity-admission.repository.js";
import type { PlaneDatabaseRegistry } from "../runtime/plane-database-registry.js";
import type { BootstrapQuery } from "../session/session.types.js";
import type { CacheClient } from "../session/session.service.js";
import type {
  ActiveOrganizationProjection,
  OrganizationProjectionRepository,
} from "../organization-projection/organization-projection.repository.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXTERNAL_ORGANIZATION_ID = "kc-org-athyper";
const PROJECTION_ID = "99999999-9999-4999-8999-999999999999";
const SCOPE_TARGET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function query(overrides: Partial<BootstrapQuery> = {}): BootstrapQuery {
  return {
    sub: SUBJECT_ID,
    realmKey: "athyper",
    planeKey: "neon",
    name: "Demo User",
    email: "demo@example.test",
    externalOrganizationIds: [EXTERNAL_ORGANIZATION_ID],
    workbenches: ["user"],
    ...overrides,
  };
}

function admission(): AdmittedIdentity {
  return {
    planeKey: "neon",
    databasePlane: "neon",
    tenantId: TENANT_ID,
    tenantCode: "athyper",
    tenantName: "Athyper",
    principalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    identityBindingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    principalType: "human",
    authEpoch: 1,
    membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    membershipKind: "member",
  };
}

function cache(cached: string | null = null): CacheClient {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

function identities(rows: AdmittedIdentity[]): IdentityAdmissionRepository {
  return {
    resolve: vi.fn(),
    resolveCandidates: vi.fn().mockResolvedValue(rows),
  };
}

function projection(): ActiveOrganizationProjection {
  return {
    projectionId: PROJECTION_ID,
    tenantId: TENANT_ID,
    realmKey: "athyper",
    externalOrganizationId: EXTERNAL_ORGANIZATION_ID,
    organizationAlias: "athyper",
    organizationName: "Athyper",
    sourceVersion: 1,
    sourceHash: "a".repeat(64),
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    ceilings: [{
      scopeTargetId: SCOPE_TARGET_ID,
      ceilingMode: "exact",
      networkRoleCeiling: null,
    }],
  };
}

function projections(rows: ActiveOrganizationProjection[] = [projection()]): OrganizationProjectionRepository {
  return { resolveActive: vi.fn().mockResolvedValue(rows) };
}

function registry(): PlaneDatabaseRegistry {
  return {
    forPlane: vi.fn().mockReturnValue({ db: {}, databasePlane: "neon" }),
  } as unknown as PlaneDatabaseRegistry;
}

describe("BootstrapService.resolve", () => {
  it("returns a cached authorization bootstrap without resolving identity", async () => {
    const expected = { principal: { id: SUBJECT_ID, name: "Demo User", email: "demo@example.test" }, tenants: [] };
    const identityRepo = identities([]);
    const service = createBootstrapService({
      planeDatabases: registry(),
      identities: identityRepo,
      projections: projections(),
      cache: cache(JSON.stringify(expected)),
    });

    await expect(service.resolve(query())).resolves.toEqual(expected);
    expect(identityRepo.resolveCandidates).not.toHaveBeenCalled();
  });

  it("admits exact UUID organization tenants and maps evaluated scope targets", async () => {
    const cacheClient = cache();
    const identityRepo = identities([admission()]);
    const loadScopes = vi.fn().mockResolvedValue([{
      scope_target_id: SCOPE_TARGET_ID,
      target_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      scope_kind: "legal_entity",
      scope_key: "LE-ATHQ",
      display_name: "Athyper Holdings",
    }]);
    const service = createBootstrapService({
      planeDatabases: registry(),
      identities: identityRepo,
      projections: projections(),
      cache: cacheClient,
      loadScopes,
    });

    const result = await service.resolve(query());

    expect(identityRepo.resolveCandidates).toHaveBeenCalledWith({
      planeKey: "neon",
      tenantIds: [TENANT_ID],
      providerCode: "keycloak",
      realmKey: "athyper",
      subjectId: SUBJECT_ID,
    });
    expect(result.tenants).toEqual([expect.objectContaining({
      code: TENANT_ID,
      entities: [expect.objectContaining({ code: "LE-ATHQ", type: "legal_entity" })],
    })]);
    expect(cacheClient.set).toHaveBeenCalledWith(
      expect.stringContaining(`bootstrap:${SUBJECT_ID}:neon:athyper:`),
      expect.any(String),
      "EX",
      300,
    );
  });

  it("returns no tenant when canonical admission finds no active membership", async () => {
    const service = createBootstrapService({
      planeDatabases: registry(),
      identities: identities([]),
      projections: projections(),
      cache: cache(),
      loadScopes: vi.fn(),
    });

    await expect(service.resolve(query({
      externalOrganizationIds: [EXTERNAL_ORGANIZATION_ID, "kc-org-missing"],
    })))
      .resolves.toEqual({
        principal: { id: SUBJECT_ID, name: "Demo User", email: "demo@example.test" },
        tenants: [],
      });
  });
});
