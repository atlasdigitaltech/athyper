import { describe, expect, it } from "vitest";

import type { EntityCapabilityManifest } from "@athyper/api-contracts/metadata";
import { AggregateChangeSetSchema } from "@athyper/api-contracts/document-edit-submit";

import {
  AggregateCollectionPlanError,
  compileAggregateCollectionExecutionPlan,
} from "../mutation/aggregate-collection-executor.js";

function manifest(): EntityCapabilityManifest {
  return {
    entityCode: "purchase_invoice",
    renderer: "document",
    mutation: {
      create: { enabled: false, kind: "disabled" },
      update: { enabled: false, kind: "disabled" },
      delete: { enabled: false, kind: "disabled" },
      aggregate: { enabled: true, kind: "workspace", handler: "DocumentWorkspaceAggregateHandler" },
    },
    deletionMode: "lifecycle_only",
    collections: [{
      name: "lines",
      targetEntity: "purchase_invoice_line",
      ownership: "foreign_key",
      foreignKey: "purchase_invoice_id",
      mutationOwner: "workspace",
      versionStrategy: "parent_version",
      allowedActions: { create: true, update: true, delete: true, replace: false },
    }],
    handlers: {},
    write: { entityVersionId: "v1", fields: [] },
  };
}

describe("aggregate collection execution plan", () => {
  it("accepts the canonical header patch and collection update contract", () => {
    expect(AggregateChangeSetSchema.parse({
      header: { patch: { supplier_id: "s1" } },
      collections: {
        lines: { update: [{ id: "line-1", patch: { quantity: 2 } }] },
        distributions: { replace: [{ account_id: "a1", percentage: 100 }] },
      },
    })).toMatchObject({ header: { patch: { supplier_id: "s1" } } });
  });

  it("orders sibling mutations deterministically inside one aggregate plan", () => {
    const steps = compileAggregateCollectionExecutionPlan(manifest(), {
      header: { patch: { supplier_id: "s1" } },
      collections: {
        lines: {
          create: [{ quantity: 1 }],
          update: [{ id: "line-1", patch: { quantity: 2 } }],
          delete: ["line-2"],
        },
      },
    });
    expect(steps.map((step) => step.operation)).toEqual(["delete", "update", "create"]);
    expect(steps.every((step) => step.foreignKey === "purchase_invoice_id")).toBe(true);
  });

  it("rejects undeclared collections and disallowed replace before persistence", () => {
    expect(() => compileAggregateCollectionExecutionPlan(manifest(), {
      header: { patch: {} },
      collections: { distributions: { create: [{}] } },
    })).toThrowError(AggregateCollectionPlanError);
    expect(() => compileAggregateCollectionExecutionPlan(manifest(), {
      header: { patch: {} },
      collections: { lines: { replace: [{}] } },
    })).toThrow(/does not allow 'replace'/);
  });
});
