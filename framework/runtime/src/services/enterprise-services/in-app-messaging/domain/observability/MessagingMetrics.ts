/**
 * MessagingMetrics - Observability and metrics for messaging system
 *
 * Tracks:
 * - Message throughput (sent, edited, deleted)
 * - Search query performance
 * - Conversation activity
 * - Error rates
 * - Latency percentiles
 * - Rate limit hits
 *
 * Integrates with observability platforms (Prometheus, DataDog, etc.)
 */

export interface MetricLabels {
    tenantId?: string;
    conversationId?: string;
    operation?: string;
    status?: "success" | "failure";
    errorType?: string;
}

/**
 * Metrics collector interface
 * In production, integrate with your observability platform
 */
export class MessagingMetrics {
    /**
     * Increment counter metric
     */
    private incrementCounter(name: string, labels: MetricLabels = {}, value = 1): void {
        // TODO: Integrate with metrics backend (Prometheus, DataDog, etc.)
        const metric = {
            type: "counter",
            name: `messaging.${name}`,
            value,
            labels,
            timestamp: new Date().toISOString(),
        };

        console.log(`[METRIC] ${JSON.stringify(metric)}`);

        // In production:
        // await this.prometheusClient.inc(name, value, labels);
        // or
        // await this.datadogClient.increment(name, value, labels);
    }

    /**
     * Record histogram metric (for latency)
     */
    private recordHistogram(
        name: string,
        value: number,
        labels: MetricLabels = {}
    ): void {
        const metric = {
            type: "histogram",
            name: `messaging.${name}`,
            value,
            labels,
            timestamp: new Date().toISOString(),
        };

        console.log(`[METRIC] ${JSON.stringify(metric)}`);

        // In production:
        // await this.prometheusClient.observe(name, value, labels);
    }

    /**
     * Set gauge metric (for current values)
     */
    private setGauge(name: string, value: number, labels: MetricLabels = {}): void {
        const metric = {
            type: "gauge",
            name: `messaging.${name}`,
            value,
            labels,
            timestamp: new Date().toISOString(),
        };

        console.log(`[METRIC] ${JSON.stringify(metric)}`);

        // In production:
        // await this.prometheusClient.set(name, value, labels);
    }

    // ─── Message Metrics ─────────────────────────────────────────────────

    /**
     * Track message sent
     */
    trackMessageSent(tenantId: string, conversationId: string): void {
        this.incrementCounter("messages.sent", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    /**
     * Track message send failure
     */
    trackMessageSendFailure(
        tenantId: string,
        conversationId: string,
        errorType: string
    ): void {
        this.incrementCounter("messages.sent", {
            tenantId,
            conversationId,
            status: "failure",
            errorType,
        });
    }

    /**
     * Track message edited
     */
    trackMessageEdited(tenantId: string, conversationId: string): void {
        this.incrementCounter("messages.edited", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    /**
     * Track message deleted
     */
    trackMessageDeleted(tenantId: string, conversationId: string): void {
        this.incrementCounter("messages.deleted", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    /**
     * Track message read
     */
    trackMessageRead(tenantId: string, conversationId: string): void {
        this.incrementCounter("messages.read", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    // ─── Search Metrics ──────────────────────────────────────────────────

    /**
     * Track search query
     */
    trackSearch(
        tenantId: string,
        resultCount: number,
        latencyMs: number,
        conversationId?: string
    ): void {
        this.incrementCounter("search.queries", {
            tenantId,
            conversationId,
            status: "success",
        });

        this.recordHistogram("search.latency_ms", latencyMs, {
            tenantId,
            conversationId,
        });

        this.recordHistogram("search.result_count", resultCount, {
            tenantId,
            conversationId,
        });
    }

    /**
     * Track search failure
     */
    trackSearchFailure(
        tenantId: string,
        errorType: string,
        conversationId?: string
    ): void {
        this.incrementCounter("search.queries", {
            tenantId,
            conversationId,
            status: "failure",
            errorType,
        });
    }

    // ─── Conversation Metrics ────────────────────────────────────────────

    /**
     * Track conversation created
     */
    trackConversationCreated(tenantId: string, conversationType: "direct" | "group"): void {
        this.incrementCounter("conversations.created", {
            tenantId,
            operation: conversationType,
            status: "success",
        });
    }

    /**
     * Track participant added
     */
    trackParticipantAdded(tenantId: string, conversationId: string): void {
        this.incrementCounter("participants.added", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    /**
     * Track participant removed
     */
    trackParticipantRemoved(tenantId: string, conversationId: string): void {
        this.incrementCounter("participants.removed", {
            tenantId,
            conversationId,
            status: "success",
        });
    }

    // ─── Rate Limit Metrics ──────────────────────────────────────────────

    /**
     * Track rate limit exceeded
     */
    trackRateLimitExceeded(tenantId: string, limitType: string): void {
        this.incrementCounter("rate_limits.exceeded", {
            tenantId,
            operation: limitType,
        });
    }

    /**
     * Track rate limit check
     */
    trackRateLimitCheck(
        tenantId: string,
        limitType: string,
        allowed: boolean,
        remaining: number
    ): void {
        this.incrementCounter("rate_limits.checks", {
            tenantId,
            operation: limitType,
            status: allowed ? "success" : "failure",
        });

        this.setGauge("rate_limits.remaining", remaining, {
            tenantId,
            operation: limitType,
        });
    }

    // ─── Access Control Metrics ──────────────────────────────────────────

    /**
     * Track access granted
     */
    trackAccessGranted(tenantId: string, resource: string, action: string): void {
        this.incrementCounter("access_control.checks", {
            tenantId,
            operation: `${resource}.${action}`,
            status: "success",
        });
    }

    /**
     * Track access denied
     */
    trackAccessDenied(tenantId: string, resource: string, action: string): void {
        this.incrementCounter("access_control.checks", {
            tenantId,
            operation: `${resource}.${action}`,
            status: "failure",
        });
    }

    // ─── Performance Metrics ─────────────────────────────────────────────

    /**
     * Track operation latency
     */
    trackOperationLatency(
        operation: string,
        latencyMs: number,
        tenantId?: string
    ): void {
        this.recordHistogram("operations.latency_ms", latencyMs, {
            tenantId,
            operation,
        });
    }

    /**
     * Track database query latency
     */
    trackDbQueryLatency(
        queryType: string,
        latencyMs: number,
        tenantId?: string
    ): void {
        this.recordHistogram("db.query_latency_ms", latencyMs, {
            tenantId,
            operation: queryType,
        });
    }

    // ─── Error Metrics ───────────────────────────────────────────────────

    /**
     * Track error
     */
    trackError(
        errorType: string,
        operation: string,
        tenantId?: string
    ): void {
        this.incrementCounter("errors", {
            tenantId,
            operation,
            errorType,
        });
    }
}

/**
 * Timer helper for measuring operation latency
 */
export class MetricTimer {
    private startTime: number;

    constructor(private metrics: MessagingMetrics) {
        this.startTime = Date.now();
    }

    /**
     * Stop timer and record latency
     */
    stop(operation: string, tenantId?: string): number {
        const latencyMs = Date.now() - this.startTime;
        this.metrics.trackOperationLatency(operation, latencyMs, tenantId);
        return latencyMs;
    }
}
