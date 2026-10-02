import {expect,it} from 'vitest';
import type {EntityRuntimeDescriptor} from '@athyper/server-contract-metadata';
import type {VerifiedRequestContext} from '@athyper/server-contract-auth';
import {createPublishedActionAuthorizer} from './published-action-authorizer.js';
const permission='workforce.profile.write';
const descriptor={entityCode:'principal',planeKey:'neon',compiledHash:'pinned',actions:[{code:'link_person',handlerKey:'workforce.link.v1',permissionCode:permission}]} as EntityRuntimeDescriptor;
const context={tenantId:'tenant',principalId:'hr',planeKey:'neon',realmKey:'realm',authEpoch:1,requestId:'test',profileHash:'profile',permissions:{tenantId:'tenant',principalId:'hr',planeKey:'neon',profileHash:'profile',schemaHash:'schema',resolvedAt:1,principalFingerprint:'hr',allowed:[permission],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[{permissionCode:permission,tenantWide:false,companyCodeIds:['company-1'],legalEntityIds:[],operatingOrganizationIds:[],networkMembershipIds:[],visibility:'all'}],evidence:[{permissionCode:permission,effect:'allow',proof:'role',scopeTargetId:'scope',scopeKind:'company_code',targetId:'company-1',propagationMode:'exact'}],requirements:[{permissionCode:permission,moduleId:'module',riskTier:'high',requiresMfa:false,requiresSod:false,entitled:true}],operationBindings:[{entityCode:'principal',operationKey:'link_person',permissionCode:permission,decisionMode:'authorize',requiredScopeKinds:['company_code']}]}} as VerifiedRequestContext;
const resource={tenantId:'tenant',entityCode:'principal',recordId:'selected-user',operationKey:'link_person',actionCode:'link_person',actionHandlerKey:'workforce.link.v1',registeredActionCheck:true,authorizationDescriptorHash:'pinned',companyCodeId:'company-1'};
const authorizer=createPublishedActionAuthorizer({getEntityDescriptor:async()=>descriptor},new Set(['workforce.link.v1']));
it('admits only the published installed action within the exact granted company',async()=>{
  expect(await authorizer.authorize({context,permissionCode:permission,resource})).toMatchObject({allowed:true,scope:{tenantWide:false,companyCodeIds:['company-1']}});
  expect((await authorizer.authorize({context,permissionCode:permission,resource:{...resource,companyCodeId:'company-2'}})).allowed).toBe(false);
});
it.each([{registeredActionCheck:false},{authorizationDescriptorHash:'stale'},{actionHandlerKey:'uninstalled.handler'},{actionCode:'patch',operationKey:'patch'},{tenantId:'other'}])('denies incorrect publication/scope coordinates %j',async changed=>{
  expect((await authorizer.authorize({context,permissionCode:permission,resource:{...resource,...changed}})).allowed).toBe(false);
});
it('denies revocation, explicit denial, missing operation bindings and unmet policy controls',async()=>{
  for(const change of [{allowed:[]},{denied:[permission]},{operationBindings:[]},{requirements:[{...context.permissions.requirements![0]!,requiresSod:true}]},{requirements:[{...context.permissions.requirements![0]!,requiresMfa:true}]}]){
    expect((await authorizer.authorize({context:{...context,permissions:{...context.permissions,...change}},permissionCode:permission,resource})).allowed).toBe(false);
  }
});
