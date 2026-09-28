import assert from "node:assert/strict";
import { test } from "node:test";
import { isCanonicalEntityCode } from "../../packages/contracts/platform/entity-runtime/src/validation/entity-code";
import {
  isObjectRecord,
  isBoundedNonBlankText,
} from "../../packages/contracts/platform/entity-runtime/src/validation/values";
import { resolveEntityReadRoute } from "../../packages/contracts/platform/entity-runtime/src/routes/entity-read-route";
import { parseEntityRuntimeLocalizedText } from "../../packages/contracts/platform/entity-runtime/src/runtime-resource";

test("native entity grammar has exact bounds and never rewrites identities", () => {
  for (const value of [
    "country",
    "example_dictionary",
    "a1",
    "ab",
    "a".repeat(63),
  ])
    assert.equal(isCanonicalEntityCode(value), true, value);
  for (const value of [
    undefined,
    null,
    {},
    1,
    "a",
    "a".repeat(64),
    "Country",
    " country",
    "country ",
    "country\n",
    "1country",
    "example.country",
    "example-country",
    "%63ountry",
    "a/b",
    "café",
  ])
    assert.equal(isCanonicalEntityCode(value), false, String(value));
});
test("native read routes share list/manage/detail rules without granting writes", () => {
  const id = "01a0d433-806b-7874-862d-49a9b955f6a1";
  assert.deepEqual(resolveEntityReadRoute("country"), {
    entityCode: "country",
  });
  assert.deepEqual(resolveEntityReadRoute("country", ["manage"]), {
    entityCode: "country",
  });
  assert.deepEqual(resolveEntityReadRoute("country", [id]), {
    entityCode: "country",
    recordId: id,
  });
  // URL syntax is intentionally distinct from storage UUID version/variant validation.
  assert.ok(
    resolveEntityReadRoute("country", ["00000000-0000-0000-0000-000000000000"]),
  );
  for (const segments of [
    [""],
    ["new"],
    ["manage", "delete"],
    [id, "edit"],
    [".."],
    ["%2f"],
    ["not-a-uuid"],
  ])
    assert.equal(resolveEntityReadRoute("country", segments), undefined);
  assert.equal(resolveEntityReadRoute("Country", [id]), undefined);
});
test("shared primitives preserve shape semantics and purpose-specific label lengths", () => {
  for (const value of [{}, Object.create(null), new Date()])
    assert.equal(isObjectRecord(value), true);
  for (const value of [null, undefined, [], "text", false])
    assert.equal(isObjectRecord(value), false);
  assert.equal(isBoundedNonBlankText(" a ", 3), true);
  assert.equal(isBoundedNonBlankText(" a ", 2), false);
  assert.equal(isBoundedNonBlankText("   ", 3), false);
  const text = { labelKey: "entity.country", defaultText: " x " };
  assert.deepEqual(parseEntityRuntimeLocalizedText(text), text); // No new trimming.
  assert.doesNotThrow(() =>
    parseEntityRuntimeLocalizedText({ ...text, defaultText: "a".repeat(500) }),
  );
  assert.throws(
    () =>
      parseEntityRuntimeLocalizedText({
        ...text,
        defaultText: "a".repeat(501),
      }),
    /localized text is invalid/,
  );
});
