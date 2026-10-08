import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { renderFieldValue } from "../../packages/platform/entity/runtime/list-view/src/field-value";
const field = {
  key: "name",
  label: "Name",
  valueKind: "string",
  rendererKey: "text",
} as ListFieldDescriptorV1;
const html = (
  value: Parameters<typeof renderFieldValue>[0],
  query?: string,
  label?: string,
) =>
  renderToStaticMarkup(
    <span>{renderFieldValue(value, field, query, undefined, label)}</span>,
  );
it("explicit text escapes markup and preserves Unicode", () => {
  assert.equal(
    html('<script>alert("x")</script>'),
    "<span>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</span>",
  );
  assert.equal(html("日本 — Malaysia"), "<span>日本 — Malaysia</span>");
});
it("highlights literal text without allowing markup injection", () => {
  assert.equal(
    html("<img> Malaysia", "Malaysia"),
    "<span>&lt;img&gt; <mark>Malaysia</mark></span>",
  );
});
it("uses the server-supplied reference label instead of its technical value", () => {
  assert.equal(
    html("00000000-0000-4000-8000-000000000001", undefined, "Malaysia"),
    "<span>Malaysia</span>",
  );
});
it("preserves missing values and avoids inferred status decoration for explicit text", () => {
  assert.equal(html(null), "<span>—</span>");
  const rendered = renderToStaticMarkup(
    <span>
      {renderFieldValue("active", { ...field, semanticRole: "status" })}
    </span>,
  );
  assert.equal(rendered, "<span>active</span>");
});
