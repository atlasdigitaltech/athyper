import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("checked-in Keycloak realm satisfies the active three-plane contract", () => {
  const result = spawnSync(process.execPath, ["tools/scripts/normalize-keycloak-plane-contract.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("rejects a Studio browser flow that mixes alternative and required executions", () => {
  const directory = mkdtempSync(join(tmpdir(), "athyper-keycloak-contract-"));
  const realmPath = join(directory, "realm.json");
  try {
    const realm = JSON.parse(readFileSync("stack/config/iam/realm-athyper.json", "utf8"));
    const flow = realm.authenticationFlows.find((candidate) => candidate.alias === "admin-mfa-required");
    flow.authenticationExecutions.find((execution) => execution.authenticator === "auth-cookie").requirement = "ALTERNATIVE";
    writeFileSync(realmPath, JSON.stringify(realm));

    const result = spawnSync(
      process.execPath,
      ["tools/scripts/normalize-keycloak-plane-contract.mjs", `--realm=${realmPath}`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /admin-mfa-required\/auth-cookie must be DISABLED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("requires enrollable OTP in the Studio second-factor flow", () => {
  const realm = JSON.parse(readFileSync("stack/config/iam/realm-athyper.json", "utf8"));
  const secondFactor = realm.authenticationFlows.find(
    (candidate) => candidate.alias === "admin-mfa-required second factor",
  );
  assert.equal(
    secondFactor.authenticationExecutions.find(
      (execution) => execution.authenticator === "athyper-iam-otp-form",
    ).requirement,
    "REQUIRED",
  );
  assert.equal(
    secondFactor.authenticationExecutions.find(
      (execution) => execution.authenticator === "webauthn-authenticator",
    ).requirement,
    "DISABLED",
  );
});

test("local plane launchers translate the confidential Studio client secret", () => {
  for (const script of ["stack/scripts/app/web-up.sh", "stack/scripts/app/planes-up.sh"]) {
    const source = readFileSync(script, "utf8");
    assert.match(source, /STUDIO_KEYCLOAK_CLIENT_SECRET=.*STUDIO_WEB_CLIENT_SECRET/);
    assert.match(source, /KEYCLOAK_CLIENT_SECRET="\$STUDIO_KEYCLOAK_CLIENT_SECRET"/);
  }
});
