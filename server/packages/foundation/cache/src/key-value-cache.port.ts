/**
 * Capability-neutral key-value cache port.
 * Implementations: adapters/cache/redis (ioredis), adapters/cache/memory (tests).
 * Services and platform code import this port — never the Redis adapter directly.
 */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  /**
   * Atomically increment a counter and return the new value.
   * Used for rate-limiting and sequence generation.
   */
  increment(key: string, by?: number): Promise<number>;

  /**
   * Set a key only if it does not already exist (SETNX semantics).
   * Returns true if the key was set, false if it already existed.
   */
  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean>;

  /**
   * Refresh the TTL on an existing key without changing its value.
   * Returns true if the key existed and was refreshed.
   */
  touch(key: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Retrieve multiple keys in a single round-trip.
   * Returns values in the same order as the keys; missing keys are null.
   */
  getMany(keys: string[]): Promise<Array<string | null>>;

  /**
   * Delete multiple keys in a single round-trip.
   */
  deleteMany(keys: string[]): Promise<void>;
}
