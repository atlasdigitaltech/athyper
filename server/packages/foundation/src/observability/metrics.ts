export type MetricLabels = Readonly<Record<string, string>>;

export interface Counter {
  increment(labels?: MetricLabels): void;
  incrementBy(value: number, labels?: MetricLabels): void;
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void;
}

export interface Histogram {
  record(value: number, labels?: MetricLabels): void;
}

export interface MetricsRegistry {
  counter(name: string, description?: string): Counter;
  gauge(name: string, description?: string): Gauge;
  histogram(name: string, description?: string): Histogram;
}
