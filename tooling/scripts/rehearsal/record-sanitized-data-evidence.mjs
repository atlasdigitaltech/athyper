#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultRepoRoot } from "../../../deploy/stackctl/src/io.mjs";
import { createValidator } from "../../../deploy/stackctl/src/schema.mjs";

const CREDENTIAL_KEY = /(?:password|passwd|secret|access.?token|refresh.?token|private.?key|credential|session.?token)/iu;
const SAFE_MARKER = /^(?:redacted|masked|removed|synthetic|not-applicable|\*+)$/iu;
const RAW_CREDENTIAL_PATTERNS = Object.freeze([
  ["pem-private-key", /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/u],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/iu],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u],
]);
const EMAIL = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/giu;
const PHONE = /(?:^|[^0-9])(?:\+?[1-9][0-9][0-9 ()-]{7,}[0-9])(?:$|[^0-9])/u;

function usage() {
  return "Usage: record-sanitized-data-evidence.mjs --dataset <qa-sanitized-export.json> --output <sanitized-data-manifest.json>";
}

function argumentsOf(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!["--dataset", "--output"].includes(flag) || !value || value.startsWith("--")) throw new Error(usage());
    options[flag.slice(2)] = resolve(value);
  }
  if (!options.dataset || !options.output) throw new Error(usage());
  return options;
}

function findings(records) {
  const credential = new Set();
  const personal = new Set();
  const visit = (value, path, key = "") => {
    if (value === null || value === undefined) return;
    if (typeof value === "object") {
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`, key));
      else for (const [childKey, child] of Object.entries(value)) visit(child, `${path}.${childKey}`, childKey);
      return;
    }
    const text = String(value);
    if (CREDENTIAL_KEY.test(key) && text && !SAFE_MARKER.test(text)) credential.add(`credential-field:${path}`);
    for (const [id, pattern] of RAW_CREDENTIAL_PATTERNS) if (pattern.test(text)) credential.add(`${id}:${path}`);
    for (const match of text.matchAll(EMAIL)) {
      const domain = match[1].toLowerCase();
      if (!(domain.endsWith(".test") || domain === "example.com" || domain.endsWith(".example.com"))) {
        personal.add(`non-synthetic-email:${path}`);
      }
    }
    if (PHONE.test(text)) personal.add(`phone-like-value:${path}`);
  };
  records.forEach((record, index) => visit(record, `records[${index}]`));
  return { credential: [...credential].sort(), personal: [...personal].sort() };
}

function atomicJson(path, document) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export function recordSanitizedDataEvidence(repoRoot, datasetPath, outputPath) {
  const bytes = readFileSync(datasetPath);
  const dataset = JSON.parse(bytes.toString("utf8"));
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)
    || dataset.sourceInstance !== "qa" || !Array.isArray(dataset.records)) {
    throw new Error("Sanitized export must be a JSON object with sourceInstance=qa and a records array");
  }
  const scan = findings(dataset.records);
  if (scan.credential.length || scan.personal.length) {
    throw new Error(`Sanitized-data scan failed:\n${[...scan.credential, ...scan.personal].map((item) => `- ${item}`).join("\n")}`);
  }
  const createdAt = new Date().toISOString();
  const evidence = {
    apiVersion: "athyper.io/v1alpha1",
    kind: "SanitizedDataManifest",
    metadata: { instance: "stg" },
    spec: {
      sourceInstance: "qa",
      classification: "sanitized",
      createdAt,
      datasetSha256: createHash("sha256").update(bytes).digest("hex"),
      recordCount: dataset.records.length,
      checks: {
        credentialScanPassed: true,
        personalDataScanPassed: true,
        prohibitedContentFound: [],
      },
    },
  };
  createValidator(repoRoot)(evidence, outputPath);
  atomicJson(outputPath, evidence);
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = argumentsOf(process.argv.slice(2));
    const evidence = recordSanitizedDataEvidence(defaultRepoRoot, options.dataset, options.output);
    process.stdout.write(`Recorded ${evidence.spec.recordCount} sanitized QA records at ${options.output}; dataset content was not printed.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
