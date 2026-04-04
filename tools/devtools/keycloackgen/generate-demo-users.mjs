/**
 * Generate 63 Keycloak demo users (9 tenants x 7 personas)
 * and patch them into realm-demosetup.json.
 *
 * Usage:  node tools/devtools/keycloackgen/generate-demo-users.mjs
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REALM_PATH = resolve(
  __dirname,
  "../../../mesh/config/iam/realm-demosetup.json",
);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const TENANTS = [
  { code: "demo_my", prefix: "demomy", cc: "MY", emailDomain: "demo.my" },
  { code: "demo_in", prefix: "demoin", cc: "IN", emailDomain: "demo.in" },
  { code: "demo_sa", prefix: "demosa", cc: "SA", emailDomain: "demo.sa" },
  { code: "demo_qa", prefix: "demoqa", cc: "QA", emailDomain: "demo.qa" },
  { code: "demo_fr", prefix: "demofr", cc: "FR", emailDomain: "demo.fr" },
  { code: "demo_de", prefix: "demode", cc: "DE", emailDomain: "demo.de" },
  { code: "demo_ch", prefix: "democh", cc: "CH", emailDomain: "demo.ch" },
  { code: "demo_us", prefix: "demous", cc: "US", emailDomain: "demo.us" },
  { code: "demo_ca", prefix: "democa", cc: "CA", emailDomain: "demo.ca" },
];

const PERSONAS = [
  {
    suffix: "viewer",
    clientRoles: ["neon:PERSONA:viewer", "neon:WORKBENCH:USER"],
  },
  {
    suffix: "reporter",
    clientRoles: ["neon:PERSONA:reporter", "neon:WORKBENCH:USER"],
  },
  {
    suffix: "requester",
    clientRoles: ["neon:PERSONA:requester", "neon:WORKBENCH:USER"],
  },
  {
    suffix: "agent",
    clientRoles: ["neon:PERSONA:agent", "neon:WORKBENCH:OPS"],
  },
  {
    suffix: "manager",
    clientRoles: ["neon:PERSONA:manager", "neon:WORKBENCH:USER"],
  },
  {
    suffix: "module_admin",
    clientRoles: ["neon:PERSONA:module_admin", "neon:WORKBENCH:ADMIN"],
  },
  {
    suffix: "tenant_admin",
    clientRoles: ["neon:PERSONA:tenant_admin", "neon:WORKBENCH:ADMIN"],
  },
];

// Preserve existing Keycloak user UUIDs (critical for idp_identity links)
const EXISTING_IDS = {
  demoin_agent: "d55a058d-2d7c-4d9e-a8f6-d4db2b8ea1e7",
  demoin_manager: "0e405c15-a1ce-4faa-a8ac-32db665a5ca9",
  demoin_reporter: "4fb19dab-3244-4f36-8862-9cd2ef1041dc",
  demoin_requester: "fc19202e-2366-4d15-b491-53fb4df61ce2",
  demoin_tenant_admin: "06295c87-5c59-4914-9c5a-fe6530fbdc78",
  demoin_viewer: "1d13047f-fb34-482b-b48e-c511c7c64040",
  demomy_manager: "88e9fa9a-da3d-4b2e-83b0-e663779a3a0a",
  demomy_viewer: "3b76fefa-de60-4299-8561-3040960b8cea",
  demous_manager: "009afe9b-5ba8-41d4-be2f-c78eeb049090",
};

// Culturally appropriate demo names per tenant (7 per country, ordered by persona)
// Order: viewer, reporter, requester, agent, manager, module_admin, tenant_admin
const NAMES = {
  demo_my: [
    { first: "Aisyah", last: "Wong" }, // viewer
    { first: "Hafiz", last: "Abdullah" }, // reporter
    { first: "Siti", last: "Rahman" }, // requester
    { first: "Rizal", last: "Ismail" }, // agent
    { first: "Ahmad", last: "Ibrahim" }, // manager (existing)
    { first: "Nurul", last: "Hassan" }, // module_admin
    { first: "Farid", last: "Osman" }, // tenant_admin
  ],
  demo_in: [
    { first: "Vikram", last: "Singh" }, // viewer (existing)
    { first: "Meena", last: "Kumar" }, // reporter (existing)
    { first: "Anita", last: "Desai" }, // requester (existing)
    { first: "Arjun", last: "Nair" }, // agent (existing)
    { first: "Raj", last: "Patel" }, // manager (existing)
    { first: "Deepa", last: "Iyer" }, // module_admin
    { first: "Priya", last: "Sharma" }, // tenant_admin (existing)
  ],
  demo_sa: [
    { first: "Fatimah", last: "Al-Rashid" }, // viewer
    { first: "Omar", last: "Al-Faisal" }, // reporter
    { first: "Noura", last: "Al-Qahtani" }, // requester
    { first: "Khalid", last: "Al-Dosari" }, // agent
    { first: "Saleh", last: "Al-Harbi" }, // manager
    { first: "Maha", last: "Al-Shehri" }, // module_admin
    { first: "Abdullah", last: "Al-Otaibi" }, // tenant_admin
  ],
  demo_qa: [
    { first: "Amna", last: "Al-Thani" }, // viewer
    { first: "Hassan", last: "Al-Kuwari" }, // reporter
    { first: "Maryam", last: "Al-Mohannadi" }, // requester
    { first: "Yousef", last: "Al-Emadi" }, // agent
    { first: "Nasser", last: "Al-Attiyah" }, // manager
    { first: "Sheikha", last: "Al-Misnad" }, // module_admin
    { first: "Hamad", last: "Al-Naimi" }, // tenant_admin
  ],
  demo_fr: [
    { first: "Camille", last: "Dubois" }, // viewer
    { first: "Lucas", last: "Bernard" }, // reporter
    { first: "Manon", last: "Leroy" }, // requester
    { first: "Antoine", last: "Moreau" }, // agent
    { first: "Sophie", last: "Laurent" }, // manager
    { first: "Pierre", last: "Roux" }, // module_admin
    { first: "Claire", last: "Fontaine" }, // tenant_admin
  ],
  demo_de: [
    { first: "Anna", last: "Mueller" }, // viewer
    { first: "Lukas", last: "Schmidt" }, // reporter
    { first: "Lena", last: "Fischer" }, // requester
    { first: "Markus", last: "Weber" }, // agent
    { first: "Julia", last: "Schneider" }, // manager
    { first: "Thomas", last: "Hoffmann" }, // module_admin
    { first: "Katharina", last: "Becker" }, // tenant_admin
  ],
  demo_ch: [
    { first: "Lea", last: "Brunner" }, // viewer
    { first: "Noah", last: "Keller" }, // reporter
    { first: "Mia", last: "Huber" }, // requester
    { first: "Luca", last: "Gerber" }, // agent
    { first: "Elena", last: "Widmer" }, // manager
    { first: "Samuel", last: "Steiner" }, // module_admin
    { first: "Nina", last: "Frei" }, // tenant_admin
  ],
  demo_us: [
    { first: "Emily", last: "Davis" }, // viewer
    { first: "Michael", last: "Brown" }, // reporter
    { first: "Jessica", last: "Wilson" }, // requester
    { first: "James", last: "Taylor" }, // agent
    { first: "Sarah", last: "Johnson" }, // manager (existing)
    { first: "David", last: "Martinez" }, // module_admin
    { first: "Rachel", last: "Anderson" }, // tenant_admin
  ],
  demo_ca: [
    { first: "Emma", last: "Tremblay" }, // viewer
    { first: "Liam", last: "Roy" }, // reporter
    { first: "Olivia", last: "Gagnon" }, // requester
    { first: "Ethan", last: "Bouchard" }, // agent
    { first: "Sophie", last: "Cote" }, // manager
    { first: "Nathan", last: "Gauthier" }, // module_admin
    { first: "Chloe", last: "Bergeron" }, // tenant_admin
  ],
};

// Shared credential block (same Argon2 hash for all demo users)
const SHARED_CREDENTIAL_DATA = {
  type: "password",
  userLabel: "Demo password",
  secretData:
    '{"value":"f9t235zCMOdcpzEEQNZ+U3oONEEU2811rZMWLO+owzE=","salt":"D1HM/TRp+MUfb6I5YXZ1HQ==","additionalParameters":{}}',
  credentialData:
    '{"hashIterations":5,"algorithm":"argon2","additionalParameters":{"hashLength":["32"],"memory":["7168"],"type":["id"],"version":["1.3"],"parallelism":["1"]}}',
};

// ---------------------------------------------------------------------------
// Generate users
// ---------------------------------------------------------------------------

function buildUser(tenant, persona, nameEntry, now) {
  const username = `${tenant.prefix}_${persona.suffix}`;
  const email = `${nameEntry.first.toLowerCase()}.${nameEntry.last.toLowerCase().replace(/[- ]/g, "")}@${tenant.emailDomain}`;
  const id = EXISTING_IDS[username] || randomUUID();

  return {
    id,
    username,
    firstName: nameEntry.first,
    lastName: nameEntry.last,
    email,
    emailVerified: true,
    enabled: true,
    createdTimestamp: now,
    totp: false,
    credentials: [],
    disableableCredentialTypes: [],
    requiredActions: [],
    clientRoles: {
      "neon-web": [...persona.clientRoles],
    },
    notBefore: 0,
    groups: [`/org/${tenant.code}/persona/${persona.suffix}`],
  };
}

function generateAllUsers() {
  const now = Date.now();
  const users = [];

  for (const tenant of TENANTS) {
    const names = NAMES[tenant.code];
    for (let i = 0; i < PERSONAS.length; i++) {
      users.push(buildUser(tenant, PERSONAS[i], names[i], now));
    }
  }

  return users;
}

// ---------------------------------------------------------------------------
// Patch realm JSON
// ---------------------------------------------------------------------------

function patchRealm() {
  console.log(`Reading ${REALM_PATH}...`);
  const realm = JSON.parse(readFileSync(REALM_PATH, "utf8"));

  // Separate service accounts from human users
  const serviceAccounts = (realm.users || []).filter((u) =>
    u.username?.startsWith("service-account-"),
  );

  // Generate 63 demo users
  const demoUsers = generateAllUsers();
  console.log(`Generated ${demoUsers.length} demo users`);

  // Combine: demo users + service accounts
  realm.users = [...demoUsers, ...serviceAccounts];

  // Patch organizations: set correct members
  if (realm.organizations) {
    for (const org of realm.organizations) {
      const tenant = TENANTS.find((t) => t.code === org.alias);
      if (tenant) {
        org.members = PERSONAS.map((p) => ({
          username: `${tenant.prefix}_${p.suffix}`,
          membershipType: "UNMANAGED",
        }));
      }
    }
  }

  // Write back
  writeFileSync(REALM_PATH, JSON.stringify(realm, null, 2) + "\n", "utf8");
  console.log(`Wrote ${REALM_PATH}`);
  console.log(
    `  Total users: ${realm.users.length} (${demoUsers.length} demo + ${serviceAccounts.length} service accounts)`,
  );
  console.log(`  Organizations patched: ${realm.organizations?.length || 0}`);

  // Summary
  console.log("\nUser summary:");
  for (const t of TENANTS) {
    const tUsers = demoUsers.filter((u) =>
      u.username.startsWith(t.prefix + "_"),
    );
    console.log(
      `  ${t.code} (${t.prefix}): ${tUsers.map((u) => u.username.split("_").slice(1).join("_")).join(", ")}`,
    );
  }
}

patchRealm();
