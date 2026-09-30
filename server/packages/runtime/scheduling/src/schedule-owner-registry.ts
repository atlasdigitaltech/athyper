import { RedisConnection } from "bullmq";
import { createBullMqConnectionOptions } from "@athyper/server-runtime-jobs";
import type { SchedulerLeaseConnection } from "./scheduler-leader-lease.js";

export interface ScheduleOwnerRegistry {
  listScheduleIds(): Promise<readonly string[]>;
  get(scheduleId: string): Promise<string | undefined>;
  claim(scheduleId: string, queue: string, fencingToken: string): Promise<string | undefined>;
  release(scheduleId: string, queue: string, fencingToken: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface RedisScheduleOwnerRegistryOptions {
  readonly key?: string;
  readonly leaseKey?: string;
  readonly connection?: SchedulerLeaseConnection;
}

interface RegistryRedisClient {
  hkeys(key: string): Promise<string[]>;
  hget(key: string, field: string): Promise<string | null>;
  eval(script: string, numberOfKeys: number, ...args: readonly string[]): Promise<unknown>;
}

const CLAIM_SCRIPT = "if redis.call('get', KEYS[1]) ~= ARGV[1] then return {err='SCHEDULER_FENCE_LOST'} end local previous = redis.call('hget', KEYS[2], ARGV[2]); redis.call('hset', KEYS[2], ARGV[2], ARGV[3]); return previous or ''";
const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) ~= ARGV[1] then return {err='SCHEDULER_FENCE_LOST'} end if redis.call('hget', KEYS[2], ARGV[2]) == ARGV[3] then return redis.call('hdel', KEYS[2], ARGV[2]) else return 0 end";

export function createRedisScheduleOwnerRegistry(
  redisUrl: string,
  options: RedisScheduleOwnerRegistryOptions = {},
): ScheduleOwnerRegistry {
  const key = options.key ?? "athyper:scheduling:owners";
  const leaseKey = options.leaseKey ?? "athyper:scheduling:leader";
  const connection = options.connection
    ?? new RedisConnection(createBullMqConnectionOptions(redisUrl), { shared: false });
  const client = async (): Promise<RegistryRedisClient> =>
    await connection.client as unknown as RegistryRedisClient;
  return {
    listScheduleIds: async () => (await client()).hkeys(key),
    async get(scheduleId) {
      return (await (await client()).hget(key, scheduleId)) ?? undefined;
    },
    async claim(scheduleId, queue, fencingToken) {
      const previous = await (await client()).eval(
        CLAIM_SCRIPT, 2, leaseKey, key, fencingToken, scheduleId, queue,
      );
      return typeof previous === "string" && previous ? previous : undefined;
    },
    async release(scheduleId, queue, fencingToken) {
      return await (await client()).eval(
        RELEASE_SCRIPT, 2, leaseKey, key, fencingToken, scheduleId, queue,
      ) === 1;
    },
    close: () => connection.close(),
  };
}

export function createInMemoryScheduleOwnerRegistry(): ScheduleOwnerRegistry {
  const owners = new Map<string, string>();
  return {
    listScheduleIds: async () => [...owners.keys()],
    get: async (scheduleId) => owners.get(scheduleId),
    async claim(scheduleId, queue) {
      const previous = owners.get(scheduleId);
      owners.set(scheduleId, queue);
      return previous;
    },
    async release(scheduleId, queue) {
      if (owners.get(scheduleId) !== queue) return false;
      return owners.delete(scheduleId);
    },
    async close() { owners.clear(); },
  };
}
