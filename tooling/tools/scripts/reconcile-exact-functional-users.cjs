#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const fixture = JSON.parse(fs.readFileSync(path.join(repoRoot, "deploy/config/iam/realm-athyper-demosetup.json"), "utf8"));
const container = process.env.DOCKER_CONTAINER_IAM || "athyper-iam-1";
const adminUser = process.env.IAM_ADMIN;
const adminPassword = process.env.IAM_ADMIN_PASSWORD;
if (!adminUser || !adminPassword) throw new Error("IAM_ADMIN and IAM_ADMIN_PASSWORD are required");

function kcadm(args) {
  return execFileSync("docker", ["exec", container, "/opt/keycloak/bin/kcadm.sh", ...args], { encoding: "utf8", timeout: 60_000 }).trim();
}
function json(args) { const value = kcadm(args); return value ? JSON.parse(value) : []; }

kcadm(["config", "credentials", "--server", "http://localhost:8080", "--realm", "master", "--user", adminUser, "--password", adminPassword]);
const functional = fixture.users.filter((user) => user.attributes?.identity_scope?.includes("operating_organization"));
if (functional.length !== 12) throw new Error(`expected 12 functional users, found ${functional.length}`);
const current = new Map(json(["get", "users", "-r", fixture.realm, "-q", "first=0", "-q", "max=1000", "--fields", "id,username", "--format", "json"])
  .map((user) => [user.username, user]));
for (const user of functional) {
  const existing = current.get(user.username);
  if (existing && existing.id !== user.id) kcadm(["delete", `users/${existing.id}`, "-r", fixture.realm]);
}
const users = functional.map((user) => ({
  id: user.id, username: user.username, enabled: user.enabled !== false,
  emailVerified: user.emailVerified !== false, firstName: user.firstName,
  lastName: user.lastName, email: user.email, attributes: user.attributes,
  realmRoles: user.realmRoles, clientRoles: user.clientRoles, requiredActions: [],
}));
kcadm(["create", "partialImport", "-r", fixture.realm, "-b", JSON.stringify({ ifResourceExists: "OVERWRITE", users })]);
const actual = new Map(json(["get", "users", "-r", fixture.realm, "-q", "first=0", "-q", "max=1000", "--fields", "id,username", "--format", "json"])
  .map((user) => [user.username, user.id]));
for (const user of functional) if (actual.get(user.username) !== user.id) throw new Error(`stable subject reconciliation failed: ${user.username}`);
console.log(`Reconciled ${functional.length} functional users with deterministic Keycloak subjects.`);
