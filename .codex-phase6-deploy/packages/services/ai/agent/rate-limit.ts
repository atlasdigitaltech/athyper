export interface AgentRateLimitContext {
  tenantId: string;
  principalId: string;
}

export interface AgentRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  scope?: "user" | "tenant";
}

export interface AgentRateLimiter {
  check(context: AgentRateLimitContext): Promise<AgentRateLimitDecision>;
}

export interface AgentRateLimitOptions {
  userRunsPerMinute?: number;
  tenantRunsPerMinute?: number;
}

interface CounterStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
}

export class FixedWindowAgentRateLimiter implements AgentRateLimiter {
  private readonly userLimit: number;
  private readonly tenantLimit: number;

  constructor(
    private readonly store: CounterStore,
    options: AgentRateLimitOptions = {},
  ) {
    this.userLimit = positiveInteger(options.userRunsPerMinute, 10);
    this.tenantLimit = positiveInteger(options.tenantRunsPerMinute, 100);
  }

  async check(context: AgentRateLimitContext): Promise<AgentRateLimitDecision> {
    const minute = Math.floor(Date.now() / 60_000);
    const ttlSeconds = 61;
    const [userCount, tenantCount] = await Promise.all([
      this.store.increment(
        `atlas-agent:rate:user:${context.tenantId}:${context.principalId}:${minute}`,
        ttlSeconds,
      ),
      this.store.increment(
        `atlas-agent:rate:tenant:${context.tenantId}:${minute}`,
        ttlSeconds,
      ),
    ]);

    if (userCount > this.userLimit) {
      return { allowed: false, retryAfterSeconds: secondsUntilNextMinute(), scope: "user" };
    }
    if (tenantCount > this.tenantLimit) {
      return { allowed: false, retryAfterSeconds: secondsUntilNextMinute(), scope: "tenant" };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export class RedisAgentCounterStore implements CounterStore {
  constructor(
    private readonly redis: {
      eval(
        script: string,
        numberOfKeys: number,
        key: string,
        ttlSeconds: number,
      ): Promise<unknown>;
    },
  ) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const raw = await this.redis.eval(
      [
        "local count = redis.call('INCR', KEYS[1])",
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        "return count",
      ].join("\n"),
      1,
      key,
      ttlSeconds,
    );
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("Atlas Redis rate counter returned an invalid value");
    }
    return count;
  }
}

export class MemoryAgentCounterStore implements CounterStore {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1_000 });
      return 1;
    }
    current.count += 1;
    return current.count;
  }
}

function secondsUntilNextMinute(): number {
  return Math.max(1, 60 - new Date().getUTCSeconds());
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
