export interface BullMqConnectionOptions {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db: number;
  readonly tls?: Readonly<Record<string, never>>;
  readonly maxRetriesPerRequest: null;
}

export function createBullMqConnectionOptions(redisUrl: string): BullMqConnectionOptions {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error("BullMQ Redis URL is invalid");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("BullMQ Redis URL must use redis:// or rediss://");
  }
  if (!url.hostname) throw new Error("BullMQ Redis URL must include a host");

  const databaseText = url.pathname.replace(/^\//, "");
  if (databaseText && !/^\d+$/.test(databaseText)) {
    throw new Error("BullMQ Redis database must be a non-negative integer");
  }
  const port = url.port ? Number(url.port) : url.protocol === "rediss:" ? 6380 : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("BullMQ Redis port is invalid");
  }

  return {
    host: url.hostname,
    port,
    db: databaseText ? Number(databaseText) : 0,
    maxRetriesPerRequest: null,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
