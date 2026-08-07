/**
 * Capability-neutral distributed lock port.
 * Implementations: adapters/cache/redis (SET NX PX / Redlock).
 * Use to prevent concurrent execution of idempotency-sensitive operations.
 */
export interface LockOptions {
  /** Lock TTL in ms. Default: 30_000. */
  ttlMs?: number;
  /** Number of acquisition retries before giving up. Default: 0 (fail immediately). */
  retries?: number;
  /** Delay between acquisition retries in ms. Default: 200. */
  retryDelayMs?: number;
}

export interface Lock {
  /** The key the lock was acquired on. */
  readonly key: string;
  /** Remaining TTL in ms at acquisition time. */
  readonly ttlMs: number;
  /** Release the lock. No-op if the lock has already expired or been released. */
  release(): Promise<void>;
  /** Extend the lock TTL. Returns false if the lock has already expired. */
  extend(additionalMs: number): Promise<boolean>;
}

export interface DistributedLock {
  /**
   * Acquire a distributed lock on `key`.
   * Returns null if the lock could not be acquired within the retry budget.
   */
  acquire(key: string, opts?: LockOptions): Promise<Lock | null>;

  /**
   * Run `fn` while holding the lock on `key`.
   * Throws if the lock could not be acquired.
   */
  withLock<T>(key: string, fn: () => Promise<T>, opts?: LockOptions): Promise<T>;
}
