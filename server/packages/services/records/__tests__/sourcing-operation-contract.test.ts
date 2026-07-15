import { describe, expect, it } from "vitest";
import {
  getEntityOp,
  listEntityOpsForEntity,
} from "../routes/entity-op.registry.js";

describe("procurement sourcing entity operations", () => {
  it("registers sourcing orchestration operations on the shared dispatcher", () => {
    const operations = [
      getEntityOp("sourcing_event", "create"),
      getEntityOp("sourcing_event", "aggregate_demand"),
      getEntityOp("sourcing_event_award", "allocate_award"),
      getEntityOp("sourcing_event_award", "convert_award"),
    ];

    expect(operations.every(Boolean)).toBe(true);
    expect(operations.map((operation) => operation?.workspaceScope.sourceDocument.entityCode)).toEqual([
      "operating_organization",
      "sourcing_event",
      "sourcing_event_award",
      "sourcing_event_award",
    ]);
  });

  it("does not make sourcing operations tenant-wide", () => {
    for (const operation of listEntityOpsForEntity("sourcing_event")) {
      expect(operation.workspaceScope.sourceDocument.required).toBe(true);
      expect(operation.workspaceScope.sourceDocument.acceptedIdPaths.length).toBeGreaterThan(0);
    }
  });

  it("registers federated and principal-seller sales operations", () => {
    const operations = [
      getEntityOp("sales_opportunity", "create"),
      getEntityOp("sales_quotation", "create"),
      getEntityOp("sales_quotation", "allocate"),
      getEntityOp("sales_quotation", "convert"),
    ];

    expect(operations.every(Boolean)).toBe(true);
    expect(operations.map((operation) => operation?.workspaceScope.targetEntityCode)).toEqual([
      "sales_opportunity",
      "sales_quotation",
      undefined,
      "sales_order",
    ]);
  });
});
