#!/usr/bin/env node

const fs = require("fs");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    result[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const realmFile = args["realm-file"];
const demoFile = args["demo-file"];

if (!realmFile || !demoFile || !fs.existsSync(realmFile) || !fs.existsSync(demoFile)) {
  console.error(
    "Usage: node prepare-keycloak-realm-import.cjs --realm-file <import.json> --demo-file <demo.json>",
  );
  process.exit(1);
}

const realm = JSON.parse(fs.readFileSync(realmFile, "utf8"));
const demo = JSON.parse(fs.readFileSync(demoFile, "utf8"));
if (!realm.realm || demo.realm !== realm.realm || demo.importableByKeycloak !== false) {
  console.error(`Realm/demo fixture mismatch: realm=${realm.realm || "(missing)"} demo=${demo.realm || "(missing)"}`);
  process.exit(1);
}

const demoUsers = (demo.users || []).filter((user) => user.username);
const demoNames = new Set(demoUsers.map((user) => user.username));
const demoIds = new Set(demoUsers.map((user) => user.id).filter(Boolean));
const retainedUsers = (realm.users || []).filter(
  (user) => !demoNames.has(user.username) && (!user.id || !demoIds.has(user.id)),
);

realm.users = [...retainedUsers, ...demoUsers];
fs.writeFileSync(realmFile, `${JSON.stringify(realm, null, 2)}\n`);
console.log(
  `Prepared Keycloak import for ${realm.realm}: ${demoUsers.length} stable demo users, ${retainedUsers.length} retained realm users.`,
);
