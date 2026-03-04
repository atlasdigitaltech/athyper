/**
 * Metrics collection system
 * Lightweight metrics for monitoring without external dependencies
 */

export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface MetricValue {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface Metric {
  name: string;
  type: MetricType;
  description?: string;
  unit?: string;
  values: MetricValue[];
}

export interface MetricLabels {
  [key: string]: string;
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  private metrics = new Map<string, Metric>();
  private maxHistorySize = 1000; // Keep last 1000 samples per metric

  /**
   * Record a counter increment
   */
  incrementCounter(
    name: string,
    value: number = 1,
    labels?: MetricLabels
  ): void {
    this.recordMetric(name, "counter", value, labels);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    this.recordMetric(name, "gauge", value, labels);
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void {
    this.recordMetric(name, "histogram", value, labels);
  }

  /**
   * Record a metric value
   */
  private recordMetric(
    name: string,
    type: MetricType,
    value: number,
    labels?: MetricLabels
  ): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        type,
        values: [],
      });
    }

    const metric = this.metrics.get(name)!;
    metric.values.push({
      value,
      timestamp: new Date(),
      labels,
    });

    // Trim history to prevent unbounded growth
    if (metric.values.length > this.maxHistorySize) {
      metric.values = metric.values.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get a specific metric
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metric summary (latest values, aggregates)
   */
  getMetricSummary(name: string): MetricSummary | undefined {
    const metric = this.metrics.get(name);
    if (!metric || metric.values.length === 0) return undefined;

    const values = metric.values.map((v) => v.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const avg = sum / count;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate percentiles for histograms
    let p50: number | undefined;
    let p95: number | undefined;
    let p99: number | undefined;

    if (metric.type === "histogram") {
      const sorted = [...values].sort((a, b) => a - b);
      p50 = sorted[Math.floor(count * 0.5)];
      p95 = sorted[Math.floor(count * 0.95)];
      p99 = sorted[Math.floor(count * 0.99)];
    }

    return {
      name: metric.name,
      type: metric.type,
      count,
      sum,
      avg,
      min,
      max,
      p50,
      p95,
      p99,
      latest: values[values.length - 1],
      timestamp: new Date(),
    };
  }

  /**
   * Get all metric summaries
   */
  getAllSummaries(): MetricSummary[] {
    return Array.from(this.metrics.keys())
      .map((name) => this.getMetricSummary(name))
      .filter((s): s is MetricSummary => s !== undefined);
  }

  /**
   * Reset a metric
   */
  resetMetric(name: string): void {
    const metric = this.metrics.get(name);
    if (metric) {
      metric.values = [];
    }
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Set metadata for a metric
   */
  setMetricMetadata(
    name: string,
    metadata: { description?: string; unit?: string }
  ): void {
    const metric = this.metrics.get(name);
    if (metric) {
      if (metadata.description) metric.description = metadata.description;
      if (metadata.unit) metric.unit = metadata.unit;
    }
  }
}

export interface MetricSummary {
  name: string;
  type: MetricType;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50?: number;
  p95?: number;
  p99?: number;
  latest: number;
  timestamp: Date;
}

/**
 * Standard HTTP metrics
 */
export interface HttpMetrics {
  requests_total: number;
  requests_active: number;
  request_duration_ms: number[];
  errors_total: number;
  status_codes: Record<string, number>;
}

/**
 * Create standard HTTP metric recorders
 */
export function createHttpMetrics(registry: MetricsRegistry) {
  return {
    recordRequest(method: string, path: string, status: number, duration: number) {
      registry.incrementCounter("http_requests_total", 1, {
        method,
        path,
        status: String(status),
      });

      registry.recordHistogram("http_request_duration_ms", duration, {
        method,
        path,
      });

      if (status >= 400) {
        registry.incrementCounter("http_errors_total", 1, {
          method,
          path,
          status: String(status),
        });
      }
    },

    incrementActiveRequests() {
      registry.setGauge("http_requests_active", 1);
    },

    decrementActiveRequests() {
      registry.setGauge("http_requests_active", -1);
    },
  };
}
