import { expect, it } from "vitest";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseDeploymentRecoveryPolicy, assertDeploymentRecoveryWindow, deploymentRecoveryCommand, type DeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";
import { validateDeploymentRecoverySource, type DeploymentRecoverySource } from "./deployment-recovery-source.js";
import { parsePublicationPolicyProposal, parseEnrollablePublicationPolicy } from "./enrollment-contract.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture() {
  const original = { schema:"athyper.dev-human-reviewed-publication/1", environment:"local", instance:"dev", authorityTenantId:id(1),
    policyId:"test.original", revision:1, authorPrincipalId:id(2), publisherPrincipalId:id(3),
    compiler:{name:"athyper.compiled-entity-artifact",version:"1.1.0",buildHash:"a".repeat(64)},predecessors:[],
    plan:{schema:"athyper.human-reviewed-publication-plan/1",publisherId:id(3),members:[{entityId:id(4),changeSetId:id(5),revision:3,
      contractHash:"b".repeat(64),descriptorHash:"c".repeat(64),sourceReleaseId:null,authorId:id(6),reviewerId:id(7),
      targets:[{plane:"neon",contractHash:"b".repeat(64),descriptorHash:"c".repeat(64)}]}]}};
  const policy: DeploymentRecoveryPolicy = {schema:"athyper.dev-coordinated-deployment-recovery/1",environment:"local",instance:"dev",authorityTenantId:id(1),
    policyId:"test.recovery",revision:1,authorPrincipalId:id(2),publisherPrincipalId:id(3),compiler:{...original.compiler,buildHash:"d".repeat(64)},
    originalPolicy:{id:id(8),version:1,hash:"e".repeat(64),compilerHash:original.compiler.buildHash,coordinationHash:sha256(original.plan)},
    expiresAt:new Date(Date.now()+86400000).toISOString(),deliveries:[{deploymentId:id(9),artifactId:id(10),releaseId:id(11),artifactHash:"f".repeat(64),plane:"neon",attempt:1}]};
  const source:DeploymentRecoverySource={policy:original,version:1,deliveries:[{...policy.deliveries[0]!,status:"dispatched",environment:"local",instance:"*",artifactStatus:"signed",entityId:id(4),changeSetId:id(5),sourceStatus:"published",acknowledged:false}]};
  return {policy,source};
}
it("admits only the separate signed-deployment policy and exact original group",()=>{
  const f=fixture();expect(parsePublicationPolicyProposal(f.policy)).toEqual(f.policy);
  expect(()=>parseEnrollablePublicationPolicy(f.policy)).toThrow();
  expect(validateDeploymentRecoverySource(parseDeploymentRecoveryPolicy(f.policy),f.source)).toEqual(f.source.policy);
  f.source.deliveries[0]!.status="failed";expect(()=>validateDeploymentRecoverySource(f.policy,f.source)).not.toThrow();
});
it.each(["hash","target","actor","duplicate","unknown","compiler","empty"])("rejects malformed/widened recovery: %s", kind=>{
  const {policy:p}=fixture();
  const changed=kind==="hash"?{...p,originalPolicy:{...p.originalPolicy,hash:"bad"}}:kind==="target"?{...p,instance:"*"}:kind==="actor"?{...p,publisherPrincipalId:p.authorPrincipalId}:kind==="duplicate"?{...p,deliveries:[...p.deliveries,...p.deliveries]}:kind==="unknown"?{...p,bypass:true}:kind==="compiler"?{...p,compiler:{...p.compiler,name:"unknown"}}:{...p,deliveries:[]};
  expect(()=>parseDeploymentRecoveryPolicy(changed)).toThrow("DEPLOYMENT_RECOVERY_");
});
it.each(["artifactHash","artifactId","releaseId","attempt","instance","status","entityId","changeSetId","acknowledged"])("rejects changed source %s", key=>{
  const f=fixture();Object.assign(f.source.deliveries[0]!,{[key]:key==="attempt"?2:key==="acknowledged"?true:"changed"});
  expect(()=>validateDeploymentRecoverySource(f.policy,f.source)).toThrow("DEPLOYMENT_RECOVERY_");
});
it("rejects omitted target and source compiler drift",()=>{
  const f=fixture();expect(()=>validateDeploymentRecoverySource(f.policy,{...f.source,deliveries:[]})).toThrow("GROUP_CHANGED");
  f.policy.originalPolicy.compilerHash="0".repeat(64);expect(()=>validateDeploymentRecoverySource(f.policy,f.source)).toThrow("ORIGINAL_CHANGED");
});
it("bounds execution time and binds idempotency to both approved policy and old attempt",()=>{
  const {policy}=fixture();expect(()=>assertDeploymentRecoveryWindow(policy)).not.toThrow();
  for(const delta of [-1,8*86400000])expect(()=>assertDeploymentRecoveryWindow({...policy,expiresAt:new Date(Date.now()+delta).toISOString()})).toThrow("WINDOW_CLOSED");
  const pin=policy.deliveries[0]!;const command=deploymentRecoveryCommand(policy.originalPolicy.hash,pin.deploymentId);
  expect(command).toBe(deploymentRecoveryCommand(policy.originalPolicy.hash,pin.deploymentId));
  expect(command).not.toBe(deploymentRecoveryCommand("a".repeat(64),pin.deploymentId));
  expect(command).not.toBe(deploymentRecoveryCommand(policy.originalPolicy.hash,id(99)));
});
