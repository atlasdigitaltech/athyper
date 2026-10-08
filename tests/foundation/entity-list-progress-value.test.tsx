import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { progressPercent } from "../../packages/platform/entity/runtime/list-view/src/progress-value";
import { renderFieldValue } from "../../packages/platform/entity/runtime/list-view/src/field-value";

const field: ListFieldDescriptorV1 = {
  key: "completion", label: "Completion", valueKind: "decimal", rendererKey: "number.progress",
  defaultVisible: true, defaultOrder: 0, filterOperators: [], sortable: false, groupable: false, aggregations: [],
} as ListFieldDescriptorV1;

describe("shared progress reader", () => {
  it("reads numbers and numeric text, clamped to 0–100 and rounded", () => {
    assert.equal(progressPercent(42.4), 42);
    assert.equal(progressPercent(" 64 "), 64);
    assert.equal(progressPercent(140), 100);
    assert.equal(progressPercent("-5"), 0);
  });

  it("treats blank, whitespace, non-numeric and null values as no value", () => {
    for (const value of ["", " ", "\t", "abc", null, undefined, Number.NaN]) assert.equal(progressPercent(value), undefined);
  });

  it("renders blank progress text as an empty value, not a 0% bar, wherever list values render", () => {
    // renderFieldValue is the one path Table rows and record cards share.
    const blank = renderToStaticMarkup(<>{renderFieldValue(" ", field)}</>);
    assert.equal(blank.includes("a-entity-list__progress"), false);
    const value = renderToStaticMarkup(<>{renderFieldValue(64, field)}</>);
    assert.match(value, /a-entity-list__progress/);
    assert.match(value, /inline-size:64%/);
  });
});
