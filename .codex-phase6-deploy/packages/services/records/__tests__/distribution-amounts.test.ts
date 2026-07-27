import { describe, expect, it } from "vitest";
import { computeDistributionDocumentAmount, readDistributionBasis } from "../distribution-amounts.js";

describe("accounting distribution amount derivation", () => {
  it("derives document amount from percent splits", () => {
    const payload = { distribution_basis: "PERCENT", split_pct: 37.5, distributed_amount: 999999 };
    expect(computeDistributionDocumentAmount(
      payload,
      { lineAmount: 200, lineQuantity: 10 },
    )).toBe(75);
  });

  it("derives document amount from amount splits", () => {
    expect(computeDistributionDocumentAmount(
      { distribution_basis: "AMOUNT", split_amount: "123.45678" },
      { lineAmount: 200, lineQuantity: 10 },
    )).toBe(123.4568);
  });

  it("derives document amount from quantity splits", () => {
    expect(computeDistributionDocumentAmount(
      { distribution_basis: "QUANTITY", split_quantity: 3 },
      { lineAmount: 250, lineQuantity: 10 },
    )).toBe(75);
  });

  it("defaults unknown bases to percent", () => {
    expect(readDistributionBasis("client_supplied")).toBe("PERCENT");
  });
});
