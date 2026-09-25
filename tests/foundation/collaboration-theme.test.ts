import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

test("Collaboration styles consume defined theme or local component tokens", () => {
  const styles = readFileSync("packages/platform/entity/runtime/form-detail/src/styles.css", "utf8");
  const theme = readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8");
  const definitions = new Set([...`${theme}\n${styles}`.matchAll(/(--a-[\w-]+)\s*:/g)].map(match => match[1]));
  const references = new Set([...styles.matchAll(/var\((--a-[\w-]+)/g)].map(match => match[1]));
  assert.deepEqual([...references].filter(token => !definitions.has(token)), []);
});
