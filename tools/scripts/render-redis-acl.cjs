#!/usr/bin/env node
/**
 * Render stack/config/memorycache/redis-acl.conf.tpl into the live config root.
 *
 * Redis ACL files use SHA-256 password hashes. Rendering before container start
 * keeps secrets out of Compose command lines and avoids startup substitution.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REQUIRED_KEYS = [
  "MEMORYCACHE_PASSWORD",
  "REDIS_EXPORTER_PASSWORD",
  "REDIS_GLITCHTIP_PASSWORD",
  "REDIS_INFISICAL_PASSWORD",
  "REDIS_ADMIN_PASSWORD",
];

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    out[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

function parseEnvFile(file) {
  const env = {};
  if (!file || !fs.existsSync(file)) return env;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 0) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = stripInlineComment(trimmed.slice(equals + 1)).trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    env[key] = value;
  }
  return env;
}

function stripInlineComment(value) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }

  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const stackDir = path.resolve(args["stack-dir"] || path.join(__dirname, "..", "..", "stack"));
const envFile = args["env-file"] ? path.resolve(args["env-file"]) : path.join(stackDir, "env", ".env");
const env = { ...parseEnvFile(envFile), ...process.env };

const configRoot = env.ATHYPER_CONFIG_ROOT || env.ATHYPER_CONFIG || path.join(stackDir, "config");
const templateFile = path.join(stackDir, "config", "memorycache", "redis-acl.conf.tpl");
const outputFile = path.join(configRoot, "memorycache", "redis-acl.conf");

const missing = REQUIRED_KEYS.filter((key) => !env[key] || /^\$\{.+\}$/.test(env[key]));
if (missing.length > 0) {
  console.error(`FAIL Redis ACL cannot be rendered. Missing/unresolved: ${missing.join(", ")}`);
  process.exit(1);
}

if (!fs.existsSync(templateFile)) {
  console.error(`FAIL Redis ACL template not found: ${templateFile}`);
  process.exit(1);
}

let rendered = fs.readFileSync(templateFile, "utf8")
  .replaceAll("__APP_HASH__", sha256(env.MEMORYCACHE_PASSWORD))
  .replaceAll("__EXPORTER_HASH__", sha256(env.REDIS_EXPORTER_PASSWORD))
  .replaceAll("__GLITCHTIP_HASH__", sha256(env.REDIS_GLITCHTIP_PASSWORD))
  .replaceAll("__INFISICAL_HASH__", sha256(env.REDIS_INFISICAL_PASSWORD))
  .replaceAll("__ADMIN_HASH__", sha256(env.REDIS_ADMIN_PASSWORD));

const leftovers = rendered.match(/__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__/g);
if (leftovers) {
  console.error(`FAIL Redis ACL still contains unrendered tokens: ${[...new Set(leftovers)].join(", ")}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, rendered);
console.log(`  [ACL] Redis ACL rendered -> ${outputFile}`);
