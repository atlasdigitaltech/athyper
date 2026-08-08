// Per-key sampler for high-volume IAM runtime events.
//
// Phase F — Per-key log sampler for high-volume mismatch events.
//
// Wraps `logger.warn` calls inside the CrossCheckReporter so a noisy
// misconfiguration storm (e.g. a forwarding proxy that always sends the
// wrong x-plane) doesn't drown the structured-logging pipeline. Counter
// metrics stay UNSAMPLED so dashboards see the true total — only the log
// lines are throttled.
//
// Policy per (check, source) key:
//   - first `burst` events in a window: log unconditionally
//   - subsequent events: log every `sampleRate`-th event
//   - window auto-resets every `windowMs`; resets restore burst credit
//
// Memory bound: at most `maxKeys` keys retained. The least-recently-touched
// key is dropped when capacity is hit (Map iteration order is insertion-
// order + reinsertion-on-touch, giving free LRU semantics).
//
// Deterministic post-burst sampling (event-count modulo rather than random)
// makes unit tests reliable and gives operators a predictable cadence.

export interface LogSamplerConfig {
  /** Window length in ms. Default: 60_000 (1 minute). */
  readonly windowMs?: number;
  /** Events that log unconditionally at window start. Default: 10. */
  readonly burst?: number;
  /** Post-burst sampling: log 1 in every `sampleRate`. Default: 100. */
  readonly sampleRate?: number;
  /** Memory cap on distinct keys. Default: 10_000. */
  readonly maxKeys?: number;
  /** Clock injection point for tests. Defaults to Date.now. */
  readonly now?: () => number;
}

export interface LogSamplerVerdict {
  /** True ⇒ caller should emit the log line. */
  readonly shouldLog: boolean;
  /** Events suppressed since the last `shouldLog: true` for this key. */
  readonly suppressedRun: number;
  /** Total events seen on this key during the current window. */
  readonly windowCount: number;
}

interface BucketState {
  windowStart: number;
  count: number;
  // Increments every time shouldLog returns false; resets when it returns true.
  suppressedRun: number;
}

const DEFAULTS: Required<Omit<LogSamplerConfig, "now">> = {
  windowMs: 60_000,
  burst: 10,
  sampleRate: 100,
  maxKeys: 10_000,
};

export class LogSampler {
  readonly #windowMs: number;
  readonly #burst: number;
  readonly #sampleRate: number;
  readonly #maxKeys: number;
  readonly #now: () => number;
  readonly #buckets = new Map<string, BucketState>();

  constructor(config: LogSamplerConfig = {}) {
    this.#windowMs = config.windowMs ?? DEFAULTS.windowMs;
    this.#burst = config.burst ?? DEFAULTS.burst;
    this.#sampleRate = config.sampleRate ?? DEFAULTS.sampleRate;
    this.#maxKeys = config.maxKeys ?? DEFAULTS.maxKeys;
    this.#now = config.now ?? (() => Date.now());

    if (this.#windowMs <= 0) throw new Error("LogSampler: windowMs must be > 0");
    if (this.#burst < 0) throw new Error("LogSampler: burst must be >= 0");
    if (this.#sampleRate < 1) throw new Error("LogSampler: sampleRate must be >= 1");
    if (this.#maxKeys < 1) throw new Error("LogSampler: maxKeys must be >= 1");
  }

  /**
   * Decide whether to log a single event under `key`. The verdict updates
   * internal state — call once per event.
   */
  decide(key: string): LogSamplerVerdict {
    const now = this.#now();

    let bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      this.#enforceCapacity();
      bucket = { windowStart: now, count: 0, suppressedRun: 0 };
      this.#buckets.set(key, bucket);
    } else if (now - bucket.windowStart >= this.#windowMs) {
      // Window expired — reset.
      bucket.windowStart = now;
      bucket.count = 0;
      bucket.suppressedRun = 0;
      this.#touch(key, bucket);
    } else {
      this.#touch(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count <= this.#burst) {
      const suppressed = bucket.suppressedRun;
      bucket.suppressedRun = 0;
      return { shouldLog: true, suppressedRun: suppressed, windowCount: bucket.count };
    }

    // Post-burst: every `sampleRate`-th event logs. Use position past burst
    // so sample fires deterministically at (burst+1), (burst+1+sampleRate),
    // etc. — first event after burst always samples to avoid a quiet gap.
    const positionPastBurst = bucket.count - this.#burst;
    const fires = positionPastBurst === 1 || (positionPastBurst - 1) % this.#sampleRate === 0;
    if (fires) {
      const suppressed = bucket.suppressedRun;
      bucket.suppressedRun = 0;
      return { shouldLog: true, suppressedRun: suppressed, windowCount: bucket.count };
    }

    bucket.suppressedRun += 1;
    return { shouldLog: false, suppressedRun: bucket.suppressedRun, windowCount: bucket.count };
  }

  /**
   * Number of keys currently tracked. Test-only.
   */
  size(): number {
    return this.#buckets.size;
  }

  /**
   * Wipe internal state. Test-only.
   */
  reset(): void {
    this.#buckets.clear();
  }

  // ── LRU helpers ────────────────────────────────────────────────────────────

  #touch(key: string, bucket: BucketState): void {
    // Re-inserting a key moves it to the end of Map iteration order, giving
    // O(1) LRU semantics without an external structure.
    this.#buckets.delete(key);
    this.#buckets.set(key, bucket);
  }

  #enforceCapacity(): void {
    while (this.#buckets.size >= this.#maxKeys) {
      const oldest = this.#buckets.keys().next();
      if (oldest.done) return;
      this.#buckets.delete(oldest.value);
    }
  }
}
