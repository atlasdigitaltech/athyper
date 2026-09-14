import { randomUUID } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  atlasInsightReuseKey,
  type AtlasInsightReuseBinding,
} from "./insight-reuse-policy.js";
import { assertAtlasContext } from "./context.js";

/** Cache storage is optional infrastructure, never an authorization source. */
export interface AtlasInsightRedis {
  eval(
    script: string,
    keys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
}

export const ATLAS_INSIGHT_CACHE_SCRIPT = `
local key=KEYS[1]
local op=ARGV[1]
if op=='invalidate' then redis.call('DEL',key);return 1 end
local time=redis.call('TIME');local now=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local ttl=tonumber(ARGV[4])
if op=='get' and redis.call('EXISTS',key)==0 then
 redis.call('HSET',key,'epoch',ARGV[3],'bytes',0);redis.call('PEXPIRE',key,ttl*2)
end
local epoch=redis.call('HGET',key,'epoch')
if not epoch then if op=='put' then return 0 else return {'',''} end end
local field='e:'..ARGV[2]
local function remove(field,raw)
 redis.call('HDEL',key,field);redis.call('HINCRBY',key,'bytes',-(string.len(field)+string.len(raw)))
end
if op=='get' then
 local raw=redis.call('HGET',key,field)
 if not raw then return {epoch,''} end
 local entry=cjson.decode(raw)
 if entry.expires<=now then remove(field,raw);return {epoch,''} end
 return {epoch,entry.value}
end
if op~='put' or epoch~=ARGV[3] then return 0 end
local all=redis.call('HGETALL',key)
for i=1,#all,2 do
 if string.sub(all[i],1,2)=='e:' and cjson.decode(all[i+1]).expires<=now then remove(all[i],all[i+1]) end
end
local raw=cjson.encode({expires=now+ttl,value=ARGV[5]})
local cost=string.len(field)+string.len(raw)
local old=redis.call('HGET',key,field)
local previous=old and (string.len(field)+string.len(old)) or 0
if cost>tonumber(ARGV[8]) or tonumber(redis.call('HGET',key,'bytes'))-previous+cost>tonumber(ARGV[7]) then return 0 end
if not old and redis.call('HLEN',key)-2>=tonumber(ARGV[6]) then return 0 end
if old then remove(field,old) end
redis.call('HSET',key,field,raw);redis.call('HINCRBY',key,'bytes',cost);redis.call('PEXPIRE',key,ttl*2)
return 1
`;

export interface AtlasInsightCacheSnapshot {
  readonly binding: AtlasInsightReuseBinding;
  /** Complete transitive disclosure claims, issued by the owner, not the model. */
  readonly claims: readonly string[];
}

/** Exact-context owner evidence only; do not use for generated prose or commands.
 * Owner snapshot must cover related rows, definitions and rules. Returning null
 * deliberately bypasses caching when the owner cannot establish that vector.
 */
export class AtlasRedisInsightCache<T> {
  private readonly ttl: number;
  private readonly key: string;
  constructor(
    private readonly options: {
      redis: AtlasInsightRedis;
      key?: string;
      ttlMs?: number;
      maxEntries?: number;
      maxBytes?: number;
      maxEntryBytes?: number;
      commandTimeoutMs?: number;
      parse: (value: unknown) => T;
    },
  ) {
    this.ttl = options.ttlMs ?? 15000;
    this.key = options.key ?? "atlas:insight:evidence:v1";
    for (const n of [
      this.ttl,
      options.maxEntries ?? 128,
      options.maxBytes ?? 2097152,
      options.maxEntryBytes ?? 16384,
      options.commandTimeoutMs ?? 1000,
    ])
      if (!Number.isSafeInteger(n) || n <= 0)
        throw new TypeError("Finite positive cache bounds required");
    if (
      this.ttl > 60000 ||
      (options.maxEntries ?? 128) > 1024 ||
      (options.maxBytes ?? 2097152) > 8388608 ||
      (options.maxEntryBytes ?? 16384) > 65536
    )
      throw new TypeError("Insight cache exceeds pilot capacity bounds");
    if (!/^atlas:insight:[a-zA-Z0-9:_-]+$/.test(this.key))
      throw new TypeError("Dedicated Atlas insight key required");
  }
  private async command(...args: (string | number)[]): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.options.redis.eval(
          ATLAS_INSIGHT_CACHE_SCRIPT,
          1,
          this.key,
          ...args,
        ),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Insight cache timeout")),
            this.options.commandTimeoutMs ?? 1000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async invalidate(): Promise<void> {
    await this.command("invalidate");
  }

  async read(input: {
    context: VerifiedRequestContext;
    snapshot: () => Promise<AtlasInsightCacheSnapshot | null>;
    authorize: (claim: string) => Promise<boolean>;
    load: () => Promise<T>;
    signal?: AbortSignal;
  }): Promise<{ value: T; cacheHit: boolean }> {
    assertAtlasContext(input.context);
    const check = () => input.signal?.throwIfAborted();
    const signature = (s: AtlasInsightCacheSnapshot) => {
      if (!s.binding.canonicalScope.trim())
        throw new TypeError("Owner canonical scope required");
      if (!s.claims.length || s.claims.some((c) => !c.trim()))
        throw new TypeError("Owner disclosure claims required");
      return atlasInsightReuseKey(input.context, {
        ...s.binding,
        canonicalScope: JSON.stringify([
          s.binding.canonicalScope,
          [...new Set(s.claims)].sort(),
        ]),
      });
    };
    const allowed = async (s: AtlasInsightCacheSnapshot) => {
      for (const claim of s.claims) {
        check();
        if (!(await input.authorize(claim)))
          throw new Error("Insight disclosure denied");
      }
      check();
    };
    check();
    const before = await input.snapshot();
    check();
    // The load callback remains the authorized owner path, even when caching is unavailable.
    if (!before) {
      const value = this.options.parse(await input.load());
      check();
      return { value, cacheHit: false };
    }
    const binding = signature(before);
    await allowed(before);
    let epoch = "",
      cached: T | undefined,
      hasCached = false;
    try {
      const result = await this.command("get", binding, randomUUID(), this.ttl);
      if (
        Array.isArray(result) &&
        typeof result[0] === "string" &&
        typeof result[1] === "string"
      ) {
        epoch = result[0];
        if (result[1]) {
          cached = this.options.parse(JSON.parse(result[1]));
          hasCached = true;
        }
      }
    } catch {
      /* Miss on Redis failure or malformed stored evidence; never reuse an unvalidated payload. */
    }
    check();
    const value = hasCached ? cached! : this.options.parse(await input.load());
    check();
    const after = await input.snapshot();
    check();
    if (!after || signature(after) !== binding)
      throw new Error("Insight owner revisions changed; reassessment required");
    await allowed(after);
    if (!hasCached && epoch) {
      const json = JSON.stringify(value);
      if (
        json !== undefined &&
        Buffer.byteLength(json) <= (this.options.maxEntryBytes ?? 16384)
      ) {
        try {
          await this.command(
            "put",
            binding,
            epoch,
            this.ttl,
            json,
            this.options.maxEntries ?? 128,
            this.options.maxBytes ?? 2097152,
            this.options.maxEntryBytes ?? 16384,
          );
        } catch {
          /* Cache admission failure does not replace owner success. */
        }
      }
    }
    // Storage latency is another revocation window. Recheck immediately before disclosure.
    const final = await input.snapshot();
    check();
    if (!final || signature(final) !== binding)
      throw new Error("Insight owner revisions changed; reassessment required");
    await allowed(final);
    return { value, cacheHit: hasCached };
  }
}
