import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const STAGING_PROVIDER_KEYS = Object.freeze([
  "ATHYPER_ENV",
  "EMAIL_PROVIDER",
  "SES_REGION",
  "SES_CONFIGURATION_SET",
  "SES_FROM",
  "SES_REPLY_TO",
  "SES_EVENT_QUEUE_URL",
  "SES_EVENT_REGION",
]);

const REQUIRED = Object.freeze([
  "ATHYPER_ENV",
  "EMAIL_PROVIDER",
  "SES_REGION",
  "SES_CONFIGURATION_SET",
  "SES_FROM",
  "SES_EVENT_QUEUE_URL",
  "SES_EVENT_REGION",
]);

export function stagingProviderPath(root) {
  return join(root, "instances", "stg", "provider.env");
}

export function parseProviderEnvironment(text, source = "provider.env") {
  const allowed = new Set(STAGING_PROVIDER_KEYS);
  const result = {};
  for (const [index, raw] of String(text).split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`${source}:${index + 1}: expected KEY=value`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!allowed.has(key)) throw new Error(`${source}:${index + 1}: unsupported provider key ${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`${source}:${index + 1}: duplicate provider key ${key}`);
    if (!value) throw new Error(`${source}:${index + 1}: ${key} is empty`);
    if (/['"`\r\n]/u.test(value)) throw new Error(`${source}:${index + 1}: quoted or multiline values are not supported`);
    result[key] = value;
  }
  return result;
}

export function stagingProviderProblems(environment) {
  const problems = [];
  for (const key of REQUIRED) {
    if (!environment[key]?.trim()) problems.push(`${key} is required`);
  }
  if (environment.ATHYPER_ENV && environment.ATHYPER_ENV !== "staging") {
    problems.push("ATHYPER_ENV must be staging");
  }
  if (environment.EMAIL_PROVIDER && environment.EMAIL_PROVIDER !== "ses") {
    problems.push("EMAIL_PROVIDER must be ses");
  }
  const region = environment.SES_REGION?.trim();
  const eventRegion = environment.SES_EVENT_REGION?.trim();
  if (region && !/^[a-z]{2}(?:-[a-z]+)+-[0-9]+$/u.test(region)) {
    problems.push("SES_REGION must be a valid AWS region");
  }
  if (eventRegion && region && eventRegion !== region) {
    problems.push("SES_EVENT_REGION must match SES_REGION");
  }
  if (environment.SES_CONFIGURATION_SET
    && !/^[A-Za-z0-9_-]{1,64}$/u.test(environment.SES_CONFIGURATION_SET)) {
    problems.push("SES_CONFIGURATION_SET has an invalid format");
  }
  for (const key of ["SES_FROM", "SES_REPLY_TO"]) {
    if (environment[key] && !/^\S+@\S+\.\S+$/u.test(environment[key])) {
      problems.push(`${key} must be an email address`);
    }
  }
  if (environment.SES_EVENT_QUEUE_URL) {
    try {
      const queue = new URL(environment.SES_EVENT_QUEUE_URL);
      if (queue.protocol !== "https:" || !/^sqs[.-]/u.test(queue.hostname)) throw new Error();
      if (region && !queue.hostname.includes(region)) problems.push("SES_EVENT_QUEUE_URL must use SES_REGION");
    } catch {
      problems.push("SES_EVENT_QUEUE_URL must be an AWS SQS HTTPS URL");
    }
  }
  return [...new Set(problems)];
}

export function loadStagingProviderEnvironment(root, baseEnvironment = process.env) {
  const path = stagingProviderPath(root);
  let fileEnvironment = {};
  const problems = [];
  if (!existsSync(path)) {
    problems.push(`provider configuration is absent: ${path}`);
  } else {
    const stat = statSync(path);
    if (!stat.isFile()) problems.push(`provider configuration is not a regular file: ${path}`);
    else if ((stat.mode & 0o077) !== 0) problems.push(`provider configuration must be owner-only: ${path}`);
    else {
      try {
        fileEnvironment = parseProviderEnvironment(readFileSync(path, "utf8"), path);
      } catch (error) {
        problems.push(error.message);
      }
    }
  }
  const overrides = Object.fromEntries(STAGING_PROVIDER_KEYS
    .filter((key) => baseEnvironment[key]?.trim())
    .map((key) => [key, baseEnvironment[key].trim()]));
  const environment = { ...fileEnvironment, ...overrides };
  problems.push(...stagingProviderProblems(environment));
  return { path, environment, problems: [...new Set(problems)] };
}

export function writeStagingProviderEnvironment(path, environment) {
  const selected = Object.fromEntries(STAGING_PROVIDER_KEYS
    .filter((key) => environment[key]?.trim())
    .map((key) => [key, environment[key].trim()]));
  const problems = stagingProviderProblems(selected);
  if (problems.length) throw new Error(`Invalid STAGING provider configuration:\n- ${problems.join("\n- ")}`);
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}`;
  const contents = `${STAGING_PROVIDER_KEYS
    .filter((key) => selected[key])
    .map((key) => `${key}=${selected[key]}`)
    .join("\n")}\n`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  return path;
}
