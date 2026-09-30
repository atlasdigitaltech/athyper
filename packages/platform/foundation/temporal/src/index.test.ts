import assert from "node:assert/strict";
import test from "node:test";

import { parseBusinessDate, parseInstant } from "./index.js";

test("parseInstant accepts only deterministic timestamp formats", () => {
  assert.equal(parseInstant("2026-09-04T10:30:00Z"), 1_788_517_800_000);
  assert.equal(parseInstant("2026-09-04T18:30:00+08:00"), 1_788_517_800_000);
  assert.equal(parseInstant("Sun, 06 Nov 1994 08:49:37 GMT"), 784_111_777_000);
  assert.ok(Number.isNaN(parseInstant("2026-09-04T10:30:00")));
  assert.ok(Number.isNaN(parseInstant("September 4, 2026")));
});

test("parseBusinessDate validates calendar dates at midnight UTC", () => {
  assert.equal(parseBusinessDate("2024-02-29"), Date.UTC(2024, 1, 29));
  assert.ok(Number.isNaN(parseBusinessDate("2023-02-29")));
  assert.ok(Number.isNaN(parseBusinessDate("2024-2-9")));
});
