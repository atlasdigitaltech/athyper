#!/usr/bin/env node
/**
 * Applies a non-importable Athyper Keycloak realm demo fixture.
 *
 * This keeps importable realm files clean:
 *   stack/config/iam/realm-<plane>.json
 *
 * Demo users, tenant organizations, and memberships live in:
 *   stack/config/iam/realm-<plane>-demosetup.json
 *
 * The script talks to the running Keycloak container through kcadm.sh so it
 * does not depend on host DNS, TLS trust, or public gateway routing.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    out[key] = argv[index + 1];
    index += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const container = args.container || process.env.DOCKER_CONTAINER_IAM || "athyper-iam-1";
const adminUser = args["admin-user"] || process.env.IAM_ADMIN;
const adminPassword = args["admin-password"] || process.env.IAM_ADMIN_PASSWORD;
const realmFile = args["realm-file"];
const demoFile = args["demo-file"];
const forceReconcile = args.reconcile === "1" || args.reconcile === "true" || process.env.IAM_DEMO_RECONCILE === "1";
const fastReconcile = args.fast === "1" || args.fast === "true";
const remapExistingUsers = new Set(["catl.admin", "tksa.admin", "ssk.admin", "tegy.admin", "sdtx.admin"]);
const remapAdmins = args["remap-admins"] === "1" || args["remap-admins"] === "true";

if (!adminUser || !adminPassword || !realmFile || !demoFile) {
  console.error("Usage: node apply-realm-demo-setup.cjs --container athyper-iam-1 --admin-user USER --admin-password PASS --realm-file realm-neon.json --demo-file realm-neon-demosetup.json");
  process.exit(1);
}

if (!fs.existsSync(realmFile)) {
  console.error(`Realm file not found: ${realmFile}`);
  process.exit(1);
}

if (!fs.existsSync(demoFile)) {
  console.log(`Demo setup not found, skipping: ${demoFile}`);
  process.exit(0);
}

const realm = JSON.parse(fs.readFileSync(realmFile, "utf8"));
const demo = JSON.parse(fs.readFileSync(demoFile, "utf8"));
const realmName = realm.realm || demo.realm;

if (!realmName || demo.importableByKeycloak !== false) {
  console.error(`Invalid demo setup file: ${demoFile}`);
  process.exit(1);
}

if (demo.realm && demo.realm !== realmName) {
  console.error(`Demo setup realm mismatch: realm file=${realmName}, demo file=${demo.realm}`);
  process.exit(1);
}

let failureCount = 0;
let keycloakAssignedIdCount = 0;

function kcadm(parts, options = {}) {
  const result = execFileSync(
    "docker",
    ["exec", container, "/opt/keycloak/bin/kcadm.sh", ...parts],
    {
      encoding: "utf8",
      stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      input: options.input,
      timeout: options.timeout || 30_000,
    },
  );
  return result.trim();
}

function tryKcadm(parts, options = {}) {
  try {
    return { ok: true, value: kcadm(parts, options) };
  } catch (error) {
    return {
      ok: false,
      value: "",
      error: String(error.stderr || error.message || error),
    };
  }
}

function getJson(parts, fallback) {
  const raw = tryKcadm(parts);
  if (!raw.ok || !raw.value) return fallback;
  try {
    return JSON.parse(raw.value);
  } catch {
    return fallback;
  }
}

function body(value) {
  return JSON.stringify(value);
}

function extractCreatedId(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const quoted = value.match(/\bid\s+['"]([^'"]+)['"]/i);
  if (quoted?.[1]) return quoted[1];
  const uuid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid?.[0]) return uuid[0];
  if (!/\s/.test(value)) return value;
  return null;
}

function cleanUser(user) {
  return {
    ...(user.id ? { id: user.id } : {}),
    username: user.username,
    enabled: user.enabled !== false,
    emailVerified: user.emailVerified !== false,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || undefined,
    attributes: user.attributes || {},
    requiredActions: [],
  };
}

let usersByUsernameCache = null;
function usersByUsernameMap() {
  if (usersByUsernameCache) return usersByUsernameCache;
  const users = getJson(["get", "users", "-r", realmName, "-q", "first=0", "-q", "max=1000", "--fields", "id,username", "--format", "json"], []);
  usersByUsernameCache = new Map();
  for (const user of users) {
    if (user.username) usersByUsernameCache.set(user.username, user);
  }
  return usersByUsernameCache;
}

function getUserByUsername(username) {
  return usersByUsernameMap().get(username) || null;
}

function getFreshUserByUsername(username) {
  const users = getJson(["get", "users", "-r", realmName, "-q", `username=${username}`, "-q", "exact=true", "--fields", "id,username", "--format", "json"], []);
  return users.find((user) => user.username === username) || users[0] || null;
}

function ensureUser(user) {
  const existing = getUserByUsername(user.username);
  const payload = cleanUser(user);
  if (existing?.id) {
    if (user.id && existing.id !== user.id) {
      keycloakAssignedIdCount += 1;
    }
    if (forceReconcile && !fastReconcile) {
      tryKcadm(["update", `users/${existing.id}`, "-r", realmName, "-b", body({ ...payload, id: existing.id })]);
    }
    return { id: existing.id, created: false };
  }

  const created = tryKcadm(["create", "users", "-r", realmName, "-b", body(payload), "-i"]);
  if (!created.ok) {
    console.warn(`  ! user create failed: ${user.username} ${created.error.slice(0, 160)}`);
    failureCount += 1;
    return { id: null, created: false };
  }
  const fresh = getFreshUserByUsername(user.username);
  const userId = fresh?.id || extractCreatedId(created.value);
  if (userId) usersByUsernameMap().set(user.username, { id: userId, username: user.username });
  return { id: userId, created: true };
}

const realmRoleCache = new Map();
function getRealmRole(roleName) {
  if (!realmRoleCache.has(roleName)) {
    realmRoleCache.set(roleName, getJson(["get", `roles/${roleName}`, "-r", realmName, "--format", "json"], null));
  }
  return realmRoleCache.get(roleName);
}

function assignRealmRoles(userId, roleNames) {
  const roles = [];
  for (const roleName of roleNames || []) {
    const role = getRealmRole(roleName);
    if (role?.id) roles.push(role);
  }
  if (roles.length > 0) {
    tryKcadm(["create", `users/${userId}/role-mappings/realm`, "-r", realmName, "-b", body(roles)]);
  }
}

const clientUuidCache = new Map();
function getClientUuid(clientId) {
  if (clientUuidCache.has(clientId)) return clientUuidCache.get(clientId);
  const clients = getJson(["get", "clients", "-r", realmName, "-q", `clientId=${clientId}`, "--fields", "id,clientId", "--format", "json"], []);
  const clientUuid = clients[0]?.id || null;
  clientUuidCache.set(clientId, clientUuid);
  return clientUuid;
}

const clientRoleMapCache = new Map();
function clientRoleMap(clientUuid) {
  if (clientRoleMapCache.has(clientUuid)) return clientRoleMapCache.get(clientUuid);
  const roles = getJson(["get", `clients/${clientUuid}/roles`, "-r", realmName, "--fields", "id,name,description,composite,clientRole,containerId,attributes", "--format", "json"], []);
  const map = new Map();
  for (const role of roles) {
    if (role.name) map.set(role.name, role);
  }
  clientRoleMapCache.set(clientUuid, map);
  return map;
}

function getClientRole(clientUuid, roleName) {
  return clientRoleMap(clientUuid).get(roleName) || null;
}

function assignClientRoles(userId, clientRoles) {
  for (const [clientId, roleNames] of Object.entries(clientRoles || {})) {
    const clientUuid = getClientUuid(clientId);
    if (!clientUuid) continue;
    const roles = [];
    for (const roleName of roleNames || []) {
      const role = getClientRole(clientUuid, roleName);
      if (role?.id) roles.push(role);
    }
    if (roles.length > 0) {
      tryKcadm(["create", `users/${userId}/role-mappings/clients/${clientUuid}`, "-r", realmName, "-b", body(roles)]);
    }
  }
}

function groupMap() {
  const groups = getJson(["get", "groups", "-r", realmName, "--fields", "id,name,path", "--format", "json"], []);
  const map = new Map();
  for (const group of groups) {
    if (group.name) map.set(group.name, group.id);
    if (group.path) map.set(group.path, group.id);
  }
  return map;
}

function assignGroups(userId, groupRefs, groupsByRef) {
  for (const ref of groupRefs || []) {
    const groupId = groupsByRef.get(ref) || groupsByRef.get(String(ref).replace(/^\//, ""));
    if (groupId) {
      tryKcadm(["update", `users/${userId}/groups/${groupId}`, "-r", realmName]);
    }
  }
}

let orgsByAliasCache = null;
function orgMap() {
  if (orgsByAliasCache) return orgsByAliasCache;
  const organizations = getJson(["get", "organizations", "-r", realmName, "-q", "first=0", "-q", "max=500", "--fields", "id,alias,name", "--format", "json"], []);
  orgsByAliasCache = new Map();
  for (const org of organizations) {
    if (org.alias) orgsByAliasCache.set(org.alias, org);
  }
  return orgsByAliasCache;
}

function getFreshOrganizationByAlias(alias) {
  return orgMap().get(alias) || null;
}

function ensureOrganization(org, organizationsByAlias) {
  const payload = {
    alias: org.alias,
    name: org.name,
    enabled: org.enabled !== false,
    attributes: org.attributes || {},
    domains: org.domains || [],
  };
  const existing = organizationsByAlias.get(org.alias);
  if (existing?.id) {
    if (forceReconcile) {
      tryKcadm(["update", `organizations/${existing.id}`, "-r", realmName, "-b", body({ ...payload, id: existing.id })]);
    }
    return { id: existing.id, created: false };
  }
  const created = tryKcadm(["create", "organizations", "-r", realmName, "-b", body(payload), "-i"]);
  if (!created.ok) {
    console.warn(`  ! organization create failed: ${org.alias} ${created.error.slice(0, 160)}`);
    failureCount += 1;
    return { id: null, created: false };
  }
  const orgId = extractCreatedId(created.value) || getFreshOrganizationByAlias(org.alias)?.id || null;
  if (orgId) {
    const entry = { id: orgId, alias: org.alias, name: org.name };
    organizationsByAlias.set(org.alias, entry);
    if (orgsByAliasCache) orgsByAliasCache.set(org.alias, entry);
  }
  return { id: orgId, created: true };
}

function replaceOrganizationMembers(orgId, members, usersByUsername) {
  const currentMembers = getJson(["get", `organizations/${orgId}/members`, "-r", realmName, "-q", "first=0", "-q", "max=500", "--fields", "id,username", "--format", "json"], []);
  for (const member of currentMembers) {
    if (member.id) tryKcadm(["delete", `organizations/${orgId}/members/${member.id}`, "-r", realmName]);
  }
  ensureOrganizationMembers(orgId, members, usersByUsername, new Set());
}

function ensureOrganizationMembers(orgId, members, usersByUsername, currentMemberIds = null) {
  const currentIds = currentMemberIds || new Set(
    getJson(["get", `organizations/${orgId}/members`, "-r", realmName, "-q", "first=0", "-q", "max=500", "--fields", "id,username", "--format", "json"], [])
      .map((member) => member.id)
      .filter(Boolean),
  );
  for (const member of members || []) {
    const userId = usersByUsername.get(member.username);
    if (!userId || currentIds.has(userId)) continue;
    const added = tryKcadm(["create", `organizations/${orgId}/members`, "-r", realmName, "-b", body(userId)]);
    if (!added.ok) {
      console.warn(`  ! organization member add failed: ${member.username} ${added.error.slice(0, 160)}`);
      failureCount += 1;
    } else {
      currentIds.add(userId);
    }
  }
}

function retireOrganizationAliases(aliases, organizationsByAlias) {
  const uniqueAliases = [...new Set((aliases || []).filter((alias) => typeof alias === "string" && alias.length > 0))];
  if (uniqueAliases.length === 0) return;

  let retiredCount = 0;
  for (const alias of uniqueAliases) {
    const existing = organizationsByAlias.get(alias);
    if (!existing?.id) continue;

    const members = getJson(["get", `organizations/${existing.id}/members`, "-r", realmName, "-q", "first=0", "-q", "max=500", "--fields", "id,username", "--format", "json"], []);
    for (const member of members) {
      if (member.id) tryKcadm(["delete", `organizations/${existing.id}/members/${member.id}`, "-r", realmName]);
    }

    const deleted = tryKcadm(["delete", `organizations/${existing.id}`, "-r", realmName]);
    if (!deleted.ok) {
      const disabled = tryKcadm(["update", `organizations/${existing.id}`, "-r", realmName, "-b", body({ ...existing, enabled: false })]);
      if (!disabled.ok) {
        console.warn(`  ! organization retire failed: ${alias} ${deleted.error.slice(0, 160)}`);
        failureCount += 1;
        continue;
      }
    }

    organizationsByAlias.delete(alias);
    if (orgsByAliasCache) orgsByAliasCache.delete(alias);
    retiredCount += 1;
  }

  if (retiredCount > 0) console.log(`  retired organizations: ${retiredCount}`);
}

console.log(`Applying demo setup: realm=${realmName}, file=${path.basename(demoFile)}`);
kcadm(["config", "credentials", "--server", "http://localhost:8080", "--realm", "master", "--user", adminUser, "--password", adminPassword]);

const groupsByRef = groupMap();
const usersByUsername = new Map();
for (const user of demo.users || []) {
  if (!user.username) continue;
  const ensured = ensureUser(user);
  const userId = ensured.id;
  if (!userId) continue;
  usersByUsername.set(user.username, userId);
  if (!fastReconcile || ensured.created || (remapAdmins && remapExistingUsers.has(user.username))) {
    assignRealmRoles(userId, user.realmRoles);
    assignClientRoles(userId, user.clientRoles);
    assignGroups(userId, user.groups, groupsByRef);
  }
}
console.log(`  users: ${usersByUsername.size}`);
if (keycloakAssignedIdCount > 0) {
  console.log(
    `  Keycloak-assigned runtime subjects: ${keycloakAssignedIdCount} ` +
      "(application principals remain linked by stable username)",
  );
}

let organizationsByAlias = orgMap();
retireOrganizationAliases(demo.retiredOrganizationAliases || demo.staleOrganizationAliases, organizationsByAlias);
let organizationCount = 0;
const allOrgs = (demo.organizations || []).filter((o) => o.alias);
for (const org of allOrgs) {
  const ensured = ensureOrganization(org, organizationsByAlias);
  const orgId = ensured.id;
  if (!orgId) continue;
  organizationCount += 1;
  const memberCount = (org.members || []).length;
  console.log(`  org [${organizationCount}/${allOrgs.length}] ${org.alias}: ${ensured.created ? "created" : "exists"}, ${memberCount} member(s)`);
  if (forceReconcile && !fastReconcile) {
    replaceOrganizationMembers(orgId, org.members, usersByUsername);
  } else {
    ensureOrganizationMembers(orgId, org.members, usersByUsername);
  }
}
console.log(`  organizations: ${organizationCount}`);
if (failureCount > 0) {
  console.error(`Demo setup completed with ${failureCount} failure(s)`);
  process.exit(1);
}
console.log("Demo setup applied");
