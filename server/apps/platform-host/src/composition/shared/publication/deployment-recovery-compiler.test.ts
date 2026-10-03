import {expect,it} from 'vitest';
import {parseDeploymentRecoveryCompilerPolicy} from './deployment-recovery-compiler.js';
import {parsePublicationPolicyProposal,parseEnrollablePublicationPolicy} from './enrollment-contract.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture=()=>({schema:'athyper.dev-deployment-recovery-compiler/1',policyId:'test.compiler.approval',revision:1,
 environment:'local',instance:'dev',authorityTenantId:id(1),authorPrincipalId:id(2),publisherPrincipalId:id(3),
 recoveryPolicy:{id:id(4),hash:'a'.repeat(64),version:1,compilerHash:'b'.repeat(64)},
 compiler:{name:'athyper.compiled-entity-artifact',version:'1.1.0',buildHash:'c'.repeat(64)},expiresAt:'2026-10-05T22:43:07.280Z'});
it('keeps compiler approval separate from source authorship and deployment commands',()=>{
 const p=fixture();expect(parsePublicationPolicyProposal(p)).toEqual(p);
 expect(()=>parseEnrollablePublicationPolicy(p)).toThrow();
});
it.each(['unknown','tenant','actor','environment','instance','hash','version','compiler','same_build','expiry'])(
 'rejects malformed compiler approval %s',kind=>{
 const p=fixture();const changed=kind==='unknown'?{...p,deliveries:[]}:kind==='tenant'?{...p,authorityTenantId:'other'}:
 kind==='actor'?{...p,publisherPrincipalId:p.authorPrincipalId}:kind==='environment'?{...p,environment:'production'}:
 kind==='instance'?{...p,instance:'*'}:kind==='hash'?{...p,recoveryPolicy:{...p.recoveryPolicy,hash:'bad'}}:
 kind==='version'?{...p,recoveryPolicy:{...p.recoveryPolicy,version:0}}:kind==='compiler'?{...p,compiler:{...p.compiler,name:'other'}}:
 kind==='same_build'?{...p,compiler:{...p.compiler,buildHash:p.recoveryPolicy.compilerHash}}:{...p,expiresAt:'never'};
 expect(()=>parseDeploymentRecoveryCompilerPolicy(changed)).toThrow('DEPLOYMENT_RECOVERY_');
});
