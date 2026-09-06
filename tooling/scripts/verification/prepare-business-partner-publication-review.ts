#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { canonicalBytes, sha256 } from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { compileBusinessPartnerDefinition } from "../../../server/packages/services/publication/src/business-partner-definition-compiler.js";
import { createBusinessPartnerFoundationDefinition } from "../../../server/packages/services/publication/src/business-partner-foundation-definition.js";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const input = "governance/evidence/business-partner/local/2026-09-05/definition-publication-candidate.json";
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9);
if (!output) throw new Error("--output=<new review packet path> is required");
const prior = JSON.parse(readFileSync(resolve(root, input), "utf8"));
const sources = {
  request: "server/packages/contracts/master-data/src/business-partner-requests.ts",
  eligibility: "server/packages/contracts/master-data/src/business-partner-eligibility.ts",
  meshProfile: "server/packages/planes/mesh/src/business-partner-profile-publication.ts",
  meshMatch: "server/packages/planes/neon/src/business-partner-profile-match.ts",
};
const sourceContracts = Object.fromEntries(Object.entries(sources).map(([key, path]) => {
  const hash = sha256(readFileSync(resolve(root, path)));
  return [key, { path, sha256: hash, priorSha256: prior.bundle.sourceContractHashes[key], changed: hash !== prior.bundle.sourceContractHashes[key] }];
}));
const hashes = Object.fromEntries(Object.entries(sourceContracts).map(([key, entry]) => [key, entry.sha256]));
const generated = createBusinessPartnerFoundationDefinition(hashes as Parameters<typeof createBusinessPartnerFoundationDefinition>[0]);
// A new review input never overwrites the previously retained candidate.
const bundle = { ...generated, semanticVersion: "2.1.1" };
const changedSections = Object.keys(bundle).filter(key =>
  sha256(canonicalBytes(bundle[key as keyof typeof bundle])) !== sha256(canonicalBytes(prior.bundle[key])));
const simulations = prior.targetPlanes.map((plane: "neon" | "mesh") => {
  const options = { bundle, plane, canonicalizer: { canonicalBytes, sha256 }, expectedSourceContractHashes: hashes };
  const first = compileBusinessPartnerDefinition(options);
  const second = compileBusinessPartnerDefinition(options);
  if (first.compiledBundleHash !== second.compiledBundleHash) throw new Error("Non-deterministic compilation");
  return { plane, report: first.report };
});
const packet = {
  schema: "athyper.business-partner-local-definition-review/1",
  generatedAt: new Date().toISOString(),
  environment: "dev", tenantCode: "cirrusatlantic",
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  priorCandidate: { path: input, sha256: sha256(readFileSync(resolve(root, input))) },
  approvalStatus: "pending", publicationAuthorized: false, productionQualified: false,
  sourceContracts, changedSections, targetPlanes: prior.targetPlanes, bundle, simulations,
  reviewRequired: ["Confirm source-to-contract mapping, especially the previously undocumented meshMatch coordinate", "Review contract changes and schema requirements; successful compilation is not semantic approval", "Run native simulation against the latest approved revision before authoring"],
  actors: {
    author: { username: "catl.admin", permissions: ["studio.business_partner_definition.read", "studio.business_partner_definition.author"] },
    reviewer: { username: "catl.owner", permissions: ["studio.business_partner_definition.read", "studio.business_partner_definition.publish"] },
    scope: { kind: "tenant", propagation: "exact", tenantId: "44444444-4444-4444-8444-444444444444" },
  },
  workforcePolicyDecisions: "BP-Q004/BP-Q006 remain pending; this packet does not authorize candidate or commercial Workforce processing",
};
mkdirSync(resolve(root, output, ".."), { recursive: true });
writeFileSync(resolve(root, output), JSON.stringify(packet, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, changedSections, sourceContracts, simulations }, null, 2));
