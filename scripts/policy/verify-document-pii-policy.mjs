#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const policy = JSON.parse(readFileSync(join(root, "config/governance/document-pii-policy.json"), "utf8"));
const errors = [];
if (policy.classificationMode !== "advisory" && policy.classificationMode !== "governed") errors.push("classificationMode must be advisory or governed");
for (const field of ["supportedJurisdictions", "supportedBaselineTypes"]) if (!Array.isArray(policy[field]) || !policy[field].length || policy[field].some((value) => typeof value !== "string" || !value.trim())) errors.push(`${field} must contain non-empty strings`);
for (const field of ["confidence", "escalation"]) if (typeof policy.baselineDetector?.[field] !== "string" || !policy.baselineDetector[field].trim()) errors.push(`baselineDetector.${field} is required`);
if (policy.baselineDetector?.persistsMatchedValues !== false) errors.push("baseline detector must not persist matched values");
if (policy.classificationMode === "advisory" && policy.baselineDetector?.redactsSourceText !== false) errors.push("advisory detector cannot redact source text");
if (typeof policy.falsePositiveHandling !== "string" || !policy.falsePositiveHandling.trim()) errors.push("falsePositiveHandling is required");
if (errors.length) { console.error(`Document PII policy validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`); process.exitCode = 1; }
else console.log(`Document PII policy verified (${policy.supportedBaselineTypes.length} baseline types, ${policy.supportedJurisdictions.length} jurisdiction profile).`);
