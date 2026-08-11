#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const fixturePath = path.join(repoRoot, "stack", "config", "iam", "realm-athyper-demosetup.json");
const principalSeedPath = path.join(
  repoRoot,
  "server",
  "db",
  "seed",
  "tenants",
  "neon",
  "010_demo",
  "900_principals",
  "001_demo_principals.sql",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const principalSeed = fs.readFileSync(principalSeedPath, "utf8");
const errors = [];

const legalEntities = [
  ["01", "athq", "LE-ATHQ"], ["02", "acfb", "LE-ACFB"], ["03", "adpm", "LE-ADPM"],
  ["04", "aitm", "LE-AITM"], ["05", "ajed", "LE-AJED"], ["06", "amre", "LE-AMRE"],
  ["07", "aphs", "LE-APHS"], ["08", "aqts", "LE-AQTS"], ["09", "aqtu", "LE-AQTU"],
  ["0a", "asac", "LE-ASAC"], ["0b", "asah", "LE-ASAH"], ["0c", "asgf", "LE-ASGF"],
  ["0d", "aspe", "LE-ASPE"], ["0e", "atem", "LE-ATEM"], ["0f", "auet", "LE-AUET"],
  ["10", "auic", "LE-AUIC"], ["11", "auka", "LE-AUKA"],
];
const personas = [
  ["01", "viewer"], ["02", "reporter"], ["03", "requester"], ["04", "agent"],
  ["05", "manager"], ["06", "owner"], ["07", "admin"],
];

const users = fixture.users || [];
const byName = new Map();
const byId = new Map();
for (const user of users) {
  if (byName.has(user.username)) errors.push(`duplicate username: ${user.username}`);
  if (byId.has(user.id)) errors.push(`duplicate user id: ${user.id}`);
  byName.set(user.username, user);
  byId.set(user.id, user);
}

function requireUser(username, expectedId, elevated) {
  const user = byName.get(username);
  if (!user) {
    errors.push(`missing generated user: ${username}`);
    return;
  }
  if (user.id !== expectedId) errors.push(`${username}: expected id ${expectedId}, got ${user.id}`);
  if (user.attributes?.principal_id?.[0] !== expectedId) {
    errors.push(`${username}: principal_id attribute does not match ${expectedId}`);
  }
  if (user.id.startsWith("aa001000-")) errors.push(`${username}: retains legacy aa001000 id`);
  if (!user.realmRoles?.includes("NEON_USER")) errors.push(`${username}: missing NEON_USER`);
  if (!user.clientRoles?.["neon-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing neon-web.AUTHORIZED`);
  if (elevated) {
    if (!user.realmRoles?.includes("MESH_BUYER_USER")) errors.push(`${username}: missing MESH_BUYER_USER`);
    if (!user.realmRoles?.includes("STUDIO_USER")) errors.push(`${username}: missing STUDIO_USER`);
    if (!user.clientRoles?.["mesh-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing mesh-web.AUTHORIZED`);
    if (!user.clientRoles?.["studio-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing studio-web.AUTHORIZED`);
  }
}

for (const [leHex, code, legalEntityCode] of legalEntities) {
  if (!principalSeed.includes(`('${leHex}','${code}')`)) {
    errors.push(`database principal seed is missing legal entity tuple: ${leHex}/${code}`);
  }
  const organization = (fixture.organizations || []).find(
    (entry) => entry.attributes?.legal_entity_code?.[0] === legalEntityCode,
  );
  if (!organization) errors.push(`missing organization for ${legalEntityCode}`);
  const members = new Map((organization?.members || []).map((entry) => [entry.username, entry.id]));
  for (const [personaHex, persona] of personas) {
    if (!principalSeed.includes(`('${personaHex}','${persona}')`)) {
      errors.push(`database principal seed is missing persona tuple: ${personaHex}/${persona}`);
    }
    const username = `${code}.${persona}`;
    const id = `aa01${leHex}${personaHex}-0000-0000-0000-000000000000`;
    requireUser(username, id, persona === "owner" || persona === "admin");
    if (members.get(username) !== id) errors.push(`${legalEntityCode}: missing or invalid member ${username}`);
  }
  for (const username of ["athyper.owner", "athyper.admin", "athq.owner", "athq.admin"]) {
    const expectedId = byName.get(username)?.id;
    if (members.get(username) !== expectedId) {
      errors.push(`${legalEntityCode}: missing tenant-level member ${username}`);
    }
  }
}

requireUser("athyper.owner", "aa010006-0000-0000-0000-000000000000", true);
requireUser("athyper.admin", "aa010007-0000-0000-0000-000000000000", true);
for (const username of ["athq.owner", "athq.admin"]) {
  if (byName.get(username)?.attributes?.identity_scope?.[0] !== "tenant") {
    errors.push(`${username}: expected tenant identity scope`);
  }
}
if (byName.has("athq.cfo")) errors.push("removed legacy user still exists: athq.cfo");

for (const organization of fixture.organizations || []) {
  for (const member of organization.members || []) {
    const user = byName.get(member.username);
    if (!user) errors.push(`${organization.alias}: member user does not exist: ${member.username}`);
    else if (user.id !== member.id) errors.push(`${organization.alias}: member id mismatch for ${member.username}`);
  }
}

if (errors.length) {
  console.error(`IAM demo fixture contract failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`IAM demo fixture contract passed: ${users.length} users, 121 systematic identities, ${fixture.organizations.length} organizations.`);
