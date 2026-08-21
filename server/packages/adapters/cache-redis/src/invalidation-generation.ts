import type { Redis } from "ioredis";

export interface InvalidationGenerationStore {
  incrementOnce(input: { readonly eventId: string; readonly kind: "metadata" | "authorization"; readonly planeKey: string; readonly tenantId: string | null; readonly scopeKey: string }): Promise<number>;
}

const SCRIPT = `
local marker=KEYS[1]
local generation=KEYS[2]
local existing=redis.call('GET',marker)
if existing then return tonumber(existing) end
local next=redis.call('INCR',generation)
redis.call('SET',marker,tostring(next),'EX',ARGV[1],'NX')
return next`;

export function createRedisInvalidationGenerationStore(client: Redis, options: { readonly prefix?: string; readonly dedupeTtlSeconds?: number } = {}): InvalidationGenerationStore {
  const prefix=(options.prefix?.trim()||"iam-invalidation").replace(/:+$/,"");
  const ttl=options.dedupeTtlSeconds??604800;
  if(!Number.isInteger(ttl)||ttl<3600)throw new TypeError("Invalidation dedupe TTL must be at least one hour");
  return { async incrementOnce(input) {
    for(const value of [input.eventId,input.kind,input.planeKey,input.scopeKey])if(!value.trim())throw new TypeError("Invalidation generation coordinates must not be empty");
    const tenant=input.tenantId??"system";
    const tag=`{${input.kind}:${input.planeKey}:${tenant}:${input.scopeKey}}`;
    const result=await client.eval(SCRIPT,2,`${prefix}:${tag}:event:${input.eventId}`,`${prefix}:${tag}:generation`,String(ttl));
    const generation=Number(result);if(!Number.isSafeInteger(generation)||generation<1)throw new Error("Redis returned an invalid generation");return generation;
  }};
}
