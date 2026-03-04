/**
 * Audit Rate Limiter
 *
 * Per-tenant backpressure control for chatty info-level audit events.
 * Critical, error, and admin events always pass through.
 * Info events are rate-limited per tenant+eventType with probabilistic sampling
 * when the limit is exceeded.
 *
 * Reuses the platform RateLimiter (Redis-backed token bucket).
 */

import type { RateLimiter, RateLimitResult } from "@athyper/core";

// ============================================================================
// Configuration
// ============================================================================

export interface AuditRateLimiterConfig {
  /** Default sampling rate when rate limit is hit (0.0–1.0, default 0.1 = 10%) */
  defaultSamplingRate: number;

  /** Per-event-type sampling overrides */
  samplingOverrides?: Record<string, number>;
}

const DEFAULT_CONFIG: AuditRateLimiterConfig = {
  defaultSamplingRate: 0.1,
};

// ============================================================================
// Rate Limiter
// ============================================================================

export class AuditRateLimiter {
  private readonly config: AuditRateLimiterConfig;

  constructor(
    private readonly limiter: RateLimiter,
    config?: Partial<AuditRateLimiterConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Decide whether an audit event should be captured.
   *
   * Always captures:
   *   - severity = critical | error
   *   - event types starting with "admin."
   *   - event types starting with "security."
   *
   * Rate-limits (with sampling fallback):
   *   - severity = info | warning for chatty event types
   */
  async shouldCapture(
    tenantId: string,
    eventType: string,
    severity: string,
  ): Promise<{ capture: boolean; sampled: boolean }> {
    // Always keep high-severity and privileged events
    if (severity === "critical" || severity === "error") {
      return { capture: true, sampled: false };
    }
    if (eventType.startsWith("admin.") || eventType.startsWith("security.")) {
      return { capture: true, sampled: false };
    }

    // Rate-limit per tenant + event type
    const key = `audit:rate:${tenantId}:${eventType}`;

    let result: RateLimitResult;
    try {
      result = await this.limiter.consume(key);
    } catch {
      // Redis down — fail open (capture the event)
      return { capture: true, sampled: false };
    }

    if (result.allowed) {
      return { capture: true, sampled: false };
    }

    // Rate limit hit — sample at configured probability
    const rate = this.getSamplingRate(eventType);
    const sampled = Math.random() < rate;
    return { capture: sampled, sampled: true };
  }

  /**
   * Get the sampling rate for a given event type.
   */
  private getSamplingRate(eventType: string): number {
    return this.config.samplingOverrides?.[eventType] ?? this.config.defaultSamplingRate;
  }
}
