#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const fixturePath = path.join(repoRoot, "stack", "config", "iam", "realm-athyper-demosetup.json");
const seedRoot = path.join(repoRoot, "server", "db", "seed");
const manifestPath = path.join(seedRoot, "manifests", "three-plane-demo.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

const fixture = readJson(fixturePath);
const manifest = readJson(manifestPath);
const authorizationPacks = Object.fromEntries(
  Object.entries(manifest.planes).map(([plane, definition]) => [
    plane,
    readJson(path.resolve(path.dirname(manifestPath), definition.authorizationPack)),
  ]),
);
const scenarioPacks = Object.fromEntries(
  manifest.tenants.map((tenant) => [
    tenant.code,
    readJson(path.resolve(path.dirname(manifestPath), tenant.scenarioPack)),
  ]),
);
const errors = [];
const expectedStudioTenantAdmins = new Map([
  ["athyper", ["athyper.admin", "athq.admin"]],
  ["technostat", ["tksa.admin"]],
  ["cirrusatlantic", ["catl.admin"]],
]);

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

const configuredStudioTenantAdmins = new Map(
  (fixture.studioTenantAdmins || []).map((entry) => [entry.tenantCode, entry.usernames]),
);
for (const [tenantCode, expectedUsernames] of expectedStudioTenantAdmins) {
  const configured = configuredStudioTenantAdmins.get(tenantCode) || [];
  if (JSON.stringify([...configured].sort()) !== JSON.stringify([...expectedUsernames].sort())) {
    errors.push(`${tenantCode}: Studio tenant admins do not match the explicit demo contract`);
  }
  for (const username of configured) {
    const user = byName.get(username);
    if (!user) errors.push(`${tenantCode}: missing Studio tenant admin ${username}`);
    else {
      if (!user.realmRoles?.includes("STUDIO_USER")) errors.push(`${username}: missing STUDIO_USER`);
      if (!user.clientRoles?.["studio-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing studio-web.AUTHORIZED`);
    }
  }
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
    if (!user.clientRoles?.["mesh-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing mesh-web.AUTHORIZED`);
  }
  if (username.endsWith(".admin")) {
    if (!user.realmRoles?.includes("MESH_PARTNER_USER")) errors.push(`${username}: missing MESH_PARTNER_USER`);
    if (!user.realmRoles?.includes("STUDIO_USER")) errors.push(`${username}: missing STUDIO_USER`);
    if (!user.clientRoles?.["studio-web"]?.includes("AUTHORIZED")) errors.push(`${username}: missing studio-web.AUTHORIZED`);
  }
}

for (const [leHex, code, legalEntityCode] of legalEntities) {
  const organization = (fixture.organizations || []).find(
    (entry) => entry.attributes?.legal_entity_code?.[0] === legalEntityCode,
  );
  if (!organization) errors.push(`missing organization for ${legalEntityCode}`);
  const members = new Map((organization?.members || []).map((entry) => [entry.username, entry.id]));
  for (const [personaHex, persona] of personas) {
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

const tenantByCode = new Map(manifest.tenants.map((tenant) => [tenant.code, tenant]));
const fixtureTenantOrganizations = new Map(
  (fixture.tenantOrganizations || []).map((organization) => [organization.alias, organization]),
);
for (const tenant of manifest.tenants) {
  if (tenant.keycloakOrganizationAlias !== tenant.id) {
    errors.push(`${tenant.code}: tenant organization alias must equal tenant UUID`);
  }
  const organization = fixtureTenantOrganizations.get(tenant.id);
  if (!organization) {
    errors.push(`${tenant.code}: missing tenant organization declaration ${tenant.id}`);
  } else {
    if (organization.name !== tenant.displayName) {
      errors.push(`${tenant.code}: tenant organization name does not match manifest`);
    }
    if (organization.enabled !== true) errors.push(`${tenant.code}: tenant organization is disabled`);
    if (organization.attributes?.tenant_code?.[0] !== tenant.code) {
      errors.push(`${tenant.code}: tenant organization declaration has the wrong tenant_code`);
    }
  }

  const scenario = scenarioPacks[tenant.code];
  if (!scenario || scenario.tenantCode !== tenant.code || scenario.plane !== "neon") {
    errors.push(`${tenant.code}: missing or invalid Neon tenant scenario pack`);
    continue;
  }
  for (const entity of scenario.legalEntities || []) {
    const legalOrganization = (fixture.organizations || []).find(
      (entry) => entry.alias === entity.scopeKey,
    );
    if (!legalOrganization) {
      errors.push(`${tenant.code}: missing legal-entity organization ${entity.scopeKey}`);
      continue;
    }
    if (legalOrganization.attributes?.tenant_code?.[0] !== tenant.code) {
      errors.push(`${entity.scopeKey}: Keycloak tenant_code does not match ${tenant.code}`);
    }
    if (legalOrganization.attributes?.legal_entity_code?.[0]?.toLowerCase() !== entity.code) {
      errors.push(`${entity.scopeKey}: Keycloak legal_entity_code does not match ${entity.code}`);
    }
    if (legalOrganization.name !== entity.name) {
      errors.push(`${entity.scopeKey}: Keycloak organization name does not match scenario pack`);
    }
    const buyer = legalOrganization.attributes?.buyer_account_code?.[0];
    const supplier = legalOrganization.attributes?.supplier_account_code?.[0];
    if (!/^BNA-[0-9]{10}$/.test(buyer || "")) errors.push(`${entity.scopeKey}: invalid buyer account`);
    if (!/^SNA-[0-9]{10}$/.test(supplier || "")) errors.push(`${entity.scopeKey}: invalid supplier account`);
    if (buyer === supplier) errors.push(`${entity.scopeKey}: buyer and supplier accounts must be distinct`);
  }
}

const organizationMembers = new Map(
  (fixture.organizations || []).map((organization) => [
    organization.alias,
    new Set((organization.members || []).map((member) => member.id)),
  ]),
);
let compiledContextCount = 0;
let compiledLegalScopeCount = 0;
for (const [plane, pack] of Object.entries(authorizationPacks)) {
  const expectedRealmRole = plane === "studio" ? "STUDIO_USER" : plane === "neon" ? "NEON_USER" : null;
  const expectedClient = `${plane}-web`;
  for (const subject of pack.subjectAssignments || []) {
    const assignments = (subject.planes || []).filter((assignment) => assignment.plane === plane);
    if (assignments.length === 0) continue;
    const user = byId.get(subject.keycloakSubject);
    if (!user) {
      errors.push(`${plane}/${subject.username}: compiled Keycloak subject does not exist`);
      continue;
    }
    if (user.username !== subject.username) {
      errors.push(`${plane}/${subject.keycloakSubject}: compiled username does not match Keycloak`);
    }
    if (subject.principalId !== subject.keycloakSubject) {
      errors.push(`${plane}/${subject.username}: compiled external principal coordinate differs from subject`);
    }
    for (const tenantCode of subject.tenantCodes || []) {
      if (!tenantByCode.has(tenantCode)) errors.push(`${plane}/${subject.username}: unknown tenant ${tenantCode}`);
      compiledContextCount += 1;
    }
    if (expectedRealmRole && !user.realmRoles?.includes(expectedRealmRole)) {
      errors.push(`${plane}/${subject.username}: missing ${expectedRealmRole}`);
    }
    if (plane === "mesh" && !(user.realmRoles || []).some((role) => /^MESH_.+_USER$/.test(role))) {
      errors.push(`${plane}/${subject.username}: missing a Mesh realm access role`);
    }
    if (!user.clientRoles?.[expectedClient]?.includes("AUTHORIZED")) {
      errors.push(`${plane}/${subject.username}: missing ${expectedClient}.AUTHORIZED`);
    }
    for (const assignment of assignments) {
      for (const scope of assignment.scopedRoleAssignments || []) {
        if (scope.scopeKind !== "legal_entity") continue;
        compiledLegalScopeCount += 1;
        const members = organizationMembers.get(scope.scopeKey);
        if (!members) errors.push(`${plane}/${subject.username}: unknown legal-entity scope ${scope.scopeKey}`);
        else if (!members.has(subject.keycloakSubject)) {
          errors.push(`${plane}/${subject.username}: not a Keycloak member of ${scope.scopeKey}`);
        }
      }
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

console.log(
  `IAM demo fixture contract passed: ${users.length} users, 121 systematic identities, `
  + `${manifest.tenants.length} tenants, ${fixture.organizations.length} business organizations, `
  + `${compiledContextCount} compiled plane contexts, ${compiledLegalScopeCount} legal-scope grants.`,
);
