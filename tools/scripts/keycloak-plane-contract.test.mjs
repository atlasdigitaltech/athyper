import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("checked-in Keycloak realm satisfies the active three-plane contract", () => {
  const result = spawnSync(process.execPath, ["tools/scripts/normalize-keycloak-plane-contract.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
