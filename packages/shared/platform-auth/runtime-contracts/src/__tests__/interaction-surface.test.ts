import { describe, expect, it } from "vitest";

import {
  INTERACTION_SURFACE_CLASS,
  InteractionOptionsSchema,
  InteractionSurfaceKindSchema,
  MetaEntityOperationOverrideSchema,
  mergeOperationOverride,
  validateInteractionSurfaceShape,
  type MergeableBaseOperation,
  type MetaEntityOperationOverride,
} from "../interaction-surface";

const BASE_ADD_LINE: MergeableBaseOperation = {
  key: "ADD_LINE",
  label: "Add line",
  icon: "plus",
  placement: "PRIMARY",
  enabled: true,
  interactionSurfaceKind: "drawer-form",
  interactionOptions: {
    width: "wide",
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

const BASE_DISCARD: MergeableBaseOperation = {
  key: "DISCARD_CHANGES",
  label: "Discard",
  icon: "trash",
  placement: "OVERFLOW",
  enabled: true,
  interactionSurfaceKind: "dialog-confirm",
  interactionOptions: {
    consequence: "All unsaved changes on this document will be lost.",
  },
};

const BASE_VIEW_LINE: MergeableBaseOperation = {
  key: "VIEW_LINE",
  label: "View line",
  placement: "CONTEXT",
  enabled: true,
  interactionSurfaceKind: "drawer-peek",
  interactionOptions: {
    bindParent: true,
  },
};

describe("INTERACTION_SURFACE_CLASS", () => {
  it("covers every kind exactly once", () => {
    const allKinds = InteractionSurfaceKindSchema.options;
    for (const kind of allKinds) {
      expect(INTERACTION_SURFACE_CLASS[kind]).toBeDefined();
    }
  });

  it("groups peek + form under drawer class", () => {
    expect(INTERACTION_SURFACE_CLASS["drawer-form"]).toBe("drawer");
    expect(INTERACTION_SURFACE_CLASS["drawer-peek"]).toBe("drawer");
  });
});

describe("validateInteractionSurfaceShape", () => {
  it("accepts a well-formed drawer-form with addContract", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "drawer-form",
      options: BASE_ADD_LINE.interactionOptions,
    });
    expect(issues).toEqual([]);
  });

  it("rejects dialog-confirm without consequence", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "dialog-confirm",
      options: {},
    });
    expect(
      issues.some((i) =>
        i.message.includes("dialog-confirm requires interactionOptions.consequence"),
      ),
    ).toBe(true);
  });

  it("rejects consequence on non-dialog-confirm", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "drawer-form",
      options: { contentAdapter: "x", consequence: "boom" },
    });
    expect(issues.map((i) => i.message)).toContain("consequence is only valid on dialog-confirm");
  });

  it("rejects width on dialog-confirm", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "dialog-confirm",
      options: { consequence: "x", width: "grid" },
    });
    const widthIssue = issues.find((i) => i.path.includes("width"));
    expect(widthIssue?.message).toContain("width not applicable");
  });

  it("rejects expandRoute when addContract is present", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "drawer-form",
      options: {
        contentAdapter: "x",
        expandRoute: "/foo",
        addContract: {
          semantics: "batch_append",
          commitMode: "stage_then_parent_save",
          parentDirtyEffect: "mark_parent_dirty",
          subPickPolicy: "inline_first",
          targetRelation: "lines",
        },
      },
    });
    expect(issues.map((i) => i.message)).toContain(
      "expandRoute forbidden when addContract is declared (add ops do not have page identity)",
    );
  });

  it("rejects contentAdapter omission on drawer-form / overlay / modal-select", () => {
    for (const kind of ["drawer-form", "overlay", "modal-select"] as const) {
      const issues = validateInteractionSurfaceShape({ kind, options: {} });
      expect(issues.some((i) => i.message.includes("requires interactionOptions.contentAdapter"))).toBe(true);
    }
  });

  it("rejects bindParent on surfaces other than overlay / drawer-peek", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "drawer-form",
      options: { contentAdapter: "x", bindParent: true },
    });
    expect(issues.some((i) => i.message.includes("bindParent only valid on overlay or drawer-peek"))).toBe(
      true,
    );
  });

  it("rejects addContract on non-mutating non-item surfaces", () => {
    const issues = validateInteractionSurfaceShape({
      kind: "modal-select",
      options: {
        contentAdapter: "x",
        addContract: {
          semantics: "batch_append",
          commitMode: "stage_then_parent_save",
          parentDirtyEffect: "mark_parent_dirty",
          subPickPolicy: "inline_first",
          targetRelation: "lines",
        },
      },
    });
    expect(issues.some((i) => i.message.includes("addContract only valid on drawer-form or overlay"))).toBe(
      true,
    );
  });
});

describe("MetaEntityOperationOverrideSchema", () => {
  it("accepts a minimal override (label only)", () => {
    const parsed = MetaEntityOperationOverrideSchema.parse({
      key: "ADD_LINE",
      label: "Add invoice line",
    });
    expect(parsed.label).toBe("Add invoice line");
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      MetaEntityOperationOverrideSchema.parse({
        key: "ADD_LINE",
        wat: true,
      }),
    ).toThrow();
  });

  it("accepts partial interactionOptions", () => {
    const parsed = MetaEntityOperationOverrideSchema.parse({
      key: "ADD_LINE",
      interactionOptions: { width: "grid" },
    });
    expect(parsed.interactionOptions?.width).toBe("grid");
  });
});

describe("mergeOperationOverride — class boundary (Rule 1)", () => {
  it("allows same-class kind swap when shape rules permit", () => {
    // Base is a clean drawer-peek without bindParent so the swap to
    // drawer-form does not trip Rule 5. Read-only -> mutating is allowed
    // (Rule 2 only blocks the reverse direction).
    const base: MergeableBaseOperation = {
      key: "VIEW_LINE",
      placement: "CONTEXT",
      enabled: true,
      interactionSurfaceKind: "drawer-peek",
      interactionOptions: {},
    };
    const result = mergeOperationOverride(base, {
      key: "VIEW_LINE",
      interactionSurfaceKind: "drawer-form",
      interactionOptions: { contentAdapter: "view-line-form" },
    });
    expect(result.ok).toBe(true);
    expect(result.resolved?.interactionSurfaceKind).toBe("drawer-form");
  });

  it("rejects cross-class override: drawer-form -> page", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      interactionSurfaceKind: "page",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Cross-class override rejected"))).toBe(true);
  });

  it("rejects cross-class override: modal-select -> overlay", () => {
    const base: MergeableBaseOperation = {
      key: "FLIP_FROM_PO",
      placement: "PRIMARY",
      enabled: true,
      interactionSurfaceKind: "modal-select",
      interactionOptions: { contentAdapter: "po-flip", width: "grid" },
    };
    const result = mergeOperationOverride(base, {
      key: "FLIP_FROM_PO",
      interactionSurfaceKind: "overlay",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Cross-class override rejected"))).toBe(true);
  });

  it("rejects cross-class override: overlay -> page", () => {
    const base: MergeableBaseOperation = {
      key: "BROWSE_CATALOG",
      placement: "PRIMARY",
      enabled: true,
      interactionSurfaceKind: "overlay",
      interactionOptions: { contentAdapter: "catalog", bindParent: true },
    };
    const result = mergeOperationOverride(base, {
      key: "BROWSE_CATALOG",
      interactionSurfaceKind: "page",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Cross-class override rejected"))).toBe(true);
  });
});

describe("mergeOperationOverride — mutating op guard (Rule 2)", () => {
  it("rejects ADD_LINE (drawer-form) -> drawer-peek even though both are drawer-class", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      interactionSurfaceKind: "drawer-peek",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes('Mutating op "ADD_LINE" cannot be overridden to read-only surface drawer-peek'),
      ),
    ).toBe(true);
  });
});

describe("mergeOperationOverride — destructive confirmation guard (Rule 3)", () => {
  it("rejects moving a dialog-confirm with consequence to any other surface", () => {
    const result = mergeOperationOverride(BASE_DISCARD, {
      key: "DISCARD_CHANGES",
      interactionSurfaceKind: "drawer-form",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes("declares a destructive consequence and cannot be moved out of dialog-confirm"),
      ),
    ).toBe(true);
  });

  it("allows tweaking label of a dialog-confirm without touching kind", () => {
    const result = mergeOperationOverride(BASE_DISCARD, {
      key: "DISCARD_CHANGES",
      label: "Throw away changes",
    });
    expect(result.ok).toBe(true);
    expect(result.resolved?.label).toBe("Throw away changes");
  });
});

describe("mergeOperationOverride — adapter registry guard (Rule 5)", () => {
  it("rejects unknown adapter IDs when registry is supplied", () => {
    const result = mergeOperationOverride(
      BASE_ADD_LINE,
      {
        key: "ADD_LINE",
        sourceAdapters: ["manual_invoice_line", "open_po_line", "moon_rocks"],
      },
      { knownAdapterIds: new Set(["manual_invoice_line", "open_po_line"]) },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Unknown source adapter "moon_rocks"'))).toBe(true);
  });

  it("accepts override when all adapters are registered", () => {
    const result = mergeOperationOverride(
      BASE_ADD_LINE,
      {
        key: "ADD_LINE",
        sourceAdapters: ["manual_invoice_line", "open_po_line"],
      },
      { knownAdapterIds: new Set(["manual_invoice_line", "open_po_line"]) },
    );
    expect(result.ok).toBe(true);
    expect(result.resolved?.sourceAdapters).toEqual(["manual_invoice_line", "open_po_line"]);
  });

  it("skips adapter check when registry is not supplied", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      sourceAdapters: ["never_seen_it"],
    });
    expect(result.ok).toBe(true);
  });
});

describe("mergeOperationOverride — width/options guard (Rule 6)", () => {
  it("rejects override that adds width: grid to a dialog-confirm", () => {
    // First, a same-class kind swap that would be otherwise allowed:
    // dialog-confirm has class 'confirmation' alone, no swap target. So we
    // build a fresh base with dialog-confirm and try an override that adds
    // a forbidden width without changing kind.
    const result = mergeOperationOverride(BASE_DISCARD, {
      key: "DISCARD_CHANGES",
      interactionOptions: { width: "grid" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("width not applicable to dialog-confirm"))).toBe(
      true,
    );
  });

  it("allows width on drawer-form override", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      interactionOptions: { width: "grid" },
    });
    expect(result.ok).toBe(true);
    expect(result.resolved?.interactionOptions?.width).toBe("grid");
  });
});

describe("mergeOperationOverride — key mismatch", () => {
  it("rejects override targeted at a different op key", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "EDIT_LINE",
    } as MetaEntityOperationOverride);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("does not match base op key");
  });
});

describe("mergeOperationOverride — additive merge", () => {
  it("inherits base interactionOptions when override omits them", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      label: "Add IV line",
    });
    expect(result.ok).toBe(true);
    expect(result.resolved?.interactionOptions?.width).toBe("wide");
    expect(result.resolved?.interactionOptions?.addContract?.targetRelation).toBe("lines");
    expect(result.resolved?.label).toBe("Add IV line");
  });

  it("override interactionOptions fields shadow base, others inherit", () => {
    const result = mergeOperationOverride(BASE_ADD_LINE, {
      key: "ADD_LINE",
      interactionOptions: { width: "full" },
    });
    expect(result.ok).toBe(true);
    expect(result.resolved?.interactionOptions?.width).toBe("full");
    expect(result.resolved?.interactionOptions?.contentAdapter).toBe("line-item-composer");
  });
});

describe("InteractionOptionsSchema.partial round-trip", () => {
  it("allows the partial shape used by overrides", () => {
    const parsed = InteractionOptionsSchema.partial().parse({ width: "compact" });
    expect(parsed.width).toBe("compact");
  });
});
