import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Request } from "express";
import {
  resolveActiveFiscalContext,
  CALENDAR_DEFAULT_CONTEXT,
  _resetFiscalContextCache,
  type FiscalContextDeps,
} from "../../fiscal-context.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Row = {
  timezone_code: string | null;
  week_start: number | null;
  fiscal_year_start_month: number;
  default_ledger_book_id: string | null;
};

/** Minimal Kysely stub — only implements what fiscal-context.ts actually calls. */
function fakeDb(companyProfiles: Map<string, Row>, principalDefaults: Map<string, string>) {
  const queryCount = { profile: 0, principal: 0 };

  const kysely = {
    // Chain used by loadDefaultCompanyCodeId
    selectFrom: (_from: string) => ({
      select: (_col: string) => ({
        where: () => ({
          where: () => ({
            executeTakeFirst: async () => {
              queryCount.principal += 1;
              // Return the row shape the caller expects: { default_company_code_id: <uuid> | null }
              // Key we last set via `where("p.principal_id","=",principalId)` isn't tracked here;
              // caller passes the principalId via deps.principalId, so we use that from the test spy.
              return null;
            },
          }),
        }),
      }),
    }),
    // sql template tag intercept: the resolver calls `sql`.execute(db) with the raw SQL.
    // We don't run SQL — we resolve based on the query string patterns.
  };

  // The resolver uses `sql\`SELECT ... FROM master.company_code ...\`.execute(db)`
  // We can't easily intercept template-tag SQL from a stub `db`, so we monkey-patch
  // through a raw override — see the test's `deps.db` construction below.
  return { kysely, queryCount, companyProfiles, principalDefaults };
}

/** Build a fake express Request with only the headers we consume. */
function fakeReq(headers: Record<string, string> = {}): Request {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  } as unknown as Request;
}

// ─── Direct-call tests (mocking loadDefaultCompanyCodeId + selectCompanyProfile via db) ──
//
// Rather than build a Kysely mock that intercepts template-tag SQL, we stub the
// public entry point with a hand-rolled db object whose behaviours are keyed
// on kysely.executeTakeFirst / sql-execute pairs. See helper below.

interface DbBehaviour {
  companyProfiles: Map<string, Row>;
  principalDefaults: Map<string, string | null>;
  onProfileLookup?: () => void;
}

function stubDeps(b: DbBehaviour, extra: Partial<FiscalContextDeps> = {}): FiscalContextDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            executeTakeFirst: async () => {
              const pid = capturedPrincipalId.value;
              if (!pid) return null;
              const val = b.principalDefaults.get(pid) ?? null;
              return val ? { default_company_code_id: val } : null;
            },
          }),
        }),
      }),
    }),
  };
  // Override kysely sql-template execution by patching the internal helper.
  // The resolver imports { sql } from "kysely" and calls sql`...`.execute(db).
  // Rather than mock kysely globals, we set up a proxy on db that captures the
  // SQL and returns the right profile row.
  const kyselyMock = db as { __sqlExecute?: (companyCodeId: string) => Promise<Row | null> };
  kyselyMock.__sqlExecute = async (companyCodeId: string) => {
    b.onProfileLookup?.();
    return b.companyProfiles.get(companyCodeId) ?? null;
  };
  return {
    db,
    tenantId: extra.tenantId ?? "tenant-a",
    principalId: extra.principalId ?? null,
    logger: extra.logger,
  };
}

const capturedPrincipalId = { value: null as string | null };

// Vitest module mock — replace the internal SQL template-tag call with a stub
// so we don't need a real database. This keeps the tests unit-scoped.
vi.mock("kysely", async () => {
  const actual = await vi.importActual<typeof import("kysely")>("kysely");
  return {
    ...actual,
    sql: Object.assign(
      (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (db: any) => {
          // Extract company_code_id from the second interpolated value
          // (order in the resolver: tenantId, companyCodeId).
          const companyCodeId = String(_values[1] ?? "");
          const row = await db.__sqlExecute?.(companyCodeId);
          return { rows: row ? [row] : [] };
        },
      }),
    ),
  };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetFiscalContextCache();
  capturedPrincipalId.value = null;
});

describe("resolveActiveFiscalContext — header path", () => {
  it("reads X-Company-Code-ID and returns full profile", async () => {
    const deps = stubDeps({
      companyProfiles: new Map([[
        "cc-ksa",
        { timezone_code: "Asia/Riyadh", week_start: 6, fiscal_year_start_month: 1, default_ledger_book_id: "book-1" },
      ]]),
      principalDefaults: new Map(),
    });
    const req = fakeReq({ "X-Company-Code-ID": "cc-ksa" });

    const ctx = await resolveActiveFiscalContext(req, deps);

    expect(ctx.companyCodeId).toBe("cc-ksa");
    expect(ctx.timeZone).toBe("Asia/Riyadh");
    expect(ctx.weekStart).toBe(6);
    expect(ctx.fiscalYearStartMonth).toBe(1);
    expect(ctx.defaultBookId).toBe("book-1");
    expect(ctx.source).toBe("header");
  });

  it("respects India fyStart=4 + Sunday-start", async () => {
    const deps = stubDeps({
      companyProfiles: new Map([[
        "cc-india",
        { timezone_code: "Asia/Kolkata", week_start: 0, fiscal_year_start_month: 4, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map(),
    });
    const ctx = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "cc-india" }), deps);
    expect(ctx.fiscalYearStartMonth).toBe(4);
    expect(ctx.weekStart).toBe(0);
    expect(ctx.timeZone).toBe("Asia/Kolkata");
  });

  it("falls back to defaults when header row is missing", async () => {
    const deps = stubDeps({
      companyProfiles: new Map(),  // header points to non-existent row
      principalDefaults: new Map(),
    });
    const ctx = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "missing" }), deps);
    expect(ctx.source).toBe("calendar_default");
    expect(ctx.companyCodeId).toBeNull();
  });
});

describe("resolveActiveFiscalContext — session_default fallback", () => {
  it("uses principal_ui_profile.default_company_code_id when header is absent", async () => {
    capturedPrincipalId.value = "principal-a";
    const deps = stubDeps({
      companyProfiles: new Map([[
        "cc-default",
        { timezone_code: "Europe/Berlin", week_start: 1, fiscal_year_start_month: 1, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map([["principal-a", "cc-default"]]),
    }, { principalId: "principal-a" });

    const ctx = await resolveActiveFiscalContext(fakeReq(), deps);
    expect(ctx.source).toBe("session_default");
    expect(ctx.companyCodeId).toBe("cc-default");
    expect(ctx.timeZone).toBe("Europe/Berlin");
  });

  it("falls back to calendar defaults when principal has no default set", async () => {
    capturedPrincipalId.value = "principal-none";
    const deps = stubDeps({
      companyProfiles: new Map(),
      principalDefaults: new Map(),  // no default for this principal
    }, { principalId: "principal-none" });

    const ctx = await resolveActiveFiscalContext(fakeReq(), deps);
    expect(ctx.source).toBe("calendar_default");
    expect(ctx.timeZone).toBe("UTC");
    expect(ctx.weekStart).toBe(1);
    expect(ctx.fiscalYearStartMonth).toBe(1);
  });
});

describe("resolveActiveFiscalContext — no context at all", () => {
  it("returns calendar defaults when neither header nor principalId is set", async () => {
    const deps = stubDeps({ companyProfiles: new Map(), principalDefaults: new Map() });
    const ctx = await resolveActiveFiscalContext(fakeReq(), deps);
    expect(ctx).toBe(CALENDAR_DEFAULT_CONTEXT); // strict-equal — same frozen singleton
  });
});

describe("resolveActiveFiscalContext — caching", () => {
  it("per-request WeakMap: two calls on the same req hit the memo (single SQL)", async () => {
    let profileLookups = 0;
    const deps = stubDeps({
      companyProfiles: new Map([[
        "cc-x",
        { timezone_code: "UTC", week_start: 1, fiscal_year_start_month: 1, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map(),
      onProfileLookup: () => { profileLookups += 1; },
    });
    const req = fakeReq({ "X-Company-Code-ID": "cc-x" });

    await resolveActiveFiscalContext(req, deps);
    await resolveActiveFiscalContext(req, deps);
    expect(profileLookups).toBe(1);
  });

  it("LRU: different req objects with same companyCodeId hit warm cache", async () => {
    let profileLookups = 0;
    const deps = stubDeps({
      companyProfiles: new Map([[
        "cc-y",
        { timezone_code: "UTC", week_start: 1, fiscal_year_start_month: 1, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map(),
      onProfileLookup: () => { profileLookups += 1; },
    });

    await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "cc-y" }), deps);
    await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "cc-y" }), deps);
    // Both requests share the LRU entry — only one SQL round-trip.
    expect(profileLookups).toBe(1);
  });

  it("LRU is tenant-scoped — same companyCodeId under a different tenant re-queries", async () => {
    let profileLookups = 0;
    const deps1 = stubDeps({
      companyProfiles: new Map([[
        "cc-z",
        { timezone_code: "UTC", week_start: 1, fiscal_year_start_month: 1, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map(),
      onProfileLookup: () => { profileLookups += 1; },
    }, { tenantId: "tenant-a" });
    const deps2 = stubDeps({
      companyProfiles: new Map([[
        "cc-z",
        { timezone_code: "Asia/Tokyo", week_start: 0, fiscal_year_start_month: 4, default_ledger_book_id: null },
      ]]),
      principalDefaults: new Map(),
      onProfileLookup: () => { profileLookups += 1; },
    }, { tenantId: "tenant-b" });

    const ctx1 = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "cc-z" }), deps1);
    const ctx2 = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "cc-z" }), deps2);
    expect(ctx1.timeZone).toBe("UTC");
    expect(ctx2.timeZone).toBe("Asia/Tokyo");
    expect(profileLookups).toBe(2);
  });
});

describe("resolveActiveFiscalContext — header edge cases", () => {
  it("empty header string falls through to default", async () => {
    const deps = stubDeps({ companyProfiles: new Map(), principalDefaults: new Map() });
    const ctx = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "" }), deps);
    expect(ctx.source).toBe("calendar_default");
  });

  it("whitespace-only header falls through to default", async () => {
    const deps = stubDeps({ companyProfiles: new Map(), principalDefaults: new Map() });
    const ctx = await resolveActiveFiscalContext(fakeReq({ "X-Company-Code-ID": "   " }), deps);
    expect(ctx.source).toBe("calendar_default");
  });
});
