/**
 * field-security maskRecord — unit tests focused on the Phase 4 contract
 * extension: when a FK is masked, its enricher-produced label/code
 * companion keys must be stripped, otherwise the masked identity leaks
 * through the human-readable name attached by the runtime reference-
 * label enricher.
 */

import { describe, expect, it } from "vitest";
import {
  maskRecord,
  stripReferenceCompanionKeys,
  type FieldPolicy,
} from "../field-security.middleware.js";

function policy(
  overrides: Partial<FieldPolicy> & Pick<FieldPolicy, "fieldName">,
): FieldPolicy {
  return {
    columnName:        overrides.fieldName,
    maskingStrategy:   "full",
    accessRoles:       [],
    piiClassification: "pii",
    ...overrides,
  };
}

describe("stripReferenceCompanionKeys", () => {
  it("removes both _id_label / base_label and _id_code / base_code shapes", () => {
    const row = {
      gl_account_id:        "uuid-x",
      gl_account_id_label:  "HR & Payroll",
      gl_account_label:     "HR & Payroll",
      gl_account_id_code:   "5100",
      gl_account_code:      "5100",
      amount:               100,
    };
    stripReferenceCompanionKeys(row, "gl_account_id");
    expect(row).toEqual({ gl_account_id: "uuid-x", amount: 100 });
  });

  it("is a no-op for non-reference fields (no companions exist)", () => {
    const row = { phone: "+1 555 5555", description: "x" };
    stripReferenceCompanionKeys(row, "phone");
    expect(row).toEqual({ phone: "+1 555 5555", description: "x" });
  });

  it("handles fields without _id suffix (no base-name strip)", () => {
    const row = { approver: "uuid-y", approver_label: "Jane", approver_code: "JN" };
    stripReferenceCompanionKeys(row, "approver");
    expect(row).toEqual({ approver: "uuid-y" });
  });
});

describe("maskRecord — masked FK strips companion label/code", () => {
  it("nulls the FK AND deletes label/code companions when role lacks access", () => {
    const row: Record<string, unknown> = {
      gl_account_id:       "019f0ad1-932a-7321-8833-56fec7b61f25",
      gl_account_id_label: "HR & Payroll",
      gl_account_label:    "HR & Payroll",
      gl_account_id_code:  "5100",
      gl_account_code:     "5100",
      amount:              780,
    };
    maskRecord(
      row,
      [policy({ fieldName: "gl_account_id" })],
      new Set(["viewer"]), // not in accessRoles → masked
    );
    expect(row["gl_account_id"]).toBeNull();
    expect(row).not.toHaveProperty("gl_account_id_label");
    expect(row).not.toHaveProperty("gl_account_label");
    expect(row).not.toHaveProperty("gl_account_id_code");
    expect(row).not.toHaveProperty("gl_account_code");
    expect(row["amount"]).toBe(780); // unrelated field untouched
  });

  it("leaves companions intact when the principal has access", () => {
    const row: Record<string, unknown> = {
      gl_account_id:       "uuid-x",
      gl_account_label:    "HR & Payroll",
      gl_account_id_label: "HR & Payroll",
    };
    maskRecord(
      row,
      [policy({ fieldName: "gl_account_id", accessRoles: ["finance_admin"] })],
      new Set(["finance_admin"]),
    );
    expect(row["gl_account_id"]).toBe("uuid-x");
    expect(row["gl_account_label"]).toBe("HR & Payroll");
    expect(row["gl_account_id_label"]).toBe("HR & Payroll");
  });

  it("partial-strategy mask still strips companions to avoid name leak", () => {
    const row: Record<string, unknown> = {
      ssn:        "111-22-3333",
      // ssn isn't a FK, but if a downstream enricher ever attached a
      // label, partial masking should still hide the human-readable form.
      ssn_label:  "Personal SSN",
    };
    maskRecord(
      row,
      [policy({ fieldName: "ssn", maskingStrategy: "partial" })],
      new Set(["viewer"]),
    );
    expect(row["ssn"]).toBe("****3333");
    expect(row).not.toHaveProperty("ssn_label");
  });

  it("strips companions for column_name variant when it differs from fieldName", () => {
    const row: Record<string, unknown> = {
      gl_account_id:        "uuid-x",
      gl_acct_id:           "uuid-x", // hypothetical legacy column name
      gl_acct_id_label:     "HR & Payroll",
      gl_acct_label:        "HR & Payroll",
    };
    maskRecord(
      row,
      [policy({ fieldName: "gl_account_id", columnName: "gl_acct_id" })],
      new Set(["viewer"]),
    );
    expect(row["gl_account_id"]).toBeNull();
    expect(row["gl_acct_id"]).toBeNull();
    expect(row).not.toHaveProperty("gl_acct_id_label");
    expect(row).not.toHaveProperty("gl_acct_label");
  });

  it("no-op for unrelated entity fields (mask only what policy targets)", () => {
    const row: Record<string, unknown> = {
      gl_account_id:    "uuid-gl",
      gl_account_label: "HR & Payroll",
      cost_center_id:   "uuid-cc",
      cost_center_label: "MarketingOps",
    };
    maskRecord(
      row,
      [policy({ fieldName: "gl_account_id" })],
      new Set(["viewer"]),
    );
    // gl_account masked + companion stripped
    expect(row["gl_account_id"]).toBeNull();
    expect(row).not.toHaveProperty("gl_account_label");
    // cost_center untouched
    expect(row["cost_center_id"]).toBe("uuid-cc");
    expect(row["cost_center_label"]).toBe("MarketingOps");
  });
});
