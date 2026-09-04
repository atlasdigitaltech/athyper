import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { KeycloakIdentityProviderAdapter } from "../../../../packages/platform/iam/src/index.ts";

const baseUrl = process.env.G5_KEYCLOAK_BASE_URL?.replace(/\/$/, "");
const bootstrapUser = process.env.G5_KEYCLOAK_BOOTSTRAP_USER;
const bootstrapPassword = process.env.G5_KEYCLOAK_BOOTSTRAP_PASSWORD;
if (!baseUrl || !bootstrapUser || !bootstrapPassword)
  throw new Error(
    "G5_KEYCLOAK_BASE_URL, G5_KEYCLOAK_BOOTSTRAP_USER and G5_KEYCLOAK_BOOTSTRAP_PASSWORD are required",
  );

const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
  realm = `g5-${suffix}`,
  clientId = `g5-saga-${suffix}`,
  clientSecret = randomBytes(32).toString("hex"),
  identifier = `g5-${suffix}@example.test`;
let masterToken;
try {
  masterToken = await passwordToken(
    "master",
    "admin-cli",
    bootstrapUser,
    bootstrapPassword,
  );
  await admin(
    "master",
    "/realms",
    {
      method: "POST",
      body: JSON.stringify({
        realm,
        enabled: true,
        organizationsEnabled: true,
      }),
    },
    [201],
    masterToken,
    true,
  );
  await admin(
    realm,
    "/clients",
    {
      method: "POST",
      body: JSON.stringify({
        clientId,
        enabled: true,
        publicClient: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        secret: clientSecret,
      }),
    },
    [201],
    masterToken,
  );
  const clients = await json(
    await admin(
      realm,
      `/clients?clientId=${encodeURIComponent(clientId)}`,
      {},
      [200],
      masterToken,
    ),
  );
  assert.equal(clients.length, 1);
  const clientUuid = clients[0].id;
  const serviceAccount = await json(
    await admin(
      realm,
      `/clients/${clientUuid}/service-account-user`,
      {},
      [200],
      masterToken,
    ),
  );
  const managementClients = await json(
    await admin(
      realm,
      "/clients?clientId=realm-management",
      {},
      [200],
      masterToken,
    ),
  );
  assert.equal(managementClients.length, 1);
  const managementId = managementClients[0].id;
  const realmAdmin = await json(
    await admin(
      realm,
      `/clients/${managementId}/roles/realm-admin`,
      {},
      [200],
      masterToken,
    ),
  );
  await admin(
    realm,
    `/users/${serviceAccount.id}/role-mappings/clients/${managementId}`,
    { method: "POST", body: JSON.stringify([realmAdmin]) },
    [204],
    masterToken,
  );

  const organizationResponse = await admin(
    realm,
    "/organizations",
    {
      method: "POST",
      body: JSON.stringify({
        name: `G5 ${suffix}`,
        alias: `g5-${suffix}`,
        enabled: true,
      }),
    },
    [201],
    masterToken,
  );
  const organizationId = locationId(organizationResponse);
  const secretBytes = new TextEncoder().encode(clientSecret);
  const provider = new KeycloakIdentityProviderAdapter({
    baseUrl,
    adminRealm: realm,
    clientId,
    credentialReference: `memory:g5:${suffix}`,
    secrets: {
      resolve: async (reference) => {
        assert.equal(reference, `memory:g5:${suffix}`);
        return { bytes: secretBytes, version: "disposable-v1" };
      },
    },
  });
  const key = (value) => `athyper:${value}:${"a".repeat(40)}`;
  const created = await provider.inviteOrCreate({
    realmKey: realm,
    identifier,
    displayName: "G5 Disposable Worker",
    invite: false,
    idempotencyKey: key("identity"),
  });
  assert.match(created.providerSubject, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(
    await provider.inviteOrCreate({
      realmKey: realm,
      identifier,
      displayName: "G5 Disposable Worker",
      invite: false,
      idempotencyKey: key("identity"),
    }),
    created,
  );
  await provider.ensureMembership({
    realmKey: realm,
    providerSubject: created.providerSubject,
    externalOrganizationId: organizationId,
    relationship: "external_worker",
    idempotencyKey: key("membership"),
  });
  await provider.ensureApplication({
    providerSubject: created.providerSubject,
    plane: "studio",
    targetTenantId: randomUUID(),
    idempotencyKey: key("application"),
  });
  let users = await providerJson(
    realm,
    `/users?username=${encodeURIComponent(identifier)}&exact=true`,
    clientId,
    clientSecret,
  );
  assert.equal(users.length, 1);
  assert.equal(users[0].enabled, true);
  const members = await providerJson(
    realm,
    `/organizations/${organizationId}/members`,
    clientId,
    clientSecret,
  );
  assert.equal(
    members.some((member) => member.id === created.providerSubject),
    true,
  );
  await provider.suspend({
    realmKey: realm,
    providerSubject: created.providerSubject,
    idempotencyKey: key("suspend"),
  });
  users = await providerJson(
    realm,
    `/users?username=${encodeURIComponent(identifier)}&exact=true`,
    clientId,
    clientSecret,
  );
  assert.equal(users[0].enabled, false);
  await provider.deprovision({
    realmKey: realm,
    providerSubject: created.providerSubject,
    idempotencyKey: key("deprovision"),
  });
  users = await providerJson(
    realm,
    `/users?username=${encodeURIComponent(identifier)}&exact=true`,
    clientId,
    clientSecret,
  );
  assert.equal(users[0].enabled, false);
  assert.equal(new TextDecoder().decode(secretBytes), clientSecret);
  process.stdout.write("G5_KEYCLOAK_PROVIDER_MUTATION_OK\n");
} finally {
  if (masterToken)
    await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${masterToken}` },
    }).catch(() => undefined);
}

async function passwordToken(realmName, tokenClientId, username, password) {
  const response = await fetch(
    `${baseUrl}/realms/${encodeURIComponent(realmName)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: tokenClientId,
        username,
        password,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`G5_KEYCLOAK_BOOTSTRAP_AUTH_${response.status}`);
  const body = await response.json();
  assert.equal(typeof body.access_token, "string");
  return body.access_token;
}
async function clientToken(realmName, tokenClientId, secret) {
  const response = await fetch(
    `${baseUrl}/realms/${encodeURIComponent(realmName)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: tokenClientId,
        client_secret: secret,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`G5_KEYCLOAK_CLIENT_AUTH_${response.status}`);
  return (await response.json()).access_token;
}
async function admin(realmName, path, init, accepted, token, root = false) {
  const prefix = root
    ? "/admin"
    : "/admin/realms/" + encodeURIComponent(realmName);
  const response = await fetch(`${baseUrl}${prefix}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!accepted.includes(response.status))
    throw new Error(`G5_KEYCLOAK_ADMIN_${response.status}:${path}`);
  return response;
}
async function providerJson(realmName, path, tokenClientId, secret) {
  const token = await clientToken(realmName, tokenClientId, secret);
  return json(await admin(realmName, path, {}, [200], token));
}
async function json(response) {
  return response.json();
}
function locationId(response) {
  const value = response.headers
    .get("location")
    ?.split("/")
    .filter(Boolean)
    .at(-1);
  if (!value) throw new Error("G5_KEYCLOAK_LOCATION_MISSING");
  return value;
}
