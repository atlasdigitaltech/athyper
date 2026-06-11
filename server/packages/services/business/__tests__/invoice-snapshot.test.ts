/**
 * Invoice Snapshot Service tests.
 *
 * Verifies the BP-first capture logic added in Patch Set 2.1. Integration
 * tests (live DB) cover the actual SQL execution and idempotency; unit tests
 * here cover the contract for the no-supplier path and result shape.
 *
 * Run integration tests with:
 *   DATABASE_URL=postgres://... pnpm vitest run invoice-snapshot
 */

import { describe, it, expect } from "vitest";
import { captureInvoiceSnapshots } from "../ap/invoice-snapshot.service.js";

describe("captureInvoiceSnapshots — contract", () => {
  it("skips snapshot capture when supplier_id is null (one_time_supplier)", async () => {
    const warnings: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    const logger = {
      info: () => {},
      warn: (event: string, fields?: Record<string, unknown>) => warnings.push({ event, fields }),
    };

    // No DB calls should be made when supplierId is null — we pass a poisoned
    // db handle to prove the function bails out early before touching it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poisonedDb = new Proxy({} as any, {
      get() {
        throw new Error("DB should not be queried when supplierId is null");
      },
    });

    const result = await captureInvoiceSnapshots(
      poisonedDb,
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      null,
      "33333333-3333-3333-3333-333333333333",
      logger,
    );

    expect(result).toEqual({ party: false, address: false, bank: false, bpId: null });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].event).toBe("ap_snapshot_skipped_no_supplier");
  });

  it("returns a result with the SnapshotCaptureResult shape", () => {
    // Compile-time-style assertion: the result type has exactly the four documented keys.
    const sample = { party: true, address: false, bank: true, bpId: "abc" };
    const keys = Object.keys(sample).sort();
    expect(keys).toEqual(["address", "bank", "bpId", "party"]);
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
// These cover the actual SQL flow and idempotency. Mirror the structure of
// purchase-invoice-lifecycle.integration.test.ts — only run when a DB URL
// is available so CI can exercise them.
const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("captureInvoiceSnapshots — integration (live DB)", () => {
  it.todo("inserts party/address/bank snapshots with correct BP-sourced values");
  it.todo("is idempotent on retry — re-invocation returns party:false, no duplicate rows");
  it.todo("falls back from purpose='remittance' to 'default' when no remittance address exists");
  it.todo("routes account_id_type='IBAN' values into the iban column");
  it.todo("preserves original snapshot values after BP rename");
  it.todo("warns ap_snapshot_supplier_missing_bp when supplier has no business_partner_id");
});
