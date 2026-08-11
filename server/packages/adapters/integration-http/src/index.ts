import { isIP } from "node:net";
import { lookup as nodeLookup } from "node:dns/promises";
import type { ConnectorResponse,ConnectorTransport,InvocationPlan,TokenCache } from "@athyper/server-contract-integration";

export interface IntegrationHttpOptions { readonly fetch?:typeof globalThis.fetch;readonly lookup?:(hostname:string)=>Promise<readonly string[]>;readonly tokenCache?:TokenCache;readonly allowPrivateNetworks?:boolean;readonly allowedHosts?:readonly string[];readonly maxResponseBytes?:number; }
type Credential={type?:string;apiKey?:string;header?:string;token?:string;clientId?:string;clientSecret?:string;tokenUrl?:string;scope?:string;audience?:string};

export function createIntegrationHttpTransport(options:IntegrationHttpOptions={}):ConnectorTransport{
  const fetcher=options.fetch??globalThis.fetch, lookup=options.lookup??resolveAddresses;
  const invoke=async(plan:InvocationPlan,payload:Uint8Array|undefined,credentialBytes:Uint8Array|undefined,signal?:AbortSignal):Promise<ConnectorResponse>=>{
    const url=await validateOutboundUrl(plan.url,lookup,options);
    const credential=parseCredential(credentialBytes);
    const auth=await authHeaders(credential,plan,options,fetcher,lookup);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(new Error("INTEGRATION_HTTP_TIMEOUT")),plan.timeoutMs);
    const abort=()=>controller.abort(signal?.reason); signal?.addEventListener("abort",abort,{once:true});
    try{
      const response=await fetcher(url,{method:plan.method,headers:{"content-type":plan.requestContentType,...plan.headers,...auth,"idempotency-key":plan.headers["idempotency-key"]??""},body:payload&&plan.method!=="GET"?Buffer.from(payload):undefined,redirect:"manual",signal:controller.signal});
      if(response.status>=300&&response.status<400)throw coded("INTEGRATION_REDIRECT_DENIED");
      const body=await boundedBody(response,options.maxResponseBytes??1_048_576);
      return{status:response.status,headers:Object.fromEntries(response.headers.entries()),body};
    }finally{clearTimeout(timeout);signal?.removeEventListener("abort",abort);}
  };
  return{invoke:(p,b,c,s)=>invoke(p,b,c,s),probe:(p,c,s)=>{if(p.method!=="GET"&&p.kind!=="health")throw coded("INTEGRATION_PROBE_NOT_ALLOWED");return invoke({...p,method:"GET"},undefined,c,s);}};
}

export async function validateOutboundUrl(value:string,lookup:(hostname:string)=>Promise<readonly string[]>=resolveAddresses,options:Pick<IntegrationHttpOptions,"allowPrivateNetworks"|"allowedHosts">={}):Promise<URL>{
  const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443")throw coded("INTEGRATION_URL_DENIED");
  const host=url.hostname.toLowerCase();if(options.allowedHosts?.length&&!options.allowedHosts.some(x=>x.toLowerCase()===host))throw coded("INTEGRATION_HOST_DENIED");
  const addresses=isIP(host)?[host]:await lookup(host);if(!addresses.length)throw coded("INTEGRATION_DNS_EMPTY");
  if(!options.allowPrivateNetworks&&addresses.some(isPrivateAddress))throw coded("INTEGRATION_PRIVATE_NETWORK_DENIED");return url;
}
function isPrivateAddress(ip:string):boolean{const v=ip.toLowerCase();if(v.includes(":")){if(v==="::"||v==="::1"||v.startsWith("fc")||v.startsWith("fd")||/^fe[89ab]/.test(v)||v.startsWith("ff"))return true;const mapped=v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);return mapped?isPrivateAddress(mapped[1]!):false;}const p=v.split(".").map(Number),a=p[0]??-1,b=p[1]??-1;return a===10||a===127||a===0||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a>=224;}
async function resolveAddresses(host:string):Promise<readonly string[]>{return(await nodeLookup(host,{all:true,verbatim:true})).map(x=>x.address);}
function parseCredential(bytes:Uint8Array|undefined):Credential{if(!bytes)return{};try{return JSON.parse(Buffer.from(bytes).toString("utf8")) as Credential;}catch{throw coded("INTEGRATION_CREDENTIAL_INVALID");}}
async function authHeaders(c:Credential,p:InvocationPlan,o:IntegrationHttpOptions,f:typeof fetch,l:(h:string)=>Promise<readonly string[]>):Promise<Record<string,string>>{if(c.type==="api_key")return{[c.header||"x-api-key"]:c.apiKey||""};if(c.type==="bearer")return{authorization:`Bearer ${c.token||""}`};if(c.type!=="oauth2_client_credentials")return{};const audience=c.audience||p.audience,key=`integration:oauth:${p.tenantId}:${p.credentialReference}:${p.credentialRevision}:${audience}`,cached=await o.tokenCache?.get(key);if(cached)return{authorization:`Bearer ${cached}`};if(!c.tokenUrl)throw coded("INTEGRATION_OAUTH_CONFIG_INVALID");await validateOutboundUrl(c.tokenUrl,l,o);const body=new URLSearchParams({grant_type:"client_credentials",client_id:c.clientId||"",client_secret:c.clientSecret||"",...(c.scope?{scope:c.scope}:{}),...(audience?{audience}:{})});const response=await f(c.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,redirect:"manual"});if(!response.ok)throw coded("INTEGRATION_OAUTH_TOKEN_FAILED");const token=await response.json() as {access_token?:string;expires_in?:number};if(!token.access_token)throw coded("INTEGRATION_OAUTH_TOKEN_INVALID");await o.tokenCache?.set(key,token.access_token,Math.max(1,(token.expires_in??3600)-60));return{authorization:`Bearer ${token.access_token}`};}
async function boundedBody(response:Response,max:number):Promise<Uint8Array>{const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>max)throw coded("INTEGRATION_RESPONSE_TOO_LARGE");return bytes;}
function coded(code:string):Error{return Object.assign(new Error(code),{code,retryable:false});}
