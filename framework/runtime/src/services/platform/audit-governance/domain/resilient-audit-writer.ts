/**
 * Resilient Audit Writer
 *
 * Main entrypoint for audit event ingestion. Writes to the outbox
 * (circuit-breaker protected) for async persistence by the drain worker.
 * Falls back to a bounded in-memory buffer when the outbox is unavailable,
 * ensuring audit never blocks or crashes the calling workflow.
 *
 * Feature flag support:
 *   - writeMode "off": silently drop events (metric incremented)
 *   - writeMode "sync": bypass outbox, write directly to audit table
 *   - writeMode "outbox": default async path via outbox + drain worker
 *   - hashChainEnabled: toggle hash chain computation
 *
 * Contract: write() NEVER throws.
 */

import { getDefaultSeverity } from "./event-taxonomy.js";

import type { AuditFeatureFlagResolver } from "./audit-feature-flags.js";
import type { AuditLoadSheddingService } from "./audit-load-shedding.service.js";
import type { AuditHashChainService } from "./hash-chain.service.js";
import type {
  AuditRedactionPipeline,
  RedactionResult,
} from "./redaction-pipeline.js";
import type { AuditEvent } from "../../workflow-engine/audit/types.js";
import type { AuditOutboxRepo } from "../persistence/AuditOutboxRepo.js";
import type { CircuitBreaker } from "@athyper/core";

// ============================================================================
// Types
// ============================================================================

export interface AuditMetricsCollector {
  eventIngested(labels: {
    tenant: string;
    event_type: string;
    severity: string;
  }): void;
  eventDropped(labels: { tenant: string; reason: string }): void;
  eventBuffered(labels: { tenant: string }): void;
}

export interface AuditWriterLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Sync writer interface for direct writes (bypasses outbox).
 * Implemented by WorkflowAuditRepository.
 */
export interface AuditSyncWriter {
  recordEvent(
    tenantId: string,
    event: Omit<AuditEvent, "id">,
  ): Promise<string | { id: string }>;
}

export interface ResilientAuditWriterOptions {
  /** Max events in the memory buffer before dropping (default 1000) */
  maxBufferSize?: number;
}

export interface BufferedEvent {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  bufferedAt: Date;
}

// ============================================================================
// Writer
// ============================================================================

export class ResilientAuditWriter {
  private readonly memoryBuffer: BufferedEvent[] = [];
  private readonly maxBufferSize: number;

  constructor(
    private readonly outboxRepo: AuditOutboxRepo,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly options: {
      redaction?: AuditRedactionPipeline;
      hashChain?: AuditHashChainService;
      metrics?: AuditMetricsCollector;
      logger?: AuditWriterLogger;
      maxBufferSize?: number;
      flagResolver?: AuditFeatureFlagResolver;
      loadShedding?: AuditLoadSheddingService;
      syncWriter?: AuditSyncWriter;
    } = {},
  ) {
    this.maxBufferSize = options.maxBufferSize ?? 1000;
  }

  /**
   * Write an audit event. Never throws — audit must not break workflows.
   *
   * Happy path (outbox mode): redact → hash → enqueue to outbox.
   * Sync mode: redact → hash → write directly to audit table.
   * Off mode: silently drop + increment metric.
   * Circuit open / DB error: push to bounded memory buffer.
   * Buffer full: drop oldest + increment drop metric.
   */
  async write(tenantId: string, event: Omit<AuditEvent, "id">): Promise<void> {
    const {
      redaction,
      hashChain,
      metrics,
      logger,
      flagResolver,
      loadShedding,
      syncWriter,
    } = this.options;

    try {
      // 0a. Load shedding policy check (before feature flags)
      if (loadShedding) {
        const severity = event.severity ?? getDefaultSeverity(event.eventType);
        const decision = await loadShedding.evaluate(
          tenantId,
          event.eventType,
          severity,
        );
        if (!decision.accepted) {
          metrics?.eventDropped({
            tenant: tenantId,
            reason: `load_shed_${decision.reason}`,
          });
          logger?.debug(
            { tenantId, eventType: event.eventType, reason: decision.reason },
            "[audit:writer] Event shed by load shedding policy",
          );
          return;
        }
      }

      // 0b. Check feature flags
      const flags = await flagResolver?.resolve(tenantId);
      if (flags?.writeMode === "off") {
        metrics?.eventDropped({ tenant: tenantId, reason: "feature_flag_off" });
        logger?.debug(
          { tenantId, eventType: event.eventType },
          "[audit:writer] Event dropped — audit write mode is off",
        );
        return;
      }

      // 1. Run redaction pipeline
      let processedEvent = event;
      if (redaction) {
        const result: RedactionResult = redaction.redact(event);
        processedEvent = result.event;
      }

      // 2. Compute hash chain (skip if disabled via feature flag)
      let hashPrev: string | undefined;
      let hashCurr: string | undefined;
      if (hashChain && flags?.hashChainEnabled !== false) {
        const hash = await hashChain.computeHash(tenantId, processedEvent);
        hashPrev = hash.hash_prev;
        hashCurr = hash.hash_curr;
      }

      // 3. Build serializable payload
      const eventType = processedEvent.eventType;
      const severity =
        processedEvent.severity ?? getDefaultSeverity(processedEvent.eventType);
      const payload: Record<string, unknown> = {
        ...processedEvent,
        severity,
        hash_prev: hashPrev,
        hash_curr: hashCurr,
      };

      // 4. Write based on mode
      if (flags?.writeMode === "sync" && syncWriter) {
        // Sync mode: write directly to audit table (bypass outbox)
        await syncWriter.recordEvent(tenantId, {
          ...processedEvent,
          severity,
        } as Omit<AuditEvent, "id">);
      } else {
        // Default outbox mode: circuit-breaker-protected INSERT
        await this.circuitBreaker.execute(async () => {
          await this.outboxRepo.enqueue(tenantId, eventType, payload);
        });
      }

      // 5. Success metrics
      metrics?.eventIngested({
        tenant: tenantId,
        event_type: eventType,
        severity,
      });
    } catch (err) {
      // Outbox unavailable — fall back to memory buffer
      this.bufferEvent(tenantId, event, err, metrics, logger);
    }
  }

  /**
   * Drain the in-memory buffer. Called when the circuit recovers,
   * or periodically by a health check / scheduled job.
   *
   * Returns the number of events successfully flushed.
   */
  async flushBuffer(): Promise<number> {
    const { metrics, logger } = this.options;
    let flushed = 0;

    while (this.memoryBuffer.length > 0) {
      const entry = this.memoryBuffer[0];

      try {
        await this.outboxRepo.enqueue(
          entry.tenantId,
          entry.eventType,
          entry.payload,
        );
        this.memoryBuffer.shift();
        flushed++;
      } catch {
        // Outbox still down — stop draining
        logger?.warn(
          { remaining: this.memoryBuffer.length, flushed },
          "[audit:writer] Buffer flush stopped — outbox still unavailable",
        );
        break;
      }
    }

    if (flushed > 0) {
      logger?.debug(
        { flushed, remaining: this.memoryBuffer.length },
        "[audit:writer] Buffer flushed",
      );
    }

    return flushed;
  }

  /**
   * Current memory buffer depth (for health check / metrics).
   */
  get bufferDepth(): number {
    return this.memoryBuffer.length;
  }

  /**
   * Whether the circuit breaker is currently open.
   */
  get isCircuitOpen(): boolean {
    try {
      // Probe the breaker by asking for metrics (no-op if not exposed)
      const metrics = this.circuitBreaker.getMetrics();
      return metrics.state === "OPEN";
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private bufferEvent(
    tenantId: string,
    event: Omit<AuditEvent, "id">,
    error: unknown,
    metrics?: AuditMetricsCollector,
    logger?: AuditWriterLogger,
  ): void {
    const eventType = event.eventType;
    const severity = event.severity ?? getDefaultSeverity(event.eventType);

    // Drop oldest if buffer is full
    if (this.memoryBuffer.length >= this.maxBufferSize) {
      const dropped = this.memoryBuffer.shift();
      metrics?.eventDropped({
        tenant: dropped?.tenantId ?? tenantId,
        reason: "buffer_overflow",
      });
      logger?.warn(
        { tenantId, eventType, bufferSize: this.maxBufferSize },
        "[audit:writer] Buffer full — dropped oldest event",
      );
    }

    // Push to buffer
    this.memoryBuffer.push({
      tenantId,
      eventType,
      payload: { ...event, severity } as unknown as Record<string, unknown>,
      bufferedAt: new Date(),
    });

    metrics?.eventBuffered({ tenant: tenantId });

    logger?.warn(
      {
        tenantId,
        eventType,
        bufferDepth: this.memoryBuffer.length,
        error: error instanceof Error ? error.message : String(error),
      },
      "[audit:writer] Outbox unavailable — event buffered in memory",
    );
  }
}
