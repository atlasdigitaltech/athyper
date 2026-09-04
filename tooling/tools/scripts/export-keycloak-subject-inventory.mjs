#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const output = option(args, "--output");
const baseUrl = required("KEYCLOAK_BASE_URL").replace(/\/$/, "");
const realm = process.env.KEYCLOAK_REALM?.trim() || "athyper";
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM?.trim() || "master";
const token = await adminToken(
  baseUrl,
  adminRealm,
  required("KEYCLOAK_ADMIN_USERNAME"),
  required("KEYCLOAK_ADMIN_PASSWORD"),
);
const users = await requestAllUsers(baseUrl, realm, token);
const subjects = users.map((user) => ({
  keycloakSubject: String(user.id ?? ""),
  username: String(user.username ?? "").toLowerCase(),
  enabled: user.enabled === true,
  email: typeof user.email === "string" ? user.email.toLowerCase() : null,
  emailVerified: user.emailVerified === true,
  createdTimestamp: Number.isFinite(user.createdTimestamp)
    ? user.createdTimestamp
    : null,
})).sort((left, right) => left.keycloakSubject.localeCompare(right.keycloakSubject));
if (subjects.some((subject) => !subject.keycloakSubject || !subject.username)) {
  throw new Error("Keycloak inventory contains a user without subject or username");
}
const canonical = JSON.stringify(subjects);
const inventory = {
  contractVersion: "authorization-v2.keycloak-subject-inventory.v1",
  realm,
  exportedAt: new Date().toISOString(),
  enabledSubjectCount: subjects.filter((subject) => subject.enabled).length,
  totalSubjectCount: subjects.length,
  canonicalIdentitySha256: createHash("sha256").update(canonical).digest("hex"),
  subjects,
};
const rendered = `${JSON.stringify(inventory, null, 2)}\n`;
if (output) await writeFile(output, rendered, { flag: "wx" });
else process.stdout.write(rendered);

async function requestAllUsers(url, targetRealm, accessToken) {
  const output = [];
  for (let first = 0; ; first += 500) {
    const response = await fetch(
      `${url}/admin/realms/${encodeURIComponent(targetRealm)}/users?first=${first}&max=500`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error(`Keycloak user inventory failed: ${response.status}`);
    const page = await response.json();
    output.push(...page);
    if (page.length < 500) return output;
  }
}
async function adminToken(url, realm, username, password) {
  const response = await fetch(
    `${url}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        grant_type: "password",
        username,
        password,
      }),
    },
  );
  if (!response.ok) throw new Error(`Keycloak token request failed: ${response.status}`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Keycloak token response has no access_token");
  return body.access_token;
}
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function option(values, name) {
  return values.find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}
