import assert from "node:assert/strict";
import { test } from "node:test";
import { requireEntityDetailNavigation } from "./detail-navigation";

test("INV-008: detail workspace never infers navigation from section keys", () => {
  for (const sections of [["overview"], ["details"], ["arbitrary", "audit"]]) {
    assert.throws(
      () => requireEntityDetailNavigation(undefined, sections),
      /ENTITY_DETAIL_NAVIGATION_REQUIRED/,
    );
  }
  assert.throws(
    () => requireEntityDetailNavigation({ mode: "scroll" }, ["overview"]),
    /ENTITY_DETAIL_NAVIGATION_GROUPS_REQUIRED/,
  );
});
test("explicit navigation retains published mode, names and order", () => {
  const navigation = {
    mode: "switch",
    tabs: [
      { key: "second", label: "Second", sectionKeys: ["audit"] },
      { key: "first", label: "First", sectionKeys: ["overview"] },
    ],
  };
  assert.deepEqual(
    requireEntityDetailNavigation(navigation, ["overview", "audit"]),
    navigation,
  );
});
test("invalid section ownership and incomplete navigation reject", () => {
  assert.throws(
    () =>
      requireEntityDetailNavigation(
        {
          mode: "scroll",
          tabs: [{ key: "main", label: "Main", sectionKeys: ["foreign"] }],
        },
        ["overview"],
      ),
    /Unknown or ambiguous/,
  );
  assert.throws(
    () =>
      requireEntityDetailNavigation(
        {
          mode: "scroll",
          tabs: [{ key: "main", label: "Main", sectionKeys: ["overview"] }],
        },
        ["overview", "audit"],
      ),
    /cover every section/,
  );
});
