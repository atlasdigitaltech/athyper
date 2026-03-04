import Redis, { type RedisOptions } from "ioredis";

export type RedisClient = Redis;

export function createRedisClient(options: RedisOptions): RedisClient {
  const client = new Redis({
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    ...options
  });

  client.on("error", (err) => {
    // Keep adapter dumb; runtime logger should also log at call sites
     
    console.error(JSON.stringify({ msg: "redis_error", err: String(err) }));
  });

  return client;
}
