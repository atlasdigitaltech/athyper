/** Creates a successor candidate only. No approval, grants, publication or heads. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  canonicalBytes,
  sha256,
} from "../../../server/packages/adapters/publication-signing/src/canonical-json.js";
import { reconcileBusinessPartnerReadContract } from "../../../server/apps/platform-host/src/composition/business-partner-read-contract.js";
import { businessPartnerReadOperationContracts } from "../../../server/apps/platform-host/src/composition/business-partner-read-runtime.js";
import { parseEntityRuntimeDescriptor } from "../../../server/packages/platform/metadata/src/descriptor-parser.js";
const previousHash =
  "5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f";
assert.ok(process.argv.slice(2).every((a) => a === "--write"));
const directory = join(
  homedir(),
  ".athyper/instances/dev/candidates/business-partner-package",
);
const original = JSON.parse(
  readFileSync(join(directory, previousHash + ".json"), "utf8"),
);
assert.equal(sha256(canonicalBytes(original)), previousHash);
const { descriptor, changes } = reconcileBusinessPartnerReadContract(
  original.nativeDescriptor,
);
const candidate = {
  ...original,
  nativeDescriptor: descriptor,
  provenance: {
    ...original.provenance,
    replacesCandidateHash: previousHash,
    readContractHash: sha256(
      canonicalBytes(businessPartnerReadOperationContracts()),
    ),
  },
  reconciliation: {
    kind: "cleaned-domain-read-contract",
    changes,
    providerChecksPreserved: true,
    grantsChanged: false,
  },
  approval: { status: "required", sourceApprovalInherited: false },
  activationAuthorized: false,
};
parseEntityRuntimeDescriptor({
  entity_code: "business_partner",
  plane_code: "neon",
  release_id: original.provenance.compiledSourceReleaseId,
  release_no: 1,
  entity_contract_hash: sha256(canonicalBytes(descriptor)),
  compiled_hash: sha256(canonicalBytes(descriptor)),
  compiled_json: descriptor,
});
assert.deepEqual(candidate.compiledRuntime, original.compiledRuntime);
const candidateHash = sha256(canonicalBytes(candidate)),
  path = join(directory, candidateHash + ".json");
if (process.argv.includes("--write")) {
  const body = JSON.stringify(candidate, null, 2) + "\n";
  if (existsSync(path)) assert.equal(readFileSync(path, "utf8"), body);
  else writeFileSync(path, body, { flag: "wx", mode: 0o600 });
}
console.log(
  JSON.stringify({
    candidateHash,
    path,
    changes,
    approvalRequired: true,
    activationChanged: false,
  }),
);
