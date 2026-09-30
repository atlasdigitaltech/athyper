import assert from "node:assert/strict";
import { test } from "node:test";
import { auditBreakpoints, readTiers } from "./verify-entity-list-breakpoints.mjs";

const tiers = { narrow: 40, wide: 64 };

test("reads the runtime tier constants", () => {
  assert.deepEqual(
    readTiers("export const LIST_NARROW_MAX_REM = 40;\nexport const LIST_WIDE_MIN_REM = 64;"),
    tiers,
  );
  assert.throws(() => readTiers("export const LIST_WIDE_MIN_REM = 64;"), /LIST_NARROW_MAX_REM/);
});

test("accepts the scale and the named container tiers", () => {
  const css = [
    "@media(max-width:48rem){.a{}}",
    "@media(48rem < width <= 64rem){.b{}}",
    "@media(max-width:40rem){.c{}}",
    "@media(pointer:coarse){.d{}}",
    "@container entity-list (width < 40rem){.e{}}",
    "@container entity-list (width < 64rem){.f{}}",
  ].join("\n");
  assert.deepEqual(auditBreakpoints("list.css", css, tiers), []);
});

test("rejects pixel, off-scale and drifting container breakpoints", () => {
  const css = [
    "@media(max-width:760px){.a{}}",
    "@media(max-width:52rem){.b{}}",
    "@container entity-list (width < 42rem){.c{}}",
    "@container (max-width: 40rem){.d{}}",
  ].join("\n");
  const violations = auditBreakpoints("list.css", css, tiers);
  assert.equal(violations.length, 4);
  assert.match(violations[0], /list\.css:1 .*760px is not on the rem scale/);
  assert.match(violations[1], /52rem is not one of 40rem, 48rem, 64rem/);
  assert.match(violations[2], /match presentation-tier\.ts/);
  assert.match(violations[3], /named `entity-list` container/);
});
