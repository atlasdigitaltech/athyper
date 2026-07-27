#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const corpusArgument = process.argv.find((argument) => argument.startsWith("--corpus="));
if (!corpusArgument) throw new Error("--corpus=<path> is required.");
const corpusPath = resolve(corpusArgument.slice("--corpus=".length));
const strict = process.argv.includes("--strict");
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
const failures: string[] = [];

if (corpus.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (corpus.readOnly !== true) failures.push("readOnly must be true");
if (!Array.isArray(corpus.identityInventory?.neonActivePrincipals)) {
  failures.push("Neon active-principal inventory is missing");
}
if (!Array.isArray(corpus.actions) || corpus.actions.length === 0) {
  failures.push("No high-risk actions were captured");
}
if (!Array.isArray(corpus.cases)) failures.push("Decision cases are missing");

const principals = corpus.identityInventory?.neonActivePrincipals ?? [];
const actions = corpus.actions ?? [];
const cases = corpus.cases ?? [];
const expected = principals.length * actions.length;
if (cases.length !== expected) {
  failures.push(`Expected ${expected} Neon principal/action cases, found ${cases.length}`);
}
if (new Set(cases.map((item: { caseId: string }) => item.caseId)).size !== cases.length) {
  failures.push("caseId values are not unique");
}
if (hashCanonical(cases) !== corpus.hashes?.casesSha256) {
  failures.push("casesSha256 does not match canonical cases");
}
if (hashCanonical(actions) !== corpus.hashes?.actionsSha256) {
  failures.push("actionsSha256 does not match canonical actions");
}
if (strict) {
  for (const [gate, passed] of Object.entries(corpus.coverage?.gates ?? {})) {
    if (!passed) failures.push(`Strict coverage gate failed: ${gate}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `FAIL ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS authorization golden corpus (${principals.length} principals, ${actions.length} actions, ${cases.length} cases)\n`,
  );
}

function hashCanonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
