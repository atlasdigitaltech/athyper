/** Isolated same-origin DEV adapter for the native NEON review screen and handler. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createEnvironmentAuthRuntime,KEYCLOAK_SESSION_TTLS_MS} from '../../../packages/platform/iam/auth-bff/src/environment';
import {createRelayHandler,IAM_ME_OPERATION} from '../../../packages/platform/gateway/bff-relay/src/index';
import {createAuthenticatedRoleReview} from './entity-authorization/authenticated-role-review.mjs';
const origin=process.env.APP_ORIGIN!;
if(origin!=='https://neon.dev.athyper.test')throw Error('DEV origin required');
const runtime=createEnvironmentAuthRuntime({plane:'neon',clientId:'neon-web',authorizedRole:'AUTHORIZED',origin,...KEYCLOAK_SESSION_TTLS_MS.neon});
const relay=createRelayHandler({plane:'neon',runtimeApiUrl:process.env.RUNTIME_API_URL!,appOrigin:origin,operations:[IAM_ME_OPERATION],session:{resolve:r=>runtime.resolveRelaySession(r),refresh:r=>runtime.refreshRelaySession(r),invalidate:r=>runtime.invalidateRelaySession(r)}});
const handler=createAuthenticatedRoleReview({enabled:true,origin,inventoryPath:'/review/inventory.json',packetPath:'/review/packet.json',packetSha256:process.env.LOCAL_BP_ROLE_REVIEW_PACKET_SHA256!,outputDirectory:'/review/output',resolveSession:r=>runtime.resolveRelaySession(r),async currentIdentity(r){const response=await relay(new Request(origin+'/api/relay/iam/me',{headers:{cookie:r.headers.get('cookie')??''}}),{params:Promise.resolve({path:['iam','me']})});if(!response.ok)throw Object.assign(Error('Identity unavailable'),{status:response.status===401?401:503,code:'REVIEW_IDENTITY_UNAVAILABLE'});return response.json();}});
createServer(async(req,res)=>{try{
 const url=new URL(req.url??'/',origin);
 let result:Response;
 if(url.pathname==='/livez')result=new Response('ok');
 else if(url.pathname==='/mdg/authorization-review/review.js')result=new Response(await readFile('/app/review.js'),{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 else if(url.pathname==='/mdg/authorization-review')result=new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Business Partner responsibility review</title></head><body><nav><a href="/home">NEON home</a> · <a href="/api/auth/login?returnTo=%2Fmdg%2Fauthorization-review">Sign in</a></nav><div id="review-root"></div><script type="module" src="/mdg/authorization-review/review.js"></script></body></html>',{headers:{'content-type':'text/html','cache-control':'no-store','x-content-type-options':'nosniff'}});
 else if(url.pathname==='/api/governance/named-role-review'){
 const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
 result=await handler(new Request(url,{method:req.method,headers,...(req.method==='POST'?{body:Readable.toWeb(req) as ReadableStream<Uint8Array>,duplex:'half'}:{})} as RequestInit));
 }else result=new Response('Not found',{status:404});
 res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"code":"REVIEW_UNAVAILABLE"}');}
}).listen(3000,'0.0.0.0');
