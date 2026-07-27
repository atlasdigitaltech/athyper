/**
 * Unit tests for budget-transaction.service (audit P0-S6 pure-logic slice).
 *
 * Covers the deterministic pieces that don't need a live DB:
 *   - computeColumnDelta(verb, amount) — the column-delta math underpins
 *     every running-total update; one wrong sign and budgets drift silently.
 *   - projectResulting / projectAvailable — the snapshots written into the
 *     ledger.budget_transaction.previous_state / resulting_state jsonb.
 *   - buildIdempotencyKey — stability under retry; if the digest input ever
 *     changes shape, replay safety breaks across deploys.
 *   - noMatchPolicy() — env-driven policy switch must default safely.
 *
 * Live-DB ladder tests (RESERVE→COMMIT→CONSUME→RELEASE, contention,
 * insufficient-budget, period-closed) live in
 * budget-lifecycle.integration.test.ts (gated on DATABASE_URL).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeColumnDelta,
  projectAvailable,
  projectResulting,
  buildIdempotencyKey,
  noMatchPolicy,
  type AllocationBalance,
} from "../ledger/budget-transaction.service.js";

const ZERO_BALANCE: AllocationBalance = {
  allocated: 0, reserved: 0, consumed: 0, released: 0, available: 0,
};

describe("computeColumnDelta — running-total updates per verb", () => {
  it("RESERVE adds to reserved_amount only (DEBIT semantics on available)", () => {
    const d = computeColumnDelta("reserve", 100);
    expect(d).toEqual({ kind: "reserve", reservedDelta: 100, consumedDelta: 0, releasedDelta: 0 });
  });

  it("COMMIT is balance-neutral (audit-only; reservation already counted)", () => {
    const d = computeColumnDelta("commit", 100);
    expect(d).toEqual({ kind: "commit", reservedDelta: 0, consumedDelta: 0, releasedDelta: 0 });
  });

  it("CONSUME (PO-based: freesPriorReserve=true) frees prior reservation AND records spend", () => {
    const d = computeColumnDelta("consume", 100, { freesPriorReserve: true });
    expect(d).toEqual({ kind: "consume", reservedDelta: -100, consumedDelta: 100, releasedDelta: 0 });
  });

  it("CONSUME (NON_PO: freesPriorReserve=false, default) only records spend", () => {
    // NON_PO PIs have no prior RESERVE/COMMIT row; subtracting from
    // reserved_amount would push it negative and violate balloc_reserved_nonneg.
    const d = computeColumnDelta("consume", 100);
    expect(d).toEqual({ kind: "consume", reservedDelta: 0, consumedDelta: 100, releasedDelta: 0 });
  });

  it("RELEASE frees reserved_amount (CREDIT restores available)", () => {
    const d = computeColumnDelta("release", 100);
    expect(d).toEqual({ kind: "release", reservedDelta: -100, consumedDelta: 0, releasedDelta: 0 });
  });
});

describe("projectResulting — state snapshots for the budget_transaction jsonb", () => {
  const base: AllocationBalance = {
    allocated: 1000, reserved: 200, consumed: 300, released: 50, available: 550,
  };

  it("RESERVE +100 → reserved 200→300, available 550→450", () => {
    const after = projectResulting(base, computeColumnDelta("reserve", 100));
    expect(after.reserved).toBe(300);
    expect(after.consumed).toBe(300);
    expect(after.released).toBe(50);
    expect(after.available).toBe(1000 - 300 - 300 + 50);
  });

  it("COMMIT +100 → snapshot unchanged (audit-only)", () => {
    const after = projectResulting(base, computeColumnDelta("commit", 100));
    expect(after).toEqual(base);
  });

  it("CONSUME PO-based +100 → reserved 200→100, consumed 300→400, available unchanged net", () => {
    const after = projectResulting(base, computeColumnDelta("consume", 100, { freesPriorReserve: true }));
    expect(after.reserved).toBe(100);
    expect(after.consumed).toBe(400);
    expect(after.available).toBe(1000 - 100 - 400 + 50);
    // Net effect on available: zero (-100 reserved + 100 consumed cancels)
    expect(after.available - base.available).toBe(0);
  });

  it("CONSUME NON_PO +100 → reserved unchanged, consumed 300→400, available -100", () => {
    const after = projectResulting(base, computeColumnDelta("consume", 100));
    expect(after.reserved).toBe(200);  // unchanged
    expect(after.consumed).toBe(400);
    expect(after.available - base.available).toBe(-100);
  });

  it("RELEASE +100 → reserved 200→100, available 550→650", () => {
    const after = projectResulting(base, computeColumnDelta("release", 100));
    expect(after.reserved).toBe(100);
    expect(after.available).toBe(1000 - 100 - 300 + 50);
  });

  it("does not mutate the input balance", () => {
    const snapshot = { ...base };
    projectResulting(base, computeColumnDelta("reserve", 100));
    expect(base).toEqual(snapshot);
  });
});

describe("projectAvailable — overspend guard projection", () => {
  it("flags insufficient when RESERVE pushes available negative", () => {
    const balance: AllocationBalance = {
      allocated: 100, reserved: 80, consumed: 0, released: 0, available: 20,
    };
    const projected = projectAvailable(balance, computeColumnDelta("reserve", 30));
    expect(projected).toBeLessThan(0);
    expect(projected).toBe(-10);
  });

  it("flags insufficient when NON_PO CONSUME pushes available negative", () => {
    const balance: AllocationBalance = {
      allocated: 100, reserved: 0, consumed: 80, released: 0, available: 20,
    };
    const projected = projectAvailable(balance, computeColumnDelta("consume", 30));
    expect(projected).toBe(-10);
  });

  it("zero from empty allocation + zero amount is a no-op", () => {
    expect(projectAvailable(ZERO_BALANCE, computeColumnDelta("reserve", 0))).toBe(0);
  });
});

describe("buildIdempotencyKey — replay-safe digest", () => {
  it("is deterministic for the same (token, verb, allocation)", () => {
    const a = buildIdempotencyKey("token-a", "reserve", "alloc-1");
    const b = buildIdempotencyKey("token-a", "reserve", "alloc-1");
    expect(a).toBe(b);
  });

  it("differs across verbs even with the same token+allocation", () => {
    const r = buildIdempotencyKey("token-a", "reserve", "alloc-1");
    const c = buildIdempotencyKey("token-a", "consume", "alloc-1");
    expect(r).not.toBe(c);
  });

  it("differs across allocations even with the same token+verb", () => {
    const a = buildIdempotencyKey("token-a", "reserve", "alloc-1");
    const b = buildIdempotencyKey("token-a", "reserve", "alloc-2");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char lowercase hex string (sha-256)", () => {
    const key = buildIdempotencyKey("t", "reserve", "a");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("noMatchPolicy — env-driven policy switch", () => {
  // Snapshot env vars and restore after each test so we don't leak state.
  let prevPolicy: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevPolicy  = process.env["BUDGET_NO_MATCH_POLICY"];
    prevNodeEnv = process.env["NODE_ENV"];
    delete process.env["BUDGET_NO_MATCH_POLICY"];
    delete process.env["NODE_ENV"];
  });

  afterEach(() => {
    if (prevPolicy  === undefined) delete process.env["BUDGET_NO_MATCH_POLICY"];
    else process.env["BUDGET_NO_MATCH_POLICY"] = prevPolicy;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
  });

  it("explicit hard_fail wins over NODE_ENV", () => {
    process.env["BUDGET_NO_MATCH_POLICY"] = "hard_fail";
    process.env["NODE_ENV"] = "development";
    expect(noMatchPolicy()).toBe("hard_fail");
  });

  it("explicit warn_continue wins over NODE_ENV=production", () => {
    process.env["BUDGET_NO_MATCH_POLICY"] = "warn_continue";
    process.env["NODE_ENV"] = "production";
    expect(noMatchPolicy()).toBe("warn_continue");
  });

  it("defaults to hard_fail when NODE_ENV=production and no override set", () => {
    process.env["NODE_ENV"] = "production";
    expect(noMatchPolicy()).toBe("hard_fail");
  });

  it("defaults to warn_continue in non-production environments", () => {
    process.env["NODE_ENV"] = "development";
    expect(noMatchPolicy()).toBe("warn_continue");
  });

  it("ignores unknown policy values and falls back to NODE_ENV default", () => {
    process.env["BUDGET_NO_MATCH_POLICY"] = "yolo";
    process.env["NODE_ENV"] = "production";
    expect(noMatchPolicy()).toBe("hard_fail");
  });
});
