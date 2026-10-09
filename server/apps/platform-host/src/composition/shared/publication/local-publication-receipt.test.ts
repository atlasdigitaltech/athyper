import { expect, it } from "vitest";
import { validateLocalTransitionReceipt } from "./local-publication-receipt.js";
const receipt = {
  basis: "local_development_authority" as const,
  requestHash: "exact-request",
  revision: 3,
  status: "approved" as const,
  replayed: true,
};
it.each(["submit", "review"] as const)(
  "accepts renewed approval replay during %s without an extra revision",
  (phase) => {
    expect(
      validateLocalTransitionReceipt(
        [{ receipt }],
        receipt.requestHash,
        3,
        phase,
      ),
    ).toEqual(receipt);
  },
);
it.each([
  { revision: 2 },
  { replayed: false },
  { requestHash: "other" },
  { status: "in_review" },
  { revision: 3.5 },
])("rejects invalid renewal receipt %j", (change) => {
  expect(() =>
    validateLocalTransitionReceipt(
      [{ receipt: { ...receipt, ...change } as typeof receipt }],
      receipt.requestHash,
      3,
      "review",
    ),
  ).toThrow("TRANSITION_RECEIPT_INVALID");
});
it("accepts a new transition only after revision advance", () => {
  expect(
    validateLocalTransitionReceipt(
      [{ receipt: { ...receipt, revision: 4, replayed: false } }],
      receipt.requestHash,
      3,
      "review",
    ).revision,
  ).toBe(4);
});
