import { randomUUID } from "node:crypto";
import {
  LocalError,
  type InferenceAdmission,
} from "@athyper/server-adapter-ai-ollama";

export const ATLAS_INFERENCE_ADMISSION_KEY = "atlas:inference:shared:v1";
/** All state lives in one non-expiring hash. Loss/eviction of that hash fails closed.
 * Owner expiry NEVER grants a successor: a crashed owner requires quiescent recovery. */
export const INFERENCE_ADMISSION_SCRIPT = `
local key,action,token=KEYS[1],ARGV[1],ARGV[2]
if not redis.call('HGET',key,'epoch') then return {'inference_admission_uninitialized'} end
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local owner=redis.call('HGET',key,'owner')
if action=='release' then
 redis.call('HDEL',key,'w:'..token)
 if owner==token then redis.call('HDEL',key,'owner','heartbeat','started') end
 return {'released'}
end
if action=='heartbeat' then
 if owner~=token then return {'inference_admission_lost'} end
 if now-tonumber(redis.call('HGET',key,'started') or '0')>130000 then return {'inference_admission_deadline'} end
 redis.call('HSET',key,'heartbeat',now);return {'renewed'}
end
if owner==token then return {'granted'} end
if owner and now-tonumber(redis.call('HGET',key,'heartbeat') or '0')>5000 then return {'inference_admission_abandoned'} end
local count,first,firstseq=0,nil,nil
local all=redis.call('HGETALL',key)
for i=1,#all,2 do
 if string.sub(all[i],1,2)=='w:' then
  local seq,deadline=string.match(all[i+1],'^(%d+):(%d+)$')
  if not deadline or tonumber(deadline)<=now then redis.call('HDEL',key,all[i])
  else count=count+1;if not firstseq or tonumber(seq)<firstseq then first=string.sub(all[i],3);firstseq=tonumber(seq) end end
 end
end
if not owner and (not first or first==token) then
 redis.call('HDEL',key,'w:'..token);redis.call('HSET',key,'owner',token,'started',now,'heartbeat',now);return {'granted'}
end
if not redis.call('HGET',key,'w:'..token) then
 if count>=8 then return {'local_queue_full'} end
 local seq=redis.call('HINCRBY',key,'sequence',1)
 redis.call('HSET',key,'w:'..token,tostring(seq)..':'..tostring(now+tonumber(ARGV[3])))
end
return {'wait'}
`;
interface RedisEvaluator {
  eval(script: string, keys: number, ...args: string[]): Promise<unknown>;
}
const unavailable = () =>
  new LocalError("overloaded", "inference_admission_unavailable");
/** Shared across every API/worker connected to the same deployment Redis resource. */
export class RedisInferenceAdmission implements InferenceAdmission {
  constructor(
    private readonly redis: RedisEvaluator | undefined,
    private readonly key = ATLAS_INFERENCE_ADMISSION_KEY,
  ) {}
  private async command(
    action: string,
    token: string,
    remaining = 5000,
  ): Promise<string> {
    if (!this.redis) throw unavailable();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        this.redis.eval(
          INFERENCE_ADMISSION_SCRIPT,
          1,
          this.key,
          action,
          token,
          String(Math.max(1, remaining)),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(unavailable()), 1000);
        }),
      ]);
      if (!Array.isArray(value) || typeof value[0] !== "string")
        throw unavailable();
      return value[0];
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }
  async acquire(
    signal: AbortSignal,
    onLost?: (error: Error) => void,
  ): Promise<() => Promise<void>> {
    signal.throwIfAborted();
    const token = randomUUID(),
      deadline = Date.now() + 5000;
    let active = false,
      released = false,
      heartbeat: ReturnType<typeof setTimeout> | undefined;
    const release = async () => {
      if (released) return;
      released = true;
      clearTimeout(heartbeat);
      signal.removeEventListener("abort", cancelWaiting);
      if(await this.command("release", token)!=="released")throw unavailable();
    };
    // An abort while a Redis command is in flight queues token-checked cleanup after
    // that command. A delayed grant can never dispatch inference after cancellation.
    const cancelWaiting = () => {
      if (!active) void release().catch(() => {});
    };
    signal.addEventListener("abort", cancelWaiting, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        if (Date.now() >= deadline)
          throw new LocalError("overloaded", "local_queue_timeout");
        const result = await this.command(
          "acquire",
          token,
          deadline - Date.now(),
        );
        signal.throwIfAborted();
        if (Date.now() >= deadline) throw new LocalError("overloaded", "local_queue_timeout");
        if (result === "granted") {
          active = true;
          break;
        }
        if (result !== "wait") throw new LocalError("overloaded", result);
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, 50);
          signal.addEventListener("abort", finish, { once: true });
          if (signal.aborted) finish();
        });
      }
      const renew = async () => {
        if (released) return;
        try {
          const result = await this.command("heartbeat", token);
          if (result !== "renewed") throw new LocalError("overloaded", result);
        } catch (error) {
          onLost?.(error instanceof LocalError ? error : unavailable());
          return;
        }
        if (!released) heartbeat = setTimeout(() => void renew(), 1000);
      };
      heartbeat = setTimeout(() => void renew(), 1000);
      return release;
    } catch (error) {
      await release().catch(() => {});
      throw error;
    }
  }
}
