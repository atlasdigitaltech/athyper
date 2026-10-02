import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBusinessDate,
  parseDatabaseInstant,
  parseInstant,
} from "./index.js";

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

test("database cursor instants require an offset and retain microsecond input", () => {
  const cursor = "2026-09-30 00:00:00.123456+00";
  assert.equal(
    parseDatabaseInstant(cursor),
    parseInstant("2026-09-30T00:00:00.123456Z"),
  );
  assert.equal(
    parseDatabaseInstant("2026-09-30 08:00:00.123456+08:00"),
    parseDatabaseInstant(cursor),
  );
  assert.equal(cursor, "2026-09-30 00:00:00.123456+00");
  for (const value of [
    "2026-09-30 00:00:00",
    "2026-09-30 00:00:00 PST",
    "2026-09-30 00:00:00+25",
    "not-a-date",
  ])
    assert.ok(Number.isNaN(parseDatabaseInstant(value)), value);
});
