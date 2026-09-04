#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const fixturePath = path.join(repoRoot, "stack", "config", "iam", "realm-athyper-demosetup.json");
const checkOnly = process.argv.includes("--check");

const legalEntities = [
  ["01", "athq", "LE-ATHQ"],
  ["02", "acfb", "LE-ACFB"],
  ["03", "adpm", "LE-ADPM"],
  ["04", "aitm", "LE-AITM"],
  ["05", "ajed", "LE-AJED"],
  ["06", "amre", "LE-AMRE"],
  ["07", "aphs", "LE-APHS"],
  ["08", "aqts", "LE-AQTS"],
  ["09", "aqtu", "LE-AQTU"],
  ["0a", "asac", "LE-ASAC"],
  ["0b", "asah", "LE-ASAH"],
  ["0c", "asgf", "LE-ASGF"],
  ["0d", "aspe", "LE-ASPE"],
  ["0e", "atem", "LE-ATEM"],
  ["0f", "auet", "LE-AUET"],
  ["10", "auic", "LE-AUIC"],
  ["11", "auka", "LE-AUKA"],
];

const personas = [
  ["01", "viewer"],
  ["02", "reporter"],
  ["03", "requester"],
  ["04", "agent"],
  ["05", "manager"],
  ["06", "owner"],
  ["07", "admin"],
];

const tenantWideUsernames = [
  "athyper.owner",
  "athyper.admin",
  "athq.owner",
  "athq.admin",
];
const preservedCrossPlaneAdmins = new Set(["catl.admin", "tksa.admin", "ssk.admin", "tegy.admin", "sdtx.admin"]);
const studioTenantAdmins = [
  { tenantCode: "athyper", usernames: ["athyper.admin", "athq.admin"] },
  { tenantCode: "technostat", usernames: ["tksa.admin"] },
  { tenantCode: "cirrusatlantic", usernames: ["catl.admin"] },
];

const athyperRegionByAlias = {
  "ORG-1000000001": "emea", "ORG-1000000002": "apac", "ORG-1000000003": "emea",
  "ORG-1000000004": "emea", "ORG-1000000005": "emea", "ORG-1000000006": "emea",
  "ORG-1000000007": "emea", "ORG-1000000008": "americas", "ORG-1000000009": "apac",
  "ORG-1000000010": "apac", "ORG-1000000011": "americas", "ORG-1000000012": "emea",
  "ORG-1000000013": "apac", "ORG-1000000014": "emea", "ORG-1000000015": "emea",
  "ORG-1000000016": "apac", "ORG-1000000017": "apac",
};

function functionalUsers() {
  const users = [];
  let sequence = 1;
  for (const region of ["apac", "emea", "americas"]) {
    for (const domain of ["procurement", "finance", "people"]) {
      const username = `athyper.${region}.${domain}`;
      const id = `aa02${String(sequence++).padStart(4, "0")}-0000-0000-0000-000000000000`;
      users.push({
        ...user(id, username, title(region), title(domain), domain, false),
        attributes: { tenant_code: ["athyper"], persona: [`regional_${domain}`], identity_scope: ["operating_organization"], principal_id: [id] },
        ...(domain === "procurement" ? {
          realmRoles: ["default-roles-athyper", "NEON_USER", "MESH_BUYER_USER"],
          clientRoles: { "neon-web": ["AUTHORIZED"], "mesh-web": ["AUTHORIZED"] },
        } : {}),
      });
    }
  }
  for (const [index, domain] of ["procurement", "finance", "people"].entries()) {
    const username = `tech.${domain}`;
    const id = `cc00200${index + 1}-0000-0000-0000-000000000000`;
    users.push({
      ...user(id, username, "Technostat", title(domain), domain, false),
      email: `${username}@technostat.demo`,
      attributes: { tenant_code: ["technostat"], persona: [`shared_${domain}`], identity_scope: ["operating_organization"], principal_id: [id] },
      ...(domain === "procurement" ? {
        realmRoles: ["default-roles-athyper", "NEON_USER", "MESH_BUYER_USER"],
        clientRoles: { "neon-web": ["AUTHORIZED"], "mesh-web": ["AUTHORIZED"] },
      } : {}),
    });
  }
  return users;
}

function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function access(persona, tenantLevel = false) {
  const buyer = tenantLevel || persona === "owner" || persona === "admin";
  const administrator = persona === "admin";
  return {
    realmRoles: [
      "default-roles-athyper",
      "NEON_USER",
      ...(buyer ? ["MESH_BUYER_USER"] : []),
      ...(administrator ? ["MESH_PARTNER_USER", "STUDIO_USER"] : []),
    ],
    clientRoles: {
      "neon-web": ["AUTHORIZED"],
      ...(buyer || administrator ? { "mesh-web": ["AUTHORIZED"] } : {}),
      ...(administrator ? { "studio-web": ["AUTHORIZED"] } : {}),
    },
  };
}

function user(id, username, firstName, lastName, persona, tenantLevel = false) {
  return {
    id,
    username,
    enabled: true,
    emailVerified: true,
    firstName,
    lastName,
    email: `${username}@athyper.demo`,
    attributes: {
      tenant_code: ["athyper"],
      persona: [persona],
      principal_id: [id],
      ...(tenantLevel ? { identity_scope: ["tenant"] } : { identity_scope: ["legal_entity"] }),
    },
    ...access(persona, tenantLevel),
    requiredActions: [],
  };
}

function systematicUsers() {
  const users = [];
  for (const [leHex, code] of legalEntities) {
    for (const [personaHex, persona] of personas) {
      const username = `${code}.${persona}`;
      users.push(
        user(
          `aa01${leHex}${personaHex}-0000-0000-0000-000000000000`,
          username,
          code.toUpperCase(),
          title(persona),
          persona,
          tenantWideUsernames.includes(username),
        ),
      );
    }
  }
  users.push(user("aa010006-0000-0000-0000-000000000000", "athyper.owner", "Athyper", "Owner", "owner", true));
  users.push(user("aa010007-0000-0000-0000-000000000000", "athyper.admin", "Athyper", "Admin", "admin", true));
  return [...users, ...functionalUsers()];
}

function isReplacedLegacyUser(username) {
  if (username === "athq.cfo" || username === "athyper.owner" || username === "athyper.admin") return true;
  if (/^athyper\.(apac|emea|americas)\.(procurement|finance|people)$/.test(username)) return true;
  if (/^tech\.(procurement|finance|people)$/.test(username)) return true;
  return legalEntities.some(([, code]) => personas.some(([, persona]) => username === `${code}.${persona}`));
}

function normalizeStudioAccess(value) {
  if (Array.isArray(value)) return value.map(normalizeStudioAccess);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    if (value === "ADMIN_USER") return "STUDIO_USER";
    if (value === "admin-web") return "studio-web";
    return value.replaceAll("ADMIN_USER", "STUDIO_USER").replaceAll("admin-web", "studio-web");
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key === "admin-web" ? "studio-web" : key,
    normalizeStudioAccess(item),
  ]));
}

function normalizePreservedUser(entry) {
  if (!preservedCrossPlaneAdmins.has(entry.username)) return entry;
  return {
    ...entry,
    realmRoles: [...new Set([...(entry.realmRoles || []), "MESH_BUYER_USER", "MESH_PARTNER_USER", "STUDIO_USER"])],
    clientRoles: {
      ...(entry.clientRoles || {}),
      "neon-web": ["AUTHORIZED"],
      "mesh-web": ["AUTHORIZED"],
      "studio-web": ["AUTHORIZED"],
    },
  };
}

function renderFixture(input) {
  input = normalizeStudioAccess(input);
  const generated = systematicUsers();
  const generatedByName = new Map(generated.map((entry) => [entry.username, entry]));
  const preservedUsers = (input.users || []).filter((entry) => !isReplacedLegacyUser(entry.username)).map(normalizePreservedUser);

  const organizations = (input.organizations || []).map((organization) => {
    const legalEntityCode = organization.attributes?.legal_entity_code?.[0];
    const entity = legalEntities.find(([, , code]) => code === legalEntityCode);
    const preservedMembers = (organization.members || []).filter(
      (member) => !isReplacedLegacyUser(member.username),
    );
    const attributes = organization.attributes?.legal_entity_code
      ? {
          ...organization.attributes,
          supplier_account_code: (organization.attributes.buyer_account_code || [])
            .map((code) => code.replace(/^BNA-/, "SNA-")),
        }
      : organization.attributes;
    if (!entity) {
      const functionalMembers = organization.attributes?.tenant_code?.[0] === "technostat"
        ? generated.filter((entry) => entry.username.startsWith("tech."))
          .map(({ id, username }) => ({ id, username }))
        : [];
      const members = [...new Map([...preservedMembers, ...functionalMembers]
        .map((member) => [member.username, member])).values()]
        .sort((a, b) => a.username.localeCompare(b.username));
      return { ...organization, attributes, members };
    }

    const entityUsernamePrefix = `${entity[1]}.`;
    const entityMembers = generated
      .filter((entry) => entry.username.startsWith(entityUsernamePrefix))
      .map(({ id, username }) => ({ id, username }));
    const tenantMembers = tenantWideUsernames.map((username) => {
      const entry = generatedByName.get(username);
      return { id: entry.id, username: entry.username };
    });
    const tenantCode = organization.attributes?.tenant_code?.[0];
    const region = athyperRegionByAlias[organization.alias];
    const functionalMembers = generated.filter((entry) =>
      (tenantCode === "athyper" && region && entry.username.startsWith(`athyper.${region}.`))
      || (tenantCode === "technostat" && entry.username.startsWith("tech.")))
      .map(({ id, username }) => ({ id, username }));
    const members = [...new Map(
      [...preservedMembers, ...entityMembers, ...tenantMembers, ...functionalMembers]
        .map((member) => [member.username, member]),
    ).values()].sort((a, b) => a.username.localeCompare(b.username));
    return { ...organization, attributes, members };
  });

  return {
    ...input,
    version: 4,
    description:
      "Generated unified athyper demo IAM setup. Systematic fixture IDs identify master.principal records; Keycloak assigns the runtime JWT subject and the application reconciles it by username.",
    identityGenerationPolicy: {
      source: "tooling/tools/scripts/generate-athyper-demo-iam.cjs",
      principalIdFormula: "aa<TT><LL><PP>-0000-0000-0000-000000000000",
      tenantHex: "01",
      legalEntityPersonas: personas.map(([, persona]) => persona),
      generatedLegalEntityUsers: legalEntities.length * personas.length,
      generatedTenantUsers: 2,
      generatedFunctionalUsers: 12,
    },
    studioTenantAdmins,
    organizations,
    users: [...generated, ...preservedUsers].sort((a, b) => a.username.localeCompare(b.username)),
  };
}

const source = fs.readFileSync(fixturePath, "utf8");
const input = JSON.parse(source);
const output = `${JSON.stringify(renderFixture(input), null, 2)}\n`;

if (checkOnly) {
  if (source !== output) {
    console.error(`IAM demo fixture is stale. Run: node ${path.relative(repoRoot, __filename)}`);
    process.exit(1);
  }
  console.log("IAM demo fixture is current.");
} else {
  fs.writeFileSync(fixturePath, output);
  console.log(`Generated ${path.relative(repoRoot, fixturePath)}.`);
}
