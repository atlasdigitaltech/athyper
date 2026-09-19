import { expect, it } from "vitest";
import { compositionChanges } from "./composition-review";
it("pairs by stable identity when members are inserted, removed and reordered", () => {
  const before = {
    fields: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
  };
  const after = {
    fields: [
      { id: "c", label: "C" },
      { id: "b", label: "Changed" },
      { id: "d", label: "D" },
    ],
  };
  expect(compositionChanges(before, after).map((c) => [c.id, c.kind])).toEqual([
    ["a", "removed"],
    ["b", "changed"],
    ["d", "added"],
  ]);
});
it("reports duplicate identities at collection level instead of silently losing rows", () => {
  expect(
    compositionChanges(
      {
        fields: [
          { id: "a", label: "A" },
          { id: "a", label: "B" },
        ],
      },
      { fields: [{ id: "a", label: "C" }] },
    ),
  ).toHaveLength(1);
  expect(
    compositionChanges(
      { fields: [{ id: "a" }, { id: "a" }] },
      { fields: [] },
    )[0]?.id,
  ).toBe("");
});

it("ignores storage ordering of uniquely keyed contract tests while retaining changed test content", () => {
  const a = {
    tests: [
      { key: "a", expected: 1 },
      { key: "b", expected: 2 },
    ],
  };
  expect(
    compositionChanges(a, {
      tests: [
        { key: "b", expected: 2 },
        { key: "a", expected: 1 },
      ],
    }),
  ).toEqual([]);
  expect(
    compositionChanges(a, {
      tests: [
        { key: "b", expected: 3 },
        { key: "a", expected: 1 },
      ],
    }),
  ).toHaveLength(1);
});
