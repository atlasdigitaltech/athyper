#!/usr/bin/env node
// Dedicated DEV business-value authority; never promote the publication identity.
import {readFileSync, writeFileSync, existsSync, chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
if (!process.argv.includes('--confirm=LOCAL-DEV-PROTECTED-VALUES')) throw Error('Explicit DEV confirmation required');
const root=join(homedir(),'.athyper/instances/dev/secrets');
const publication=JSON.parse(readFileSync(join(root,'publication-infisical-bootstrap.json'),'utf8'));
const path=join(root,'protected-values-infisical.json');
const state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
const save=()=>{writeFileSync(path,JSON.stringify(state,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);};
async function api(path,body,method=body===undefined?'GET':'POST'){
 const r=await fetch('http://127.0.0.1:53001'+path,{method,headers:{Authorization:'Bearer '+publication.bootstrap.identity.credentials.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const b=await r.json();if(!r.ok)throw Error(`Native Infisical ${path}: ${r.status} (${b.error??'request failed'})`);return b;
}
if(!state.project){state.project=(await api('/api/v1/projects',{projectName:'DEV protected business values',slug:'athyper-dev-protected-values',type:'secret-manager',shouldCreateDefaultEnvs:true})).project;save();}
const compensation=process.argv.includes('--enable-compensation')||state.compensation===true;
const permissions=(compensation?['read','create','delete']:['read','create']).map(action=>({action,subject:'secrets',conditions:{environment:'dev',secretPath:'/',...(compensation?{secretName:{$glob:'athyper_ref_*'}}:{})}}));
if(!state.identity){state.identity=(await api('/api/v1/identities',{name:'athyper-dev-protected-value-capture',organizationId:publication.bootstrap.organization.id,role:'no-access'})).identity;save();}
if(!state.membership){state.membership=await api(`/api/v1/projects/${state.project.id}/memberships/identities/${state.identity.id}`,{roles:[{role:'no-access',isTemporary:false}]});save();}
if(!state.privilege){state.privilege=await api('/api/v2/identity-project-additional-privilege',{identityId:state.identity.id,projectId:state.project.id,slug:'dev-protected-value-capture',permissions,type:{isTemporary:false}});save();}
if(compensation&&!state.compensation){state.privilege=await api(`/api/v2/identity-project-additional-privilege/${state.privilege.privilege.id}`,{slug:'dev-protected-value-capture',permissions,type:{isTemporary:false}},'PATCH');state.compensation=true;save();}
if(!state.tokenAuth){state.tokenAuth=await api(`/api/v1/auth/token-auth/identities/${state.identity.id}`,{accessTokenTTL:604800,accessTokenMaxTTL:604800,accessTokenNumUsesLimit:0});save();}
if(!state.token){state.token=(await api(`/api/v1/auth/token-auth/identities/${state.identity.id}/tokens`,{name:'dev-protected-value-capture',organizationSlug:publication.bootstrap.organization.slug})).accessToken;if(!state.token)throw Error('Token missing');save();}
const tokenPath=join(root,'protected-values-infisical-token');
writeFileSync(tokenPath,state.token,{mode:0o600});chmodSync(tokenPath,0o600);
writeFileSync(join(root,'protected-values-environment.json'),JSON.stringify({
 PROTECTED_VALUES_INFISICAL_URL:'https://secrets.dev.athyper.test:8443',
 PROTECTED_VALUES_INFISICAL_WORKSPACE_ID:state.project.id,
 PROTECTED_VALUES_INFISICAL_ENVIRONMENT:'dev',PROTECTED_VALUES_INFISICAL_SECRET_PATH:'/',
},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({projectId:state.project.id,identityId:state.identity.id,role:'no-access',permissions,tokenLifetimeDays:7,publicationUnchanged:true}));
