import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of ["realm-platform-control.json", "realm-platform-control-clean-slate.json"]) {
  test(`${file} retains restricted account-console role claims on initial import`, () => {
    const realm = JSON.parse(readFileSync(new URL(`../../config/iam/${file}`, import.meta.url), "utf8"));
    const clients = realm.clients.filter(client => client.clientId === "account-console");
    assert.equal(clients.length, 1);
    const client = clients[0];
    assert.equal(client.fullScopeAllowed, false);
    assert.equal(client.publicClient, true);
    assert.equal(client.directAccessGrantsEnabled, false);
    assert.equal(client.serviceAccountsEnabled, false);
    assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
    assert.deepEqual(client.defaultClientScopes, ["roles"]);
    assert.deepEqual(client.redirectUris, ["/realms/platform-control/account/*"]);
    assert.deepEqual(realm.clientScopeMappings.account, [{ client: "account-console", roles: ["manage-account", "view-groups"] }]);
    assert.ok(realm.clientScopes.find(scope => scope.name === "roles").protocolMappers.some(mapper =>
      mapper.protocolMapper === "oidc-usermodel-client-role-mapper" && mapper.config["access.token.claim"] === "true"));
  });
}
