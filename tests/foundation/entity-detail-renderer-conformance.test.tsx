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

it("preserves localized scalar display values and semantic time elements", async () => {
  const { createEffectiveLocalization, createIntlRuntime } =
    await import("../../packages/platform/foundation/i18n/src/index");
  const { formatEntityValue } =
    await import("../../packages/platform/foundation/i18n/src/entity-value");
  const intl = createIntlRuntime({
    localization: createEffectiveLocalization({
      uiLocale: "en",
      formatLocale: "en-US",
      timeZone: "UTC",
    }),
    messages: { "entity.value.yes": "Yes", "entity.value.no": "No" },
  });
  for (const [kind, value, expected] of [
    ["boolean", true, "Yes"],
    ["boolean", false, "No"],
    ["enum", "active", "Enabled &amp; ready"],
    ["datetime", null, "—"],
  ] as const) {
    const scalar = {
      ...field,
      kind,
      options: [{ value: "active", label: "Enabled & ready" }],
    };
    assert.equal(
      renderToStaticMarkup(
        <span>
          {renderDetailFieldValue(
            scalar,
            formatEntityValue(value, scalar, intl),
          )}
        </span>,
      ),
      `<span>${expected}</span>`,
    );
  }
  for (const kind of ["date", "datetime"] as const) {
    const value = kind === "date" ? "2026-10-08" : "2026-10-08T12:00:00Z";
    const scalar = { ...field, kind };
    const content = (
      <time dateTime={value}>{formatEntityValue(value, scalar, intl)}</time>
    );
    assert.equal(
      renderToStaticMarkup(
        <span>{renderDetailFieldValue(scalar, content)}</span>,
      ),
      `<span>${renderToStaticMarkup(content)}</span>`,
    );
  }
});
