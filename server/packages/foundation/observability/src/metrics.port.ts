export interface Counter {
  increment(labels?: Record<string, string>): void;
  incrementBy(value: number, labels?: Record<string, string>): void;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
}

export interface Histogram {
  record(value: number, labels?: Record<string, string>): void;
}

export interface MetricsRegistry {
  counter(name: string, description?: string): Counter;
  gauge(name: string, description?: string): Gauge;
  histogram(name: string, description?: string): Histogram;
}
