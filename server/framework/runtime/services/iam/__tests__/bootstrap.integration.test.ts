/**
 * Bootstrap Service — integration tests
 *
 * All DB and cache calls are mocked via vi.fn(). Tests cover:
 *   - Kumar: 3 distinct entities across 2 tenants (athyper:ATHQ+ASAC, athyper-hq1:ATHQ)
 *   - Jesus: 17-entity user (simulated by 17 company_code rows in CTE result)
 *   - Rama:  1-entity user (single org alias)
 *   - Cache hit: second call returns cached value without DB queries
 *   - Empty org aliases: returns empty tenants list
 *   - Inactive tenant: filtered out of result
 */

import { describe, it, expect, vi } from "vitest";
import { sql } from "kysely";

import {
  createBootstrapService,
  type BootstrapServiceDeps,
} from "../bootstrap/bootstrap.service.js";
import type { BootstrapQuery } from "../session/session.types.js";
import type { CacheClient } from "../session/session.service.js";

// ─── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockCache(cached: string | null = null): CacheClient {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

/**
 * Builds a mock Kysely db where:
 *   - `selectFrom(table)` returns a builder
 *   - `.execute()` / `.executeTakeFirst()` return the row(s) keyed by table name
 *   - `sql\`...\`.execute(db)` is intercepted via the `sql` tagged-template mock
 *
 * The bootstrap service uses `sql\`...\`.execute(db)` for the entity CTE.
 * We stub that by injecting a `__sqlRows` key per tenant into the rows map.
 */
function makeMockDb(
  tableRows: Record<string, unknown[] | unknown>,
  sqlRows: Record<string, unknown[]> = {},
): { db: Record<string, unknown>; sqlMock: ReturnType<typeof vi.fn> } {
  // We'll track which "current tenant" we're in by order of resolveTenant calls
  // using a queue indexed per tenantCode key.
  const sqlCallIdx = { count: 0 };
  const sqlKeys = Object.keys(sqlRows);

  const sqlMock = vi.fn().mockImplementation(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
      execute: vi.fn().mockImplementation(() => {
        const key = sqlKeys[sqlCallIdx.count % sqlKeys.length] ?? "_default";
        sqlCallIdx.count++;
        return Promise.resolve({ rows: sqlRows[key] ?? [] });
      }),
    }),
  );

  const db = {
    selectFrom(table: string) {
      const rowsForTable = tableRows[table];
      const b: Record<string, (...a: unknown[]) => unknown> = {
        select: () => b,
        innerJoin: () => b,
        leftJoin: () => b,
        where: () => b,
        on: () => b,
        onRef: () => b,
        orderBy: () => b,
        executeTakeFirst: vi.fn().mockResolvedValue(
          Array.isArray(rowsForTable)
            ? rowsForTable[0] ?? null
            : rowsForTable ?? null,
        ),
        execute: vi.fn().mockResolvedValue(
          Array.isArray(rowsForTable)
            ? rowsForTable
            : rowsForTable != null
              ? [rowsForTable]
              : [],
        ),
        fn: { countAll: () => ({ as: () => "cnt" }) },
      };
      return b;
    },
    __sqlMock: sqlMock,
  };

  return { db, sqlMock };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

const KUMAR_SUB  = "aa000001-0000-0000-0000-000000000001";
const RAMA_SUB   = "aa000001-0000-0000-0000-000000000003";
const JESUS_SUB  = "bb000099-0000-0000-0000-000000000001"; // hypothetical 17-entity user

describe("BootstrapService.resolve", () => {
  // ── Cache hit ───────────────────────────────────────────────────────────────

  it("returns cached response without hitting DB", async () => {
    const cachedPayload = JSON.stringify({
      principal: { id: KUMAR_SUB, name: "Kumar Rajan", email: "kumar@athyper.demo" },
      tenants: [],
      delegation_count: 0,
    });
    const cache = makeMockCache(cachedPayload);
    const db = { selectFrom: vi.fn() };

    const svc = createBootstrapService({ db: db as never, cache });
    const result = await svc.resolve({
      sub: KUMAR_SUB,
      realmKey: "athyper",
      name: "Kumar Rajan",
      email: "kumar@athyper.demo",
      orgAliases: ["athyper--ATHQ"],
      workbenches: ["user"],
    });

    expect(result.principal.id).toBe(KUMAR_SUB);
    expect(db.selectFrom).not.toHaveBeenCalled();
  });

  // ── Empty orgAliases ────────────────────────────────────────────────────────

  it("returns empty tenants list when orgAliases is empty", async () => {
    const svc = createBootstrapService({
      db: { selectFrom: vi.fn() } as never,
      cache: makeMockCache(),
    });

    const result = await svc.resolve({
      sub: KUMAR_SUB,
      realmKey: "athyper",
      name: "Kumar Rajan",
      email: "kumar@athyper.demo",
      orgAliases: [],
      workbenches: ["user"],
    });

    expect(result.tenants).toHaveLength(0);
    expect(result.delegation_count).toBe(0);
  });

  // ── Rama: 1-entity user ─────────────────────────────────────────────────────

  it("resolves 1 tenant with 1 entity for Rama", async () => {
    const entityCTERows = [
      {
        entity_code: "ATHQ",
        entity_name: "Athyper Group Holdings",
        entity_type: "holding",
        country_code: "MY",
        legal_entity_code: "ATHQ-LE",
        persona_code: "agent",
        module_count: 2,
      },
    ];

    // Bootstrap service does 3 types of selectFrom queries per tenant:
    //   1. master.tenant  → tenant id/name/status
    //   2. master.principal_auth_binding → principal_id
    //   Then sql CTE
    //   Then for delegation count: master.tenant again + master.principal_auth_binding + master.delegation_grant
    const db = {
      selectFrom(table: string) {
        const rowsByTable: Record<string, unknown> = {
          "master.tenant": { id: "t-athyper", name: "Athyper", display_name: "Athyper Group", status: "active" },
          "master.principal_auth_binding as pab": { principal_id: RAMA_SUB, is_active: true, is_locked: false },
          "master.principal_auth_binding": { principal_id: RAMA_SUB },
          "master.delegation_grant": { cnt: 0 },
        };

        const rowsForTable = rowsByTable[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b,
          innerJoin: () => b,
          leftJoin: () => b,
          where: () => b,
          on: () => b,
          onRef: () => b,
          orderBy: () => b,
          fn: { countAll: () => ({ as: (alias: string) => alias }) },
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable[0] ?? null : rowsForTable ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable : rowsForTable != null ? [rowsForTable] : [],
          ),
        };
        return b;
      },
    };

    // The service uses `sql\`...\`.execute(db)` for the entity CTE.
    // We need to intercept it. Since Kysely's sql is imported in the service,
    // we can't easily mock it without module-level mocking.
    // Instead we test the service's output shape by providing a custom db
    // that returns the CTE-equivalent rows via raw sql mock.
    //
    // Note: This test verifies behaviour assuming the sql CTE returns entityCTERows.
    // In a real integration test environment (with postgres), the CTE runs against
    // the actual schema. Here we verify the overall service orchestration is correct.
    //
    // Since we cannot intercept the sql tagged template in Vitest without a transform,
    // we mark this test as a "structural" test and mock sql at the module level.
    vi.mock("kysely", async () => {
      const actual = await vi.importActual<typeof import("kysely")>("kysely");
      return {
        ...actual,
        sql: Object.assign(
          (_strings: TemplateStringsArray) => ({
            execute: vi.fn().mockResolvedValue({ rows: entityCTERows }),
          }),
          actual.sql,
        ),
      };
    });

    const svc = createBootstrapService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: RAMA_SUB,
      realmKey: "athyper",
      name: "Rama Subramaniam",
      email: "rama@athyper.demo",
      orgAliases: ["athyper--ATHQ"],
      workbenches: ["user"],
    });

    expect(result.principal.name).toBe("Rama Subramaniam");
    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0].code).toBe("athyper");
  });

  // ── Kumar: 3-entity user across 2 tenants ──────────────────────────────────
  //
  // orgAliases: ["athyper--ATHQ", "athyper--ASAC", "athyper-hq1--ATHQ"]
  // Expected: 2 tenants; athyper has 2 entities, athyper-hq1 has 1 entity.

  it("groups 3 entities into 2 tenants for Kumar", async () => {
    // Because the bootstrap service runs resolveTenant() per tenant in parallel,
    // and each call uses sql CTE, we test the tenant grouping logic (groupAliasesByTenant)
    // by verifying the output structure when CTE returns appropriate rows per tenant.

    const athyperEntities = [
      {
        entity_code: "ATHQ",
        entity_name: "Athyper Group Holdings",
        entity_type: "holding",
        country_code: "MY",
        legal_entity_code: "ATHQ-LE",
        persona_code: "manager",
        module_count: 3,
      },
      {
        entity_code: "ASAC",
        entity_name: "Athyper Saudi Construction",
        entity_type: "subsidiary",
        country_code: "SA",
        legal_entity_code: "ASAC-LE",
        persona_code: "manager",
        module_count: 2,
      },
    ];

    const hq1Entities = [
      {
        entity_code: "ATHQ",
        entity_name: "Athyper HQ Unit 1",
        entity_type: "holding",
        country_code: "MY",
        legal_entity_code: "ATHQ-HQ1-LE",
        persona_code: "partner",
        module_count: 1,
      },
    ];

    // sql mock: alternate between athyperEntities and hq1Entities per call
    let sqlCallCount = 0;
    vi.mock("kysely", async () => {
      const actual = await vi.importActual<typeof import("kysely")>("kysely");
      return {
        ...actual,
        sql: Object.assign(
          (_strings: TemplateStringsArray) => ({
            execute: vi.fn().mockImplementation(() => {
              const rows = sqlCallCount % 2 === 0 ? athyperEntities : hq1Entities;
              sqlCallCount++;
              return Promise.resolve({ rows });
            }),
          }),
          actual.sql,
        ),
      };
    });

    const db = {
      selectFrom(table: string) {
        const rowsByTable: Record<string, unknown> = {
          "master.tenant": { id: "t-id", name: "Athyper", display_name: "Athyper Group", status: "active" },
          "master.principal_auth_binding as pab": { principal_id: KUMAR_SUB, is_active: true, is_locked: false },
          "master.principal_auth_binding": { principal_id: KUMAR_SUB },
          "master.delegation_grant": { cnt: 0 },
        };
        const rowsForTable = rowsByTable[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b, innerJoin: () => b, leftJoin: () => b,
          where: () => b, on: () => b, onRef: () => b, orderBy: () => b,
          fn: { countAll: () => ({ as: (a: string) => a }) },
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable[0] ?? null : rowsForTable ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable : rowsForTable != null ? [rowsForTable] : [],
          ),
        };
        return b;
      },
    };

    const svc = createBootstrapService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: KUMAR_SUB,
      realmKey: "athyper",
      name: "Kumar Rajan",
      email: "kumar@athyper.demo",
      orgAliases: ["athyper--ATHQ", "athyper--ASAC", "athyper-hq1--ATHQ"],
      workbenches: ["user", "partner"],
    });

    expect(result.principal.name).toBe("Kumar Rajan");
    // 2 distinct tenant codes
    expect(result.tenants).toHaveLength(2);
    const athyperTenant = result.tenants.find((t) => t.code === "athyper");
    expect(athyperTenant).toBeDefined();
  });

  // ── Jesus: 17-entity user (many entities simulation) ───────────────────────

  it("handles a user with 17 entities in one tenant", async () => {
    const manyEntities = Array.from({ length: 17 }, (_, i) => ({
      entity_code: `ENT${String(i + 1).padStart(2, "0")}`,
      entity_name: `Entity ${i + 1}`,
      entity_type: "subsidiary",
      country_code: "US",
      legal_entity_code: `LE${i + 1}`,
      persona_code: "manager",
      module_count: 2,
    }));

    vi.mock("kysely", async () => {
      const actual = await vi.importActual<typeof import("kysely")>("kysely");
      return {
        ...actual,
        sql: Object.assign(
          (_strings: TemplateStringsArray) => ({
            execute: vi.fn().mockResolvedValue({ rows: manyEntities }),
          }),
          actual.sql,
        ),
      };
    });

    const db = {
      selectFrom(table: string) {
        const rowsByTable: Record<string, unknown> = {
          "master.tenant": { id: "t-pepsi", name: "Pepsi", display_name: "Pepsi Corporation", status: "active" },
          "master.principal_auth_binding as pab": { principal_id: JESUS_SUB, is_active: true, is_locked: false },
          "master.principal_auth_binding": { principal_id: JESUS_SUB },
          "master.delegation_grant": { cnt: 0 },
        };
        const rowsForTable = rowsByTable[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b, innerJoin: () => b, leftJoin: () => b,
          where: () => b, on: () => b, onRef: () => b, orderBy: () => b,
          fn: { countAll: () => ({ as: (a: string) => a }) },
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable[0] ?? null : rowsForTable ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable : rowsForTable != null ? [rowsForTable] : [],
          ),
        };
        return b;
      },
    };

    const orgAliases = manyEntities.map((e) => `pepsi--${e.entity_code}`);
    const svc = createBootstrapService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: JESUS_SUB,
      realmKey: "athyper",
      name: "Jesus Rodriguez",
      email: "jesus@pepsi.demo",
      orgAliases,
      workbenches: ["user"],
    });

    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0].entities).toHaveLength(17);
  });

  // ── Inactive tenant filtered out ────────────────────────────────────────────

  it("excludes inactive tenants from the response", async () => {
    const db = {
      selectFrom(table: string) {
        const rowsByTable: Record<string, unknown> = {
          "master.tenant": { id: "t-id", name: "Coke", display_name: "Coca-Cola", status: "inactive" },
        };
        const rowsForTable = rowsByTable[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b, innerJoin: () => b, leftJoin: () => b,
          where: () => b, on: () => b, onRef: () => b, orderBy: () => b,
          fn: { countAll: () => ({ as: (a: string) => a }) },
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable[0] ?? null : rowsForTable ?? null,
          ),
          execute: vi.fn().mockResolvedValue([]),
        };
        return b;
      },
    };

    const svc = createBootstrapService({ db: db as never, cache: makeMockCache() });
    const result = await svc.resolve({
      sub: "aa000004-0000-0000-0000-000000000001",
      realmKey: "athyper",
      name: "Sarah Johnson",
      email: "sarah@coke.demo",
      orgAliases: ["coke--COKE"],
      workbenches: ["user"],
    });

    expect(result.tenants).toHaveLength(0);
  });

  // ── Cache is populated after DB resolution ──────────────────────────────────

  it("caches the bootstrap response after DB resolution", async () => {
    const cache = makeMockCache();
    vi.mock("kysely", async () => {
      const actual = await vi.importActual<typeof import("kysely")>("kysely");
      return {
        ...actual,
        sql: Object.assign(
          (_strings: TemplateStringsArray) => ({
            execute: vi.fn().mockResolvedValue({ rows: [] }),
          }),
          actual.sql,
        ),
      };
    });

    const db = {
      selectFrom(table: string) {
        const rowsByTable: Record<string, unknown> = {
          "master.tenant": { id: "t-athyper", name: "Athyper", display_name: "Athyper Group", status: "active" },
          "master.principal_auth_binding as pab": { principal_id: RAMA_SUB, is_active: true, is_locked: false },
          "master.principal_auth_binding": { principal_id: RAMA_SUB },
          "master.delegation_grant": { cnt: 0 },
        };
        const rowsForTable = rowsByTable[table];
        const b: Record<string, (...a: unknown[]) => unknown> = {
          select: () => b, innerJoin: () => b, leftJoin: () => b,
          where: () => b, on: () => b, onRef: () => b, orderBy: () => b,
          fn: { countAll: () => ({ as: (a: string) => a }) },
          executeTakeFirst: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable[0] ?? null : rowsForTable ?? null,
          ),
          execute: vi.fn().mockResolvedValue(
            Array.isArray(rowsForTable) ? rowsForTable : rowsForTable != null ? [rowsForTable] : [],
          ),
        };
        return b;
      },
    };

    const svc = createBootstrapService({ db: db as never, cache });
    await svc.resolve({
      sub: RAMA_SUB,
      realmKey: "athyper",
      name: "Rama Subramaniam",
      email: "rama@athyper.demo",
      orgAliases: ["athyper--ATHQ"],
      workbenches: ["user"],
    });

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^bootstrap:aa000001-0000-0000-0000-000000000003:/),
      expect.any(String),
      "EX",
      300,
    );
  });
});
