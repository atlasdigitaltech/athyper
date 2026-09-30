import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyRealm } from "./verify-ci-realm.mjs";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("../../../deploy/config/iam/realm-athyper.json", import.meta.url),
      "utf8",
    ),
  );
test("canonical realm retains Studio strict MFA and emitted AMR", () =>
  assert.ok(verifyRealm(fixture()).checks > 0));
for (const [name, corrupt] of [
  [
    "wrong client flow",
    (realm) => {
      realm.clients.find(
        (c) => c.clientId === "studio-web",
      ).authenticationFlowBindingOverrides.browser = "other";
    },
  ],
  [
    "optional second factor",
    (realm) => {
      realm.authenticationFlows
        .find((f) => f.alias === "admin-mfa-required")
        .authenticationExecutions.find((e) =>
          e.flowAlias?.endsWith("second factor"),
        ).requirement = "ALTERNATIVE";
    },
  ],
  [
    "disabled OTP",
    (realm) => {
      realm.authenticationFlows
        .find((f) => f.alias.endsWith("required second factor"))
        .authenticationExecutions.find(
          (e) => e.authenticator === "athyper-iam-otp-form",
        ).requirement = "DISABLED";
    },
  ],
  [
    "cookie bypass",
    (realm) => {
      realm.authenticationFlows.find(
        (f) => f.alias === "admin-mfa-required",
      ).authenticationExecutions[0].requirement = "ALTERNATIVE";
    },
  ],
  [
    "missing AMR",
    (realm) => {
      realm.clientScopes
        .find((s) => s.name === "acr")
        .protocolMappers.find(
          (m) => m.protocolMapper === "oidc-amr-mapper",
        ).config["access.token.claim"] = "false";
    },
  ],
])
  test(`rejects ${name}`, () => {
    const realm = fixture();
    corrupt(realm);
    assert.throws(() => verifyRealm(realm));
  });
