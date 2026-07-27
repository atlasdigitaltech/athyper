/**
 * Session Service — integration tests
 *
 * All DB and cache calls are mocked via vi.fn(). The test exercises
 * createSessionService.resolve() through the full control-flow logic,
 * covering:
 *   - Kumar: 3-entity user with user+partner workbenches, scope=all
 *   - Rama:  1-entity user, scope=own (explicit company_code)
 *   - Partner-only user: workbench=partner, restricted org
 *   - Cache hit: second call returns cached value without DB queries
 *   - Auth failures: wrong org, wrong workbench, inactive principal
 */

import { describe, it, expect, vi } from "vitest";

import {
  createSessionService,
  type CacheClient,
} from "../session/session.service.js";
import type { SessionQuery } from "../session/session.types.js";

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockCache(cached: string | null = null): CacheClient {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

function makeExecuteQuery(rowsByCall: Array<{ rows: unknown[] }>): ReturnType<typeof vi.fn> {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const next = rowsByCall[call] ?? { rows: [] };
    call += 1;
    return Promise.resolve(next);
  });
}

/**
 * Build a minimal Kysely-compatible mock that maps table names to result rows.
 * Each call to selectFrom() starts a builder chain; executeTakeFirst() and
 * execute() return the resolved rows for that table.
 */
// ─── Shared fixtures ──────────────────────────────────────────────────────────

const KUMAR_SUB = "aa000001-0000-0000-0000-000000000001";
const RAMA_SUB  = "aa000001-0000-0000-0000-000000000003";
const PRIYA_SUB = "aa000010-0000-0000-0000-000000000001";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionService.resolve", () => {
  // ── Cache hit ───────────────────────────────────────────────────────────────

  it("returns cached response without hitting DB", async () => {
    const cachedPayload = JSON.stringify({
      response: { persona: "manager", workbench: "user" },
      principal_id: KUMAR_SUB,
      auth_epoch: 1,
    });
    const cache = {
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === `session:${KUMAR_SUB}:athyper:ATHQ:user`) return cachedPayload;
        if (key === `session:auth_epoch:${KUMAR_SUB}`) return "1";
        return null;
      }),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    };
    const db = { selectFrom: vi.fn() };

    const svc = createSessionService({ db: db as never, cache });
    const result = await svc.resolve({
      sub: KUMAR_SUB,
      realmKey: "athyper",
      tenant: "athyper",
      entity: "ATHQ",
      workbench: "user",
      orgAliases: ["athyper--ATHQ"],
      workbenches: ["user"],
    });

    expect(result).toEqual({ persona: "manager", workbench: "user" });
    expect(db.selectFrom).not.toHaveBeenCalled();
  });

  // ── Org membership gate ─────────────────────────────────────────────────────

  it("throws ORG_NOT_IN_TOKEN when alias is absent from orgAliases", async () => {
    const svc = createSessionService({ db: {} as never, cache: makeMockCache() });

    await expect(
      svc.resolve({
        sub: KUMAR_SUB,
        realmKey: "athyper",
        tenant: "pepsi",       // not in orgAliases
        entity: "PEPSI",
        workbench: "user",
        orgAliases: ["athyper--ATHQ", "athyper--ASAC"],
        workbenches: ["user"],
      }),
    ).rejects.toMatchObject({ code: "ORG_NOT_IN_TOKEN", httpStatus: 403 });
  });

  it("throws WORKBENCH_NOT_ALLOWED when requested workbench is not in allowed list", async () => {
    const svc = createSessionService({ db: {} as never, cache: makeMockCache() });

    await expect(
      svc.resolve({
        sub: KUMAR_SUB,
        realmKey: "athyper",
        tenant: "athyper",
        entity: "ATHQ",
        workbench: "admin",    // kumar doesn't have admin workbench
        orgAliases: ["athyper--ATHQ"],
        workbenches: ["user", "partner"],
      }),
    ).rejects.toMatchObject({ code: "WORKBENCH_NOT_ALLOWED", httpStatus: 403 });
  });

  // ── Kumar: 3-entity user, scope=all ────────────────────────────────────────
  //
  // Kumar belongs to: athyper:ATHQ, athyper:ASAC, athyper-hq1:ATHQ
  // Here we test resolution for athyper:ATHQ entity with user workbench.

  it("resolves full session for Kumar (athyper:ATHQ, user workbench, scope=all)", async () => {
    const query: SessionQuery = {
      sub: KUMAR_SUB,
      realmKey: "athyper",
      tenant: "athyper",
      entity: "ATHQ",
      workbench: "user",
      orgAliases: ["athyper--ATHQ", "athyper--ASAC", "athyper-hq1--ATHQ"],
      workbenches: ["user", "partner"],
    };

    const executeRawQuery = makeExecuteQuery([
      { rows: [{ plan_version_id: "pv-basic" }] },
      {
        rows: [
          { module_id: "m-acc", module_code: "ACC", workspace_id: "w-core" },
          { module_id: "m-pay", module_code: "PAY", workspace_id: "w-core" },
        ],
      },
      { rows: [{ has_tenant_scope: true, widest_visibility: "all", cc_codes: null }] },
    ]);
    const db = {
      selectFrom(table: string) {
        const rows: Record<string, unknown> = {
          "master.tenant as t":              { id: "t-athyper", status: "active" },
          "master.legal_entity as le":       {
            legal_entity_code: "ATHQ",
            legal_entity_name: "Athyper Group Holdings",
            legal_entity_display_name: "Athyper Group Holdings",
            country_code: "MY",
            company_code: "ATHQ",
          },
          "master.principal_identity_binding as pab": { principal_id: KUMAR_SUB, is_active: true, is_locked: false },
          "master.principal_persona as pp":  { persona_id: "ps-manager", persona_code: "manager" },
          "shared.permission as p":          [
            { code: "invoice.create", is_granted: true },
            { code: "invoice.approve", is_granted: false },
            { code: "report.view", is_granted: true },
          ],
          "master.delegation_grant as dg":   [],
        };

        const tableRows = rows[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b,
          innerJoin: () => b,
          leftJoin: () => b,
          where: () => b,
          on: () => b,
          onRef: () => b,
          orderBy: () => b,
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows[0] ?? null : tableRows ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows : tableRows != null ? [tableRows] : [],
          ),
        };
        return b;
      },
      getExecutor: () => ({
        transformQuery: (query: unknown) => query,
        compileQuery: (query: unknown) => query,
        executeQuery: executeRawQuery,
      }),
    };

    const cache = makeMockCache();
    const svc = createSessionService({ db: db as never, cache });
    const result = await svc.resolve(query);

    expect(result.persona).toBe("manager");
    expect(result.workbench).toBe("user");
    expect(result.entity).toEqual({ code: "ATHQ", name: "Athyper Group Holdings", country: "MY" });
    expect(result.permissions["invoice.create"]).toBe(true);
    expect(result.permissions["invoice.approve"]).toBe(false);
    expect(result.permissions["report.view"]).toBe(true);
    expect(result.modules).toHaveLength(2);
    expect(result.modules).toEqual([
      { code: "ACC", name: "ACC", level: "user" },
      { code: "PAY", name: "PAY", level: "user" },
    ]);
    expect(result.scope).toEqual({ all: true, company_codes: [], visibility: "all" });
    expect(result.delegations_available).toHaveLength(0);
    // Response must be cached
    expect(cache.set).toHaveBeenCalledWith(
      `session:${KUMAR_SUB}:athyper:ATHQ:user`,
      expect.any(String),
      "EX",
      300,
    );
  });

  // ── Rama: 1-entity user, scope=own ─────────────────────────────────────────
  //
  // Rama only has one entity (athyper:ATHQ) with explicit company_code scope.

  it("resolves session for Rama with explicit company_code scope (scope=own)", async () => {
    const executeRawQuery = makeExecuteQuery([
      { rows: [{ plan_version_id: "pv-basic" }] },
      { rows: [{ module_id: "m-acc", module_code: "ACC", workspace_id: "w-core" }] },
      { rows: [{ has_tenant_scope: false, widest_visibility: "own", cc_codes: ["ATHQ"] }] },
    ]);
    const db = {
      selectFrom(table: string) {
        const rows: Record<string, unknown> = {
          "master.tenant as t":              { id: "t-athyper", status: "active" },
          "master.legal_entity as le":       {
            legal_entity_code: "ATHQ",
            legal_entity_name: "Athyper Group Holdings",
            legal_entity_display_name: "Athyper Group Holdings",
            country_code: "MY",
            company_code: "ATHQ",
          },
          "master.principal_identity_binding as pab": { principal_id: RAMA_SUB, is_active: true, is_locked: false },
          "master.principal_persona as pp":  { persona_id: "ps-agent", persona_code: "agent" },
          "shared.permission as p":          [
            { code: "report.view", is_granted: true },
          ],
          "master.delegation_grant as dg": [],
        };

        const tableRows = rows[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b,
          innerJoin: () => b,
          leftJoin: () => b,
          where: () => b,
          on: () => b,
          onRef: () => b,
          orderBy: () => b,
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows[0] ?? null : tableRows ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows : tableRows != null ? [tableRows] : [],
          ),
        };
        return b;
      },
      getExecutor: () => ({
        transformQuery: (query: unknown) => query,
        compileQuery: (query: unknown) => query,
        executeQuery: executeRawQuery,
      }),
    };

    const svc = createSessionService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: RAMA_SUB,
      realmKey: "athyper",
      tenant: "athyper",
      entity: "ATHQ",
      workbench: "user",
      orgAliases: ["athyper--ATHQ"],
      workbenches: ["user"],
    });

    expect(result.persona).toBe("agent");
    expect(result.scope).toEqual({ all: false, company_codes: ["ATHQ"], visibility: "own" });
  });

  // ── Partner-only user ───────────────────────────────────────────────────────
  //
  // Priya (demo_in) can only use workbench=partner. Requesting workbench=user
  // must be rejected; workbench=partner must succeed.

  it("rejects user workbench for partner-only principal", async () => {
    const svc = createSessionService({ db: {} as never, cache: makeMockCache() });

    await expect(
      svc.resolve({
        sub: PRIYA_SUB,
        realmKey: "athyper",
        tenant: "demo_in",
        entity: "DEMOIN",
        workbench: "user",       // not allowed — only "partner"
        orgAliases: ["demo_in--DEMOIN"],
        workbenches: ["partner"],
      }),
    ).rejects.toMatchObject({ code: "WORKBENCH_NOT_ALLOWED", httpStatus: 403 });
  });

  it("resolves partner session for Priya (demo_in, partner workbench)", async () => {
    const executeRawQuery = makeExecuteQuery([
      { rows: [{ plan_version_id: "pv-basic" }] },
      { rows: [{ module_id: "m-acc", module_code: "ACC", workspace_id: "w-core" }] },
      { rows: [{ has_tenant_scope: false, widest_visibility: "own", cc_codes: ["DEMOIN"] }] },
    ]);
    const db = {
      selectFrom(table: string) {
        const rows: Record<string, unknown> = {
          "master.tenant as t":              { id: "t-demo-in", status: "active" },
          "master.legal_entity as le":       {
            legal_entity_code: "DEMOIN",
            legal_entity_name: "Demo India",
            legal_entity_display_name: "Demo India",
            country_code: "IN",
            company_code: "DEMOIN",
          },
          "master.principal_identity_binding as pab": { principal_id: PRIYA_SUB, is_active: true, is_locked: false },
          "master.principal_persona as pp":  { persona_id: "ps-agent", persona_code: "agent" },
          "shared.permission as p":          [{ code: "invoice.view", is_granted: true }],
          "master.delegation_grant as dg":   [],
        };

        const tableRows = rows[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b,
          innerJoin: () => b,
          leftJoin: () => b,
          where: () => b,
          on: () => b,
          onRef: () => b,
          orderBy: () => b,
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows[0] ?? null : tableRows ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows : tableRows != null ? [tableRows] : [],
          ),
        };
        return b;
      },
      getExecutor: () => ({
        transformQuery: (query: unknown) => query,
        compileQuery: (query: unknown) => query,
        executeQuery: executeRawQuery,
      }),
    };

    const svc = createSessionService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: PRIYA_SUB,
      realmKey: "athyper",
      tenant: "demo_in",
      entity: "DEMOIN",
      workbench: "partner",
      orgAliases: ["demo_in--DEMOIN"],
      workbenches: ["partner"],
    });

    expect(result.workbench).toBe("partner");
    expect(result.persona).toBe("agent");
    expect(result.entity.code).toBe("DEMOIN");
  });

  // ── Inactive / locked principal ─────────────────────────────────────────────

  it("throws PRINCIPAL_DISABLED for locked principal", async () => {
    const db = {
      selectFrom(table: string) {
        const rows: Record<string, unknown> = {
          "master.tenant as t": { id: "t-athyper", status: "active" },
          "master.legal_entity as le": {
            legal_entity_code: "ATHQ",
            legal_entity_name: "Athyper Group Holdings",
            legal_entity_display_name: "Athyper Group Holdings",
            country_code: "MY",
            company_code: "ATHQ",
          },
          "master.principal_identity_binding as pab": {
            principal_id: KUMAR_SUB,
            is_active: true,
            is_locked: true,  // locked!
          },
        };
        const tableRows = rows[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b, innerJoin: () => b, leftJoin: () => b,
          where: () => b, on: () => b, onRef: () => b, orderBy: () => b,
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(tableRows) ? tableRows[0] ?? null : tableRows ?? null,
          ),
          execute: vi.fn().mockResolvedValue([]),
        };
        return b;
      },
    };

    const svc = createSessionService({ db: db as never, cache: makeMockCache() });

    await expect(
      svc.resolve({
        sub: KUMAR_SUB,
        realmKey: "athyper",
        tenant: "athyper",
        entity: "ATHQ",
        workbench: "user",
        orgAliases: ["athyper--ATHQ"],
        workbenches: ["user"],
      }),
    ).rejects.toMatchObject({ code: "PRINCIPAL_DISABLED", httpStatus: 403 });
  });
});

// ─── SessionService.invalidate ─────────────────────────────────────────────────

describe("SessionService.invalidate", () => {
  it("deletes the specific session cache key", async () => {
    const cache = makeMockCache();
    const svc = createSessionService({ db: {} as never, cache });

    await svc.invalidate(KUMAR_SUB, "athyper", "ATHQ", "user");

    expect(cache.del).toHaveBeenCalledWith(
      `session:${KUMAR_SUB}:athyper:ATHQ:user`,
    );
  });
});

// ─── SessionService.invalidateAll ─────────────────────────────────────────────

describe("SessionService.invalidateAll", () => {
  it("scans and deletes all session keys for a sub", async () => {
    const cache: CacheClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(3),
      scan: vi
        .fn()
        .mockResolvedValueOnce([
          "0",
          [
            `session:${KUMAR_SUB}:athyper:ATHQ:user`,
            `session:${KUMAR_SUB}:athyper:ASAC:user`,
            `session:${KUMAR_SUB}:athyper-hq1:ATHQ:partner`,
          ],
        ]),
    };

    const svc = createSessionService({ db: {} as never, cache });
    await svc.invalidateAll(KUMAR_SUB);

    expect(cache.del).toHaveBeenCalledWith([
      `session:${KUMAR_SUB}:athyper:ATHQ:user`,
      `session:${KUMAR_SUB}:athyper:ASAC:user`,
      `session:${KUMAR_SUB}:athyper-hq1:ATHQ:partner`,
    ]);
  });

  it("skips del when scan returns no keys", async () => {
    const cache: CacheClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(0),
      scan: vi.fn().mockResolvedValueOnce(["0", []]),
    };

    const svc = createSessionService({ db: {} as never, cache });
    await svc.invalidateAll(KUMAR_SUB);

    expect(cache.del).not.toHaveBeenCalled();
  });
});
