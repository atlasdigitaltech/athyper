import { describe, expect, it } from "vitest";
import { assembleTreeMatches, type TreeMatchRow } from "./tree-matches.js";

const item = (id: string, parent: string | null, hasChildren = false): TreeMatchRow => ({ row: { id, code: id }, id, parent, hasChildren });

describe("search with ancestor context", () => {
  it("keeps matches first, then the context rows their paths need, each once", () => {
    const result = assembleTreeMatches({
      matches: [item("m1", "b"), item("m2", "b")],
      ancestors: [item("b", "a", true), item("a", null, true), item("unused", null)],
      maxDepth: 5,
      truncated: false,
    });
    expect(result.data.map((row) => row["id"])).toEqual(["m1", "m2", "b", "a"]);
    expect(result.treeRoles).toEqual(["match", "match", "context", "context"]);
    expect(result.parentOutsideView).toEqual([false, false, false, false]);
    expect(result.hasChildren).toEqual([false, false, true, true]);
    expect(result).not.toHaveProperty("matchesTruncated");
    expect(result).not.toHaveProperty("matchesBeyondDepth");
  });

  it("marks the top of a path stopped by an unreadable parent, never naming that parent", () => {
    const result = assembleTreeMatches({ matches: [item("m", "b")], ancestors: [item("b", "hidden")], maxDepth: 5, truncated: true });
    expect(result.data.map((row) => row["id"])).toEqual(["m", "b"]);
    expect(result.parentOutsideView).toEqual([false, true]);
    expect(result.matchesTruncated).toBe(true);
  });

  it("drops and counts a match whose path is deeper than the tree shows", () => {
    // maxDepth 2: a match two levels below a root is at depth 3.
    const result = assembleTreeMatches({ matches: [item("deep", "b"), item("ok", "a")], ancestors: [item("b", "a"), item("a", null)], maxDepth: 2, truncated: false });
    expect(result.data.map((row) => row["id"])).toEqual(["ok", "a"]);
    expect(result.matchesBeyondDepth).toBe(1);
  });

  it("lets a match also be another match's ancestor, as a match", () => {
    const result = assembleTreeMatches({ matches: [item("child", "parent"), item("parent", null)], ancestors: [], maxDepth: 5, truncated: false });
    expect(result.treeRoles).toEqual(["match", "match"]);
  });
});
