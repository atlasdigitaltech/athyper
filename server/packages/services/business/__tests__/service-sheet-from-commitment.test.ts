/**
 * service-sheet-from-commitment.service — unit tests for input validation.
 *
 * Mirrors receipt-from-commitment.test.ts. The transaction body is covered
 * by integration tests that need a live DB.
 */

import { describe, it, expect } from "vitest";
import { createServiceSheetFromCommitment } from "../p2p/service_sheet/service-sheet-from-commitment.service.js";

const TENANT     = "00000000-0000-0000-0000-000000000001";
const PRINCIPAL  = "00000000-0000-0000-0000-000000000002";
const COMMITMENT = "00000000-0000-0000-0000-000000000003";
const COMPANY    = "00000000-0000-0000-0000-000000000004";
const CL_A       = "00000000-0000-0000-0000-0000000000aa";
const CL_B       = "00000000-0000-0000-0000-0000000000bb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb: any = {
  transaction() {
    return {
      execute() { throw new Error("transaction.execute reached during validation-only test"); },
    };
  },
};

function baseInput(overrides: Partial<Parameters<typeof createServiceSheetFromCommitment>[1]> = {}) {
  return {
    tenantId:           TENANT,
    principalId:        PRINCIPAL,
    commitmentId:       COMMITMENT,
    companyCodeId:      COMPANY,
    serviceSheetNumber: "SES-TEST-001",
    fiscalYear:         2026,
    periodNumber:       6,
    baseCurrencyCode:   "USD",
    servicePeriodFrom:  "2026-06-01",
    servicePeriodTo:    "2026-06-30",
    lineEntries:        [{ commitmentLineId: CL_A, quantity: 5 }],
    ...overrides,
  };
}

describe("createServiceSheetFromCommitment — input validation (no DB)", () => {
  it("rejects empty lineEntries with NO_LINE_ENTRIES", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({ lineEntries: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("NO_LINE_ENTRIES");
  });

  it("rejects missing servicePeriodFrom or servicePeriodTo with SERVICE_PERIOD_REQUIRED", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      servicePeriodFrom: "",
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.error).toBe("SERVICE_PERIOD_REQUIRED");
  });

  it("rejects inverted service period with SERVICE_PERIOD_INVERTED", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      servicePeriodFrom: "2026-06-30",
      servicePeriodTo:   "2026-06-01",
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(422);
    expect(out.error).toBe("SERVICE_PERIOD_INVERTED");
  });

  it("accepts equal start and end dates (one-day service period)", async () => {
    // Validates that input validation passes for a same-day period. The
    // service's outer try/catch then converts the stub's transaction throw
    // into a generic 500 SERVICE_SHEET_FROM_COMMITMENT_FAILED outcome —
    // we assert that, NOT a 422 SERVICE_PERIOD_INVERTED.
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      servicePeriodFrom: "2026-06-15",
      servicePeriodTo:   "2026-06-15",
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("SERVICE_SHEET_FROM_COMMITMENT_FAILED");
    expect(out.error).not.toBe("SERVICE_PERIOD_INVERTED");
  });

  it("rejects missing commitmentLineId with field error 'required'", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [{ commitmentLineId: "", quantity: 5 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(out.fieldErrors?.["lineEntries[0].commitmentLineId"]).toBe("required");
  });

  it("rejects duplicate commitmentLineId across line entries", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [
        { commitmentLineId: CL_A, quantity: 5 },
        { commitmentLineId: CL_A, quantity: 3 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineEntries[1].commitmentLineId"]).toBe("duplicate");
  });

  it("rejects quantity = 0 with 'must be greater than zero'", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [{ commitmentLineId: CL_A, quantity: 0 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineEntries[0].quantity"]).toBe("must be greater than zero");
  });

  it("rejects negative quantity", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [{ commitmentLineId: CL_A, quantity: -2 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineEntries[0].quantity"]).toBe("must be greater than zero");
  });

  it("rejects completionPct outside 0-100 range", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [{ commitmentLineId: CL_A, quantity: 5, completionPct: 150 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineEntries[0].completionPct"]).toBe("must be between 0 and 100");
  });

  it("rejects negative completionPct", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [{ commitmentLineId: CL_A, quantity: 5, completionPct: -10 }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.fieldErrors?.["lineEntries[0].completionPct"]).toBe("must be between 0 and 100");
  });

  it("accumulates multiple field errors in one response", async () => {
    const out = await createServiceSheetFromCommitment(stubDb, baseInput({
      lineEntries: [
        { commitmentLineId: "",   quantity: 0 },
        { commitmentLineId: CL_B, quantity: 5, completionPct: 200 },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("VALIDATION_FAILED");
    expect(Object.keys(out.fieldErrors ?? {})).toEqual(expect.arrayContaining([
      "lineEntries[0].commitmentLineId",
      "lineEntries[0].quantity",
      "lineEntries[1].completionPct",
    ]));
  });
});

// ── Integration tests (require live DB) ─────────────────────────────────────
const LIVE_DATABASE_URL = process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("createServiceSheetFromCommitment — integration (live DB)", () => {
  it.todo("happy path: header + line written atomically; service_sheet_number populated");
  it.todo("commitment not found → 404 COMMITMENT_NOT_FOUND");
  it.todo("commitment in draft/closed/cancelled → 422 COMMITMENT_NOT_TRANSACTABLE");
  it.todo("quantity > remaining_quantity → 422 QUANTITY_OVER_REMAINING with per-line errors");
  it.todo("commitment_line not under chosen commitment → 422 COMMITMENT_LINES_NOT_FOUND");
});
