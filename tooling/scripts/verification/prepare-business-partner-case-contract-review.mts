#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalBytes, sha256 } from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { buildDevelopmentBusinessPartnerCaseProjection } from "../../../server/db/scripts/provisioning/provision-development-business-partner-runtime.js";

type CurrentContract = {
  tenantId: string;
  contractId: string;
  releaseNo: number;
  contractHash: string;
  publicationKey: string;
  contract: Record<string, unknown> & { properties: Record<string, unknown> };
};

/** Produces review input only. Never stages releases or copies bootstrap attestations. */
export function prepareCaseContractReview(current: CurrentContract) {
  assert.match(current.tenantId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const generated = buildDevelopmentBusinessPartnerCaseProjection(current.tenantId);
  assert.equal(current.publicationKey, generated.publicationKey, "Publication tenant coordinate mismatch");
  const foundation = generated.projection.contract.contract_json;
  const prior = current.contract.properties;
  const additiveFields = new Set([
    "partnerCategory", "legalClassification", "supplierType", "customerType",
    "expectedBusinessPartnerVersion", "priorStatus", "reasonCode", "dependencies",
    "bankProjectionId", "supplierCompanyProfileId", "expectedBankSnapshotId", "priorBankLinkId",
  ]);
  const contract = {
    ...foundation,
    properties: Object.fromEntries(Object.entries(foundation.properties).filter(([name]) =>
      Object.hasOwn(prior, name) || additiveFields.has(name))),
  };
  assert.ok(prior && typeof prior === "object", "Current published schema properties are required");
  // Reject removed/narrowed properties and new required fields. Record relaxed requirements explicitly.
  const { properties: _priorProperties, required: priorRequired, ...priorRoot } = current.contract;
  const { properties: _nextProperties, required: nextRequired, ...nextRoot } = contract;
  assert.ok(Array.isArray(priorRequired), "Current required fields must be an array");
  assert.ok(nextRequired.every(name => priorRequired.includes(name)), "New required fields need explicit compatibility review");
  assert.deepEqual(priorRoot, nextRoot, "Root contract semantics changed; explicit compatibility review required");
  for (const [name, schema] of Object.entries(prior)) {
    assert.deepEqual(Reflect.get(contract.properties, name), schema, `Existing property changed: ${name}`);
  }
  return {
    schema: "athyper.business-partner-case-contract-review/1",
    tenantId: current.tenantId,
    targetPlane: "neon",
    publicationKey: current.publicationKey,
    previous: {
      contractId: current.contractId,
      releaseNo: current.releaseNo,
      recordedContractHash: current.contractHash,
      canonicalContentHash: sha256(canonicalBytes(current.contract)),
    },
    candidate: {
      contractSchemaCode: "athyper.entity-contract",
      contractSchemaVersion: "1.0.0",
      entityCode: "master.business_partner",
      contract,
      canonicalContentHash: sha256(canonicalBytes(contract)),
    },
    compatibility: {
      classification: "properties_added_and_required_fields_relaxed",
      noLongerRequired: priorRequired.filter(name => !nextRequired.includes(name)),
      addedProperties: Object.keys(contract.properties).filter(name => !(name in prior)).sort(),
      existingPropertiesUnchanged: true,
      existingCaseSnapshotsRemainPinned: true,
    },
    approvalStatus: "pending",
    signedReleaseId: null,
    consumerActivationReceipt: null,
    constraints: [
      "This is a JSON Schema case contract, not the onboarding definition bundle or a metadata graph.",
      "Use native independent approval and Ed25519 signing; development bootstrap attestations are not approval evidence.",
      "Recheck the active source contract before publication and create fresh cases after activation.",
      "Bank case materialization starts verification; it does not authorize remittance switching.",
    ],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const option = (name: string) => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const input = option("--current");
  const output = option("--output");
  assert.ok(input && output, "--current=<native contract export.json> --output=<new review.json> required");
  const packet = prepareCaseContractReview(JSON.parse(readFileSync(input, "utf8")));
  writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`Prepared unsigned review input: ${output}\n`);
}
