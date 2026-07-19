import { describe, expect, it } from "vitest";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { formatFieldValue } from "../record-display";

function field(overrides: Partial<MetaEntityField> = {}): MetaEntityField {
  return {
    key: "status",
    name: "status",
    columnName: "status",
    label: "Status",
    dataType: "enum",
    order: 1,
    isRequired: false,
    isUnique: false,
    isSearchable: true,
    isFilterable: true,
    isSortable: true,
    isGroupable: true,
    isAggregatable: false,
    isReadOnly: false,
    isComputed: false,
    isWriteOnce: false,
    display: { renderer: "lookup_label", format: "label" },
    ...overrides,
  };
}

describe("formatFieldValue lookup labels", () => {
  it("renders a hydrated lookup label instead of the stored code", () => {
    expect(formatFieldValue(
      { status: "posted", status_label: "Posted" },
      field(),
    )).toBe("Posted");
  });

  it("honors a hydrated label from a legacy plain-text descriptor", () => {
    expect(formatFieldValue(
      { status: "posted", status_label: "Posted" },
      field({ display: { renderer: "text" } }),
    )).toBe("Posted");
  });

  it("falls back to static enum option metadata", () => {
    expect(formatFieldValue(
      { status: "posted" },
      field({
        optionSource: {
          kind: "static",
          options: [{ value: "posted", label: "Posted" }],
        },
      }),
    )).toBe("Posted");
  });

  it("prefers the live lifecycle label over legacy static fallback options", () => {
    expect(formatFieldValue(
      { status: "posted" },
      field({
        dataType: "lifecycle_state",
        optionSource: {
          kind: "lifecycle",
          entityLifecycle: "current",
          options: [{ value: "posted", label: "Finalized" }],
          fallbackOptions: [{ value: "posted", label: "Posted" }],
        },
      }),
    )).toBe("Finalized");
  });

  it("supports explicit code and label formats", () => {
    const record = { status: "posted", status_label: "Posted" };
    expect(formatFieldValue(record, field({
      display: { renderer: "lookup_label", format: "code_label" },
    }))).toBe("posted - Posted");
    expect(formatFieldValue(record, field({
      display: { renderer: "lookup_label", format: "label_code" },
    }))).toBe("Posted (posted)");
  });

  it("renders only the resolved name for an explicitly label-only reference", () => {
    expect(formatFieldValue(
      {
        created_by: "00000000-0000-0000-0000-000000000000",
        created_by_label: "System",
        created_by_code: "SYSTEM",
      },
      field({
        key: "created_by",
        name: "created_by",
        columnName: "created_by",
        label: "Created By",
        dataType: "reference",
        display: { renderer: "reference_label", format: "label" },
      }),
    )).toBe("System");
  });

  it("keeps the stored code as a safe fallback when no label is available", () => {
    expect(formatFieldValue({ status: "posted" }, field())).toBe("posted");
  });
});

describe("formatFieldValue temporal metadata", () => {
  it("formats a custom instant field without requiring an _at suffix", () => {
    expect(formatFieldValue(
      { last_reviewed: "2026-07-17T15:51:00Z" },
      field({
        key: "last_reviewed",
        name: "last_reviewed",
        columnName: "last_reviewed",
        label: "Last Reviewed",
        dataType: "enum",
        temporalKind: "instant",
        displayMode: "dateTime",
        display: { renderer: "text" },
      }),
    )).toContain("17 Jul 2026");
  });

  it("lets explicit business-date metadata override a legacy _at name", () => {
    expect(formatFieldValue(
      { effective_at: "2026-07-17" },
      field({
        key: "effective_at",
        name: "effective_at",
        columnName: "effective_at",
        label: "Effective Date",
        dataType: "enum",
        temporalKind: "businessDate",
        displayMode: "date",
        display: { renderer: "text" },
      }),
    )).toBe("17 Jul 2026");
  });

  it("renders a zoned datetime in its bound IANA timezone", () => {
    expect(formatFieldValue(
      { cutoff: { localDateTime: "2026-07-17T18:00:00", timeZone: "Asia/Riyadh" } },
      field({
        key: "cutoff",
        name: "cutoff",
        columnName: "cutoff",
        label: "Cutoff",
        dataType: "enum",
        temporalKind: "zonedDateTime",
        displayMode: "dateTime",
        display: { renderer: "text" },
      }),
    )).toContain("Asia/Riyadh");
  });
});
