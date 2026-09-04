#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const document = JSON.parse(readFileSync(join(root, "governance/config/governance/server-p1-parity-manifest.json"), "utf8"));
const auditInventory = JSON.parse(readFileSync(join(root, "governance/config/governance/server-audit-runtime-inventory.json"), "utf8"));
const validStates = new Set(["migrated", "partial", "missing", "retired"]);
const ids = new Set(); const errors = [];
for (const item of document.items ?? []) {
  if (!/^[a-z][a-z0-9-]+$/.test(item.id ?? "") || ids.has(item.id)) errors.push(`invalid or duplicate id: ${item.id}`);
  ids.add(item.id);
  if (!validStates.has(item.state)) errors.push(`${item.id}: invalid state`);
  if (!Array.isArray(item.legacy) || !item.legacy.length) errors.push(`${item.id}: legacy reference required`);
  if (!Array.isArray(item.requiredEvidence) || !item.requiredEvidence.length) errors.push(`${item.id}: required evidence required`);
  if (item.state === "retired" && !item.approval) errors.push(`${item.id}: retirement requires approval`);
}
const auditIds = new Set((auditInventory.components ?? []).map((component) => component.id));
for (const required of ["http-query-export", "export-job-definition", "export-worker", "export-artifact-storage", "integrity-controls", "legal-hold-retention", "pii-inventory", "audit-schedules"]) if (!auditIds.has(required)) errors.push(`audit inventory missing component: ${required}`);
for (const component of auditInventory.components ?? []) {
  if (!["unconditional", "conditional", "not registered"].includes(component.registration)) errors.push(`audit ${component.id}: invalid registration`);
  if (component.registration !== "not registered" && !component.runtimeEvidence) errors.push(`audit ${component.id}: registered component requires runtime evidence`);
}
if (errors.length) { console.error(`P1 parity manifest validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`); process.exitCode = 1; }
else console.log(`P1 parity manifest verified (${document.items.length} items; ${document.items.filter((item) => item.state !== "migrated").length} not yet migrated).`);
