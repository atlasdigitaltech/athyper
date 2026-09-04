#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const paths = [
  "stack/config/iam/realm-athyper.json",
  "stack/config/iam/realm-athyper-demosetup.json",
];

for (const path of paths) {
  const document = JSON.parse(await readFile(path, "utf8"));
  const contracted = contract(document);
  await writeFile(path, `${JSON.stringify(contracted, null, 2)}\n`);
}

function contract(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isRetiredMapper(item))
      .map(contract);
  }
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^personas?$/i.test(key)) continue;
    output[key] = contract(item);
  }
  return output;
}

function isRetiredMapper(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const name = String(value.name ?? "");
  const config = value.config ?? {};
  return /^persona$/i.test(name)
    || /^athyper\.persona$/i.test(String(config["claim.name"] ?? ""))
    || /^persona$/i.test(String(config["user.attribute"] ?? ""));
}
