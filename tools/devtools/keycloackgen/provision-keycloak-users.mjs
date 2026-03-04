/**
 * Provision missing Keycloak users via Admin REST API.
 * Reads the realm-demosetup.json and creates any users that don't already exist.
 *
 * Usage: node tools/devtools/keycloackgen/provision-keycloak-users.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REALM_PATH = resolve(
  __dirname,
  "../../../mesh/config/iam/realm-demosetup.json",
);

const KC_URL = "https://iam.mesh.athyper.local";
const REALM = "athyper";
const ADMIN_USER = "athyperadmin";
const ADMIN_PASS = "athyperadmin";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function getToken() {
  const res = await fetch(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        username: ADMIN_USER,
        password: ADMIN_PASS,
        grant_type: "password",
      }),
    },
  );
  const data = await res.json();
  if (!data.access_token)
    throw new Error("Failed to get token: " + JSON.stringify(data));
  return data.access_token;
}

async function getExistingUsers(token) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}/users?max=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function getClientId(token, clientName) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/clients?clientId=${clientName}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const clients = await res.json();
  return clients[0]?.id;
}

async function getClientRoles(token, clientUuid) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/clients/${clientUuid}/roles`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return res.json();
}

async function getOrganizations(token) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function createUser(token, user) {
  const payload = {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailVerified: user.emailVerified ?? true,
    enabled: user.enabled ?? true,
    credentials: [
      {
        type: "password",
        value: "Demo123!",
        temporary: false,
      },
    ],
    groups: user.groups || [],
  };

  const res = await fetch(`${KC_URL}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 201) {
    const location = res.headers.get("location");
    const userId = location?.split("/").pop();
    return userId;
  } else if (res.status === 409) {
    return null; // already exists
  } else {
    const body = await res.text();
    throw new Error(
      `Create user ${user.username} failed (${res.status}): ${body}`,
    );
  }
}

async function assignClientRoles(
  token,
  userId,
  clientUuid,
  roleNames,
  allRoles,
) {
  const rolesToAssign = allRoles.filter((r) => roleNames.includes(r.name));
  if (rolesToAssign.length === 0) return;

  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/clients/${clientUuid}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rolesToAssign),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.warn(`  Warning: Role assignment for ${userId} failed: ${body}`);
  }
}

async function addUserToOrg(token, orgId, userId) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/organizations/${orgId}/members`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userId),
    },
  );

  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    console.warn(`  Warning: Org membership failed: ${body}`);
  }
}

async function main() {
  console.log("Reading realm JSON...");
  const realm = JSON.parse(readFileSync(REALM_PATH, "utf8"));
  const realmUsers = realm.users.filter(
    (u) => !u.username?.startsWith("service-account-"),
  );

  console.log(`Realm JSON has ${realmUsers.length} human users`);

  const token = await getToken();

  // Get existing users
  const existingUsers = await getExistingUsers(token);
  const existingUsernames = new Set(existingUsers.map((u) => u.username));
  console.log(
    `Keycloak has ${existingUsers.length} users (${existingUsernames.size} unique usernames)`,
  );

  // Get neon-web client UUID and roles
  const neonWebClientUuid = await getClientId(token, "neon-web");
  if (!neonWebClientUuid) {
    throw new Error("Could not find neon-web client in Keycloak");
  }
  const allClientRoles = await getClientRoles(token, neonWebClientUuid);
  console.log(
    `neon-web client roles: ${allClientRoles.map((r) => r.name).join(", ")}`,
  );

  // Get organizations
  const orgs = await getOrganizations(token);
  const orgByAlias = Object.fromEntries(orgs.map((o) => [o.alias, o]));
  console.log(`Organizations: ${orgs.map((o) => o.alias).join(", ")}`);

  // Process users
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of realmUsers) {
    if (existingUsernames.has(user.username)) {
      // User exists - ensure role assignments and org membership are correct
      const existingUser = existingUsers.find(
        (u) => u.username === user.username,
      );

      // Assign client roles
      if (user.clientRoles?.["neon-web"]) {
        await assignClientRoles(
          token,
          existingUser.id,
          neonWebClientUuid,
          user.clientRoles["neon-web"],
          allClientRoles,
        );
      }

      // Add to organization
      const orgAlias = user.groups?.[0]?.match(/^\/org\/([^/]+)/)?.[1];
      if (orgAlias && orgByAlias[orgAlias]) {
        await addUserToOrg(token, orgByAlias[orgAlias].id, existingUser.id);
      }

      skipped++;
      continue;
    }

    try {
      const userId = await createUser(token, user);
      if (!userId) {
        skipped++;
        continue;
      }

      // Assign client roles
      if (user.clientRoles?.["neon-web"]) {
        await assignClientRoles(
          token,
          userId,
          neonWebClientUuid,
          user.clientRoles["neon-web"],
          allClientRoles,
        );
      }

      // Add to organization
      const orgAlias = user.groups?.[0]?.match(/^\/org\/([^/]+)/)?.[1];
      if (orgAlias && orgByAlias[orgAlias]) {
        await addUserToOrg(token, orgByAlias[orgAlias].id, userId);
      }

      console.log(`  Created: ${user.username} (${user.email})`);
      created++;
    } catch (err) {
      console.error(`  Error creating ${user.username}: ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log("=== Summary ===");
  console.log(`Created: ${created}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total in Keycloak: ${existingUsers.length + created}`);
}

main().catch(console.error);
