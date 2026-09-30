#!/usr/bin/env node
/**
 * Applies environment-specific Keycloak realm policy to importable IAM realm
 * files. Demo setup fixtures are intentionally skipped.
 */

const fs = require("fs");
const path = require("path");

const LOCAL_STAGING_PASSWORD_POLICY = "length(8) and upperCase(1) and digits(1) and specialChars(1) and notUsername";
const PRODUCTION_PASSWORD_POLICY = "length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername";

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function policyFor(environment) {
  if (environment === "production") return PRODUCTION_PASSWORD_POLICY;
  if (environment === "local" || environment === "staging") return LOCAL_STAGING_PASSWORD_POLICY;
  throw new Error(`Unsupported environment: ${environment}`);
}

function candidateFiles(root, explicitFiles) {
  if (explicitFiles.length > 0) return explicitFiles;
  return fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(root, name));
}

function applyToFile(file, passwordPolicy, write) {
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);

  if (!json.realm || json.importableByKeycloak === false) {
    return { skipped: true, file, realm: json.realm || null };
  }

  const before = json.passwordPolicy || "";
  json.passwordPolicy = passwordPolicy;

  if (write && before !== passwordPolicy) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }

  return {
    skipped: false,
    changed: before !== passwordPolicy,
    file,
    realm: json.realm,
    before,
    after: passwordPolicy,
  };
}

const args = parseArgs(process.argv.slice(2));
const environment = String(args.environment || process.env.ENVIRONMENT || "local").toLowerCase();
const root = args.root || process.cwd();
const write = args.write === "true" || args.write === "1";
const files = args.file ? String(args.file).split(";").filter(Boolean) : [];
const passwordPolicy = policyFor(environment);

if (!fs.existsSync(root)) {
  console.error(`IAM config root not found: ${root}`);
  process.exit(1);
}

const results = candidateFiles(root, files).map((file) => applyToFile(file, passwordPolicy, write));
const touched = results.filter((result) => !result.skipped);

for (const result of touched) {
  const rel = path.relative(process.cwd(), result.file) || result.file;
  const status = result.changed ? (write ? "UPDATED" : "DRIFTED") : "OK";
  console.log(`${status} ${result.realm} passwordPolicy ${rel}`);
}

if (!write && touched.some((result) => result.changed)) {
  process.exit(2);
}
