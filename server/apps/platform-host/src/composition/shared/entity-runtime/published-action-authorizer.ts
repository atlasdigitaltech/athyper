import type { MetadataReader } from '@athyper/server-contract-metadata';
import { readEvidence } from '@athyper/server-foundation/context';
import { createPermissionAuthorizer } from '@athyper/server-platform-iam';

/** Installed registered-action policy. Company scope still needs current IAM
 * evidence and an operation binding; publication and handler registration are
 * qualifications, never grants. No general Principal administration is admitted. */
export function createPublishedActionAuthorizer(metadata: MetadataReader, handlers: ReadonlySet<string>) {
  return createPermissionAuthorizer({ policyGate: { async evaluate({context,permissionCode,resource,requirement}) {
    const denied={allowed:false,reason:'entity_action_policy_unavailable'};
    if(requirement?.requiresSod || resource?.registeredActionCheck!==true || resource.tenantId!==context.tenantId || typeof resource.entityCode!=='string' || typeof resource.recordId!=='string' || typeof resource.actionCode!=='string' || resource.operationKey!==resource.actionCode || typeof resource.actionHandlerKey!=='string' || !handlers.has(resource.actionHandlerKey))return denied;
    const descriptor=await readEvidence(metadata,context,resource.entityCode,()=>metadata.getEntityDescriptor(context,resource.entityCode as string));
    const registration=descriptor?.actions?.find(action=>action.code===resource.actionCode);
    if(!descriptor || descriptor.planeKey!==context.planeKey || descriptor.compiledHash!==resource.authorizationDescriptorHash || registration?.handlerKey!==resource.actionHandlerKey || registration.permissionCode!==permissionCode)return denied;
    return {allowed:true};
  } } });
}
