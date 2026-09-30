import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyRealm(realm) {
  const studio = realm.clients?.find(
    (client) => client.clientId === "studio-web",
  );
  const flow = realm.authenticationFlows?.find(
    (flow) => flow.alias === "admin-mfa-required",
  );
  assert.ok(flow?.id && flow.topLevel, "Studio mandatory MFA flow must exist");
  assert.equal(
    studio?.authenticationFlowBindingOverrides?.browser,
    flow.id,
    "Studio must bind mandatory MFA",
  );
  for (const alias of [
    "admin-mfa-required forms",
    "admin-mfa-required second factor",
  ]) {
    assert.ok(
      flow.authenticationExecutions.some(
        (execution) =>
          execution.flowAlias === alias &&
          execution.authenticatorFlow &&
          execution.requirement === "REQUIRED",
      ),
      `${alias} must be REQUIRED`,
    );
  }
  for (const execution of flow.authenticationExecutions.filter(
    (execution) => !execution.authenticatorFlow,
  ))
    assert.equal(
      execution.requirement,
      "DISABLED",
      "No alternate top-level authentication bypass",
    );
  const password = realm.authenticationFlows.find(
    (flow) => flow.alias === "admin-mfa-required forms",
  );
  assert.ok(
    password?.authenticationExecutions.some(
      (execution) =>
        execution.authenticator === "athyper-iam-username-password-form" &&
        execution.requirement === "REQUIRED",
    ),
    "Password must be required",
  );
  const second = realm.authenticationFlows.find(
    (flow) => flow.alias === "admin-mfa-required second factor",
  );
  assert.ok(
    second?.authenticationExecutions.some(
      (execution) =>
        execution.authenticator === "athyper-iam-otp-form" &&
        execution.requirement === "REQUIRED" &&
        execution.authenticatorConfig === "athyper-amr-otp",
    ),
    "OTP and its AMR configuration must be required",
  );
  const mapper = realm.clientScopes
    ?.find((scope) => scope.name === "acr")
    ?.protocolMappers?.find(
      (mapper) => mapper.protocolMapper === "oidc-amr-mapper",
    );
  assert.equal(
    mapper?.config?.["access.token.claim"],
    "true",
    "AMR must reach access tokens",
  );
  assert.equal(
    mapper?.config?.["id.token.claim"],
    "true",
    "AMR must reach ID tokens",
  );
  for (const id of ["studio-web", "neon-web", "mesh-web"])
    assert.ok(
      realm.clients
        .find((client) => client.clientId === id)
        ?.defaultClientScopes?.includes("acr"),
      `${id} must receive AMR`,
    );
  return {
    checks: 11,
    scope:
      "canonical realm export; live authentication remains IAM live qualification",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(
    JSON.stringify(
      verifyRealm(
        JSON.parse(
          readFileSync(
            resolve(
              import.meta.dirname,
              "../../../deploy/config/iam/realm-athyper.json",
            ),
            "utf8",
          ),
        ),
      ),
    ),
  );
}
