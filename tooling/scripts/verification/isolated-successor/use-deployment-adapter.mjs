/** Install a qualification entry point that consumes the real deployment adapter.
 * Only its isolatedExecution port bypasses production qualification, on dedicated stores. */
import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911";
let host = fs.readFileSync(root + "/harness/host.mjs", "utf8");
if (host.includes("const deploymentAdapter="))
  throw Error("Already integrated; preserve existing harness revision");
host =
  "import {loadBusinessPartnerAuthorizationDeployment} from '/app/server/dist/composition/business-partner-authorization-deployment.js';\nimport {businessPartnerCaseAuthority} from '/app/server/dist/composition/business-partner-case-authority.js';\n" +
  host;
const begin = host.indexOf("const wrapAuthority=");
const end = host.indexOf(
  "container.platform.httpRegistrars.push(app=>registerBusinessPartnerGovernedImportRoutes",
  begin,
);
if (begin < 0 || end < 0) throw Error("Harness seam missing");
const replacement = `const publicKey=readFileSync('/release/public-key.der');
const verifier=new Ed25519PublicationVerifier({verificationKeys:async key=>{if(key!==m.signingKeyId)throw Error('UNTRUSTED_SIGNING_KEY');return[publicKey];}});
container.adapters.publicationVerifier=verifier;
container.adapters.publicationArtifactStore={...container.adapters.publicationArtifactStore,get:async input=>{if(input.expectedSha256!==artifactHash)throw Error('UNREVIEWED_ARTIFACT');return bytes;}};
const deploymentAdapter=loadBusinessPartnerAuthorizationDeployment('/release/deployment.json',container,config);
if(!deploymentAdapter)throw Error('DEPLOYMENT_ADAPTER_REQUIRED');
const configured=deploymentAdapter.dependencies.businessPartnerBackendAuthorization;
const selected={...configured,rollout:{...configured.rollout,mode:'enforce',qualificationRef:'isolated-experiment-not-production-qualification'},isolatedExecution:{diagnostic:event=>emit({kind:'isolated_target_decision',...event}),assertCurrent:async candidate=>{if(JSON.stringify(candidate)!==JSON.stringify(release))throw Error('ISOLATED_RELEASE_MISMATCH');await assertCurrent();}}};
bindJobRuntime(container.runtimes.jobs,assertCurrent,emit);
registerServices(container,{...deploymentAdapter.dependencies,businessPartnerBackendAuthorization:selected},config);
container.platform.authorizer=createEntityBackendAuthorizer({...selected,...createBusinessPartnerBackendMapping(d.descriptor.authorization),authority:businessPartnerCaseAuthority(container.platform.authorizer,d.descriptor.authorization,'44444444-4444-4444-8444-444444444444'),refreshContext:createKyselyContextRefresh({run:(_identity,work)=>db.transaction().execute(work)})});
`;
host = host.slice(0, begin) + replacement + host.slice(end);
const duplicate =
  "const publicKey=readFileSync('/release/public-key.der');\nconst verifier=new Ed25519PublicationVerifier({verificationKeys:async key=>{if(key!==m.signingKeyId)throw Error('UNTRUSTED_SIGNING_KEY');return[publicKey];}});";
const index = host.indexOf(
  duplicate,
  host.indexOf(duplicate) + duplicate.length,
);
if (index < 0) throw Error("Expected verifier seam missing");
host = host.slice(0, index) + host.slice(index + duplicate.length);
host = host.replace(
  "const loaded=await loader.load(deployment);",
  "const loaded=await loader.load(deployment);\nawait deploymentAdapter.verifyStartup();",
);
// Production startup remains unchanged: this special host must reject unbounded IAM trust.
host = host.replace(
  "if(process.env.BP_IAM_TRUST_EXPIRES_AT&&!(Date.now()<Date.parse(process.env.BP_IAM_TRUST_EXPIRES_AT)))",
  "if(!process.env.BP_IAM_TRUST_EXPIRES_AT||!(Date.now()<Date.parse(process.env.BP_IAM_TRUST_EXPIRES_AT)))",
);
fs.writeFileSync(
  root + "/harness/host-before-adapter.mjs",
  fs.readFileSync(root + "/harness/host.mjs"),
  { mode: 0o600, flag: "wx" },
);
fs.writeFileSync(root + "/harness/host.mjs", host, { mode: 0o600 });
fs.writeFileSync(
  root + "/harness-adapter-revision.json",
  JSON.stringify(
    {
      sha256: createHash("sha256").update(host).digest("hex"),
      usesProductionDeploymentAdapter: true,
      harnessAuthorityHooksRemoved: true,
      productionQualificationBypass:
        "Existing isolatedExecution port; dedicated stores and active artifact verified on each boundary.",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log("Qualification host now consumes production adapter dependencies.");
