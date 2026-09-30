import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildR5DatabaseFixtures,
  validateR5FixtureTarget,
} from "../../provisioning/provision-business-partner-r5-fixtures.js";
test("R5 fixture coordinates are stable, unique UUIDs", () => {
  assert.deepEqual(buildR5DatabaseFixtures(), buildR5DatabaseFixtures());
  const ids = Object.values(buildR5DatabaseFixtures());
  assert.equal(new Set(ids).size, 5);
  for (const id of ids)
    assert.match(
      id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
});
test("R5 provisioning fails before connecting to nonlocal or unconfirmed targets", () => {
  for (const url of [
    "postgres://remote/athyper_neon",
    "postgres://localhost/production",
    "https://localhost/athyper_neon",
  ])
    assert.throws(
      () => validateR5FixtureTarget(url, "LOCAL-NEON-BP-R5-FIXTURES"),
      /local athyper_neon/,
    );
  assert.throws(
    () => validateR5FixtureTarget("postgres://localhost/athyper_neon"),
    /confirm/,
  );
  validateR5FixtureTarget(
    "postgres://localhost/athyper_neon",
    "LOCAL-NEON-BP-R5-FIXTURES",
  );
});
