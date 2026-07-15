import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Request } from "express";
import { resolvePeriodRange } from "../period-range";

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface Row {
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  period_type?: string;
}

interface DbBehaviour {
  periods: Row[];
  companyCodeId: string;
  tenantId: string;
  onLookup?: () => void;
}

let currentBehaviour: DbBehaviour | null = null;

// Mock kysely's `sql` template tag so tests don't need a real database.
// The resolver runs two shapes of query:
//   1. SELECT ... WHERE start_date <= today AND end_date >= today   (current period)
//   2. SELECT ... WHERE (fiscal_year, period_number) < (?, ?)       (previous period)
// We differentiate by scanning the values array.
vi.mock("kysely", async () => {
  const actual = await vi.importActual<typeof import("kysely")>("kysely");
  return {
    ...actual,
    sql: Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => ({
        execute: async () => {
          currentBehaviour?.onLookup?.();
          if (!currentBehaviour) return { rows: [] };
          const b = currentBehaviour;
          const joined = strings.join(" ");
          // Filter to normal-type periods (excludes adjustments)
          const normal = b.periods.filter((p) => (p.period_type ?? "normal") === "normal");

          if (joined.includes("(fiscal_year, period_number) <")) {
            // "previous period" query — values order: tenantId, companyCodeId, fy, period
            const fy = Number(_values[2]);
            const period = Number(_values[3]);
            const prior = normal
              .filter((p) =>
                p.fiscal_year < fy || (p.fiscal_year === fy && p.period_number < period),
              )
              .sort((a, z) =>
                z.fiscal_year !== a.fiscal_year
                  ? z.fiscal_year - a.fiscal_year
                  : z.period_number - a.period_number,
              );
            return { rows: prior[0] ? [prior[0]] : [] };
          }

          // "current period" query — values order: tenantId, companyCodeId, today, today
          const today = String(_values[2]);
          const containing = normal
            .filter((p) => p.start_date <= today && today <= p.end_date)
            .sort((a, z) =>
              z.fiscal_year !== a.fiscal_year
                ? z.fiscal_year - a.fiscal_year
                : z.period_number - a.period_number,
            );
          return { rows: containing[0] ? [containing[0]] : [] };
        },
      }),
    ),
  };
});

function fakeReq(): Request {
  return { headers: {} } as unknown as Request;
}

// ─── Common fixture: 12 monthly calendar-year periods ────────────────────────

const CAL_2026_MONTHLY: Row[] = [
  { fiscal_year: 2026, period_number: 1,  start_date: "2026-01-01", end_date: "2026-01-31" },
  { fiscal_year: 2026, period_number: 2,  start_date: "2026-02-01", end_date: "2026-02-28" },
  { fiscal_year: 2026, period_number: 3,  start_date: "2026-03-01", end_date: "2026-03-31" },
  { fiscal_year: 2026, period_number: 4,  start_date: "2026-04-01", end_date: "2026-04-30" },
  { fiscal_year: 2026, period_number: 5,  start_date: "2026-05-01", end_date: "2026-05-31" },
  { fiscal_year: 2026, period_number: 6,  start_date: "2026-06-01", end_date: "2026-06-30" },
  { fiscal_year: 2026, period_number: 7,  start_date: "2026-07-01", end_date: "2026-07-31" },
  { fiscal_year: 2026, period_number: 8,  start_date: "2026-08-01", end_date: "2026-08-31" },
  { fiscal_year: 2026, period_number: 9,  start_date: "2026-09-01", end_date: "2026-09-30" },
  { fiscal_year: 2026, period_number: 10, start_date: "2026-10-01", end_date: "2026-10-31" },
  { fiscal_year: 2026, period_number: 11, start_date: "2026-11-01", end_date: "2026-11-30" },
  { fiscal_year: 2026, period_number: 12, start_date: "2026-12-01", end_date: "2026-12-31" },
];

const INDIA_FY: Row[] = [
  { fiscal_year: 2025, period_number: 10, start_date: "2026-01-01", end_date: "2026-01-31" },
  { fiscal_year: 2025, period_number: 11, start_date: "2026-02-01", end_date: "2026-02-28" },
  { fiscal_year: 2025, period_number: 12, start_date: "2026-03-01", end_date: "2026-03-31" },
  { fiscal_year: 2026, period_number: 1,  start_date: "2026-04-01", end_date: "2026-04-30" },
  { fiscal_year: 2026, period_number: 2,  start_date: "2026-05-01", end_date: "2026-05-31" },
  { fiscal_year: 2026, period_number: 3,  start_date: "2026-06-01", end_date: "2026-06-30" },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  currentBehaviour = null;
});

describe("resolvePeriodRange — this_period", () => {
  it("returns the period containing today", async () => {
    currentBehaviour = {
      periods: CAL_2026_MONTHLY,
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
    };
    const range = await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-a",
      today: "2026-06-15",
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("returns null when today falls outside any seeded period", async () => {
    currentBehaviour = { periods: CAL_2026_MONTHLY, companyCodeId: "cc-a", tenantId: "tenant-a" };
    const range = await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-a",
      today: "2027-05-01",
    });
    expect(range).toBeNull();
  });

  it("respects India-style FY periods (Apr-Mar)", async () => {
    currentBehaviour = { periods: INDIA_FY, companyCodeId: "cc-india", tenantId: "tenant-a" };
    // 2026-06-15 → FY 2026 period 3
    const range = await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-india",
      today: "2026-06-15",
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("excludes adjustment periods (period_type != 'normal')", async () => {
    currentBehaviour = {
      periods: [
        ...CAL_2026_MONTHLY,
        // Adjustment period spanning the entire year — must NOT be returned.
        { fiscal_year: 2026, period_number: 13, start_date: "2026-01-01", end_date: "2026-12-31", period_type: "adjustment" },
      ],
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
    };
    const range = await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-a",
      today: "2026-06-15",
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("resolvePeriodRange — last_period", () => {
  it("returns the period immediately before today's period", async () => {
    currentBehaviour = { periods: CAL_2026_MONTHLY, companyCodeId: "cc-a", tenantId: "tenant-a" };
    const range = await resolvePeriodRange(fakeReq(), "last_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-a",
      today: "2026-06-15",
    });
    expect(range).toEqual({ from: "2026-05-01", to: "2026-05-31" });
  });

  it("wraps to previous fiscal year at FY period 1", async () => {
    currentBehaviour = { periods: INDIA_FY, companyCodeId: "cc-india", tenantId: "tenant-a" };
    // Today = 2026-04-15 → FY 2026 period 1 → last = FY 2025 period 12 (Mar 2026)
    const range = await resolvePeriodRange(fakeReq(), "last_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-india",
      today: "2026-04-15",
    });
    expect(range).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("returns null when no prior period exists", async () => {
    currentBehaviour = {
      periods: [CAL_2026_MONTHLY[0]!], // only period 1
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
    };
    const range = await resolvePeriodRange(fakeReq(), "last_period", {
      db: {} as never,
      tenantId: "tenant-a",
      companyCodeId: "cc-a",
      today: "2026-01-15",
    });
    expect(range).toBeNull();
  });
});

describe("resolvePeriodRange — per-request cache", () => {
  it("two calls on same req + same (companyCodeId, today, key) → single query pair", async () => {
    let lookups = 0;
    currentBehaviour = {
      periods: CAL_2026_MONTHLY,
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
      onLookup: () => { lookups += 1; },
    };
    const req = fakeReq();
    const first = await resolvePeriodRange(req, "this_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    const second = await resolvePeriodRange(req, "this_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    expect(second).toEqual(first);
    expect(lookups).toBe(1); // second call served from cache
  });

  it("different requests do NOT share the cache", async () => {
    let lookups = 0;
    currentBehaviour = {
      periods: CAL_2026_MONTHLY,
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
      onLookup: () => { lookups += 1; },
    };
    await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    await resolvePeriodRange(fakeReq(), "this_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    expect(lookups).toBe(2);
  });

  it("this_period and last_period cache independently on the same request", async () => {
    let lookups = 0;
    currentBehaviour = {
      periods: CAL_2026_MONTHLY,
      companyCodeId: "cc-a",
      tenantId: "tenant-a",
      onLookup: () => { lookups += 1; },
    };
    const req = fakeReq();
    await resolvePeriodRange(req, "this_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    await resolvePeriodRange(req, "last_period", {
      db: {} as never, tenantId: "tenant-a", companyCodeId: "cc-a", today: "2026-06-15",
    });
    // this_period: 1 query. last_period: 2 queries (current + previous). Total: 3.
    expect(lookups).toBe(3);
  });
});
