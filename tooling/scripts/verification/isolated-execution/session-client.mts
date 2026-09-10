/** Single operator-invoked request using normal BFF session resolution. Never emits tokens. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createEnvironmentAuthRuntime,KEYCLOAK_SESSION_TTLS_MS} from '../../../../packages/platform/iam/auth-bff/src/environment.ts';
const account=process.argv[2],path=process.argv[3],method=process.argv[4]??'GET';
const principals={'catl.admin':'cca94907-7519-5871-8e3c-6b11aa545c93','catl.owner':'645b6a55-3355-526a-9643-3900425bde47'};
if(!(account in principals)||!path?.startsWith('/api/')||path.includes('..')||path.includes('://'))throw Error('QUALIFICATION_REQUEST_INVALID');
const state=JSON.parse(readFileSync('/auth/'+account+'-release-19-qualification.json','utf8'));
const cookie=state.cookies.filter(c=>c.domain==='neon.dev.athyper.test').map(c=>c.name+'='+c.value).join('; ');
const runtime=createEnvironmentAuthRuntime({plane:'neon',clientId:'neon-web',authorizedRole:'AUTHORIZED',origin:'https://neon.dev.athyper.test',...KEYCLOAK_SESSION_TTLS_MS.neon});
const request=new Request('https://neon.dev.athyper.test/api/relay/iam/me',{headers:{cookie}});
let session=await runtime.resolveRelaySession(request);
if(!session||session.principalId!==principals[account])throw Error('AUTHENTICATED_SESSION_REQUIRED');
const claims=JSON.parse(Buffer.from(session.accessToken.split('.')[1],'base64url').toString());
if(claims.exp*1000<Date.now()+30000)session=await runtime.refreshRelaySession(request);
if(!session||session.principalId!==principals[account])throw Error('AUTHENTICATED_SESSION_REQUIRED');
const headers={authorization:'Bearer '+session.accessToken,'x-plane':'neon','x-realm':session.realmKey,'x-principal-id':session.principalId,'x-auth-epoch':String(session.authEpoch),'x-tenant-id':session.tenantId,'content-type':'application/json'};
const source=await fetch(process.env.RUNTIME_API_URL+'/api/iam/me',{headers});
if(!source.ok)throw Error('SOURCE_SESSION_REVALIDATION_FAILED:'+source.status);
const sourceIdentity=await source.json();if(sourceIdentity.principalId!==session.principalId)throw Error('SOURCE_IDENTITY_CHANGED');
let body; if(!['GET','HEAD'].includes(method)){body=readFileSync(0,'utf8');headers['idempotency-key']='isolated-'+createHash('sha256').update(account+path+body).digest('hex');}
const response=await fetch('http://athyper-bp-r19-api:4000'+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});
console.log(JSON.stringify({account,principalId:session.principalId,assurance:session.assurance,status:response.status,artifact:response.headers.get('x-execution-artifact'),releaseId:response.headers.get('x-execution-release'),requestId:response.headers.get('x-request-id'),body:await response.json()}));process.exit(0);
