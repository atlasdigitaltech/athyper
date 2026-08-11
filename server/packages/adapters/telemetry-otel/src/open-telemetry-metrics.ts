import { metrics } from "@opentelemetry/api";
import type { MetricsRegistry } from "@athyper/server-foundation/observability";

export function createOpenTelemetryMetricsRegistry(scope: string, version?: string): MetricsRegistry {
  const meter = metrics.getMeter(scope, version);
  return {
    counter(name, description) {
      const instrument=meter.createCounter(name,{description});
      return { increment(labels){instrument.add(1,labels);},incrementBy(value,labels){instrument.add(value,labels);} };
    },
    gauge(name, description) {
      const instrument=meter.createGauge(name,{description});
      return { set(value,labels){instrument.record(value,labels);} };
    },
    histogram(name, description) {
      const instrument=meter.createHistogram(name,{description});
      return { record(value,labels){instrument.record(value,labels);} };
    },
  };
}
