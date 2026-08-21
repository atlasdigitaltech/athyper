#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHostCapabilityRegistry } from "./host-capability-registry.mjs";

const root = resolve(import.meta.dirname, "../..");
export function verifyHostCapabilityRegistry(paths = {}) {
  const registry = JSON.parse(readFileSync(paths.registry ?? resolve(root, "config/deployment/host-capability-registry.json"), "utf8"));
  const coverage = JSON.parse(readFileSync(paths.coverage ?? resolve(root, "docs/architecture/generated/ddl-service-coverage.json"), "utf8"));
  const profiles = JSON.parse(readFileSync(paths.profiles ?? resolve(root, "config/deployment/profiles.json"), "utf8")).profiles;
  const errors = validateHostCapabilityRegistry(registry, coverage, { profiles });
  if (errors.length) throw new Error(`Host capability registry validation failed:\n- ${errors.join("\n- ")}`);
  return { capabilities: registry.capabilities.length, linkedRows: registry.capabilities.reduce((count, capability) => count + coverage.rows.filter((row) => row.serviceOwner === capability.coverage.serviceOwner && row.featureGate === capability.coverage.featureGate && capability.coverage.classifications.includes(row.classification)).length, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyHostCapabilityRegistry();
    console.log(`Host capability registry verified (${result.capabilities} capabilities, ${result.linkedRows} coverage rows).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
