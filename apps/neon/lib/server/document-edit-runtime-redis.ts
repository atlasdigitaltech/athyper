import "server-only";

export interface DocumentEditRedisClient {
  get(key: string): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  set(
    key: string,
    value: string,
    options?: Record<string, unknown>,
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  rPush(key: string, value: string): Promise<number>;
  lTrim(key: string, start: number, stop: number): Promise<string>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  publish(channel: string, message: string): Promise<number>;
  duplicate(): DocumentEditRedisClient;
  connect(): Promise<unknown>;
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): Promise<unknown> | unknown;
}

interface SessionStoreModule {
  createSessionRedisClient?: (options?: { logPrefix?: string }) => Promise<DocumentEditRedisClient>;
}

/**
 * Optional Redis bridge for the Next.js app runtime.
 *
 * The workspace package is intentionally loaded dynamically so a stale local
 * install cannot make Turbopack fail module resolution. Callers already fall
 * back to in-process caches when Redis is unavailable.
 */
export async function createDocumentEditRedisClient(
  options: { logPrefix?: string } = {},
): Promise<DocumentEditRedisClient> {
  const importPackage = new Function("packageName", "return import(packageName)") as (
    packageName: string,
  ) => Promise<unknown>;
  const mod = await importPackage("@athyper/platform-iam-session-store") as SessionStoreModule;
  if (typeof mod.createSessionRedisClient !== "function") {
    throw new Error("@athyper/platform-iam-session-store does not export createSessionRedisClient.");
  }
  return mod.createSessionRedisClient(options);
}
