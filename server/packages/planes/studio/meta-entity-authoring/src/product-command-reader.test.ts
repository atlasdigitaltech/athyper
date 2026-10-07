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

it("pins the atomic operational package without enrolling it in automatic plane upgrades", async () => {
  const { createHash } = await import("node:crypto");
  const root = new URL("../../../../../db/", import.meta.url);
  const inventory = JSON.parse(
    readFileSync(new URL("migrations/inventory.json", root), "utf8"),
  );
  const name = "20261008_entity_product_command_authority.sql";
  const entry = inventory.entries.find(
    (row: { originalPath: string }) =>
      row.originalPath === `migrations/${name}`,
  );
  expect(entry.disposition).toBe("operational-upgrade");
  expect(entry.planes).toEqual([]);
  const source = readFileSync(new URL(entry.path, root), "utf8");
  expect(createHash("sha256").update(source).digest("hex")).toBe(entry.sha256);
  expect(source.startsWith("BEGIN;\n")).toBe(true);
  expect(source.endsWith("COMMIT;\n")).toBe(true);
  for (const file of [
    "product-command-authority.sql",
    "product-command-reader.sql",
  ]) {
    expect(source).toContain(
      readFileSync(new URL(file, import.meta.url), "utf8"),
    );
  }
  for (const plane of ["studio", "neon", "mesh"]) {
    expect(
      readFileSync(
        new URL(`migrations/manifests/${plane}.txt`, root),
        "utf8",
      ).split("\n"),
    ).not.toContain(name);
  }
});
