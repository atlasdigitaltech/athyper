import type { OpaqueSecretValue, SecretStore } from "@athyper/server-contract-secrets";

export interface InfisicalSecretStoreConfig {
  readonly endpoint: string;
  readonly token: string;
  readonly workspaceId: string;
  readonly environment: string;
  readonly secretPath?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

export function createInfisicalSecretStore(config: InfisicalSecretStoreConfig): SecretStore {
  const endpoint = new URL(requireValue(config.endpoint, "endpoint"));
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") throw new Error("Infisical endpoint must use HTTPS outside localhost");
  const fetcher = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 5_000;
  let closed = false;

  const request = async (reference: string): Promise<OpaqueSecretValue> => {
    if (closed) throw new Error("SECRET_STORE_CLOSED");
    const url = new URL(`/api/v3/secrets/raw/${encodeURIComponent(requireValue(reference,"reference"))}`, endpoint);
    url.searchParams.set("workspaceId", requireValue(config.workspaceId,"workspaceId"));
    url.searchParams.set("environment", requireValue(config.environment,"environment"));
    url.searchParams.set("secretPath", config.secretPath?.trim() || "/");
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${requireValue(config.token,"token")}`, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw Object.assign(new Error("SECRET_STORE_UNAVAILABLE"), { code: response.status === 404 ? "SECRET_NOT_FOUND" : "SECRET_STORE_UNAVAILABLE" });
    const payload = await response.json() as Record<string, unknown>;
    const secret = asObject(payload["secret"] ?? payload);
    const encoded = requireValue(secret["secretValue"], "secretValue");
    const encoding = secret["secretEncoding"] === "utf8" ? "utf8" : "base64";
    return { bytes: Buffer.from(encoded, encoding), version: String(secret["version"] ?? secret["secretVersion"] ?? "current") };
  };

  const put = async (reference: string, value: Uint8Array): Promise<{ reference:string;version:string }> => {
    if (closed) throw new Error("SECRET_STORE_CLOSED");
    const opaqueReference=requireValue(reference,"reference");
    if(value.byteLength<16)throw Object.assign(new Error("SECRET_MATERIAL_TOO_SHORT"),{code:"SECRET_MATERIAL_TOO_SHORT"});
    const url=new URL(`/api/v3/secrets/raw/${encodeURIComponent(opaqueReference)}`,endpoint);
    const response=await fetcher(url,{method:"PUT",headers:{Authorization:`Bearer ${requireValue(config.token,"token")}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({workspaceId:requireValue(config.workspaceId,"workspaceId"),environment:requireValue(config.environment,"environment"),secretPath:config.secretPath?.trim()||"/",secretValue:Buffer.from(value).toString("base64"),secretEncoding:"base64"}),signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw Object.assign(new Error("SECRET_STORE_WRITE_FAILED"),{code:"SECRET_STORE_WRITE_FAILED"});
    const payload=await response.json().catch(()=>({})) as Record<string,unknown>,secret=payload["secret"]&&typeof payload["secret"]==="object"?payload["secret"] as Record<string,unknown>:payload;
    return{reference:opaqueReference,version:String(secret["version"]??secret["secretVersion"]??"current")};
  };

  return {
    resolve: request,
    put,
    async health() { try { if (closed) return { healthy:false,message:"closed" }; new URL(endpoint); return { healthy:true }; } catch { return { healthy:false,message:"configuration invalid" }; } },
    close() { closed = true; },
  };
}

function requireValue(value:unknown,name:string):string{if(typeof value!=="string"||!value.trim())throw new TypeError(`Infisical ${name} is required`);return value.trim();}
function asObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("SECRET_RESPONSE_INVALID");return value as Record<string,unknown>;}
