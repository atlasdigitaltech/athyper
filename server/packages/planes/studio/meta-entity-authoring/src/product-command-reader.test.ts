import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BRANCH_COLUMNS } from "./graph-storage-columns.js";

it("keeps the closed SQL read inventory complete as the canonical legacy reader changes", () => {
  const source = readFileSync(
    new URL("./product-command-reader.sql", import.meta.url),
    "utf8",
  );
  const inventory = source.match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)?.[1];
  expect(inventory).toBeDefined();
  const tables = [...inventory!.matchAll(/'(entity\w*)'/g)].map(
    (match) => match[1],
  );
  expect(tables.sort()).toEqual(
    ["entity", ...Object.keys(BRANCH_COLUMNS)].sort(),
  );
  expect(new Set(tables).size).toBe(tables.length);
});
