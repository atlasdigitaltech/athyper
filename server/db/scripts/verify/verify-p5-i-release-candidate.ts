#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

type Component = {
  code: string;
  paths: string[];
  exclude?: string[];
  sha256: string;
};
type Manifest = {
  contractVersion: string;
  candidateId: string;
  components: Component[];
  aggregateSha256: string;
};

const root = resolve(import.meta.dirname, "../../../..");
const manifestPath = resolve(
  root,
  "server/db/config/qualification/p5-i-release-candidate.v1.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
const capture = process.argv.includes("--capture");

if (manifest.contractVersion !== "p5-i.release-candidate.v1") {
  throw new Error("Unsupported P5-I release-candidate contract");
}

async function filesBelow(path: string): Promise<string[]> {
  const absolute = resolve(root, path);
  const details = await stat(absolute).catch(() => undefined);
  if (!details) throw new Error(`P5-I candidate path is missing: ${path}`);
  if (details.isFile()) return [path.replaceAll("\\", "/")];
  const result: string[] = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(entry.name)) continue;
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(relative(root, child)));
    else if (entry.isFile()) result.push(relative(root, child).replaceAll("\\", "/"));
  }
  return result;
}

async function componentHash(component: Component) {
  const excluded = new Set((component.exclude ?? []).map((path) => path.replaceAll("\\", "/")));
  const files = [...new Set((await Promise.all(component.paths.map(filesBelow))).flat())]
    .filter((path) => !excluded.has(path))
    .sort();
  if (files.length === 0) throw new Error(`P5-I component is empty: ${component.code}`);
  const digest = createHash("sha256");
  for (const path of files) {
    digest.update(path).update("\0").update(await readFile(resolve(root, path))).update("\0");
  }
  return { code: component.code, sha256: digest.digest("hex"), files: files.length };
}

const components = await Promise.all(manifest.components.map(componentHash));
const aggregate = createHash("sha256");
for (const component of components) {
  aggregate.update(component.code).update("\0").update(component.sha256).update("\0");
}
const aggregateSha256 = aggregate.digest("hex");
const mismatches = components.filter((actual) =>
  manifest.components.find((item) => item.code === actual.code)?.sha256 !== actual.sha256);
const passed = !capture && mismatches.length === 0
  && manifest.aggregateSha256 === aggregateSha256;

process.stdout.write(JSON.stringify({
  contractVersion: manifest.contractVersion,
  candidateId: manifest.candidateId,
  mode: capture ? "capture" : "verify",
  passed,
  aggregateSha256,
  components,
  mismatches: mismatches.map((item) => item.code),
}, null, 2) + "\n");
if (!capture && !passed) process.exitCode = 2;
