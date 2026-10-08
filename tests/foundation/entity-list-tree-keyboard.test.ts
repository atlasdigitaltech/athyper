import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { treeKeyAction, type TreeRowPosition } from "../../packages/platform/entity/runtime/list-view/src/tree/tree-keyboard";

// 1000 Assets (open) > 1100 Current (open) > 1110 Cash (leaf); 1200 (closed); 2000 Liabilities (closed)
const rows: readonly TreeRowPosition[] = [
  { key: "1000", level: 1, expanded: true },
  { key: "1100", level: 2, expanded: true },
  { key: "1110", level: 3 },
  { key: "1200", level: 2, expanded: false },
  { key: "2000", level: 1, expanded: false },
];

describe("tree grid keyboard model", () => {
  it("moves with Up, Down, Home and End and opens with Enter", () => {
    assert.deepEqual(treeKeyAction(rows, "1100", "ArrowDown"), { kind: "focus", key: "1110" });
    assert.deepEqual(treeKeyAction(rows, "1100", "ArrowUp"), { kind: "focus", key: "1000" });
    assert.equal(treeKeyAction(rows, "2000", "ArrowDown"), undefined);
    assert.deepEqual(treeKeyAction(rows, "1110", "Home"), { kind: "focus", key: "1000" });
    assert.deepEqual(treeKeyAction(rows, "1000", "End"), { kind: "focus", key: "2000" });
    assert.deepEqual(treeKeyAction(rows, "1110", "Enter"), { kind: "open", key: "1110" });
  });

  it("Right expands or enters; Left collapses or climbs to the parent", () => {
    assert.deepEqual(treeKeyAction(rows, "2000", "ArrowRight"), { kind: "toggle", key: "2000" });
    assert.deepEqual(treeKeyAction(rows, "1000", "ArrowRight"), { kind: "focus", key: "1100" });
    assert.equal(treeKeyAction(rows, "1110", "ArrowRight"), undefined);
    assert.deepEqual(treeKeyAction(rows, "1100", "ArrowLeft"), { kind: "toggle", key: "1100" });
    assert.deepEqual(treeKeyAction(rows, "1110", "ArrowLeft"), { kind: "focus", key: "1100" });
    assert.deepEqual(treeKeyAction(rows, "1200", "ArrowLeft"), { kind: "focus", key: "1000" });
    assert.equal(treeKeyAction(rows, "2000", "ArrowLeft"), undefined);
  });

  it("swaps Left and Right in right-to-left layouts", () => {
    assert.deepEqual(treeKeyAction(rows, "2000", "ArrowLeft", true), { kind: "toggle", key: "2000" });
    assert.deepEqual(treeKeyAction(rows, "1110", "ArrowRight", true), { kind: "focus", key: "1100" });
  });

  it("* expands only the collapsed siblings already loaded", () => {
    assert.deepEqual(treeKeyAction(rows, "1000", "*"), { kind: "expandSiblings", keys: ["2000"] });
    assert.deepEqual(treeKeyAction(rows, "1100", "*"), { kind: "expandSiblings", keys: ["1200"] });
    assert.equal(treeKeyAction(rows, "1110", "*"), undefined);
  });
});
