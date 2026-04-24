/**
 * Enforce MFA (TOTP) on Keycloak users in MFA-required organizations.
 * Sets CONFIGURE_TOTP as a required action and sends a setup email.
 *
 * Skips:
 *  - IDP-only users (GitHub / Microsoft — no Keycloak password credential)
 *  - Users whose org is not in MFA_REQUIRED_ORGS (see mfa-config.mjs)
 *  - Users who already have OTP configured
 *
 * Usage: node tools/devtools/keycloackgen/enforce-mfa.mjs
 */

import { KC_URL, REALM, ADMIN_USER, ADMIN_PASS, sleep, getToken } from "./shared.mjs";
import { MFA_REQUIRED_ORGS, requiresMfa } from "./mfa-config.mjs";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function getAllUsers(token) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}/users?max=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch users: " + await res.text());
  return res.json();
}

async function getUserGroups(token, userId) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/users/${userId}/groups`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const groups = await res.json();
  return groups.map((g) => g.path);
}

async function getUserCredentials(token, userId) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/users/${userId}/credentials`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  return res.json();
}

function hasPasswordCredential(creds) {
  return creds.some((c) => c.type === "password");
}

function hasOtpConfigured(creds) {
  return creds.some((c) => c.type === "otp");
}

async function setRequiredActions(token, userId) {
  const getRes = await fetch(`${KC_URL}/admin/realms/${REALM}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) {
    console.warn(`  Warning: Could not fetch user ${userId} for required actions update`);
    return;
  }
  const currentUser = await getRes.json();
  const existing = currentUser.requiredActions || [];
  if (!existing.includes("CONFIGURE_TOTP")) {
    existing.push("CONFIGURE_TOTP");
  }
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}/users/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...currentUser, requiredActions: existing }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`  Warning: setRequiredActions for ${userId} failed: ${body}`);
  }
}

async function sendMfaSetupEmail(token, userId) {
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/users/${userId}/execute-actions-email`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["CONFIGURE_TOTP"]),
    },
  );
  if (!res.ok && res.status !== 400) {
    const body = await res.text();
    console.warn(`  Warning: sendMfaSetupEmail for ${userId} failed: ${body}`);
  }
}

async function main() {
  console.log(`MFA required orgs: ${MFA_REQUIRED_ORGS.join(", ")}\n`);

  console.log("Fetching admin token...");
  const token = await getToken();

  console.log("Fetching all users...");
  const users = await getAllUsers(token);
  const humanUsers = users.filter(
    (u) => !u.username?.startsWith("service-account-"),
  );
  console.log(`Found ${humanUsers.length} human users\n`);

  let enforced = 0;
  let alreadyConfigured = 0;
  let skippedIdp = 0;
  let skippedOrg = 0;
  let errors = 0;

  for (const user of humanUsers) {
    try {
      const creds = await getUserCredentials(token, user.id);

      // Skip IDP-only users (GitHub, Microsoft) — no Keycloak password
      if (!hasPasswordCredential(creds)) {
        console.log(`  [skip-idp]  ${user.username} — IDP-only user, MFA not required`);
        skippedIdp++;
        continue;
      }

      // Skip users whose org is not in the MFA-required list
      const groups = await getUserGroups(token, user.id);
      if (!requiresMfa(groups)) {
        const orgPath = groups.find((g) => g.startsWith("/org/")) ?? "(no org)";
        console.log(`  [skip-org]  ${user.username} — org not in MFA list (${orgPath})`);
        skippedOrg++;
        continue;
      }

      // Skip users who already have OTP configured
      if (hasOtpConfigured(creds)) {
        console.log(`  [skip-otp]  ${user.username} — OTP already configured`);
        alreadyConfigured++;
        continue;
      }

      await setRequiredActions(token, user.id);
      await sendMfaSetupEmail(token, user.id);
      console.log(`  [enforced]  ${user.username} (${user.email}) — CONFIGURE_TOTP set, email sent`);
      enforced++;
    } catch (err) {
      console.error(`  [error]     ${user.username}: ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log("=== Summary ===");
  console.log(`MFA enforced (email sent): ${enforced}`);
  console.log(`Already had OTP:           ${alreadyConfigured}`);
  console.log(`Skipped (IDP-only):        ${skippedIdp}`);
  console.log(`Skipped (org not in list): ${skippedOrg}`);
  console.log(`Errors:                    ${errors}`);
}

main().catch(console.error);
