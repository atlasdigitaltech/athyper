import { resolveSourcePath } from "../../tooling/scripts/metadata/source-workspace.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  groupActivityFields,
  changed,
  formatActivityValue,
  type ActivityPresentation,
} from "../../packages/platform/entity/runtime/form-detail/src/activity-comparison-model";
import {
  createEffectiveLocalization,
  createIntlRuntime,
} from "../../packages/platform/foundation/i18n/src/index";
import type { ActivityComparison } from "../../packages/contracts/platform/entity-runtime/src/activity";
const field = (key: string): ActivityComparison["fields"][number] => ({
  key,
  label: key,
  before: { state: "value", value: "a" },
  after: { state: "value", value: "b" },
  changed: true,
});
test("groups only projected fields, in tab/section order, without duplication or hidden section disclosure", () => {
  const metadata = {
    fields: [],
    presentation: {
      sections: [
        { key: "second", label: "Second", fields: ["b", "a"] },
        { key: "first", label: "First", fields: ["a"] },
        { key: "secret", label: "Secret", fields: ["secret"] },
      ],
      navigation: {
        tabs: [
          {
            key: "overview",
            label: "Overview",
            sectionKeys: ["first", "second", "secret"],
          },
        ],
      },
    },
  } as unknown as ActivityPresentation;
  const groups = groupActivityFields(
    [field("b"), field("a"), field("legacy")],
    metadata,
  );
  assert.deepEqual(
    groups.map((group) => [group.key, group.fields.map((f) => f.key)]),
    [
      ["section:first", ["a"]],
      ["section:second", ["b"]],
      ["additional", ["legacy"]],
    ],
  );
  assert.ok(!JSON.stringify(groups).includes("Secret"));
  assert.equal(groups[0]?.tabLabel, "Overview");
});
test("no metadata uses an explicit additional-fields fallback; missing capture is not a change", () => {
  assert.equal(groupActivityFields([field("legacy")])[0]?.key, "additional");
  assert.equal(
    changed({ ...field("missing"), before: { state: "uncaptured" } }),
    false,
  );
});
test("typed formatting preserves precision, historical references, calendar dates, empty and uncaptured states", () => {
  const intl = createIntlRuntime({
    localization: createEffectiveLocalization({
      uiLocale: "en",
      formatLocale: "en-US",
      timeZone: "America/Los_Angeles",
    }),
    messages: {
      "activity.yes": "Yes",
      "activity.capturedEmpty": "Empty · captured",
      "activity.uncaptured": "Not captured",
    },
  });
  const format = (value: unknown, kind = "string", options?: unknown) =>
    formatActivityValue(
      { state: "value", value },
      { kind, options } as never,
      intl,
    );
  assert.equal(format(true, "boolean"), "Yes");
  assert.equal(format(null), "Empty · captured");
  assert.equal(
    formatActivityValue({ state: "uncaptured" }, undefined, intl),
    "Not captured",
  );
  assert.equal(format("2026-09-28", "date"), "Sep 28, 2026");
  // C1b (Compare blueprint 9.6): exact decimals are formatted by kind,
  // grouped and without losing precision.
  assert.equal(
    format("12345678901234567890.1234", "decimal"),
    "12,345,678,901,234,567,890.1234",
  );
  assert.equal(
    format("active", "enum", [{ value: "active", label: "Active" }]),
    "Active",
  );
  assert.equal(format("historical-id", "reference"), "historical-id");
});

test("Country source metadata groups authorized captured fields into its published sections", () => {
  const { definition } = JSON.parse(
    readFileSync(
      resolveSourcePath(new URL(
        "../../metadata/entities/country/definition.json",
        import.meta.url,
      )),
      "utf8",
    ),
  );
  const metadata = {
    fields: [],
    presentation: {
      ...definition,
      sections: definition.sections.map((section: any) => ({
        ...section,
        label: section.label.defaultText,
      })),
    },
  } as ActivityPresentation;
  const groups = groupActivityFields(
    ["name", "calling_code", "has_postal_codes", "updated_at", "id"].map(field),
    metadata,
  );
  assert.deepEqual(
    groups.map((group) => group.label),
    ["Country", "Phone", "Postal and address", "Audit", undefined],
  );
  assert.deepEqual(
    groups.map((group) => group.fields[0]?.key),
    ["name", "calling_code", "has_postal_codes", "updated_at", "id"],
  );
});
