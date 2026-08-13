import { randomUUID } from "node:crypto";
import { RedisConnection } from "bullmq";
import { createBullMqConnectionOptions } from "@athyper/server-runtime-jobs";

export interface SchedulerLeaderLease {
  acquire(): Promise<boolean>;
  assertLeadership(): Promise<void>;
  release(): Promise<void>;
  close(): Promise<void>;
  readonly ownerId: string;
  readonly leaseKey: string;
  readonly fencingToken: string | undefined;
}

export interface RedisSchedulerLeaderLeaseOptions {
  readonly key?: string;
  readonly ownerId?: string;
  readonly ttlMs?: number;
  readonly renewIntervalMs?: number;
  readonly onLeadershipLost?: (error: Error) => void;
  /** Test/embedded connection seam; production creates a dedicated BullMQ Redis connection. */
  readonly connection?: SchedulerLeaseConnection;
}

interface LeaseRedisClient {
  eval(script: string, numberOfKeys: number, ...args: readonly (string | number)[]): Promise<unknown>;
}

export interface SchedulerLeaseConnection {
  readonly client: Promise<unknown>;
  close(): Promise<void>;
}

const ACQUIRE_SCRIPT = "if redis.call('exists', KEYS[1]) == 0 then local generation = redis.call('incr', KEYS[2]); local token = ARGV[1] .. ':' .. generation; redis.call('psetex', KEYS[1], ARGV[2], token); return token else return '' end";
const RENEW_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export class SchedulerLeadershipError extends Error {
  constructor(message = "Scheduler instance does not own the leader lease") {
    super(message);
    this.name = "SchedulerLeadershipError";
  }
}

export function createRedisSchedulerLeaderLease(
  redisUrl: string,
  options: RedisSchedulerLeaderLeaseOptions = {},
): SchedulerLeaderLease {
  const key = options.key ?? "athyper:scheduling:leader";
  const generationKey = `${key}:generation`;
  const ownerId = options.ownerId ?? randomUUID();
  const ttlMs = positiveInteger("leader ttlMs", options.ttlMs ?? 15_000);
  const renewIntervalMs = positiveInteger(
    "leader renewIntervalMs",
    options.renewIntervalMs ?? Math.max(1_000, Math.floor(ttlMs / 3)),
  );
  if (renewIntervalMs >= ttlMs) throw new Error("leader renewIntervalMs must be less than ttlMs");
  const connection: SchedulerLeaseConnection = options.connection
    ?? new RedisConnection(createBullMqConnectionOptions(redisUrl), { shared: false });
  let leader = false;
  let token: string | undefined;
  let closed = false;
  let renewal: ReturnType<typeof setInterval> | undefined;

  const client = async (): Promise<LeaseRedisClient> => await connection.client as unknown as LeaseRedisClient;
  const renew = async (): Promise<boolean> => {
    if (!leader || closed) return false;
    try {
      if (!token) return false;
      const renewed = await (await client()).eval(RENEW_SCRIPT, 1, key, token, ttlMs);
      leader = renewed === 1;
    } catch (error) {
      leader = false;
      options.onLeadershipLost?.(asError(error));
      return false;
    }
    if (!leader) options.onLeadershipLost?.(new SchedulerLeadershipError());
    return leader;
  };
  const startRenewal = (): void => {
    if (renewal) return;
    renewal = setInterval(() => { void renew(); }, renewIntervalMs);
    renewal.unref();
  };

  return {
    ownerId,
    leaseKey: key,
    get fencingToken() { return token; },
    async acquire() {
      if (closed) throw new Error("Scheduler leader lease is closed");
      if (leader && await renew()) return true;
      const acquired = await (await client()).eval(ACQUIRE_SCRIPT, 2, key, generationKey, ownerId, ttlMs);
      token = typeof acquired === "string" && acquired ? acquired : undefined;
      leader = token !== undefined;
      if (leader) startRenewal();
      return leader;
    },
    async assertLeadership() {
      if (!leader || !await renew()) throw new SchedulerLeadershipError();
    },
    async release() {
      if (renewal) clearInterval(renewal);
      renewal = undefined;
      if (!leader) return;
      try { if (token) await (await client()).eval(RELEASE_SCRIPT, 1, key, token); }
      finally { leader = false; token = undefined; }
    },
    async close() {
      if (closed) return;
      await this.release();
      closed = true;
      await connection.close();
    },
  };
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
