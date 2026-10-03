import {sql,type Kysely,type Transaction} from 'kysely';
import {calculateDefinitionHash,createKyselyPolicyRepository,createJsonRuleEvaluator} from '@athyper/server-platform-policy';
import {sha256} from '@athyper/server-plane-studio-meta-entity-authoring';
import {publicationCompilerIdentity,assertPublicationCompilerIdentity} from './compiler-build.js';
import {parseDeploymentRecoveryPolicy,assertDeploymentRecoveryWindow,requireRecovery,type DeploymentRecoveryPolicy} from './deployment-recovery-policy.js';
import {validateDeploymentRecoverySource,type DeploymentRecoverySource} from './deployment-recovery-source.js';
import {MACHINE_PUBLICATION_PERMISSION} from './machine-policy.js';

type Database=Kysely<Record<string,never>>;
export interface DeploymentRecoveryCompilerPolicy {
 schema:'athyper.dev-deployment-recovery-compiler/1';
 policyId:string;revision:number;environment:'local';instance:'dev';
 authorityTenantId:string;authorPrincipalId:string;publisherPrincipalId:string;
 recoveryPolicy:{id:string;hash:string;version:number;compilerHash:string};
 compiler:DeploymentRecoveryPolicy['compiler'];expiresAt:string;
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
function exact(v:unknown,keys:string):asserts v is Record<string,unknown>{
 requireRecovery(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.split(',').sort().join(),'COMPILER_SCHEMA_INVALID');
}
export function parseDeploymentRecoveryCompilerPolicy(input:unknown):DeploymentRecoveryCompilerPolicy{
 exact(input,'schema,policyId,revision,environment,instance,authorityTenantId,authorPrincipalId,publisherPrincipalId,recoveryPolicy,compiler,expiresAt');
 const p=structuredClone(input) as unknown as DeploymentRecoveryCompilerPolicy;
 requireRecovery(p.schema==='athyper.dev-deployment-recovery-compiler/1'&&p.environment==='local'&&p.instance==='dev'
  &&typeof p.policyId==='string'&&/^[a-z][a-z0-9_.-]{1,126}$/.test(p.policyId)&&Number.isSafeInteger(p.revision)&&p.revision>0,'COMPILER_SCOPE_INVALID');
 requireRecovery([p.authorityTenantId,p.authorPrincipalId,p.publisherPrincipalId].every(x=>typeof x==='string'&&uuid.test(x))
  &&p.authorPrincipalId!==p.publisherPrincipalId,'COMPILER_ACTORS_INVALID');
 exact(p.recoveryPolicy,'id,hash,version,compilerHash');exact(p.compiler,'name,version,buildHash');
 requireRecovery(uuid.test(p.recoveryPolicy.id)&&hash.test(p.recoveryPolicy.hash)&&hash.test(p.recoveryPolicy.compilerHash)
  &&Number.isSafeInteger(p.recoveryPolicy.version)&&p.recoveryPolicy.version>0
  &&p.compiler.name==='athyper.compiled-entity-artifact'&&p.compiler.version==='1.1.0'&&hash.test(p.compiler.buildHash)
  &&p.compiler.buildHash!==p.recoveryPolicy.compilerHash,'COMPILER_PIN_INVALID');
 requireRecovery(typeof p.expiresAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.expiresAt)&&Number.isFinite(Date.parse(p.expiresAt)),'COMPILER_EXPIRY_INVALID');
 return p;
}
async function exactDefinition(database:Database,tenantId:string,pin:{id:string;version:number;hash:string}){
 const definition=await createKyselyPolicyRepository().findExact!({planeKey:'studio',tenantId,entityType:'metadata.publication',
  effectiveOn:new Date().toISOString().slice(0,10),revision:pin},database as Transaction<Record<string,never>>);
 requireRecovery(definition&&definition.rules.length===1&&calculateDefinitionHash(definition)===pin.hash,'COMPILER_ENROLLMENT_CHANGED');
 const r=definition.rules[0]!,e=r.actionConfig;
 requireRecovery(r.action==='allow'&&e.schema==='athyper.machine-publication-enrollment/1'&&e.environment==='dev'
  &&e.tenantId===tenantId&&e.permissionCode===MACHINE_PUBLICATION_PERMISSION
  &&createJsonRuleEvaluator().evaluate(r.condition,{environment:'dev',tenantId,policyHash:sha256(e.policy)})===true,'COMPILER_ENROLLMENT_CHANGED');
 return e.policy;
}
/** An immutable supplemental approval, not a replacement of the command policy.
 * Human enrollment rechecks the parent review; worker use also verifies both
 * active enrollments under the persisted publisher identity. */
export async function assertRecoveryCompilerSource(database:Database,policy:DeploymentRecoveryCompilerPolicy,tenantId:string,human:boolean){
 requireRecovery(database.isTransaction&&policy.authorityTenantId===tenantId,'COMPILER_AUTHORITY_MISMATCH');
 assertPublicationCompilerIdentity(policy.compiler);
 const remaining=Date.parse(policy.expiresAt)-Date.now();requireRecovery(remaining>0&&remaining<=7*86400000,'COMPILER_WINDOW_CLOSED');
 const parent=parseDeploymentRecoveryPolicy(await exactDefinition(database,tenantId,policy.recoveryPolicy));
 requireRecovery(parent.authorityTenantId===tenantId&&parent.authorPrincipalId===policy.authorPrincipalId
  &&parent.publisherPrincipalId===policy.publisherPrincipalId&&parent.compiler.buildHash===policy.recoveryPolicy.compilerHash
  &&Date.parse(policy.expiresAt)<=Date.parse(parent.expiresAt),'COMPILER_PARENT_CHANGED');
 assertDeploymentRecoveryWindow(parent);
 await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`deployment-recovery:${tenantId}:${parent.originalPolicy.id}`},0))`.execute(database);
 if(human){
  const check=(await sql<{valid:boolean}>`SELECT publication.fn_human_review_identity_status(d.created_by,d.updated_by,
   ${parent.authorPrincipalId}::uuid,${parent.publisherPrincipalId}::uuid) valid FROM control.policy_definition d
   WHERE d.id=${policy.recoveryPolicy.id}::uuid AND d.tenant_id=${tenantId}::uuid AND d.status='active'
     AND d.definition_hash=${policy.recoveryPolicy.hash}`.execute(database)).rows[0];
  requireRecovery(check?.valid===true,'COMPILER_PARENT_REVIEW_REVOKED');
 }else await activeEnrollment(database,policy.recoveryPolicy,parent);
 const source=(await sql<{value:DeploymentRecoverySource}>`SELECT publication.fn_coordinated_deployment_recovery_source(
  ${parent.originalPolicy.id}::uuid,${parent.originalPolicy.hash}) value`.execute(database)).rows[0]?.value;
 requireRecovery(source,'COMPILER_SOURCE_UNAVAILABLE');validateDeploymentRecoverySource(parent,source);
 return parent;
}
async function activeEnrollment(database:Database,pin:{id:string;hash:string},policy:{authorPrincipalId:string;publisherPrincipalId:string}){
 const valid=(await sql<{valid:boolean}>`SELECT control.publication_policy_enrollment_is_active(${pin.id}::uuid,${pin.hash},
  ${policy.authorPrincipalId}::uuid,${policy.publisherPrincipalId}::uuid) valid`.execute(database)).rows[0]?.valid;
 requireRecovery(valid===true,'COMPILER_APPROVAL_REVOKED');
}
export async function activeRecoveryCompilerPolicies(database:Database,tenantId:string,parentId:string,exclude?:string){
 return (await sql<{id:string;version:number;hash:string;policy:unknown}>`SELECT d.id,d.version_no version,d.definition_hash hash,
  r.action_config->'policy' policy FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
  WHERE d.tenant_id=${tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
    AND r.action_config#>>'{policy,schema}'='athyper.dev-deployment-recovery-compiler/1'
    AND r.action_config#>>'{policy,recoveryPolicy,id}'=${parentId}
    AND (${exclude??null}::uuid IS NULL OR d.id<>${exclude??null}::uuid)`.execute(database)).rows;
}
/** No fallback to a different compiler unless a separate human-reviewed policy
 * pins the entire still-active recovery definition and this exact source build. */
export async function assertDeploymentRecoveryCompiler(database:Database,parent:DeploymentRecoveryPolicy,tenantId:string){
 if(parent.compiler.buildHash===publicationCompilerIdentity().buildHash){assertPublicationCompilerIdentity(parent.compiler);return;}
 const parents=(await sql<{id:string}>`SELECT d.id FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
  WHERE d.tenant_id=${tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status='active'
    AND r.action_config->'policy'=${JSON.stringify(parent)}::jsonb`.execute(database)).rows;
 requireRecovery(parents.length===1,'COMPILER_PARENT_REQUIRED');
 const rows=await activeRecoveryCompilerPolicies(database,tenantId,parents[0]!.id);
 requireRecovery(rows.length===1,'COMPILER_APPROVAL_REQUIRED');
 const row=rows[0]!,pin={id:row.id,hash:row.hash,version:Number(row.version)};
 const policy=parseDeploymentRecoveryCompilerPolicy(await exactDefinition(database,tenantId,pin));
 requireRecovery(policy.recoveryPolicy.id===parents[0]!.id,'COMPILER_PARENT_CHANGED');
 const approvedParent=await assertRecoveryCompilerSource(database,policy,tenantId,false);
 requireRecovery(sha256(approvedParent)===sha256(parent),'COMPILER_PARENT_CHANGED');
 await activeEnrollment(database,pin,policy);
}
