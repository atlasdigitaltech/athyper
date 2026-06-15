import { describe, expect, it } from "vitest";

import {
  META_ENTITY_RUNTIME_CONTRACT_VERSION,
  MetaEntityOperationSchema,
  MetaEntityRuntimeDescriptorSchema,
  type MetaEntityOperation,
} from "../index";

const MINIMAL_OP: MetaEntityOperation = {
  key: "READ",
  permissionCode: "doc.read",
  surface: "DETAIL",
  placement: "PRIMARY",
  handlerType: "API",
  isRecordRequired: true,
  order: 0,
  enabled: true,
};

describe("META_ENTITY_RUNTIME_CONTRACT_VERSION", () => {
  it("is bumped to v1.1", () => {
    expect(META_ENTITY_RUNTIME_CONTRACT_VERSION).toBe("meta-entity-runtime/v1.1");
  });
});

describe("MetaEntityOperationSchema — backward compatibility", () => {
  it("accepts an op with no interaction fields (v1 shape)", () => {
    const result = MetaEntityOperationSchema.safeParse(MINIMAL_OP);
    expect(result.success).toBe(true);
  });
});

describe("MetaEntityOperationSchema — Rule 1: interactionSurfaceKind requires MODAL (one-way)", () => {
  it("accepts handlerType=MODAL without interactionSurfaceKind (legacy modal op)", () => {
    // Pre-Phase-1 ops use handlerType=MODAL for confirmation dialogs without
    // ever declaring a surface kind. Backward compatibility requires this
    // to stay valid — the runtime renders default modal chrome.
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      key: "DELETE",
      handlerType: "MODAL",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-MODAL handlerType when interactionSurfaceKind is set", () => {
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      handlerType: "NAVIGATE",
      interactionSurfaceKind: "drawer-form",
      interactionOptions: { contentAdapter: "x" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("interactionSurfaceKind requires handlerType=MODAL"),
        ),
      ).toBe(true);
    }
  });

  it("accepts handlerType=MODAL + drawer-form + contentAdapter", () => {
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      key: "ADD_LINE",
      handlerType: "MODAL",
      interactionSurfaceKind: "drawer-form",
      interactionOptions: {
        width: "wide",
        contentAdapter: "line-item-composer",
        addContract: {
          semantics: "batch_append",
          commitMode: "stage_then_parent_save",
          targetRelation: "lines",
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("MetaEntityOperationSchema — Rule 2: interactionOptions requires kind", () => {
  it("rejects interactionOptions without interactionSurfaceKind", () => {
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      handlerType: "API",
      interactionOptions: { width: "wide" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("interactionOptions requires interactionSurfaceKind"),
        ),
      ).toBe(true);
    }
  });
});

describe("MetaEntityOperationSchema — shape rule delegation (Rules 3-9)", () => {
  it("rejects dialog-confirm without consequence via shared shape validator", () => {
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      key: "DISCARD",
      handlerType: "MODAL",
      interactionSurfaceKind: "dialog-confirm",
      interactionOptions: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("dialog-confirm requires interactionOptions.consequence")),
      ).toBe(true);
    }
  });

  it("rejects expandRoute alongside addContract", () => {
    const result = MetaEntityOperationSchema.safeParse({
      ...MINIMAL_OP,
      key: "ADD_LINE",
      handlerType: "MODAL",
      interactionSurfaceKind: "drawer-form",
      interactionOptions: {
        contentAdapter: "line-item-composer",
        expandRoute: "/line/[id]",
        addContract: {
          semantics: "batch_append",
          commitMode: "stage_then_parent_save",
          targetRelation: "lines",
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("expandRoute forbidden when addContract is declared")),
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Descriptor-level FK validator (targetRelation in relations[] with
// kind ∈ {has_many, m2m}).
// ─────────────────────────────────────────────────────────────────

function buildDescriptor(overrides: {
  operations: MetaEntityOperation[];
  relations: Array<{
    key: string;
    name: string;
    kind: "belongs_to" | "has_many" | "m2m";
    targetEntity: string;
    targetKey?: string;
    uiBehavior?: Record<string, unknown>;
  }>;
}) {
  return {
    contractVersion: META_ENTITY_RUNTIME_CONTRACT_VERSION,
    entityCode: "purchase_invoice",
    entityName: "Purchase Invoice",
    routeSlug: "purchase-invoice",
    renderer: "document" as const,
    capabilities: {
      canRead: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      hasLineItems: true,
      hasChildRecords: false,
      hasDistributions: false,
      hasAttachments: false,
      hasComments: false,
      hasWorkflow: false,
      hasLifecycle: false,
      hasVersions: false,
      hasCompare: false,
      hasActivityLog: false,
      hasAuditTrail: false,
      hasAuditSummary: false,
      hasImport: false,
      hasBulk: false,
      isReadOnly: false,
    },
    surfaces: [],
    fields: [],
    fieldGroups: [],
    operations: overrides.operations,
    relations: overrides.relations.map((r) => ({
      key: r.key,
      name: r.name,
      kind: r.kind,
      targetEntity: r.targetEntity,
      targetKey: r.targetKey ?? "id",
      uiBehavior: r.uiBehavior ?? {},
    })),
    source: {
      tableSchema: "document",
      tableName: "purchase_invoice",
      backingType: "table" as const,
      entityClass: "DOCUMENT",
      ownershipModel: "system",
    },
    policy: { hasFieldSecurity: false },
    lifecycleStateMasks: [],
    audit: {
      compiledAt: "2026-06-12T00:00:00.000Z",
      compiledHash: "test-hash",
    },
  };
}

const ADD_LINE_OP: MetaEntityOperation = {
  key: "ADD_LINE",
  permissionCode: "purchase_invoice.add_line",
  surface: "DETAIL",
  placement: "PRIMARY",
  handlerType: "MODAL",
  isRecordRequired: true,
  order: 10,
  enabled: true,
  interactionSurfaceKind: "drawer-form",
  interactionOptions: {
    contentAdapter: "line-item-composer",
    addContract: {
      semantics: "batch_append",
      commitMode: "stage_then_parent_save",
      parentDirtyEffect: "mark_parent_dirty",
      subPickPolicy: "inline_first",
      targetRelation: "lines",
    },
  },
};

describe("MetaEntityRuntimeDescriptorSchema — Rule 10: targetRelation FK", () => {
  it("accepts addContract.targetRelation pointing at a has_many relation", () => {
    const desc = buildDescriptor({
      operations: [ADD_LINE_OP],
      relations: [
        {
          key: "lines",
          name: "lines",
          kind: "has_many",
          targetEntity: "purchase_invoice_line",
        },
      ],
    });
    const result = MetaEntityRuntimeDescriptorSchema.safeParse(desc);
    expect(result.success).toBe(true);
  });

  it("accepts addContract.targetRelation pointing at an m2m relation", () => {
    const desc = buildDescriptor({
      operations: [ADD_LINE_OP],
      relations: [
        {
          key: "lines",
          name: "lines",
          kind: "m2m",
          targetEntity: "purchase_invoice_line",
        },
      ],
    });
    const result = MetaEntityRuntimeDescriptorSchema.safeParse(desc);
    expect(result.success).toBe(true);
  });

  it("rejects addContract.targetRelation when relation is not declared", () => {
    const desc = buildDescriptor({
      operations: [ADD_LINE_OP],
      relations: [],
    });
    const result = MetaEntityRuntimeDescriptorSchema.safeParse(desc);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes('targetRelation "lines" is not declared in relations[]'),
        ),
      ).toBe(true);
    }
  });

  it("rejects addContract.targetRelation when relation is belongs_to", () => {
    const desc = buildDescriptor({
      operations: [ADD_LINE_OP],
      relations: [
        {
          key: "lines",
          name: "parent",
          kind: "belongs_to",
          targetEntity: "purchase_order",
        },
      ],
    });
    const result = MetaEntityRuntimeDescriptorSchema.safeParse(desc);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes('targetRelation "lines" is belongs_to; add ops require has_many or m2m'),
        ),
      ).toBe(true);
    }
  });
});
