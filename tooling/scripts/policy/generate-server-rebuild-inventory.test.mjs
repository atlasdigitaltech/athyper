import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLegacyBaseline } from "./generate-server-rebuild-inventory.mjs";

const baseline = JSON.parse(
  readFileSync(
    new URL(
      "../../../server/architecture/legacy-inventory-baseline.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("legacy inventory loads without an ignored backup tree and preserves all historical identities", () => {
  assert.equal(readLegacyBaseline(baseline).size, 1473);
});

test("legacy inventory rejects missing provenance, deleted identities and changed locations", () => {
  assert.throws(
    () => readLegacyBaseline({ ...baseline, provenance: {} }),
    /provenance/,
  );
  assert.throws(
    () => readLegacyBaseline({ ...baseline, items: baseline.items.slice(1) }),
    /pinned historical snapshot/,
  );
  const modified = structuredClone(baseline);
  modified.items[0].locations = ["server-backup/invented.ts"];
  assert.throws(
    () => readLegacyBaseline(modified),
    /pinned historical snapshot/,
  );
});
