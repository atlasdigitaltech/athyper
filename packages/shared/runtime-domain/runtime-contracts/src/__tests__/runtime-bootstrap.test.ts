import { describe, expect, it } from "vitest";

import {
  MetaEntityRecordOperationOverlayV1Schema,
  MetaEntityRuntimeBootstrapV1Schema,
} from "../runtime-bootstrap";

describe("runtime bootstrap contracts", () => {
  it("accepts one compiled bundle with shallow child hashes", () => {
    const parsed = MetaEntityRuntimeBootstrapV1Schema.parse({
      schemaVersion: 1,
      entityCode: "purchase_order",
      bootstrapHash: "hash",
      compiledEntity: { entity_code: "purchase_order" },
      operations: [],
      policy: null,
      lifecycleStateMasks: [],
      childProjections: [{
        relationName: "lines",
        entityCode: "purchase_order_line",
        descriptorHash: "line-hash",
        compiledEntity: { entity_code: "purchase_order_line" },
        operations: [],
        policy: null,
        lifecycleStateMasks: [],
      }],
    });
    expect(parsed.childProjections[0]?.descriptorHash).toBe("line-hash");
  });

  it("requires record identity for the small operation overlay", () => {
    expect(MetaEntityRecordOperationOverlayV1Schema.safeParse({
      schemaVersion: 1, entityCode: "purchase_order", recordId: "", operations: [],
    }).success).toBe(false);
  });
});
