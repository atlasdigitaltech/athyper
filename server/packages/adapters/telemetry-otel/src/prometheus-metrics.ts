import type { Counter, Gauge, Histogram, MetricLabels, MetricsRegistry } from "@athyper/server-foundation/observability";

export const ATHYPER_METRIC_CATALOG = Object.freeze({
  httpDuration: "athyper_http_request_duration_seconds", httpErrors: "athyper_http_errors_total",
  dbPool: "athyper_db_pool_connections", redis: "athyper_redis_operations_total",
  jobLatency: "athyper_job_latency_seconds", jobRetries: "athyper_job_retries_total", jobDlq: "athyper_job_dlq_total",
  scheduleLag: "athyper_schedule_lag_seconds", outboxLag: "athyper_outbox_lag_seconds",
  cacheInvalidation: "athyper_cache_invalidation_total", integrationDelivery: "athyper_integration_delivery_total",
} as const);

export const JOB_QUEUE_LABELS = Object.freeze(["publication", "documents", "notifications", "integrations", "maintenance", "unknown"] as const);
export const CAPABILITY_LABELS = Object.freeze(["http", "database", "redis", "jobs", "scheduling", "outbox", "cache", "integration", "unknown"] as const);
const FORBIDDEN_LABEL = /(^|_)(tenant|principal|record|entity|document|user|organization|org)(_?id)?$/i;
const HISTOGRAM_BUCKETS = Object.freeze([0.001,0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10,25,50,100,250,500,1_000,2_500,5_000,10_000,25_000,50_000,100_000,250_000,500_000,1_000_000,2_500_000,5_000_000,10_000_000,25_000_000,50_000_000,100_000_000,250_000_000,500_000_000,1_000_000_000]);

export interface PrometheusMetricsRegistry extends MetricsRegistry { render(): string; }

/** A Prometheus view over the canonical OTel registry; all writes are forwarded to OTel first. */
export function createPrometheusMetricsRegistry(delegate: MetricsRegistry): PrometheusMetricsRegistry {
  const samples = new Map<string, { type: "counter" | "gauge" | "histogram"; description?: string; values: Map<string, number[]> }>();
  const instrument = (type: "counter" | "gauge" | "histogram", name: string, description?: string) => {
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) throw new TypeError(`Invalid metric name: ${name}`);
    const current = samples.get(name) ?? { type, ...(description ? { description } : {}), values: new Map() };
    if (current.type !== type) throw new TypeError(`Metric ${name} already registered as ${current.type}`);
    samples.set(name, current); return current;
  };
  const registry: PrometheusMetricsRegistry = {
    counter(name, description): Counter { const otel = delegate.counter(name, description); const metric = instrument("counter", name, description); return { increment: (labels) => { otel.increment(labels); add(metric.values, labels, 1); }, incrementBy: (value, labels) => { otel.incrementBy(value, labels); add(metric.values, labels, value); } }; },
    gauge(name, description): Gauge { const otel = delegate.gauge(name, description); const metric = instrument("gauge", name, description); return { set: (value, labels) => { otel.set(value, labels); metric.values.set(labelKey(labels), [value]); } }; },
    histogram(name, description): Histogram { const otel = delegate.histogram(name, description); const metric = instrument("histogram", name, description); return { record: (value, labels) => { otel.record(value, labels); recordHistogram(metric.values,labelKey(labels),value); } }; },
    render() { return render(samples); },
  };
  return registry;
}

function add(values: Map<string, number[]>, labels: MetricLabels | undefined, amount: number): void { const key = labelKey(labels); values.set(key, [(values.get(key)?.[0] ?? 0) + amount]); }
function labelKey(labels?: MetricLabels): string {
  const entries = Object.entries(labels ?? {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, value] of entries) {
    if (FORBIDDEN_LABEL.test(name)) throw new TypeError(`High-cardinality or identity metric label is forbidden: ${name}`);
    if (name === "queue" && !(JOB_QUEUE_LABELS as readonly string[]).includes(value)) throw new TypeError(`Metric queue label is outside the fixed catalog: ${value}`);
    if (name === "capability" && !(CAPABILITY_LABELS as readonly string[]).includes(value)) throw new TypeError(`Metric capability label is outside the fixed catalog: ${value}`);
  }
  return JSON.stringify(entries);
}
function render(samples: Map<string, { type: "counter" | "gauge" | "histogram"; description?: string; values: Map<string, number[]> }>): string {
  const lines: string[] = [];
  for (const [name, metric] of [...samples].sort(([a], [b]) => a.localeCompare(b))) {
    if (metric.description) lines.push(`# HELP ${name} ${metric.description.replace(/[\\\n]/g, " ")}`);
    lines.push(`# TYPE ${name} ${metric.type}`);
    for (const [key, values] of metric.values) {
      const labels = labelsText(JSON.parse(key) as Array<[string, string]>);
      if (metric.type !== "histogram") lines.push(`${name}${labels} ${values[0] ?? 0}`);
      else {
        const entries=JSON.parse(key) as Array<[string,string]>;
        for(let index=0;index<HISTOGRAM_BUCKETS.length;index+=1)lines.push(`${name}_bucket${labelsText(labelsWithLe(entries,String(HISTOGRAM_BUCKETS[index])))} ${values[index+2]??0}`);
        lines.push(`${name}_bucket${labelsText(labelsWithLe(entries,"+Inf"))} ${values[0]??0}`);
        lines.push(`${name}_count${labels} ${values[0]??0}`);lines.push(`${name}_sum${labels} ${values[1]??0}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
function labelsText(entries: Array<[string, string]>): string { return entries.length ? `{${entries.map(([key, value]) => `${key}="${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`).join(",")}}` : ""; }
function labelsWithLe(entries:Array<[string,string]>,le:string):Array<[string,string]>{return[...entries,["le",le] as [string,string]].sort(([a],[b])=>a.localeCompare(b));}
function recordHistogram(values:Map<string,number[]>,key:string,value:number):void{if(!Number.isFinite(value))throw new TypeError("Histogram observations must be finite");const aggregate=values.get(key)??Array.from({length:HISTOGRAM_BUCKETS.length+2},()=>0);aggregate[0]=(aggregate[0]??0)+1;aggregate[1]=(aggregate[1]??0)+value;for(let index=0;index<HISTOGRAM_BUCKETS.length;index+=1)if(value<=HISTOGRAM_BUCKETS[index]!)aggregate[index+2]=(aggregate[index+2]??0)+1;values.set(key,aggregate);}
