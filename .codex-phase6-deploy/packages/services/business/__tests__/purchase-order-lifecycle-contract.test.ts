import { describe, expect, it } from "vitest";
import {
  PO_STATES,
  PURCHASE_ORDER_TRANSITIONS,
} from "../p2p/purchase_order/purchase-order-lifecycle.contract.js";

describe("Phase 0A purchase-order lifecycle contract", () => {
  it("has unique transition keys", () => {
    const keys = PURCHASE_ORDER_TRANSITIONS.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("references only declared concrete states", () => {
    const states = new Set<string>(PO_STATES);
    for (const row of PURCHASE_ORDER_TRANSITIONS) {
      expect(states.has(row.from), row.key).toBe(true);
      if (row.to !== "previous_executable_state" && row.to !== "derived_fulfillment_state") {
        expect(states.has(row.to), row.key).toBe(true);
      }
    }
  });

  it("declares every exit-gate artifact for every command", () => {
    for (const row of PURCHASE_ORDER_TRANSITIONS) {
      expect(row.permission, `${row.key}: permission`).not.toBe("");
      expect(row.handler, `${row.key}: handler`).not.toBe("");
      expect(row.validationPolicy, `${row.key}: validation`).not.toBe("");
      expect(row.businessEffect, `${row.key}: business effect`).not.toBe("");
      expect(row.activityEvent, `${row.key}: activity`).not.toBe("");
      expect(row.outboxEvent, `${row.key}: outbox`).not.toBe("");
      if (row.snapshot === "required") {
        expect(row.snapshotKind, `${row.key}: snapshot kind`).toBeTruthy();
      }
    }
  });

  it("preserves distinct return and withdraw commands on the shared rework edge", () => {
    const commands = PURCHASE_ORDER_TRANSITIONS.filter(
      (row) => row.from === "pending_approval" && row.to === "draft",
    );
    expect(commands.map((row) => row.command).sort()).toEqual(["return", "withdraw"]);
    expect(new Set(commands.map((row) => row.lifecycleOperation))).toEqual(new Set(["return"]));
    expect(new Set(commands.map((row) => row.outboxEvent)).size).toBe(2);
  });

  it("models hold release and fulfillment as derived transitions", () => {
    expect(PURCHASE_ORDER_TRANSITIONS).toContainEqual(
      expect.objectContaining({ key: "suspended.release", to: "previous_executable_state" }),
    );
    expect(PURCHASE_ORDER_TRANSITIONS.filter((row) => row.command === "record_fulfillment"))
      .toHaveLength(2);
  });
});
