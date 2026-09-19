import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customerDownstreamComplete,
  type CustomerDeliveryEvidence,
} from "../../business-partner-360/collect-customer-downstream-evidence.js";
const rows = (): CustomerDeliveryEvidence[] =>
  ["activate", "suspend", "reactivate", "deactivate", "archive"].map(
    (action, index) => ({
      action,
      lifecycleEventId: `event-${index}`,
      version: index + 2,
      desiredState: ["activate", "reactivate"].includes(action)
        ? "active"
        : "inactive",
      projectionReceiptId: `projection-${index}`,
      notificationReceiptId: `notification-${index}`,
      projectionStatus: "consumed",
      notificationStatus: "delivered",
      sagaAttemptIds: [`attempt-${index}`],
    }),
  );
test("Customer downstream requires all five observed action receipts", () => {
  assert.equal(customerDownstreamComplete(rows()), true);
  assert.equal(customerDownstreamComplete([]), false);
  assert.equal(customerDownstreamComplete(rows().slice(1)), false);
});
test("Publication, missing saga proof and missing delivery cannot qualify", () => {
  for (const change of [
    { projectionStatus: "published" },
    { sagaAttemptIds: [] },
    { notificationStatus: "pending" },
    { notificationReceiptId: null },
  ]) {
    const value = rows();
    Object.assign(value[0]!, change);
    assert.equal(customerDownstreamComplete(value), false);
  }
});
test("Duplicate, reordered, wrong-state and nonconsecutive receipts cannot qualify", () => {
  for (const change of [
    { lifecycleEventId: "event-1" },
    { action: "archive" },
    { desiredState: "inactive" },
    { version: 99 },
  ]) {
    const value = rows();
    Object.assign(value[0]!, change);
    assert.equal(customerDownstreamComplete(value), false);
  }
});
