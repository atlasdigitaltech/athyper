import assert from "node:assert/strict";
import { test } from "node:test";
import { auditControls, CONTROL_SOURCES } from "./verify-entity-list-controls.mjs";

test("covers the list control sections and shared collection controls", () => {
  assert.ok(CONTROL_SOURCES.some((file) => file.endsWith("list-view/src/index.tsx")));
  assert.ok(CONTROL_SOURCES.some((file) => file.endsWith("dialogs/group-dialog.tsx")));
  assert.ok(CONTROL_SOURCES.some((file) => file.endsWith("collection-controls/src/filter-editor.tsx")));
});

test("rejects native selects and accepts design-system choices", () => {
  assert.deepEqual(auditControls("a.tsx", "<SegmentedControl />\n<SearchableSelect />\n<ChoiceChips />\n<SelectionBar />"), []);
  const violations = auditControls("a.tsx", "ok\n<Select value={x}>\n<select>");
  assert.equal(violations.length, 2);
  assert.match(violations[0], /^a\.tsx:2 native select/);
});
