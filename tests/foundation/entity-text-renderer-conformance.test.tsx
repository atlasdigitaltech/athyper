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

it("explicit list text preserves boolean values and missing-value distinctions", () => {
  const render = (value: boolean | null) =>
    renderToStaticMarkup(
      <span>
        {renderFieldValue(value, { ...field, valueKind: "boolean" })}
      </span>,
    );
  assert.equal(render(true), "<span>Yes</span>");
  assert.equal(render(false), "<span>No</span>");
  assert.equal(render(null), "<span>—</span>");
});
it("explicit list enum text uses the declared option label and escapes it", () => {
  const rendered = renderToStaticMarkup(
    <span>
      {renderFieldValue("active", {
        ...field,
        valueKind: "enum",
        filterOptions: [{ value: "active", label: "Active <safe>" }],
      })}
    </span>,
  );
  assert.equal(rendered, "<span>Active &lt;safe&gt;</span>");
});
it("explicit list datetime text formats an instant without interpreting markup", () => {
  const value = "2026-10-09T00:00:00.000Z";
  const expected = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
  assert.equal(
    renderToStaticMarkup(
      <span>
        {renderFieldValue(value, { ...field, valueKind: "datetime" })}
      </span>,
    ),
    `<span>${expected}</span>`,
  );
  assert.equal(
    renderToStaticMarkup(
      <span>
        {renderFieldValue("<invalid>", { ...field, valueKind: "datetime" })}
      </span>,
    ),
    "<span>&lt;invalid&gt;</span>",
  );
});

it("an unresolved reference never falls back to its technical identifier", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const reference = { ...field, valueKind: "reference" as const };
  const unresolved = renderToStaticMarkup(
    <span>{renderFieldValue(id, reference)}</span>,
  );
  assert.equal(unresolved, "<span>—</span>");
  assert.ok(!unresolved.includes(id));
  assert.equal(
    renderToStaticMarkup(
      <span>
        {renderFieldValue(id, reference, undefined, undefined, "Malaysia")}
      </span>,
    ),
    "<span>Malaysia</span>",
  );
});
