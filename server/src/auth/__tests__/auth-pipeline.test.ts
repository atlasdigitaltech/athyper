// server/src/auth/__tests__/auth-pipeline.test.ts
//
// Phase B unit tests — table-driven across the four pipeline steps.
//
// Coverage:
//   - crossCheckClaimsAgainstContext × {off, shadow, on} × {realm, plane,
//     tenant, azp} mismatches
//   - resolveCanonicalTenant: ok, lookup error, not found, mismatch vs claim
//   - enforceAuthorizedRole: AUTHORIZED present / absent / wrong client
//   - enforceRequiredActions: empty, no-route blocking, matrix match, non-
//     mutating method bypass
//   - enforceAuthPipeline composition: short-circuit on first failure

import { describe, it, expect, vi } from "vitest";

import {
  crossCheckClaimsAgainstContext,
  enforceAuthPipeline,
  enforceAuthorizedRole,
  enforceRequiredActions,
  resolveCanonicalTenant,
  type AuthPipelineMode,
  type CrossCheckReporter,
} from "../auth-pipeline.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = "01900000-0000-7000-aaaa-000000000001";
const TENANT_B = "01900000-0000-7000-bbbb-000000000002";

function makeReporter(): CrossCheckReporter & {
  calls: Array<{ kind: "mismatch" | "log"; check?: string; mode?: string; event?: string; fields?: Record<string, unknown> }>;
} {
  const calls: Array<{ kind: "mismatch" | "log"; check?: string; mode?: string; event?: string; fields?: Record<string, unknown> }> = [];
  return {
    calls,
    recordMismatch(check, mode) {
      calls.push({ kind: "mismatch", check, mode });
    },
    log(event, fields) {
      calls.push({ kind: "log", event, fields });
    },
  };
}

function makeClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://iam.athyper.local/realms/athyper",
    azp: "neon-web",
    tenant_id: TENANT_A,
    resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ─── crossCheckClaimsAgainstContext ──────────────────────────────────────────

describe("crossCheckClaimsAgainstContext", () => {
  const matchCases: Array<{
    name: string;
    claims: Record<string, unknown>;
    ctx: { planeKey?: "neon" | "mesh" | "admin"; realmKey?: string; tenantId?: string };
    expectMismatch?: "realm" | "plane" | "tenant" | "azp";
  }> = [
    {
      name: "no mismatch when claims and ctx agree",
      claims: makeClaims(),
      ctx: { planeKey: "neon", realmKey: "athyper", tenantId: TENANT_A },
    },
    {
      name: "realm mismatch when iss != ctx.realmKey",
      claims: makeClaims({ iss: "https://iam.athyper.local/realms/mesh-buyers" }),
      ctx: { realmKey: "athyper" },
      expectMismatch: "realm",
    },
    {
      name: "plane mismatch when azp → plane != ctx.planeKey",
      claims: makeClaims({ azp: "neon-web" }),
      ctx: { planeKey: "admin" },
      expectMismatch: "plane",
    },
    {
      name: "tenant mismatch when claim != ctx.tenantId",
      claims: makeClaims({ tenant_id: TENANT_A }),
      ctx: { tenantId: TENANT_B },
      expectMismatch: "tenant",
    },
  ];

  for (const c of matchCases) {
    it(`mode=on — ${c.name}`, () => {
      const reporter = makeReporter();
      const result = crossCheckClaimsAgainstContext(
        { claims: c.claims, ctx: c.ctx },
        "on",
        reporter,
      );
      if (c.expectMismatch) {
        expect(result.ok).toBe(false);
        expect(result.mismatches.map((m) => m.check)).toContain(c.expectMismatch);
        expect(reporter.calls.some((k) => k.kind === "mismatch" && k.check === c.expectMismatch && k.mode === "enforced")).toBe(true);
      } else {
        expect(result.ok).toBe(true);
        expect(result.mismatches).toHaveLength(0);
      }
    });

    it(`mode=shadow — ${c.name}`, () => {
      const reporter = makeReporter();
      const result = crossCheckClaimsAgainstContext(
        { claims: c.claims, ctx: c.ctx },
        "shadow",
        reporter,
      );
      // shadow never returns ok=false, but still records mismatches
      expect(result.ok).toBe(true);
      if (c.expectMismatch) {
        expect(result.mismatches.map((m) => m.check)).toContain(c.expectMismatch);
        expect(reporter.calls.some((k) => k.kind === "mismatch" && k.check === c.expectMismatch && k.mode === "shadow")).toBe(true);
      }
    });

    it(`mode=off — ${c.name}`, () => {
      const reporter = makeReporter();
      const result = crossCheckClaimsAgainstContext(
        { claims: c.claims, ctx: c.ctx },
        "off",
        reporter,
      );
      expect(result.ok).toBe(true);
      expect(result.mismatches).toHaveLength(0);
      expect(reporter.calls).toHaveLength(0);
    });
  }

  it("unmapped azp + allowedAzp set flags azp mismatch", () => {
    const reporter = makeReporter();
    const result = crossCheckClaimsAgainstContext(
      {
        claims: makeClaims({ azp: "unknown-svc" }),
        ctx: { planeKey: "neon" },
        allowedAzp: ["neon-web", "mesh-web", "admin-web"],
      },
      "on",
      reporter,
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.check)).toContain("azp");
  });

  it("does not flag azp when allowedAzp is empty (no allowlist configured)", () => {
    const reporter = makeReporter();
    const result = crossCheckClaimsAgainstContext(
      {
        claims: makeClaims({ azp: "unknown-svc" }),
        ctx: { planeKey: "neon" },
        allowedAzp: [],
      },
      "on",
      reporter,
    );
    expect(result.ok).toBe(true);
  });
});

// ─── resolveCanonicalTenant ──────────────────────────────────────────────────

describe("resolveCanonicalTenant", () => {
  function mockDb(rows: Array<{ id: string }> | null, throws = false): unknown {
    return {
      selectFrom() {
        return this;
      },
      select() {
        return this;
      },
      where() {
        return this;
      },
      executeTakeFirst() {
        if (throws) return Promise.reject(new Error("connection refused"));
        return Promise.resolve(rows ? rows[0] : undefined);
      },
    };
  }

  it("ok when xOrg empty", async () => {
    const result = await resolveCanonicalTenant(
      { xOrg: "", realmKey: "athyper", claimsTenantId: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb([]) as any,
      makeLogger(),
    );
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBeUndefined();
  });

  it("returns tenantId when lookup succeeds and matches claim", async () => {
    const result = await resolveCanonicalTenant(
      { xOrg: "acme--cc1", realmKey: "athyper", claimsTenantId: TENANT_A },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb([{ id: TENANT_A }]) as any,
      makeLogger(),
    );
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe(TENANT_A);
  });

  it("TENANT_NOT_FOUND when lookup returns nothing", async () => {
    const result = await resolveCanonicalTenant(
      { xOrg: "ghost--cc1", realmKey: "athyper", claimsTenantId: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb(null) as any,
      makeLogger(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TENANT_NOT_FOUND");
    expect(result.error?.status).toBe(404);
  });

  it("TENANT_LOOKUP_FAILED on DB error (500)", async () => {
    const result = await resolveCanonicalTenant(
      { xOrg: "acme--cc1", realmKey: "athyper", claimsTenantId: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb([], true) as any,
      makeLogger(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TENANT_LOOKUP_FAILED");
    expect(result.error?.status).toBe(500);
  });

  it("TENANT_MISMATCH when resolved UUID != claim tenant_id", async () => {
    const result = await resolveCanonicalTenant(
      { xOrg: "acme--cc1", realmKey: "athyper", claimsTenantId: TENANT_B },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb([{ id: TENANT_A }]) as any,
      makeLogger(),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TENANT_MISMATCH");
    expect(result.error?.status).toBe(403);
  });
});

// ─── enforceAuthorizedRole ───────────────────────────────────────────────────

describe("enforceAuthorizedRole", () => {
  it("ok when AUTHORIZED present on plane web client", () => {
    const result = enforceAuthorizedRole(
      { resource_access: { "neon-web": { roles: ["AUTHORIZED"] } } },
      "neon",
    );
    expect(result.ok).toBe(true);
  });

  it("NO_PLATFORM_ACCESS when AUTHORIZED on different client", () => {
    const result = enforceAuthorizedRole(
      { resource_access: { "admin-web": { roles: ["AUTHORIZED"] } } },
      "neon",
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_PLATFORM_ACCESS");
    expect(result.error?.status).toBe(403);
  });

  it("NO_PLATFORM_ACCESS when AUTHORIZED missing", () => {
    const result = enforceAuthorizedRole(
      { resource_access: { "neon-web": { roles: ["NEON_USER"] } } },
      "neon",
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NO_PLATFORM_ACCESS");
  });
});

// ─── enforceRequiredActions ──────────────────────────────────────────────────

describe("enforceRequiredActions", () => {
  const matrix = {
    UPDATE_PASSWORD: ["/api/"],
    VERIFY_EMAIL: ["/api/finance/"],
  };

  it("ok when no pending actions", () => {
    const result = enforceRequiredActions({
      claims: { required_actions: [] },
      route: { path: "/api/finance/post", method: "POST" },
      matrix,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks UPDATE_PASSWORD on any mutating /api/* route", () => {
    const result = enforceRequiredActions({
      claims: { required_actions: ["UPDATE_PASSWORD"] },
      route: { path: "/api/records/foo", method: "POST" },
      matrix,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("REQUIRED_ACTION_PENDING");
    expect(result.error?.blockingAction).toBe("UPDATE_PASSWORD");
  });

  it("allows GET on a blocked path (reads stay open)", () => {
    const result = enforceRequiredActions({
      claims: { required_actions: ["UPDATE_PASSWORD"] },
      route: { path: "/api/records/foo", method: "GET" },
      matrix,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks VERIFY_EMAIL only on /api/finance/* prefix", () => {
    const blocked = enforceRequiredActions({
      claims: { required_actions: ["VERIFY_EMAIL"] },
      route: { path: "/api/finance/post", method: "POST" },
      matrix,
    });
    expect(blocked.ok).toBe(false);

    const allowed = enforceRequiredActions({
      claims: { required_actions: ["VERIFY_EMAIL"] },
      route: { path: "/api/records/foo", method: "POST" },
      matrix,
    });
    expect(allowed.ok).toBe(true);
  });

  it("blocks on ANY pending action when no route provided (gateway path)", () => {
    const result = enforceRequiredActions({
      claims: { required_actions: ["CONFIGURE_TOTP"] },
      matrix,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.blockingAction).toBe("CONFIGURE_TOTP");
  });

  it("ignores actions not in matrix", () => {
    const result = enforceRequiredActions({
      claims: { required_actions: ["UNKNOWN_ACTION"] },
      route: { path: "/api/records/foo", method: "POST" },
      matrix,
    });
    expect(result.ok).toBe(true);
  });
});

// ─── enforceAuthPipeline (composition) ───────────────────────────────────────

describe("enforceAuthPipeline composition", () => {
  function mockDbWithTenant(id: string): unknown {
    return {
      selectFrom() {
        return this;
      },
      select() {
        return this;
      },
      where() {
        return this;
      },
      executeTakeFirst() {
        return Promise.resolve({ id });
      },
    };
  }

  it("ok across all four steps with consistent inputs", async () => {
    const reporter = makeReporter();
    const result = await enforceAuthPipeline(
      {
        claims: makeClaims(),
        ctx: { planeKey: "neon", realmKey: "athyper", tenantId: TENANT_A, requestId: "req-1" },
        headers: { xOrg: "acme--cc1", xRealm: "athyper" },
        route: { path: "/api/records/foo", method: "POST" },
      },
      { mode: "on", resolveTenant: true, enforceAuthorized: true, enforceRequiredActions: true, requiredActionsMatrix: {} },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: mockDbWithTenant(TENANT_A) as any,
        defaultRealmKey: "athyper",
        logger: makeLogger(),
        reporter,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.canonical?.tenantId).toBe(TENANT_A);
    expect(result.canonical?.planeKey).toBe("neon");
  });

  it("short-circuits on realm mismatch before tenant lookup", async () => {
    const reporter = makeReporter();
    const dbCalls = vi.fn(() => Promise.resolve({ id: TENANT_A }));
    const result = await enforceAuthPipeline(
      {
        claims: makeClaims({ iss: "https://iam.athyper.local/realms/admin-only" }),
        ctx: { planeKey: "neon", realmKey: "athyper", requestId: "req-2" },
        headers: { xOrg: "acme--cc1", xRealm: "athyper" },
      },
      { mode: "on" },
      {
        db: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          selectFrom: () => ({ select: () => ({ where: () => ({ where: () => ({ executeTakeFirst: dbCalls }) }) }) }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        defaultRealmKey: "athyper",
        logger: makeLogger(),
        reporter,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("AUTH_CONTEXT_MISMATCH");
    expect(result.error?.check).toBe("realm");
    expect(dbCalls).not.toHaveBeenCalled();
  });

  it("short-circuits on TENANT_MISMATCH before AUTHORIZED check", async () => {
    const reporter = makeReporter();
    const result = await enforceAuthPipeline(
      {
        claims: makeClaims({
          tenant_id: TENANT_B,
          resource_access: {}, // no AUTHORIZED — but we never reach this check
        }),
        ctx: { planeKey: "neon", requestId: "req-3" },
        headers: { xOrg: "acme--cc1" },
      },
      { mode: "on", resolveTenant: true, enforceAuthorized: true },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: mockDbWithTenant(TENANT_A) as any,
        defaultRealmKey: "athyper",
        logger: makeLogger(),
        reporter,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TENANT_MISMATCH");
  });

  it("blocks on REQUIRED_ACTION_PENDING when matrix matches", async () => {
    const reporter = makeReporter();
    const result = await enforceAuthPipeline(
      {
        claims: makeClaims({ required_actions: ["UPDATE_PASSWORD"] }),
        ctx: { planeKey: "neon", realmKey: "athyper", tenantId: TENANT_A, requestId: "req-4" },
        headers: {},
        route: { path: "/api/records/foo", method: "POST" },
      },
      {
        mode: "on",
        resolveTenant: false,
        enforceAuthorized: true,
        enforceRequiredActions: true,
        requiredActionsMatrix: { UPDATE_PASSWORD: ["/api/"] },
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: {} as any,
        defaultRealmKey: "athyper",
        logger: makeLogger(),
        reporter,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("REQUIRED_ACTION_PENDING");
    expect(result.error?.blockingAction).toBe("UPDATE_PASSWORD");
  });
});
