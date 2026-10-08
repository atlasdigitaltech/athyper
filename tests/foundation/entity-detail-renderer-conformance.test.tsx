import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseDetailFieldRenderer,
  parseEntityDetailDescriptor,
  type EntitySurfaceFieldV1,
} from "@athyper/contract-platform-entity-runtime";
import { renderDetailFieldValue } from "../../packages/platform/entity/runtime/form-detail/src/detail-field-renderer";
const field: EntitySurfaceFieldV1 = {
  key: "name",
  label: "Name",
  kind: "string",
  required: false,
  readOnly: true,
  rendererKey: "text",
};
it("explicit detail text escapes markup and preserves authorized Unicode display content", () => {
  assert.equal(
    renderToStaticMarkup(
      <span>{renderDetailFieldValue(field, "<script>日本</script>")}</span>,
    ),
    "<span>&lt;script&gt;日本&lt;/script&gt;</span>",
  );
  assert.equal(
    renderToStaticMarkup(<span>{renderDetailFieldValue(field, "—")}</span>),
    "<span>—</span>",
  );
});
it("rejects unsupported detail renderer and field-kind combinations", () => {
  assert.throws(
    () => parseDetailFieldRenderer("unknown", "string"),
    /DETAIL_FIELD_RENDERER_UNSUPPORTED/,
  );
  for (const kind of ["uuid", "json", "integer"])
    assert.throws(
      () => parseDetailFieldRenderer("text", kind),
      /DETAIL_FIELD_RENDERER_UNSUPPORTED/,
    );
});

it("retains the framework reference element rather than rendering its technical value", () => {
  assert.equal(
    renderToStaticMarkup(
      <span>
        {renderDetailFieldValue(
          { ...field, kind: "reference" },
          <a href="/record">Malaysia</a>,
        )}
      </span>,
    ),
    '<span><a href="/record">Malaysia</a></span>',
  );
});

it("retains the explicit renderer across the public detail descriptor boundary", async () => {
  const value = {
    schema: "athyper.entity-detail-descriptor/1",
    plane: "studio",
    entity: {
      code: "reference",
      label: "Reference",
      pluralLabel: "References",
    },
    revision: {
      release: 1,
      descriptorHash: "a".repeat(64),
      surfaceHash: "b".repeat(64),
    },
    titleField: "name",
    fields: [field],
    actions: [],
  };
  assert.equal(
    parseEntityDetailDescriptor(value).fields[0]?.rendererKey,
    "text",
  );
  assert.throws(
    () =>
      parseEntityDetailDescriptor({
        ...value,
        fields: [{ ...field, rendererKey: "unknown" }],
      }),
    /DETAIL_FIELD_RENDERER_UNSUPPORTED/,
  );
});
