#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { images, sql, tenant } from "./atlas-f6-common.mjs";
import { requirements } from "./qualify-business-partner-ai.mjs";

// Preparation only. Never turns historical evidence into release-gate receipts.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const runId = randomUUID(),
  observedAt = new Date().toISOString();
const directory = `docs/examples/bp-ai-release/${runId}`;
mkdirSync(directory, { recursive: true });
const save = (name, value) =>
  writeFileSync(`${directory}/${name}`, JSON.stringify(value, null, 2) + "\n");
const deployed = JSON.parse(
  execFileSync(
    "docker",
    ["exec", "-i", "athyper-dev-api-1", "node", "--input-type=module", "-"],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: `
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='/app/server/node_modules/@athyper/server-platform-ai/dist/';
const composition=readFileSync('/app/server/dist/composition/register-services.js','utf8');
const moduleNames=['business-partner-tools','business-partner-insight-tools','business-partner-list-insights','business-partner-case-tools','local-generation-composition','agent-runtime'];
const modules=moduleNames.map(name=>({name,sha256:createHash('sha256').update(readFileSync(root+name+'.js')).digest('hex')}));
const {createBusinessPartnerInsightTools}=await import(root+'business-partner-insight-tools.js');
const {createBusinessPartnerCaseTools}=await import(root+'business-partner-case-tools.js');
const {createBusinessPartnerAtlasTools}=await import(root+'business-partner-tools.js');
const unavailable=async()=>{throw Error('Inventory must not execute an owner');};
const owner={read:unavailable,readContacts:unavailable,readAddresses:unavailable};
const tools=[...createBusinessPartnerAtlasTools({}),...createBusinessPartnerCaseTools({}),...createBusinessPartnerInsightTools(owner,unavailable)].map(({manifest:m})=>({code:m.toolCode,version:m.version,access:m.access,planes:m.allowedPlanes,permissions:m.requiredPermissions}));
console.log(JSON.stringify({modules,tools,insightOwnerComposed:composition.includes('businessPartnerAtlasInsights = createBusinessPartnerAtlasInsightOwner'),insightToolsComposed:composition.includes('createBusinessPartnerInsightTools(container.services.businessPartnerAtlasInsights'),caseToolsComposed:composition.includes('createBusinessPartnerCaseTools(caseOwner)'),basis:'Deployed module manifests and composition; authenticated execution is qualified separately.'}));
`,
    },
  ),
);
const publications = JSON.parse(
  sql(
    "neon",
    `SELECT coalesce(jsonb_agg(jsonb_build_object('publicationKey',h.publication_key,'tenantId',d.tenant_id,'releaseId',a.source_release_id,'releaseNo',a.source_release_no,'compiledHash',d.compiled_hash,'ai',d.compiled_json->'ai') ORDER BY h.publication_key),'[]'::jsonb) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id WHERE d.compiled_json->>'entityCode'='business_partner' AND (d.tenant_id IS NULL OR d.tenant_id='${tenant}');`,
  ),
);
const roots = [
  "server/packages/platform/ai/src",
  "server/packages/services/master-data/src",
  "server/apps/platform-host/src/composition",
  "packages/platform/ai",
  "packages/platform/shell",
  "packages/planes/neon/business-partner",
  "packages/contracts/platform/entity-runtime",
  "apps/neon",
];
const files = execFileSync(
  "rg",
  ["--files", ...roots, "-g", "*.ts", "-g", "*.tsx"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .sort();
const sources = files.map((path) => ({
  path,
  sha256: hash(readFileSync(path)),
}));
const enabledPackages = Array.from(
  { length: 9 },
  (_, i) => `BP-AI-${String(i).padStart(2, "0")}`,
);
const inventory = {
  schema: "bp-ai-release-inventory/1",
  observedAt,
  runId,
  target: "DEV CirrusAtlantic",
  tenantId: tenant,
  images: images(),
  deployed,
  publications,
  sourceSnapshotSha256: hash(JSON.stringify(sources)),
  candidatePackages: enabledPackages,
  observedEnabledPackages: null,
  proactive: {
    releaseQualified: false,
    defaultOff: true,
    ownerRevisionResolverQualified: false,
  },
  deferrals: [
    {
      capability: "duplicate_candidates",
      reason:
        "Separate owner matching/disclosure contract and quality/workflow qualification required.",
    },
    {
      capability: "document_expiry",
      reason:
        "Retrieval does not establish business expiry; owner date/rule contract and qualified workflow required.",
    },
    {
      capability: "draft_preview",
      reason:
        "Optional nonpersistent owner API and allowlisted patch contract not qualified.",
    },
  ],
  releaseQualified: false,
};
save("inventory.json", inventory);
save("source-snapshot.json", sources);
const manifest = {
  schema: "bp-ai-qualification/1",
  target: "DEV CirrusAtlantic",
  plane: "neon",
  runId,
  startedAt: observedAt,
  completedAt: null,
  enabledPackages,
  enabledExtendedCapabilities: [],
  extendedOwnerContracts: {},
  binding: {
    sourceTreeSha256: inventory.sourceSnapshotSha256,
    deploymentSha256: hash(
      JSON.stringify({ images: inventory.images, deployed }),
    ),
    modelSha256: hash(readFileSync("deploy/config/atlas/local-inference.json")),
    promptSha256: null,
    toolsSha256: hash(JSON.stringify(deployed.tools)),
    descriptorSha256: publications.length
      ? hash(JSON.stringify(publications))
      : null,
    policySha256: null,
    contractsSha256: null,
    fixtureSetSha256: null,
  },
  evidence: requirements(enabledPackages).map((id) => ({
    id,
    status: "pending",
    path: null,
    sha256: null,
  })),
};
save("manifest.json", manifest);
console.log(
  JSON.stringify({
    directory,
    runId,
    requiredGates: manifest.evidence.length,
    toolManifests: deployed.tools.length,
    publications: publications.length,
    qualified: false,
  }),
);
