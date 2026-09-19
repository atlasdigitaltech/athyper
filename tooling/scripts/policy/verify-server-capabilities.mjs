#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const profiles = JSON.parse(readFileSync(join(root, "governance/config/deployment/profiles.json"), "utf8")).profiles;
const document = JSON.parse(readFileSync(join(root, "governance/config/deployment/server-capabilities.json"), "utf8"));
const errors = [];
const ids = new Set();
const profileNames = Object.keys(profiles);
for (const capability of document.capabilities ?? []) {
  if (!/^[a-z][a-z0-9-]*$/.test(capability.id ?? "") || ids.has(capability.id)) errors.push(`invalid or duplicate capability id: ${capability.id}`);
  ids.add(capability.id);
  if (!["unconditional", "conditional", "not registered"].includes(capability.registration)) errors.push(`${capability.id}: invalid registration state`);
  if (!Array.isArray(capability.requirements) || capability.requirements.some((item) => typeof item !== "string" || !item.trim())) errors.push(`${capability.id}: requirements must be non-empty strings`);
  for (const [profile, enabled] of Object.entries(capability.profiles ?? {})) {
    if (!profiles[profile]) errors.push(`${capability.id}: unknown profile ${profile}`);
    if (typeof enabled !== "boolean") errors.push(`${capability.id}: ${profile} availability must be boolean`);
    if (capability.registration === "not registered" && enabled) errors.push(`${capability.id}: not registered capability cannot be enabled`);
  }
  for (const profile of profileNames) {
    if (!Object.prototype.hasOwnProperty.call(capability.profiles ?? {}, profile)) {
      errors.push(`${capability.id}: missing ${profile} availability`);
    }
  }
}
if (errors.length) { console.error(`Server capability manifest validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`); process.exitCode = 1; }
else console.log(`Server capability manifest verified (${document.capabilities.length} capabilities).`);
