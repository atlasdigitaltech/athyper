import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const root =
    os.homedir() +
    "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911",
  p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-successor-isolated-transfer-grants.proposal.dev.json",
    ),
  );
const transform = (s) =>
  s
    .replaceAll(
      "bp-release-19-isolated-20260910",
      "bp-release-19-successor-20260911",
    )
    .replaceAll("athyper-bp-r19-", "athyper-bp-r19s-")
    .replaceAll("athyper-bp-r19s-isolated:20260910", p.runtimeImage);
fs.mkdirSync(root + "/harness", { mode: 0o700 });
for (const name of [
  "host.mjs",
  "release-boundary.mjs",
  "case-bindings.mjs",
  "import-policy.mjs",
  "ai-retrieval.mjs",
])
  fs.writeFileSync(
    root + "/harness/" + name,
    transform(
      fs.readFileSync(
        "tooling/scripts/verification/isolated-execution/" + name,
        "utf8",
      ),
    ),
    { mode: 0o600 },
  );
let host = fs.readFileSync(root + "/harness/host.mjs", "utf8");
const registry = `const {createEntityAuthorizationRuntimeRegistry}=await import('@athyper/server-contract-metadata');
const scopeAdapter=createBusinessPartnerStoredScopes(db,casePreflight),s=container.services;
const registry=createEntityAuthorizationRuntimeRegistry([
 ...createBusinessPartnerCaseRuntimeRegistrations(s.businessPartnerRequests,scopeAdapter),
 ...(await import('/app/server/dist/composition/business-partner-read-runtime.js')).createBusinessPartnerReadRuntimeRegistrations(s.records.surfaces,s.businessPartner360,scopeAdapter),
 ...(await import('/app/server/dist/composition/business-partner-reveal-runtime.js')).createBusinessPartnerRevealRuntimeRegistrations(s.businessPartner360,scopeAdapter),
 ...(await import('/app/server/dist/composition/business-partner-qualification-runtime.js')).createBusinessPartnerQualificationRuntimeRegistrations(s.businessPartnerEligibility,scopeAdapter),
 ...(await import('/app/server/dist/composition/business-partner-action-runtime.js')).createBusinessPartnerActionRuntimeRegistrations(s.businessPartnerRequests,s.records.queries,scopeAdapter),
 (await import('/app/server/dist/composition/business-partner-bound-import.js')).createBusinessPartnerImportRegistration(s.businessPartnerGovernedImport,scopeAdapter),
 (await import('/app/server/dist/composition/business-partner-export-runtime.js')).createBusinessPartnerExportRegistration(s.records.transfers,scopeAdapter)
]);
`;
host = host
  .replace(
    "const loader=new VerifiedPublicationArtifactLoader",
    registry + "const loader=new VerifiedPublicationArtifactLoader",
  )
  .replace(
    "authorizationRuntime:container.services.bpAuthorizationCompilation.runtime",
    "authorizationRuntime:{qualify(profile,bindings){registry.qualify(profile,bindings);}}",
  );
fs.writeFileSync(root + "/harness/host.mjs", host, { mode: 0o600 });
let initialize = fs
  .readFileSync(root + "/scripts/initialize-stores.mjs", "utf8")
  .replaceAll("athyper-bp-r19s-isolated:20260910", p.runtimeImage);
fs.writeFileSync(root + "/scripts/initialize-stores.mjs", initialize, {
  mode: 0o600,
});
cp.execFileSync("node", [root + "/scripts/initialize-stores.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const hashes = Object.fromEntries(
  fs.readdirSync(root + "/harness").map((n) => [
    n,
    createHash("sha256")
      .update(fs.readFileSync(root + "/harness/" + n))
      .digest("hex"),
  ]),
);
fs.writeFileSync(
  root + "/harness-hashes.json",
  JSON.stringify({ runtimeImage: p.runtimeImage, hashes }, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    prepared: true,
    runtimeImage: p.runtimeImage,
    harnessFiles: Object.keys(hashes),
    priorInstanceModified: false,
  }),
);
