import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseEntityDetailDescriptor } from "@athyper/contract-platform-entity-runtime";
import { EntityRecordFields } from "../../packages/platform/entity/runtime/form-detail/src/record-fields";

// Foundation loader uses classic JSX; production Next uses automatic JSX.
Object.assign(globalThis, { React });

const descriptor = parseEntityDetailDescriptor({
  schema: "athyper.entity-detail-descriptor/1",
  plane: "studio",
  entity: { code: "reference", label: "Reference", pluralLabel: "References" },
  revision: {
    release: 1,
    descriptorHash: "a".repeat(64),
    surfaceHash: "b".repeat(64),
  },
  titleField: "name",
  actions: [],
  fields: [
    {
      key: "name",
      label: "Name",
      kind: "string",
      required: false,
      readOnly: true,
      rendererKey: "text",
    },
  ],
});
it("shared record fields consumes explicit text display and escapes authorized content", () => {
  const html = renderToStaticMarkup(
    <EntityRecordFields
      descriptor={descriptor}
      record={{ id: "internal", values: { name: "<script>日本</script>" } }}
      fieldKeys={["name"]}
    />,
  );
  assert.match(html, /&lt;script&gt;日本&lt;\/script&gt;/);
  assert.doesNotMatch(html, /internal|<script>/);
});
it("shared record fields honors server display values and rejects an unregistered renderer", () => {
  const record = {
    id: "internal",
    values: { name: "stored" },
    displayValues: { name: "Readable" },
  };
  const html = renderToStaticMarkup(
    <EntityRecordFields
      descriptor={descriptor}
      record={record}
      fieldKeys={["name"]}
    />,
  );
  assert.match(html, /Readable/);
  assert.doesNotMatch(html, /stored/);
  const invalid = {
    ...descriptor,
    fields: [{ ...descriptor.fields[0]!, rendererKey: "unknown" as "text" }],
  };
  assert.throws(
    () =>
      renderToStaticMarkup(
        <EntityRecordFields
          descriptor={invalid}
          record={record}
          fieldKeys={["name"]}
        />,
      ),
    /DETAIL_FIELD_RENDERER_UNSUPPORTED/,
  );
});
