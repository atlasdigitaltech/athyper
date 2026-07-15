import { describe, expect, it } from "vitest";

import {
  DraftLineSchema,
  SOURCE_ADAPTER_CONTRACT_VERSION,
  SourceAdapterIdSchema,
  SourceAdapterManifestSchema,
  SourceBindingSchema,
  SourceSelectionShapeSchema,
  SourceSideEffectSchema,
} from "../source-adapter";

describe("SOURCE_ADAPTER_CONTRACT_VERSION", () => {
  it("is pinned at source-adapter/v1", () => {
    expect(SOURCE_ADAPTER_CONTRACT_VERSION).toBe("source-adapter/v1");
  });
});

describe("SourceAdapterIdSchema", () => {
  it.each([
    "manual_invoice_line",
    "open_po_line",
    "ap_non_po.invoice",
    "telco.usage_line",
    "ab",
  ])("accepts %s", (id) => {
    expect(SourceAdapterIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    "a",                       // too short
    "Open_PO_Line",            // uppercase
    "_leading_underscore",
    "1starts_with_digit",
    "two..dots..deep",
    "kebab-case",
    "open po line",            // space
    "ap.bad..dot",
  ])("rejects %s", (id) => {
    expect(SourceAdapterIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("SourceSelectionShapeSchema", () => {
  it("accepts id_only", () => {
    expect(
      SourceSelectionShapeSchema.safeParse({ kind: "id_only", idField: "id" }).success,
    ).toBe(true);
  });

  it("accepts id_qty", () => {
    expect(
      SourceSelectionShapeSchema.safeParse({
        kind: "id_qty",
        idField: "id",
        qtyField: "remainingQty",
      }).success,
    ).toBe(true);
  });

  it("accepts id_qty_uom", () => {
    expect(
      SourceSelectionShapeSchema.safeParse({
        kind: "id_qty_uom",
        idField: "id",
        qtyField: "qty",
        uomField: "uom",
      }).success,
    ).toBe(true);
  });

  it("accepts composite with >=2 keyFields", () => {
    expect(
      SourceSelectionShapeSchema.safeParse({
        kind: "composite",
        keyFields: ["sourceDocId", "sourceLineId"],
      }).success,
    ).toBe(true);
  });

  it("rejects composite with only one key", () => {
    expect(
      SourceSelectionShapeSchema.safeParse({
        kind: "composite",
        keyFields: ["sourceDocId"],
      }).success,
    ).toBe(false);
  });
});

describe("SourceBindingSchema", () => {
  it("accepts minimal binding (sourceType only)", () => {
    const result = SourceBindingSchema.safeParse({ sourceType: "manual_invoice_line" });
    expect(result.success).toBe(true);
  });

  it("accepts full binding with matchType", () => {
    const result = SourceBindingSchema.safeParse({
      sourceType: "open_po_line",
      sourceDocType: "purchase_order",
      sourceDocId: "po-123",
      sourceLineId: "line-456",
      matchType: "three_way",
      sourceRef: { release: "R-001" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown matchType", () => {
    expect(
      SourceBindingSchema.safeParse({
        sourceType: "x",
        matchType: "make_up_match" as unknown as "three_way",
      }).success,
    ).toBe(false);
  });
});

describe("DraftLineSchema", () => {
  it("requires sourceBinding", () => {
    expect(DraftLineSchema.safeParse({ description: "x" }).success).toBe(false);
  });

  it("accepts a draft with sourceBinding plus arbitrary fields", () => {
    const result = DraftLineSchema.safeParse({
      description: "Office supplies",
      quantity: 5,
      sourceBinding: { sourceType: "catalog" },
    });
    expect(result.success).toBe(true);
  });
});

describe("SourceSideEffectSchema", () => {
  it("accepts reserve_remaining_quantity", () => {
    expect(
      SourceSideEffectSchema.safeParse({
        kind: "reserve_remaining_quantity",
        entityCode: "purchase_order",
        recordId: "po-1",
        lineId: "line-1",
        quantityField: "remainingQty",
        quantity: 10,
      }).success,
    ).toBe(true);
  });

  it("rejects negative quantity reservation", () => {
    expect(
      SourceSideEffectSchema.safeParse({
        kind: "reserve_remaining_quantity",
        entityCode: "purchase_order",
        recordId: "po-1",
        lineId: "line-1",
        quantityField: "remainingQty",
        quantity: -5,
      }).success,
    ).toBe(false);
  });

  it("accepts emit_event with default empty payload", () => {
    const parsed = SourceSideEffectSchema.parse({
      kind: "emit_event",
      eventType: "po.line.invoiced",
    });
    expect(parsed.kind).toBe("emit_event");
    if (parsed.kind === "emit_event") {
      expect(parsed.payload).toEqual({});
    }
  });
});

describe("SourceAdapterManifestSchema", () => {
  const validManifest = {
    id: "open_po_line",
    version: 1,
    label: "Open PO lines",
    picker: {
      kind: "modal-select" as const,
      columns: [
        { key: "po", label: "PO #", kind: "text" as const, sortable: false, filterable: false },
      ],
      filters: [],
      search: { enabled: true },
    },
    selectionShape: {
      kind: "id_qty" as const,
      idField: "lineId",
      qtyField: "remainingQty",
    },
    dedupeKeys: ["sourceBinding.sourceDocId", "sourceBinding.sourceLineId"],
  };

  const validDirectFillManifest = {
    id: "manual_invoice_line",
    version: 1,
    label: "Add line manually",
    entry: "direct_fill" as const,
    cacheStrategy: "none" as const,
    selectionShape: { kind: "id_only" as const, idField: "draftId" },
    dedupeKeys: ["draftId"],
  };

  it("accepts a minimal valid manifest", () => {
    const result = SourceAdapterManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("defaults minFrameworkVersion to 1", () => {
    const parsed = SourceAdapterManifestSchema.parse(validManifest);
    expect(parsed.minFrameworkVersion).toBe(1);
  });

  it("defaults cacheStrategy to session", () => {
    const parsed = SourceAdapterManifestSchema.parse(validManifest);
    expect(parsed.cacheStrategy).toBe("session");
  });

  it("defaults stalenessStrategy to fail (strictest)", () => {
    const parsed = SourceAdapterManifestSchema.parse(validManifest);
    expect(parsed.stalenessStrategy).toBe("fail");
  });

  it("rejects page picker with session cacheStrategy", () => {
    const result = SourceAdapterManifestSchema.safeParse({
      ...validManifest,
      picker: { ...validManifest.picker, kind: "page" as const },
      cacheStrategy: "session" as const,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("page pickers should not rely on session-only cache")),
      ).toBe(true);
    }
  });

  it("rejects picker kind drawer-form (drawer-form is fill, not picker)", () => {
    const result = SourceAdapterManifestSchema.safeParse({
      ...validManifest,
      picker: { ...validManifest.picker, kind: "drawer-form" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty dedupeKeys", () => {
    const result = SourceAdapterManifestSchema.safeParse({
      ...validManifest,
      dedupeKeys: [],
    });
    expect(result.success).toBe(false);
  });

  it("defaults entry to 'picker' when omitted (backward compat for pre-v1.1 adapters)", () => {
    const parsed = SourceAdapterManifestSchema.parse(validManifest);
    expect(parsed.entry).toBe("picker");
  });

  it("accepts a direct_fill manifest without a picker", () => {
    const result = SourceAdapterManifestSchema.safeParse(validDirectFillManifest);
    expect(result.success).toBe(true);
  });

  it("rejects entry='picker' without a picker configuration", () => {
    const { picker: _drop, ...withoutPicker } = validManifest;
    const result = SourceAdapterManifestSchema.safeParse(withoutPicker);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("entry='picker' requires a picker configuration")),
      ).toBe(true);
    }
  });

  it("rejects entry='direct_fill' that still declares a picker", () => {
    const result = SourceAdapterManifestSchema.safeParse({
      ...validDirectFillManifest,
      picker: validManifest.picker,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("entry='direct_fill' adapters must not declare a picker"),
        ),
      ).toBe(true);
    }
  });

  it("rejects unknown adapter id grammar", () => {
    const result = SourceAdapterManifestSchema.safeParse({
      ...validManifest,
      id: "Open-PO-Line",
    });
    expect(result.success).toBe(false);
  });
});
